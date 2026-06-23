import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildDailyKnowledgeCalendar,
  buildKnowledgeLibraryView,
  createKnowledgeBackup,
  ensureObsidianCompatibility,
  exportKnowledgeMarkdown,
  filterKnowledgeAtoms,
  findDuplicateKnowledgeGroups,
  restoreLatestKnowledgeBackup
} from "../app/core";
import { SCHEMA_VERSION, type DailyRun, type KnowledgeAtom } from "../app/schemas";
import { buildKnowledgeAtomMarkdownDocument, renderKnowledgeAtomMarkdown } from "../app/storage";

test("P6 filters knowledge atoms by query, source, type, project and tag", async () => {
  const vaultRoot = await createTempVault();
  await writeAtom(vaultRoot, buildAtom({ atom_id: "atom_codex", title: "复盘方法", source_app: "codex", type: "方法", project: "personal", tags: ["review"] }));
  await writeAtom(vaultRoot, buildAtom({ atom_id: "atom_cursor", title: "素材判断", source_app: "cursor", type: "素材", project: "writing", tags: ["material"] }));

  const view = await buildKnowledgeLibraryView(vaultRoot);
  const filtered = filterKnowledgeAtoms(view.items, {
    query: "复盘",
    source_app: "codex",
    type: "方法",
    project: "personal",
    tag: "review"
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.atom.atom_id, "atom_codex");
  assert.equal(view.facets.source_apps.find((item) => item.value === "codex")?.count, 1);
  assert.equal(view.facets.tags.find((item) => item.value === "review")?.count, 1);
});

test("P6 duplicate groups ignore rejected and merged atoms", async () => {
  const base = buildAtom({ atom_id: "atom_a", title: "相同观点", content: "每天沉淀时先确认价值。", review_status: "pending" });
  const groups = findDuplicateKnowledgeGroups([
    { atom: base, file_path: "knowledge/inbox/a.md" },
    { atom: { ...base, atom_id: "atom_b", review_status: "approved" }, file_path: "knowledge/approved/b.md" },
    { atom: { ...base, atom_id: "atom_c", review_status: "rejected" }, file_path: "knowledge/rejected/c.md" }
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.atom_ids.sort(), ["atom_a", "atom_b"]);
});

test("P6 daily calendar combines run history and atom review status", () => {
  const atom = buildAtom({ atom_id: "atom_calendar", review_status: "approved", created_at: "2026-06-23T09:00:00.000Z" });
  const calendar = buildDailyKnowledgeCalendar([
    { atom, file_path: "knowledge/approved/atom_calendar.md" },
    { atom: { ...atom, atom_id: "atom_pending", review_status: "pending" }, file_path: "knowledge/inbox/atom_pending.md" }
  ], [
    buildDailyRun({ run_id: "run_ok", run_date: "2026-06-23", status: "completed", generated_atom_ids: ["atom_calendar"] }),
    buildDailyRun({ run_id: "run_failed", run_date: "2026-06-23", status: "failed", generated_atom_ids: [] })
  ]);

  assert.equal(calendar[0]?.date, "2026-06-23");
  assert.equal(calendar[0]?.run_count, 2);
  assert.equal(calendar[0]?.generated_atom_count, 1);
  assert.equal(calendar[0]?.approved_atom_count, 1);
  assert.equal(calendar[0]?.pending_atom_count, 1);
  assert.equal(calendar[0]?.failed_run_count, 1);
});

test("P6 export, obsidian index, backup and restore operate on local vault", async () => {
  const vaultRoot = await createTempVault();
  const atom = buildAtom({ atom_id: "atom_export", title: "导出知识", review_status: "approved" });
  await writeAtom(vaultRoot, atom);
  await writeFile(path.join(vaultRoot, "data/runtime/knowledge-atoms-index.json"), "[]\n", "utf8");

  const exported = await exportKnowledgeMarkdown(vaultRoot, new Date("2026-06-23T10:00:00.000Z"));
  assert.equal(exported.exported_file_count, 1);
  assert.match(await readFile(path.join(vaultRoot, exported.index_path), "utf8"), /导出知识/);

  const obsidian = await ensureObsidianCompatibility(vaultRoot, new Date("2026-06-23T10:10:00.000Z"));
  assert.equal(obsidian.index_path, "knowledge/_index.md");
  assert.match(await readFile(path.join(vaultRoot, "knowledge/_index.md"), "utf8"), /\[\[approved\//);

  const backup = await createKnowledgeBackup(vaultRoot, new Date("2026-06-23T10:20:00.000Z"));
  assert.equal(backup.copied_dir_count >= 2, true);
  await rm(path.join(vaultRoot, "knowledge"), { recursive: true, force: true });
  const restored = await restoreLatestKnowledgeBackup(vaultRoot);

  assert.equal(restored.restored_dir_count >= 2, true);
  assert.match(await readFile(path.join(vaultRoot, "knowledge/approved/2026-06-23-atom_export-导出知识.md"), "utf8"), /导出知识/);
});

async function createTempVault(): Promise<string> {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p6-"));
  await mkdir(path.join(vaultRoot, "knowledge/approved"), { recursive: true });
  await mkdir(path.join(vaultRoot, "knowledge/inbox"), { recursive: true });
  await mkdir(path.join(vaultRoot, "data/runtime"), { recursive: true });
  await mkdir(path.join(vaultRoot, "data/daily_runs"), { recursive: true });
  await mkdir(path.join(vaultRoot, "logs"), { recursive: true });
  return vaultRoot;
}

async function writeAtom(vaultRoot: string, atom: KnowledgeAtom): Promise<void> {
  const document = buildKnowledgeAtomMarkdownDocument(atom);
  const filePath = path.join(vaultRoot, document.file_path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderKnowledgeAtomMarkdown(document), "utf8");
}

function buildAtom(input: Partial<KnowledgeAtom>): KnowledgeAtom {
  const now = input.created_at ?? "2026-06-23T09:00:00.000Z";
  return {
    schema_version: SCHEMA_VERSION.knowledgeAtom,
    atom_id: input.atom_id ?? "atom_one",
    title: input.title ?? "默认知识",
    type: input.type ?? "观点",
    content: input.content ?? "这是一条用于 P6 验收的知识内容。",
    source_app: input.source_app ?? "codex",
    source_record_ids: input.source_record_ids ?? ["record_one"],
    source_raw_paths: input.source_raw_paths ?? ["raw/imports/codex/one.md"],
    project: input.project ?? "personal",
    tags: input.tags ?? ["review"],
    sensitivity: input.sensitivity ?? "personal",
    review_status: input.review_status ?? "pending",
    evidence: input.evidence ?? "用户明确表达了该观点。",
    merged_into: input.merged_into ?? "",
    created_at: now,
    updated_at: input.updated_at ?? now
  };
}

function buildDailyRun(input: Partial<DailyRun>): DailyRun {
  const now = "2026-06-23T10:00:00.000Z";
  return {
    schema_version: SCHEMA_VERSION.dailyRun,
    run_id: input.run_id ?? "run_one",
    run_date: input.run_date ?? "2026-06-23",
    status: input.status ?? "completed",
    started_at: now,
    finished_at: now,
    source_apps: input.source_apps ?? ["codex"],
    imported_raw_paths: input.imported_raw_paths ?? [],
    normalized_record_ids: input.normalized_record_ids ?? [],
    generated_atom_ids: input.generated_atom_ids ?? [],
    errors: input.errors ?? [],
    created_at: now,
    updated_at: now
  };
}
