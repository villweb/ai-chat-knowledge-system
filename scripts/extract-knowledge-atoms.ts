import process from "node:process";
import {
  extractKnowledgeAtoms,
  type KnowledgeExtractionProviderName
} from "../app/core";
import type { SourceApp } from "../app/schemas";

type CliOptions = {
  vault_root: string;
  allow_ai: boolean;
  provider: KnowledgeExtractionProviderName;
  source_app?: SourceApp;
  run_id?: string;
  run_date?: string;
};

const options = parseArgs(process.argv.slice(2));
const summary = await extractKnowledgeAtoms({
  ...options
});

console.log(JSON.stringify(summary, null, 2));

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith("--")) {
      throw new Error(`Invalid argument: ${key ?? ""}`);
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key.slice(2), next);
      index += 1;
    } else {
      values.set(key.slice(2), true);
    }
  }

  const provider = values.get("provider") ?? "fixture";
  if (provider !== "fixture" && provider !== "openai-compatible") {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const sourceApp = values.get("source-app");
  if (
    sourceApp !== undefined &&
    sourceApp !== "codex" &&
    sourceApp !== "cursor" &&
    sourceApp !== "deepseek" &&
    sourceApp !== "doubao" &&
    sourceApp !== "workbuddy"
  ) {
    throw new Error(`Unsupported source app: ${sourceApp}`);
  }

  const result: CliOptions = {
    vault_root: String(values.get("vault-root") ?? process.cwd()),
    allow_ai: values.get("allow-ai") === true,
    provider,
    ...(sourceApp ? { source_app: sourceApp } : {})
  };
  const runId = values.get("run-id");
  const runDate = values.get("run-date");
  if (runId) {
    result.run_id = String(runId);
  }
  if (runDate) {
    result.run_date = String(runDate);
  }

  return result;
}
