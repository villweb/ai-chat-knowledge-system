import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  extractKnowledgeAtoms,
  prepareRecordForAI,
  runManualImportNormalization,
  type KnowledgeAtomDraft,
  type KnowledgeAtomGenerationRequest,
  type KnowledgeAtomGenerator
} from "../app/core";
import { SCHEMA_VERSION, type NormalizedRecord } from "../app/schemas";
import { LocalStorageProvider } from "../app/storage";

const SQLITE_PATH = "data/runtime/normalized-records.sqlite";

test("P2 extraction refuses to run without explicit authorization", async () => {
  const vaultRoot = await createTempVault();
  await writeSample(vaultRoot, "clean", { user_message: "请帮我复盘这次产品决策。" });
  await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "import_auth" });

  await assert.rejects(
    () => extractKnowledgeAtoms({
      vault_root: vaultRoot,
      source_app: "codex",
      provider: "fixture",
      allow_ai: false
    }),
    /explicit user authorization/
  );
});

test("P2 input preparation redacts secrets and blocks non-personal and business-risk records", () => {
  const redacted = prepareRecordForAI(buildRecord({
    user_message: "请检查 sk-secret_123456 和 /Users/may/secret/file.txt 还有 mail@example.com"
  }));
  assert.ok(redacted);
  assert.equal(redacted.ai_input.user_excerpt.includes("sk-secret"), false);
  assert.equal(redacted.ai_input.user_excerpt.includes("/Users/may/secret"), false);
  assert.ok(redacted.ai_input.user_excerpt.includes("[redacted_api_key]"));
  assert.ok(redacted.ai_input.user_excerpt.includes("<local_path>"));
  assert.ok(redacted.ai_input.user_excerpt.includes("<email>"));

  assert.equal(prepareRecordForAI(buildRecord({ sensitivity: "private", can_enter_personal_kb: false })), null);
  assert.equal(prepareRecordForAI(buildRecord({ user_message: "这是公司项目的内部客户合同细节。" })), null);
});

test("P2 fixture run sends only allowed records and writes pending candidates with archive sources", async () => {
  const vaultRoot = await createTempVault();
  await writeSample(vaultRoot, "clean", { user_message: "请帮我复盘这次产品决策，并提炼一个可复用方法。" });
  await writeSample(vaultRoot, "blocked", { user_message: "这是公司客户的合同细节，请勿外传。" });
  await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "import_block" });

  const summary = await extractKnowledgeAtoms({
    vault_root: vaultRoot,
    source_app: "codex",
    provider: "fixture",
    allow_ai: true,
    run_id: "extract_block"
  });

  assert.equal(summary.selected_record_count, 2);
  assert.equal(summary.sent_record_count, 1);
  assert.equal(summary.blocked_record_count, 1);
  assert.equal(summary.generated_atom_count, 1);

  const storage = new LocalStorageProvider({ vault_root: vaultRoot, sqlite_path: SQLITE_PATH });
  const atom = await storage.findKnowledgeAtom(summary.generated_atom_ids[0] ?? "");
  storage.close();
  assert.equal(atom?.review_status, "pending");
  assert.ok((atom?.source_record_ids.length ?? 0) > 0);
  assert.ok(atom?.evidence && atom.evidence.length > 0);
  assert.ok(atom?.source_raw_paths.every((rawPath) => rawPath.startsWith("raw/archive/codex/")));
});

test("P2 run writes a daily summary file matching the returned counts", async () => {
  const vaultRoot = await createTempVault();
  await writeSample(vaultRoot, "clean", { user_message: "请帮我复盘这次产品决策。" });
  await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "import_summary" });

  const summary = await extractKnowledgeAtoms({
    vault_root: vaultRoot,
    source_app: "codex",
    provider: "fixture",
    allow_ai: true,
    run_id: "extract_summary"
  });

  const dailySummary = JSON.parse(
    await readFile(path.join(vaultRoot, summary.daily_summary_path), "utf8")
  ) as { run_id: string; provider: string; generated_atom_count: number; generated_atom_ids: string[] };
  assert.equal(dailySummary.run_id, "extract_summary");
  assert.equal(dailySummary.provider, "fixture");
  assert.equal(dailySummary.generated_atom_count, summary.generated_atom_count);
  assert.deepEqual(dailySummary.generated_atom_ids, summary.generated_atom_ids);
});

test("P2 skips low-value drafts and drafts referencing unknown records", async () => {
  const vaultRoot = await createTempVault();
  await writeSample(vaultRoot, "clean", { user_message: "请帮我复盘这次产品决策。" });
  await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "import_lowvalue" });

  const lowValue = await extractKnowledgeAtoms(
    { vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "extract_lowvalue" },
    generator((request) => request.records.map((record) => ({
      title: "低价值候选",
      type: "观点",
      content: "短",
      evidence: "x",
      source_record_ids: [record.record_id],
      tags: [],
      sensitivity: "personal",
      confidence_level: "low"
    })))
  );
  assert.equal(lowValue.generated_atom_count, 0);
  assert.equal(lowValue.skipped_low_value_count, 1);

  const unknownRef = await extractKnowledgeAtoms(
    { vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "extract_unknownref" },
    generator(() => [{
      title: "引用不存在的记录",
      type: "观点",
      content: "这是一段足够长的正文，用于通过低价值过滤。",
      evidence: "足够长的证据摘录。",
      source_record_ids: ["rec_does_not_exist"],
      tags: [],
      sensitivity: "personal",
      confidence_level: "high"
    }])
  );
  assert.equal(unknownRef.generated_atom_count, 0);
  assert.equal(unknownRef.skipped_low_value_count, 1);
});

test("P2 reports duplicates and merge suggestions on a second run instead of overwriting", async () => {
  const vaultRoot = await createTempVault();
  await writeSample(vaultRoot, "clean", { user_message: "请帮我复盘这次产品决策。" });
  await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "import_dedup" });

  const first = await extractKnowledgeAtoms({
    vault_root: vaultRoot,
    source_app: "codex",
    provider: "fixture",
    allow_ai: true,
    run_id: "extract_dedup_first"
  });
  assert.equal(first.generated_atom_count, 1);
  assert.equal(first.duplicate_atom_count, 0);

  const second = await extractKnowledgeAtoms({
    vault_root: vaultRoot,
    source_app: "codex",
    provider: "fixture",
    allow_ai: true,
    run_id: "extract_dedup_second"
  });
  assert.equal(second.generated_atom_count, 0);
  assert.equal(second.duplicate_atom_count, 1);
  assert.equal(second.merge_suggestion_count, 1);
});

function generator(
  fn: (request: KnowledgeAtomGenerationRequest) => KnowledgeAtomDraft[]
): KnowledgeAtomGenerator {
  return {
    async generateKnowledgeAtoms(request) {
      return fn(request);
    }
  };
}

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p2-"));
}

async function writeSample(
  vaultRoot: string,
  name: string,
  overrides: Partial<{ user_message: string; ai_message: string; sensitivity: string; topic: string }>
): Promise<void> {
  const importRoot = path.join(vaultRoot, "raw/imports/codex");
  await mkdir(importRoot, { recursive: true });
  await writeFile(path.join(importRoot, `${name}.json`), JSON.stringify({
    source_app: "codex",
    source_type: "manual_export",
    conversation_id: `p2-${name}`,
    message_time: "2026-06-23T09:00:00+08:00",
    project: "P2测试",
    topic: overrides.topic ?? `P2 ${name} 示例`,
    raw_source: "测试",
    sensitivity: overrides.sensitivity ?? "personal",
    user_message: overrides.user_message ?? "请记录这条对话。",
    ai_message: overrides.ai_message ?? "我会把它标准化。"
  }, null, 2), "utf8");
}

function buildRecord(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    schema_version: SCHEMA_VERSION.normalizedRecord,
    record_id: "rec_p2_unit",
    source_app: "codex",
    source_type: "manual_export",
    conversation_id: "p2-unit",
    parent_conversation_id: "p2-unit",
    turn_index: 0,
    message_index_start: 0,
    message_index_end: 1,
    message_time: "2026-06-23T10:00:00+08:00",
    project: "personal",
    topic: "P2 单元测试",
    user_message: "请帮我复盘这次产品决策。",
    ai_message: "收到。",
    raw_path: "raw/imports/codex/unit.md",
    raw_archive_path: "raw/archive/codex/unit.md",
    raw_checksum: "0".repeat(64),
    raw_source: "unit_test",
    sensitivity: "personal",
    can_enter_personal_kb: true,
    created_at: "2026-06-23T10:00:00+08:00",
    updated_at: "2026-06-23T10:00:00+08:00",
    ...overrides
  };
}
