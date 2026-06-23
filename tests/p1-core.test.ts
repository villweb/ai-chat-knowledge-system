import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { normalizeManualImport, rebuildLocalIndexes, runManualImportNormalization } from "../app/core";
import type { RawSourceDocument } from "../app/connectors";
import { buildRunLogEvent } from "../app/services";
import { LocalStorageProvider, SQLiteNormalizedRecordStore, toSafeTitle } from "../app/storage";

test("normalizeManualImport defaults unknown sensitivity to private and blocks personal KB entry", () => {
  const document: RawSourceDocument = {
    source_app: "codex",
    source_type: "manual_export",
    raw_path: "raw/imports/codex/private.json",
    raw_source: "unit_test",
    detected_at: "2026-06-23T00:00:00.000Z",
    content_type: "json",
    content: JSON.stringify({
      conversation_id: "private-default",
      user_message: "这条记录没有显式敏感度。",
      ai_message: "应默认阻断。"
    })
  };

  const [record] = normalizeManualImport(document, "2026-06-23T00:00:00.000Z");
  assert.ok(record);
  assert.equal(record.sensitivity, "private");
  assert.equal(record.can_enter_personal_kb, false);
});

test("runManualImportNormalization archives raw files, writes SQLite records, pending cards and daily run", async () => {
  const vaultRoot = await createTempVault();
  await writeCodexSamples(vaultRoot);

  const firstSummary = await runManualImportNormalization({
    vault_root: vaultRoot,
    source_app: "codex",
    run_id: "run_p1_test"
  });

  assert.equal(firstSummary.imported_file_count, 2);
  assert.equal(firstSummary.normalized_record_count, 2);
  assert.equal(firstSummary.generated_atom_count, 2);
  assert.equal(firstSummary.failed_file_count, 0);

  const archiveFiles = await listFiles(path.join(vaultRoot, "raw/archive/codex"));
  assert.equal(archiveFiles.length, 2);
  assert.ok(archiveFiles.every((file) => file.includes("raw/archive/codex/")));

  const inboxFiles = await listFiles(path.join(vaultRoot, "knowledge/inbox"));
  assert.equal(inboxFiles.length, 2);

  const store = new SQLiteNormalizedRecordStore({
    vault_root: vaultRoot,
    sqlite_path: "data/runtime/normalized-records.sqlite"
  });
  const records = await store.findNormalizedRecords({ include_blocked: true });
  store.close();

  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.raw_archive_path.startsWith("raw/archive/codex/")));
  assert.ok(records.every((record) => record.raw_checksum.length === 64));

  const storage = new LocalStorageProvider({
    vault_root: vaultRoot,
    sqlite_path: "data/runtime/normalized-records.sqlite"
  });
  const indexedAtom = await storage.findKnowledgeAtom(firstAtomId(records));
  storage.close();
  assert.equal(indexedAtom?.review_status, "pending");
  assert.ok(indexedAtom?.content.includes("后续 P2"));

  const dailyRun = JSON.parse(await readFile(path.join(vaultRoot, "data/daily_runs/run_p1_test.json"), "utf8")) as {
    status: string;
    imported_raw_paths: string[];
    normalized_record_ids: string[];
    generated_atom_ids: string[];
  };
  assert.equal(dailyRun.status, "completed");
  assert.equal(dailyRun.imported_raw_paths.length, 2);
  assert.equal(dailyRun.normalized_record_ids.length, 2);
  assert.equal(dailyRun.generated_atom_ids.length, 2);

  const rebuildSummary = await rebuildLocalIndexes({ vault_root: vaultRoot });
  assert.equal(rebuildSummary.archived_file_count, 2);
  assert.equal(rebuildSummary.normalized_record_count, 2);
  assert.equal(rebuildSummary.knowledge_atom_count, 2);

  const secondSummary = await runManualImportNormalization({
    vault_root: vaultRoot,
    source_app: "codex",
    run_id: "run_p1_test_second"
  });
  const inboxFilesAfterSecondRun = await listFiles(path.join(vaultRoot, "knowledge/inbox"));

  assert.equal(secondSummary.generated_atom_count, 2);
  assert.equal(inboxFilesAfterSecondRun.length, 2);
});

test("log sanitization and safe title formatting stay stable", () => {
  const event = buildRunLogEvent({
    run_id: "run_test",
    level: "error",
    event_type: "failed",
    message: "调用失败 sk-test_secret_123456，请检查",
    raw_path: "raw/imports/codex/secret.md"
  }, "2026-06-23T00:00:00.000Z");

  assert.equal(event.message, "调用失败 [redacted_api_key]，请检查");
  assert.equal(event.raw_file_name, "secret.md");
  assert.equal(toSafeTitle(" a/b:c*?<>| title "), "abc-title");
});

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p1-"));
}

async function writeCodexSamples(vaultRoot: string): Promise<void> {
  const importRoot = path.join(vaultRoot, "raw/imports/codex");
  await mkdir(importRoot, { recursive: true });
  await writeFile(path.join(importRoot, ".gitkeep"), "", "utf8");

  await writeFile(path.join(importRoot, "sample.md"), `---
source_app: codex
source_type: manual_export
conversation_id: test-md
message_time: "2026-06-23T09:00:00+08:00"
project: P1测试
topic: Markdown 示例
raw_source: 测试
sensitivity: personal
---

# 示例

## 用户消息

请记录这条 Markdown 对话。

## AI 回复

我会把它标准化。
`, "utf8");

  await writeFile(path.join(importRoot, "sample.json"), JSON.stringify({
    source_app: "codex",
    source_type: "manual_export",
    conversation_id: "test-json",
    message_time: "2026-06-23T09:10:00+08:00",
    project: "P1测试",
    topic: "JSON 示例",
    raw_source: "测试",
    sensitivity: "personal",
    user_message: "请记录这条 JSON 对话。",
    ai_message: "我会把它标准化。"
  }, null, 2), "utf8");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.join(root, entry.name));
}

function firstAtomId(records: Array<{ record_id: string }>): string {
  const first = records[0];
  assert.ok(first);
  return `atom_${createHashForTest(first.record_id)}`;
}

function createHashForTest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
