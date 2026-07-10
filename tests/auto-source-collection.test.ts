import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  listPendingAutoCollectionItems,
  markAutoCollectionItemsProcessed,
  readAutoCollectionSettings
} from "../app/core";

test("auto collection defaults off and tracks processed import files", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-auto-collection-"));
  const importRoot = path.join(vaultRoot, "raw/imports/codex");
  await mkdir(importRoot, { recursive: true });
  await writeFile(path.join(importRoot, "sample.json"), JSON.stringify({
    source_app: "codex",
    source_type: "manual_export",
    conversation_id: "auto-collection",
    sensitivity: "personal",
    user_message: "自动收集测试",
    ai_message: "应只处理一次"
  }), "utf8");

  const settings = await readAutoCollectionSettings(vaultRoot);
  assert.equal(settings.enabled, false);
  assert.equal(settings.scan_interval_minutes, 5);

  const pending = await listPendingAutoCollectionItems(vaultRoot, ["codex"]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.raw_path, "raw/imports/codex/sample.json");

  await markAutoCollectionItemsProcessed(vaultRoot, pending);
  const nextPending = await listPendingAutoCollectionItems(vaultRoot, ["codex"]);
  assert.equal(nextPending.length, 0);
});
