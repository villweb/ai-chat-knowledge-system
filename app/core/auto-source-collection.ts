import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceApp, VaultRelativePath } from "../schemas";
import { resolveVaultPath, toVaultRelativePath } from "../storage";

export interface AutoCollectionSettings {
  enabled: boolean;
  scan_interval_minutes: number;
  scan_on_startup: boolean;
  scan_before_daily: boolean;
  updated_at: string;
}

export interface AutoCollectionFileState {
  source_app: SourceApp;
  signature: string;
  processed_at: string;
}

export interface AutoCollectionRuntimeState {
  schema_version: "auto_collection_state.v1";
  processed_files: Record<string, AutoCollectionFileState>;
  last_scan_at: string;
  updated_at: string;
}

export interface AutoCollectionCandidate {
  source_app: SourceApp;
  raw_path: VaultRelativePath;
  signature: string;
  detected_at: string;
}

export interface AutoCollectionViewState {
  settings: AutoCollectionSettings;
  pending: AutoCollectionCandidate[];
  processed_file_count: number;
  last_scan_at: string;
}

const SETTINGS_PATH = "data/runtime/auto-collection-settings.json";
const STATE_PATH = "data/runtime/auto-collection-state.json";
const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".json"]);

export function buildDefaultAutoCollectionSettings(now = new Date().toISOString()): AutoCollectionSettings {
  return {
    enabled: false,
    scan_interval_minutes: 5,
    scan_on_startup: true,
    scan_before_daily: true,
    updated_at: now
  };
}

export async function readAutoCollectionSettings(vaultRoot: string): Promise<AutoCollectionSettings> {
  try {
    const content = await readFile(resolveVaultPath(vaultRoot, SETTINGS_PATH), "utf8");
    return normalizeAutoCollectionSettings(JSON.parse(content) as Partial<AutoCollectionSettings>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return buildDefaultAutoCollectionSettings();
    }
    throw error;
  }
}

export async function saveAutoCollectionSettings(
  vaultRoot: string,
  input: Partial<AutoCollectionSettings>,
  now = new Date().toISOString()
): Promise<AutoCollectionSettings> {
  const current = await readAutoCollectionSettings(vaultRoot);
  const settings = normalizeAutoCollectionSettings({ ...current, ...input, updated_at: now });
  const filePath = resolveVaultPath(vaultRoot, SETTINGS_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

export async function getAutoCollectionState(
  vaultRoot: string,
  enabledSourceApps: SourceApp[]
): Promise<AutoCollectionViewState> {
  const [settings, runtime, pending] = await Promise.all([
    readAutoCollectionSettings(vaultRoot),
    readAutoCollectionRuntimeState(vaultRoot),
    listPendingAutoCollectionItems(vaultRoot, enabledSourceApps)
  ]);

  return {
    settings,
    pending,
    processed_file_count: Object.keys(runtime.processed_files).length,
    last_scan_at: runtime.last_scan_at
  };
}

export async function listPendingAutoCollectionItems(
  vaultRoot: string,
  enabledSourceApps: SourceApp[]
): Promise<AutoCollectionCandidate[]> {
  const runtime = await readAutoCollectionRuntimeState(vaultRoot);
  const candidates = await listAutoCollectionCandidates(vaultRoot, enabledSourceApps);
  return candidates.filter((candidate) => runtime.processed_files[candidate.raw_path]?.signature !== candidate.signature);
}

export async function markAutoCollectionItemsProcessed(
  vaultRoot: string,
  items: AutoCollectionCandidate[],
  now = new Date().toISOString()
): Promise<AutoCollectionRuntimeState> {
  const runtime = await readAutoCollectionRuntimeState(vaultRoot);
  const next: AutoCollectionRuntimeState = {
    schema_version: "auto_collection_state.v1",
    processed_files: { ...runtime.processed_files },
    last_scan_at: now,
    updated_at: now
  };

  for (const item of items) {
    next.processed_files[item.raw_path] = {
      source_app: item.source_app,
      signature: item.signature,
      processed_at: now
    };
  }

  const filePath = resolveVaultPath(vaultRoot, STATE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function groupAutoCollectionItemsBySource(
  items: AutoCollectionCandidate[]
): Partial<Record<SourceApp, AutoCollectionCandidate[]>> {
  return items.reduce<Partial<Record<SourceApp, AutoCollectionCandidate[]>>>((groups, item) => {
    groups[item.source_app] = [...(groups[item.source_app] ?? []), item];
    return groups;
  }, {});
}

export function normalizeAutoCollectionSettings(input: Partial<AutoCollectionSettings>): AutoCollectionSettings {
  const settings = {
    ...buildDefaultAutoCollectionSettings(input.updated_at),
    ...input
  };

  if (!Number.isInteger(settings.scan_interval_minutes) || settings.scan_interval_minutes < 1 || settings.scan_interval_minutes > 1440) {
    throw new Error("scan_interval_minutes must be an integer from 1 to 1440.");
  }

  return {
    enabled: Boolean(settings.enabled),
    scan_interval_minutes: settings.scan_interval_minutes,
    scan_on_startup: Boolean(settings.scan_on_startup),
    scan_before_daily: Boolean(settings.scan_before_daily),
    updated_at: settings.updated_at
  };
}

async function listAutoCollectionCandidates(vaultRoot: string, sourceApps: SourceApp[]): Promise<AutoCollectionCandidate[]> {
  const items: AutoCollectionCandidate[] = [];
  for (const sourceApp of sourceApps) {
    const root = resolveVaultPath(vaultRoot, `raw/imports/${sourceApp}`);
    items.push(...await listSourceFiles(root, vaultRoot, sourceApp));
  }
  return items.sort((left, right) => left.raw_path.localeCompare(right.raw_path));
}

async function listSourceFiles(root: string, vaultRoot: string, sourceApp: SourceApp): Promise<AutoCollectionCandidate[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const items: AutoCollectionCandidate[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      items.push(...await listSourceFiles(absolutePath, vaultRoot, sourceApp));
      continue;
    }
    if (!entry.isFile() || entry.name.startsWith(".") || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    items.push({
      source_app: sourceApp,
      raw_path: toVaultRelativePath(vaultRoot, absolutePath),
      signature: `${fileStat.size}:${fileStat.mtimeMs}`,
      detected_at: fileStat.mtime.toISOString()
    });
  }
  return items;
}

async function readAutoCollectionRuntimeState(vaultRoot: string): Promise<AutoCollectionRuntimeState> {
  try {
    const content = await readFile(resolveVaultPath(vaultRoot, STATE_PATH), "utf8");
    const parsed = JSON.parse(content) as Partial<AutoCollectionRuntimeState>;
    return {
      schema_version: "auto_collection_state.v1",
      processed_files: parsed.processed_files ?? {},
      last_scan_at: parsed.last_scan_at ?? "",
      updated_at: parsed.updated_at ?? ""
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        schema_version: "auto_collection_state.v1",
        processed_files: {},
        last_scan_at: "",
        updated_at: ""
      };
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
