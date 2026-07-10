import process from "node:process";
import {
  getAutoCollectionState,
  listPendingAutoCollectionItems,
  markAutoCollectionItemsProcessed,
  saveAutoCollectionSettings
} from "../app/core";
import type { SourceApp } from "../app/schemas";

const SOURCE_APPS = new Set<SourceApp>(["codex", "cursor", "deepseek", "doubao", "workbuddy"]);
const action = process.argv[2];
const vaultRoot = getArgValue("--vault-root") ?? process.cwd();
const enabledSourceApps = parseSourceApps(getArgValue("--enabled") ?? "");

if (action === "get-state") {
  console.log(JSON.stringify(await getAutoCollectionState(vaultRoot, enabledSourceApps), null, 2));
} else if (action === "save-settings") {
  const input = await readStdinJson<Record<string, unknown>>();
  console.log(JSON.stringify(await saveAutoCollectionSettings(vaultRoot, input), null, 2));
} else if (action === "list-pending") {
  console.log(JSON.stringify(await listPendingAutoCollectionItems(vaultRoot, enabledSourceApps), null, 2));
} else if (action === "mark-processed") {
  const input = await readStdinJson<{ items?: unknown[] }>();
  console.log(JSON.stringify(await markAutoCollectionItemsProcessed(vaultRoot, parseItems(input.items ?? [])), null, 2));
} else {
  throw new Error(`Unsupported auto collection action: ${action ?? ""}`);
}

async function readStdinJson<T>(): Promise<T> {
  let content = "";
  for await (const chunk of process.stdin) {
    content += chunk;
  }
  return JSON.parse(content) as T;
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseSourceApps(value: string): SourceApp[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is SourceApp => SOURCE_APPS.has(item as SourceApp));
}

function parseItems(items: unknown[]): Array<{ source_app: SourceApp; raw_path: string; signature: string; detected_at: string }> {
  return items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid auto collection item.");
    }
    const value = item as Record<string, unknown>;
    if (!SOURCE_APPS.has(value.source_app as SourceApp) || typeof value.raw_path !== "string" || typeof value.signature !== "string") {
      throw new Error("Invalid auto collection item fields.");
    }
    return {
      source_app: value.source_app as SourceApp,
      raw_path: value.raw_path,
      signature: value.signature,
      detected_at: typeof value.detected_at === "string" ? value.detected_at : new Date().toISOString()
    };
  });
}
