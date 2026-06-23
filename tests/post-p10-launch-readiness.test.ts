import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildLaunchReadinessReport, type LaunchReadinessEnv } from "../app/core";

const readyEnv: LaunchReadinessEnv = {
  CSC_LINK: "configured",
  CSC_KEY_PASSWORD: "configured",
  APPLE_ID: "dev@example.com",
  APPLE_APP_SPECIFIC_PASSWORD: "configured",
  APPLE_TEAM_ID: "TEAMID",
  WIN_CSC_LINK: "configured",
  WIN_CSC_KEY_PASSWORD: "configured",
  AI_KB_UPDATE_URL: "https://updates.example.com",
  AI_KB_LICENSE_PUBLIC_KEY: "configured",
  AI_KB_LICENSE_SERVER_URL: "https://license.example.com",
  AI_KB_PAYMENT_URL: "https://pay.example.com",
  AI_KB_ACCOUNT_URL: "https://account.example.com",
  AI_KB_FEEDBACK_URL: "https://feedback.example.com",
  AI_KB_SUPPORT_EMAIL: "support@example.com"
};

test("post-P10 launch readiness reports missing external launch resources", () => {
  const report = buildLaunchReadinessReport({});

  assert.equal(report.schema_version, "launch_readiness_report.v1");
  assert.equal(report.status, "blocked");
  assert.equal(report.ready_count, 0);
  assert.equal(report.blocked_count, 6);
  assert.deepEqual(
    report.items.map((item) => item.item_id),
    ["mac_signing", "windows_signing", "update_server", "license_server", "payment_account", "feedback_support"]
  );
  const macSigning = report.items.find((item) => item.item_id === "mac_signing");
  assert.ok(macSigning);
  assert.match(macSigning.missing.join(","), /CSC_LINK/);
});

test("post-P10 launch readiness passes after all required release settings are configured", () => {
  const report = buildLaunchReadinessReport(readyEnv);

  assert.equal(report.status, "ready");
  assert.equal(report.ready_count, 6);
  assert.equal(report.blocked_count, 0);
  assert.equal(report.items.every((item) => item.missing.length === 0), true);
});

test("post-P10 launch readiness requires https URLs for service endpoints", () => {
  const report = buildLaunchReadinessReport({
    ...readyEnv,
    AI_KB_PAYMENT_URL: "http://pay.example.com"
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.items.find((item) => item.item_id === "payment_account")?.missing, ["AI_KB_PAYMENT_URL"]);
});

test("post-P10 launch readiness CLI supports strict release blocking mode", () => {
  const blocked = spawnSync(process.execPath, ["--import", "tsx", "scripts/launch-readiness.ts", "--strict"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      CSC_LINK: "",
      AI_KB_UPDATE_URL: ""
    }
  });

  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stdout, /launch_readiness_report\.v1/);

  const ready = spawnSync(process.execPath, ["--import", "tsx", "scripts/launch-readiness.ts", "--strict"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...readyEnv
    }
  });

  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stdout, /"status": "ready"/);
});

test("post-P10 release workflow publishes tag builds as draft GitHub releases", async () => {
  const workflow = await readFile(".github/workflows/release-build.yml", "utf8");

  assert.match(workflow, /permissions:\n\s+contents: write/);
  assert.match(workflow, /npm run launch:readiness/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /draft: true/);
});
