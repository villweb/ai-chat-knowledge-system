import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runQualityGate, type QualityCheckId } from "../app/core";

test("P10 quality gate covers every launch checklist item and passes", async () => {
  const report = await runQualityGate(process.cwd(), new Date("2026-06-23T10:00:00.000Z"));
  const expected: QualityCheckId[] = ["P10-01", "P10-02", "P10-03", "P10-04", "P10-05", "P10-06", "P10-07", "P10-08", "P10-09", "P10-10"];
  const actual = report.checks.map((check) => check.check_id);

  assert.equal(report.status, "passed");
  assert.deepEqual(actual, expected);
  assert.equal(report.failed_count, 0);
  assert.equal(report.warning_count, 0);
  assert.equal(report.passed_count, 10);
  assert.equal(report.checks.every((check) => check.evidence.length > 0), true);
});

test("P10 quality gate CLI report can be saved as an artifact", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p10-report-"));
  const output = path.join(tmp, "quality-gate-report.json");
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/quality-gate.ts", "--project-root", process.cwd(), "--output", output], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(output, "utf8")) as { status: string; checks: unknown[] };
  assert.equal(report.status, "passed");
  assert.equal(report.checks.length, 10);
});

test("P10 release workflow runs the quality gate before installer builds", async () => {
  const workflow = await readFile(".github/workflows/release-build.yml", "utf8");

  assert.match(workflow, /npm run quality:gate/);
});
