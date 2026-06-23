import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  activateLicense,
  createActivationCode,
  createFeedbackDraft,
  getCommercialState,
  saveAccountLoginIntent,
  type LicenseActivationPayload
} from "../app/core";

test("P9 default commercial state starts a local trial and keeps export available", async () => {
  const vaultRoot = await createTempVault();
  const state = await getCommercialState(vaultRoot, new Date("2026-06-23T10:00:00.000Z"));

  assert.equal(state.runtime.license_status, "trial_active");
  assert.equal(state.runtime.plan_id, "trial");
  assert.equal(state.access.can_use_paid_features, true);
  assert.equal(state.access.can_export_existing_data, true);
  assert.equal(state.plans.some((plan) => plan.plan_id === "free" && plan.limits.export_existing_data), true);
  assert.equal(state.plans.some((plan) => plan.plan_id === "pro" && plan.limits.automation), true);
});

test("P9 expired trial locks paid features but not existing data export", async () => {
  const vaultRoot = await createTempVault();
  await getCommercialState(vaultRoot, new Date("2026-06-01T00:00:00.000Z"));

  const state = await getCommercialState(vaultRoot, new Date("2026-06-20T00:00:00.000Z"));

  assert.equal(state.runtime.license_status, "trial_expired");
  assert.equal(state.access.effective_plan_id, "free");
  assert.equal(state.access.can_use_paid_features, false);
  assert.equal(state.access.can_export_existing_data, true);
  assert.equal(state.notices.some((notice) => notice.title === "试用已结束"), true);
});

test("P9 signed activation code enables paid offline license", async () => {
  const vaultRoot = await createTempVault();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payload: LicenseActivationPayload = {
    schema_version: "license_activation.v1",
    license_id: "lic_test_001",
    plan_id: "pro",
    account_email: "user@example.com",
    issued_at: "2026-06-23T10:00:00.000Z",
    expires_at: "2027-06-23T10:00:00.000Z"
  };
  const code = createActivationCode(payload, privateKey.export({ type: "pkcs8", format: "pem" }).toString());

  const result = await activateLicense(vaultRoot, { activation_code: code }, new Date("2026-06-23T10:05:00.000Z"), publicKey.export({ type: "spki", format: "pem" }).toString());

  assert.equal(result.ok, true);
  assert.equal(result.state.runtime.license_status, "active");
  assert.equal(result.state.runtime.plan_id, "pro");
  assert.equal(result.state.runtime.license_id, "lic_test_001");
  assert.equal(result.state.runtime.account_email, "user@example.com");
  assert.equal(result.state.access.can_use_paid_features, true);
  assert.equal(result.state.access.can_export_existing_data, true);
  assert.match(result.state.runtime.offline_valid_until, /^2026-07-23/);
});

test("P9 invalid activation and account entry do not block data export", async () => {
  const vaultRoot = await createTempVault();
  const invalid = await activateLicense(vaultRoot, { activation_code: "bad-code" }, new Date("2026-06-23T10:00:00.000Z"));
  const withAccount = await saveAccountLoginIntent(vaultRoot, { account_email: "buyer@example.com" }, new Date("2026-06-23T10:10:00.000Z"));

  assert.equal(invalid.ok, false);
  assert.equal(invalid.state.access.can_export_existing_data, true);
  assert.equal(withAccount.runtime.account_email, "buyer@example.com");
  assert.equal(withAccount.access.can_export_existing_data, true);
});

test("P9 purchase, website, update announcement and feedback entry are available", async () => {
  const vaultRoot = await createTempVault();
  const state = await getCommercialState(vaultRoot, new Date("2026-06-23T10:00:00.000Z"));
  const feedback = await createFeedbackDraft(vaultRoot, { category: "feature", contact_email: "user@example.com", message: "希望支持更多导入来源。" }, new Date("2026-06-23T10:15:00.000Z"));

  assert.match(state.purchase.purchase_url, /^https:\/\//);
  assert.equal(state.website.required_pages.some((page) => page.page_id === "pricing"), true);
  assert.match(state.update_announcement.announcement_url, /^https:\/\//);
  assert.match(state.feedback.support_email, /@/);
  assert.match(await readFile(path.join(vaultRoot, feedback.draft_path), "utf8"), /希望支持更多导入来源/);
});

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p9-"));
}
