import { buildLaunchReadinessReport } from "../app/core";

const report = buildLaunchReadinessReport();
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--strict") && report.status !== "ready") {
  process.exit(1);
}
