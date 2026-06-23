import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  applyRawRetentionPolicy,
  deleteAllUserData,
  deleteSourceData,
  exportUserData,
  getPrivacySecurityState,
  getSecureCredentialState,
  loadSecureCredential,
  savePrivacySecuritySettings,
  saveSecureCredential,
  scanSensitiveContent,
  writePrivacyLegalDrafts
} from "../app/core";

test("P7 sensitive scanner blocks secrets and business-private content locally", () => {
  const result = scanSensitiveContent("客户合同包含 api_key: sk-test-secret-1234567890，请不要上传。");

  assert.equal(result.sensitivity, "confidential");
  assert.equal(result.can_enter_personal_kb, false);
  assert.equal(result.findings.some((item) => item.rule_id === "api_key"), true);
  assert.equal(result.findings.some((item) => item.rule_id === "business_private"), true);
  assert.equal(result.findings.some((item) => item.match_preview.includes("sk-test-secret-1234567890")), false);
});

test("P7 privacy settings and source authorization are readable", async () => {
  const vaultRoot = await createTempVault();
  await savePrivacySecuritySettings(vaultRoot, { raw_retention_mode: "delete_after_days", raw_retention_days: 7 }, "2026-06-23T12:00:00.000Z");

  const state = await getPrivacySecurityState(vaultRoot);

  assert.equal(state.settings.raw_retention_mode, "delete_after_days");
  assert.equal(state.settings.raw_retention_days, 7);
  assert.equal(state.sources.some((item) => item.source_app === "codex" && item.reads.length > 0 && item.does_not_read.length > 0), true);
});

test("P7 encrypted API key storage does not write plaintext", async () => {
  const vaultRoot = await createTempVault();
  const secret = "sk-test-secret-value-1234567890";
  await saveSecureCredential(vaultRoot, { service: "openai-compatible", api_key: secret, base_url: "https://api.example.com/v1", model: "model-one" }, "2026-06-23T12:10:00.000Z");

  const encryptedFile = await readFile(path.join(vaultRoot, "data/runtime/secure/credentials.json.enc"), "utf8");
  const loaded = await loadSecureCredential(vaultRoot);
  const state = await getSecureCredentialState(vaultRoot);

  assert.equal(encryptedFile.includes(secret), false);
  assert.equal(loaded?.api_key, secret);
  assert.equal(loaded?.base_url, "https://api.example.com/v1");
  assert.equal(state.openai_compatible_saved, true);
});

test("P7 source deletion, retention, export, legal drafts and full deletion work locally", async () => {
  const vaultRoot = await createTempVault();
  await mkdir(path.join(vaultRoot, "raw/imports/codex"), { recursive: true });
  await mkdir(path.join(vaultRoot, "raw/archive/codex"), { recursive: true });
  await mkdir(path.join(vaultRoot, "knowledge/inbox"), { recursive: true });
  await mkdir(path.join(vaultRoot, "logs"), { recursive: true });
  await writeFile(path.join(vaultRoot, "raw/imports/codex/one.md"), "import", "utf8");
  await writeFile(path.join(vaultRoot, "raw/archive/codex/old.md"), "archive", "utf8");
  await writeFile(path.join(vaultRoot, "knowledge/inbox/one.md"), "knowledge", "utf8");
  await writeFile(path.join(vaultRoot, "logs/run.jsonl"), "{}", "utf8");

  await savePrivacySecuritySettings(vaultRoot, { raw_retention_mode: "delete_after_days", raw_retention_days: 0 }, "2026-06-23T12:20:00.000Z");
  const retention = await applyRawRetentionPolicy(vaultRoot, new Date("2026-06-23T12:21:00.000Z"));
  assert.equal(retention.deleted_paths.includes("raw/archive/codex/old.md"), true);

  await writeFile(path.join(vaultRoot, "raw/archive/codex/new.md"), "archive", "utf8");
  const deletedSource = await deleteSourceData(vaultRoot, "codex");
  assert.deepEqual(deletedSource.deleted_paths.sort(), ["raw/archive/codex", "raw/imports/codex"]);

  const exported = await exportUserData(vaultRoot, new Date("2026-06-23T12:30:00.000Z"));
  assert.equal(exported.copied_dir_count >= 2, true);
  assert.match(await readFile(path.join(vaultRoot, exported.manifest_path), "utf8"), /user_data_export/);

  const legal = await writePrivacyLegalDrafts(vaultRoot, new Date("2026-06-23T12:40:00.000Z"));
  assert.match(await readFile(path.join(vaultRoot, legal.privacy_policy_path), "utf8"), /隐私政策草案/);

  const deletedAll = await deleteAllUserData(vaultRoot);
  assert.equal(deletedAll.deleted_paths.includes("knowledge"), true);
  assert.equal(deletedAll.deleted_paths.includes("logs"), true);
});

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p7-"));
}
