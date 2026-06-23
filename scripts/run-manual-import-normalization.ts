import process from "node:process";
import { runManualImportNormalization } from "../app/core";
import type { SourceApp } from "../app/schemas";

type CliOptions = {
  vault_root: string;
  source_app: SourceApp;
  run_id?: string;
  run_date?: string;
  default_sensitivity_when_missing?: "personal" | "private" | "confidential";
};

const SOURCE_APPS = new Set<SourceApp>(["codex", "cursor", "deepseek", "doubao", "workbuddy"]);

const options = parseArgs(process.argv.slice(2));
const summary = await runManualImportNormalization(options);
console.log(JSON.stringify(summary, null, 2));

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid argument pair near: ${key ?? ""}`);
    }

    values.set(key.slice(2), value);
  }

  const sourceApp = values.get("source-app") ?? "codex";
  if (!SOURCE_APPS.has(sourceApp as SourceApp)) {
    throw new Error(`Unsupported source app: ${sourceApp}`);
  }

  const result: CliOptions = {
    vault_root: values.get("vault-root") ?? process.cwd(),
    source_app: sourceApp as SourceApp
  };
  const runId = values.get("run-id");
  const runDate = values.get("run-date");
  const defaultSensitivityMissing = values.get("default-sensitivity-missing");
  if (runId) {
    result.run_id = runId;
  }
  if (runDate) {
    result.run_date = runDate;
  }
  if (
    defaultSensitivityMissing === "personal" ||
    defaultSensitivityMissing === "private" ||
    defaultSensitivityMissing === "confidential"
  ) {
    result.default_sensitivity_when_missing = defaultSensitivityMissing;
  }

  return result;
}
