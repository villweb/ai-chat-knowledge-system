import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createSourceConnector,
  listSourceConnectorManifests
} from "../app/connectors";
import { runManualImportNormalization } from "../app/core";
import type { SourceApp, SourceType } from "../app/schemas";
import { SQLiteNormalizedRecordStore } from "../app/storage";

test("P4 connector registry exposes available and reserved sources with permission notes", () => {
  const connectors = listSourceConnectorManifests();
  const bySource = new Map(connectors.map((connector) => [connector.source_app, connector]));

  for (const sourceApp of ["codex", "cursor", "deepseek"] as const) {
    const connector = bySource.get(sourceApp);
    assert.ok(connector);
    assert.equal(connector.status, "available");
    assert.equal(connector.default_enabled, true);
    assert.ok(connector.reads.length > 0);
    assert.ok(connector.does_not_read.length > 0);
    assert.ok(connector.permission_scope.length > 0);
    assert.ok(connector.local_record_recognition.length > 0);
  }

  for (const sourceApp of ["doubao", "workbuddy"] as const) {
    const connector = bySource.get(sourceApp);
    assert.ok(connector);
    assert.equal(connector.status, "reserved");
    assert.equal(connector.default_enabled, false);
    assert.throws(() => createSourceConnector(sourceApp), /reserved/);
  }
});

test("P4 Cursor connector imports local record files from its manual path", async () => {
  const vaultRoot = await createTempVault();
  await writeSourceSample(vaultRoot, {
    source_app: "cursor",
    source_type: "local_app",
    conversation_id: "cursor-local-record",
    topic: "Cursor 本地记录",
    user_message: "请记录 Cursor 中的一条项目偏好。",
    ai_message: "可以沉淀为个人偏好。"
  });

  const summary = await runManualImportNormalization({
    vault_root: vaultRoot,
    source_app: "cursor",
    run_id: "run_p4_cursor"
  });

  assert.equal(summary.imported_file_count, 1);
  assert.equal(summary.normalized_record_count, 1);
  assert.equal(summary.failed_file_count, 0);

  const records = await readRecords(vaultRoot);
  assert.equal(records[0]?.source_app, "cursor");
  assert.equal(records[0]?.source_type, "local_app");
  assert.equal(records[0]?.raw_source, "cursor_local_path");
  assert.ok(records[0]?.raw_path.startsWith("raw/imports/cursor/"));
});

test("P4 DeepSeek connector imports web export files from its import path", async () => {
  const vaultRoot = await createTempVault();
  await writeSourceSample(vaultRoot, {
    source_app: "deepseek",
    source_type: "web_export",
    conversation_id: "deepseek-web-export",
    topic: "DeepSeek 网页导出",
    user_message: "请记录 DeepSeek 网页端的一条观点。",
    ai_message: "可以进入待确认区。"
  });

  const summary = await runManualImportNormalization({
    vault_root: vaultRoot,
    source_app: "deepseek",
    run_id: "run_p4_deepseek"
  });

  assert.equal(summary.imported_file_count, 1);
  assert.equal(summary.normalized_record_count, 1);
  assert.equal(summary.failed_file_count, 0);

  const records = await readRecords(vaultRoot);
  assert.equal(records[0]?.source_app, "deepseek");
  assert.equal(records[0]?.source_type, "web_export");
  assert.equal(records[0]?.raw_source, "deepseek_export_file");
  assert.ok(records[0]?.raw_path.startsWith("raw/imports/deepseek/"));
});

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p4-"));
}

async function writeSourceSample(
  vaultRoot: string,
  input: {
    source_app: SourceApp;
    source_type: SourceType;
    conversation_id: string;
    topic: string;
    user_message: string;
    ai_message: string;
  }
): Promise<void> {
  const importRoot = path.join(vaultRoot, "raw/imports", input.source_app);
  await mkdir(importRoot, { recursive: true });
  await writeFile(path.join(importRoot, "sample.json"), JSON.stringify({
    source_app: input.source_app,
    source_type: input.source_type,
    conversation_id: input.conversation_id,
    message_time: "2026-06-23T12:00:00+08:00",
    project: "P4测试",
    topic: input.topic,
    sensitivity: "personal",
    user_message: input.user_message,
    ai_message: input.ai_message
  }, null, 2), "utf8");
}

async function readRecords(vaultRoot: string) {
  const store = new SQLiteNormalizedRecordStore({
    vault_root: vaultRoot,
    sqlite_path: "data/runtime/normalized-records.sqlite"
  });
  try {
    return await store.findNormalizedRecords({ include_blocked: true });
  } finally {
    store.close();
  }
}
