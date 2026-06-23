import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildDefaultDailyAutomationSettings,
  evaluateDailyAutomation,
  listDailyRunHistory,
  readDailyAutomationSettings
} from "../app/core";
import { SCHEMA_VERSION, type DailyRun } from "../app/schemas";

test("P5 default automation settings are conservative", async () => {
  const vaultRoot = await createTempVault();
  const settings = await readDailyAutomationSettings(vaultRoot);

  assert.equal(settings.enabled, false);
  assert.equal(settings.run_time_local, "22:30");
  assert.equal(settings.only_when_idle, true);
  assert.equal(settings.idle_threshold_seconds, 300);
  assert.equal(settings.require_confirmation, true);
  assert.equal(settings.notify_on_complete, true);
  assert.equal(settings.retry_count, 1);
  assert.equal(settings.retry_delay_minutes, 10);
});

test("P5 due run waits when idle threshold is not met", () => {
  const decision = evaluateDailyAutomation({
    settings: { ...buildDefaultDailyAutomationSettings(), enabled: true, run_time_local: "22:30" },
    history: [],
    now: new Date(2026, 5, 23, 22, 31, 0),
    idle_seconds: 120
  });

  assert.equal(decision.action, "waiting_idle");
});

test("P5 due run requires confirmation by default", () => {
  const decision = evaluateDailyAutomation({
    settings: { ...buildDefaultDailyAutomationSettings(), enabled: true, run_time_local: "22:30" },
    history: [],
    now: new Date(2026, 5, 23, 22, 31, 0),
    idle_seconds: 360
  });

  assert.equal(decision.action, "pending_confirmation");
});

test("P5 completed extraction skips same-day automation unless rerun is requested", () => {
  const settings = { ...buildDefaultDailyAutomationSettings(), enabled: true, run_time_local: "22:30" };
  const history = [{
    run_id: "p2_2026-06-23_completed",
    run_date: "2026-06-23",
    status: "completed" as const,
    source_apps: ["codex" as const],
    generated_atom_count: 1,
    error_summary: "",
    started_at: "2026-06-23T22:30:00.000Z",
    finished_at: "2026-06-23T22:31:00.000Z"
  }];

  const skipped = evaluateDailyAutomation({
    settings,
    history,
    now: new Date(2026, 5, 23, 22, 32, 0),
    idle_seconds: 360
  });
  assert.equal(skipped.action, "already_completed");

  const rerun = evaluateDailyAutomation({
    settings,
    history,
    now: new Date(2026, 5, 23, 22, 32, 0),
    idle_seconds: 360,
    allow_rerun: true
  });
  assert.equal(rerun.action, "run_now");
});

test("P5 cancelled same-day automation does not prompt again unless rerun is requested", () => {
  const settings = { ...buildDefaultDailyAutomationSettings(), enabled: true, run_time_local: "22:30" };
  const history = [{
    run_id: "auto_daily_2026-06-23_extract_cancelled",
    run_date: "2026-06-23",
    status: "cancelled" as const,
    source_apps: ["codex" as const],
    generated_atom_count: 0,
    error_summary: "",
    started_at: "2026-06-23T22:30:00.000Z",
    finished_at: "2026-06-23T22:30:00.000Z"
  }];

  const skipped = evaluateDailyAutomation({
    settings,
    history,
    now: new Date(2026, 5, 23, 22, 32, 0),
    idle_seconds: 360
  });
  assert.equal(skipped.action, "already_skipped");

  const rerun = evaluateDailyAutomation({
    settings,
    history,
    now: new Date(2026, 5, 23, 22, 32, 0),
    idle_seconds: 360,
    allow_rerun: true
  });
  assert.equal(rerun.action, "run_now");
});

test("P5 failure retry observes retry count and retry delay", () => {
  const settings = {
    ...buildDefaultDailyAutomationSettings(),
    enabled: true,
    run_time_local: "22:30",
    require_confirmation: false,
    retry_count: 1,
    retry_delay_minutes: 10
  };
  const history = [{
    run_id: "auto_daily_2026-06-23_extract_failed",
    run_date: "2026-06-23",
    status: "failed" as const,
    source_apps: ["codex" as const],
    generated_atom_count: 0,
    error_summary: "boom",
    started_at: "2026-06-23T14:30:00.000Z",
    finished_at: "2026-06-23T14:30:00.000Z"
  }];

  const waiting = evaluateDailyAutomation({
    settings,
    history,
    now: new Date("2026-06-23T14:35:00.000Z"),
    idle_seconds: 360
  });
  assert.equal(waiting.action, "retry_later");

  const retry = evaluateDailyAutomation({
    settings,
    history,
    now: new Date("2026-06-23T14:41:00.000Z"),
    idle_seconds: 360
  });
  assert.equal(retry.action, "retry_now");

  const exhausted = evaluateDailyAutomation({
    settings,
    history: [...history, { ...history[0]!, run_id: "auto_daily_2026-06-23_extract_failed_second" }],
    now: new Date("2026-06-23T14:52:00.000Z"),
    idle_seconds: 360
  });
  assert.equal(exhausted.action, "retry_exhausted");
});

test("P5 history aggregates daily run files with error summaries", async () => {
  const vaultRoot = await createTempVault();
  await writeDailyRun(vaultRoot, {
    run_id: "auto_daily_2026-06-23_extract",
    run_date: "2026-06-23",
    status: "failed",
    generated_atom_ids: [],
    errors: [{ code: "automation_run_failed", message: "导入失败", source_app: "codex" }]
  });
  await writeDailyRun(vaultRoot, {
    run_id: "auto_daily_2026-06-22_extract",
    run_date: "2026-06-22",
    status: "completed",
    generated_atom_ids: ["atom_one"],
    errors: []
  });
  await writeFile(path.join(vaultRoot, "data/daily_runs/summary-p2-summary.json"), JSON.stringify({ generated_atom_count: 1 }), "utf8");

  const history = await listDailyRunHistory(vaultRoot);

  assert.equal(history.length, 2);
  assert.equal(history[0]?.run_id, "auto_daily_2026-06-23_extract");
  assert.equal(history[0]?.error_summary, "导入失败");
  assert.equal(history[1]?.generated_atom_count, 1);
});

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p5-"));
}

async function writeDailyRun(
  vaultRoot: string,
  input: Pick<DailyRun, "run_id" | "run_date" | "status" | "generated_atom_ids" | "errors">
): Promise<void> {
  const root = path.join(vaultRoot, "data/daily_runs");
  await mkdir(root, { recursive: true });
  const now = input.run_date === "2026-06-23" ? "2026-06-23T22:30:00.000Z" : "2026-06-22T22:30:00.000Z";
  const run: DailyRun = {
    schema_version: SCHEMA_VERSION.dailyRun,
    run_id: input.run_id,
    run_date: input.run_date,
    status: input.status,
    started_at: now,
    finished_at: now,
    source_apps: ["codex"],
    imported_raw_paths: [],
    normalized_record_ids: [],
    generated_atom_ids: input.generated_atom_ids,
    errors: input.errors,
    created_at: now,
    updated_at: now
  };
  await writeFile(path.join(root, `${input.run_id}.json`), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}
