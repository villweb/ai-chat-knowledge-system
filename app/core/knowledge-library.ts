import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DailyRun, KnowledgeAtom, KnowledgeAtomType, ReviewStatus, SourceApp, VaultRelativePath } from "../schemas";
import { SCHEMA_VERSION } from "../schemas";
import { buildKnowledgeAtomMarkdownDocument, renderKnowledgeAtomMarkdown, resolveVaultPath, toSafeTitle } from "../storage";
import { listKnowledgeAtomDocuments, type KnowledgeAtomDocument } from "./knowledge-review";

export interface KnowledgeLibraryFilters {
  query?: string;
  source_app?: SourceApp | "";
  type?: KnowledgeAtomType | "";
  project?: string;
  tag?: string;
  review_status?: ReviewStatus | "";
}

export interface KnowledgeLibraryFacets {
  source_apps: Array<{ value: SourceApp; count: number }>;
  types: Array<{ value: KnowledgeAtomType; count: number }>;
  projects: Array<{ value: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
  statuses: Array<{ value: ReviewStatus; count: number }>;
}

export interface DuplicateKnowledgeGroup {
  key: string;
  title: string;
  atom_ids: string[];
  items: KnowledgeAtomDocument[];
}

export interface DailyKnowledgeCalendarItem {
  date: string;
  run_count: number;
  generated_atom_count: number;
  approved_atom_count: number;
  pending_atom_count: number;
  failed_run_count: number;
}

export interface KnowledgeLibraryView {
  items: KnowledgeAtomDocument[];
  facets: KnowledgeLibraryFacets;
  duplicate_groups: DuplicateKnowledgeGroup[];
  calendar: DailyKnowledgeCalendarItem[];
}

export interface KnowledgeExportSummary {
  export_dir: VaultRelativePath;
  index_path: VaultRelativePath;
  exported_file_count: number;
}

export interface KnowledgeBackupSummary {
  backup_dir: VaultRelativePath;
  manifest_path: VaultRelativePath;
  copied_dir_count: number;
}

export interface KnowledgeRestoreSummary {
  backup_dir: VaultRelativePath;
  restored_dir_count: number;
}

const KNOWLEDGE_RUNTIME_DIRS = ["knowledge", "data/runtime", "data/daily_runs", "logs"] as const;

export async function buildKnowledgeLibraryView(vaultRoot: string, filters: KnowledgeLibraryFilters = {}): Promise<KnowledgeLibraryView> {
  const allItems = await listKnowledgeAtomDocuments(vaultRoot);
  const history = await listDailyRuns(vaultRoot);
  const effectiveFilters: KnowledgeLibraryFilters = {
    review_status: "approved",
    ...filters
  };
  return {
    items: filterKnowledgeAtoms(allItems, effectiveFilters),
    facets: buildFacets(allItems),
    duplicate_groups: findDuplicateKnowledgeGroups(allItems),
    calendar: buildDailyKnowledgeCalendar(allItems, history)
  };
}

export function filterKnowledgeAtoms(items: KnowledgeAtomDocument[], filters: KnowledgeLibraryFilters): KnowledgeAtomDocument[] {
  const query = normalizeSearchText(filters.query ?? "");
  const project = normalizeFacetValue(filters.project ?? "");
  const tag = normalizeFacetValue(filters.tag ?? "");

  return items.filter((item) => {
    if (filters.source_app && item.atom.source_app !== filters.source_app) {
      return false;
    }
    if (filters.type && item.atom.type !== filters.type) {
      return false;
    }
    if (filters.review_status && item.atom.review_status !== filters.review_status) {
      return false;
    }
    if (project && normalizeFacetValue(item.atom.project) !== project) {
      return false;
    }
    if (tag && !item.atom.tags.some((itemTag) => normalizeFacetValue(itemTag) === tag)) {
      return false;
    }
    if (!query) {
      return true;
    }

    return normalizeSearchText([
      item.atom.title,
      item.atom.content,
      item.atom.evidence,
      item.atom.project,
      item.atom.source_app,
      item.atom.type,
      item.atom.tags.join(" "),
      item.atom.source_raw_paths.join(" ")
    ].join(" ")).includes(query);
  });
}

export function buildFacets(items: KnowledgeAtomDocument[]): KnowledgeLibraryFacets {
  return {
    source_apps: countFacet(items, (item) => item.atom.source_app),
    types: countFacet(items, (item) => item.atom.type),
    projects: countFacet(items, (item) => item.atom.project || "未分项目"),
    tags: countFacet(items.flatMap((item) => item.atom.tags.map((tag) => ({ ...item, atom: { ...item.atom, tags: [tag] } }))), (item) => item.atom.tags[0] ?? ""),
    statuses: countFacet(items, (item) => item.atom.review_status)
  };
}

export function findDuplicateKnowledgeGroups(items: KnowledgeAtomDocument[]): DuplicateKnowledgeGroup[] {
  const groups = new Map<string, KnowledgeAtomDocument[]>();
  for (const item of items) {
    if (item.atom.review_status === "rejected" || item.atom.review_status === "merged") {
      continue;
    }

    const key = buildDuplicateKey(item.atom);
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .filter(([, groupItems]) => groupItems.length > 1)
    .map(([key, groupItems]) => ({
      key,
      title: groupItems[0]?.atom.title ?? key,
      atom_ids: groupItems.map((item) => item.atom.atom_id),
      items: groupItems
    }))
    .sort((left, right) => right.items.length - left.items.length || left.title.localeCompare(right.title));
}

export function buildDailyKnowledgeCalendar(items: KnowledgeAtomDocument[], history: DailyRun[]): DailyKnowledgeCalendarItem[] {
  const calendar = new Map<string, DailyKnowledgeCalendarItem>();
  for (const run of history) {
    const current = ensureCalendarItem(calendar, run.run_date);
    current.run_count += 1;
    current.generated_atom_count += run.generated_atom_ids.length;
    if (run.status === "failed") {
      current.failed_run_count += 1;
    }
  }

  for (const item of items) {
    const date = item.atom.created_at.slice(0, 10);
    const current = ensureCalendarItem(calendar, date);
    if (item.atom.review_status === "approved") {
      current.approved_atom_count += 1;
    }
    if (item.atom.review_status === "pending") {
      current.pending_atom_count += 1;
    }
  }

  return [...calendar.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export async function exportKnowledgeMarkdown(vaultRoot: string, now = new Date()): Promise<KnowledgeExportSummary> {
  const items = (await listKnowledgeAtomDocuments(vaultRoot)).filter((item) => item.atom.review_status === "approved");
  const timestamp = toTimestamp(now);
  const exportDir = `data/exports/markdown-${timestamp}`;
  const absoluteExportDir = resolveVaultPath(vaultRoot, exportDir);
  await mkdir(absoluteExportDir, { recursive: true });

  const lines = ["# Knowledge Export", "", `Created at: ${now.toISOString()}`, ""];
  let exportedFileCount = 0;
  for (const item of items) {
    const statusDir = path.join(absoluteExportDir, "approved");
    await mkdir(statusDir, { recursive: true });
    const filename = `${item.atom.created_at.slice(0, 10)}-${item.atom.atom_id}-${toSafeTitle(item.atom.title)}.md`;
    const target = path.join(statusDir, filename);
    await writeFile(target, renderKnowledgeAtomMarkdown(buildKnowledgeAtomMarkdownDocument(item.atom)), "utf8");
    lines.push(`- [[approved/${filename.replace(/\.md$/, "")}]] ${item.atom.title}`);
    exportedFileCount += 1;
  }

  const indexPath = `${exportDir}/index.md`;
  await writeFile(resolveVaultPath(vaultRoot, indexPath), `${lines.join("\n")}\n`, "utf8");
  return { export_dir: exportDir, index_path: indexPath, exported_file_count: exportedFileCount };
}

export async function ensureObsidianCompatibility(vaultRoot: string, now = new Date()): Promise<KnowledgeExportSummary> {
  const items = await listKnowledgeAtomDocuments(vaultRoot);
  const indexPath = "knowledge/_index.md";
  const lines = [
    "# Knowledge Index",
    "",
    `Updated at: ${now.toISOString()}`,
    "",
    "## Approved",
    ...buildObsidianIndexLines(items, "approved"),
    "",
    "## Pending",
    ...buildObsidianIndexLines(items, "pending"),
    "",
    "## Merged",
    ...buildObsidianIndexLines(items, "merged"),
    "",
    "## Rejected",
    ...buildObsidianIndexLines(items, "rejected")
  ];
  await writeFile(resolveVaultPath(vaultRoot, indexPath), `${lines.join("\n")}\n`, "utf8");
  return { export_dir: "knowledge", index_path: indexPath, exported_file_count: items.length };
}

export async function createKnowledgeBackup(vaultRoot: string, now = new Date()): Promise<KnowledgeBackupSummary> {
  const backupDir = `data/backups/backup-${toTimestamp(now)}`;
  const absoluteBackupDir = resolveVaultPath(vaultRoot, backupDir);
  await mkdir(absoluteBackupDir, { recursive: true });

  let copiedDirCount = 0;
  for (const sourceDir of KNOWLEDGE_RUNTIME_DIRS) {
    const source = resolveVaultPath(vaultRoot, sourceDir);
    const target = path.join(absoluteBackupDir, sourceDir);
    if (await exists(source)) {
      await cp(source, target, { recursive: true });
      copiedDirCount += 1;
    }
  }

  const manifestPath = `${backupDir}/manifest.json`;
  await writeFile(resolveVaultPath(vaultRoot, manifestPath), `${JSON.stringify({
    schema_version: "knowledge_backup.v1",
    created_at: now.toISOString(),
    copied_dirs: KNOWLEDGE_RUNTIME_DIRS
  }, null, 2)}\n`, "utf8");
  return { backup_dir: backupDir, manifest_path: manifestPath, copied_dir_count: copiedDirCount };
}

export async function restoreLatestKnowledgeBackup(vaultRoot: string): Promise<KnowledgeRestoreSummary> {
  const backupsRoot = resolveVaultPath(vaultRoot, "data/backups");
  const backupNames = (await readdir(backupsRoot))
    .filter((item) => item.startsWith("backup-"))
    .sort();
  const backupName = backupNames.at(-1);
  if (!backupName) {
    throw new Error("没有可恢复的知识库备份。");
  }

  const backupDir = `data/backups/${backupName}`;
  const absoluteBackupDir = resolveVaultPath(vaultRoot, backupDir);
  let restoredDirCount = 0;
  for (const sourceDir of KNOWLEDGE_RUNTIME_DIRS) {
    const source = path.join(absoluteBackupDir, sourceDir);
    if (!await exists(source)) {
      continue;
    }

    const target = resolveVaultPath(vaultRoot, sourceDir);
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
    restoredDirCount += 1;
  }

  return { backup_dir: backupDir, restored_dir_count: restoredDirCount };
}

async function listDailyRuns(vaultRoot: string): Promise<DailyRun[]> {
  const root = resolveVaultPath(vaultRoot, "data/daily_runs");
  if (!await exists(root)) {
    return [];
  }

  const runs: DailyRun[] = [];
  for (const file of await readdir(root)) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const content = await readFile(path.join(root, file), "utf8");
    const parsed = JSON.parse(content) as Partial<DailyRun>;
    if (parsed.schema_version === SCHEMA_VERSION.dailyRun && parsed.run_id && parsed.run_date && parsed.status) {
      runs.push(parsed as DailyRun);
    }
  }
  return runs;
}

function ensureCalendarItem(calendar: Map<string, DailyKnowledgeCalendarItem>, date: string): DailyKnowledgeCalendarItem {
  const current = calendar.get(date);
  if (current) {
    return current;
  }

  const next = {
    date,
    run_count: 0,
    generated_atom_count: 0,
    approved_atom_count: 0,
    pending_atom_count: 0,
    failed_run_count: 0
  };
  calendar.set(date, next);
  return next;
}

function buildObsidianIndexLines(items: KnowledgeAtomDocument[], status: ReviewStatus): string[] {
  return items
    .filter((item) => item.atom.review_status === status)
    .map((item) => `- [[${item.file_path.replace(/^knowledge\//, "").replace(/\.md$/, "")}]] ${item.atom.title}`);
}

function countFacet<T extends string>(items: KnowledgeAtomDocument[], read: (item: KnowledgeAtomDocument) => T): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  for (const item of items) {
    const value = read(item);
    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function buildDuplicateKey(atom: KnowledgeAtom): string {
  return normalizeSearchText(`${atom.type}:${atom.title}:${atom.content.slice(0, 180)}`);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFacetValue(value: string): string {
  return value.trim().toLowerCase();
}

function toTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await readFile(absolutePath);
    return true;
  } catch (error) {
    if (isDirectoryCheckNeeded(error)) {
      try {
        await readdir(absolutePath);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }
}

function isDirectoryCheckNeeded(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "EISDIR" || error.code === "ENOENT");
}
