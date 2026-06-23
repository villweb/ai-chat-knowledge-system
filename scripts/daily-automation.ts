import process from "node:process";
import {
  getDailyAutomationState,
  listDailyRunHistory,
  saveDailyAutomationSettings
} from "../app/core";

const action = process.argv[2];
const vaultRoot = getArgValue("--vault-root") ?? process.cwd();

if (action === "get-state") {
  const idleSeconds = Number(getArgValue("--idle-seconds") ?? 0);
  console.log(JSON.stringify(await getDailyAutomationState(vaultRoot, new Date(), idleSeconds), null, 2));
} else if (action === "save-settings") {
  const input = await readStdinJson<Record<string, unknown>>();
  console.log(JSON.stringify(await saveDailyAutomationSettings(vaultRoot, input), null, 2));
} else if (action === "list-history") {
  console.log(JSON.stringify(await listDailyRunHistory(vaultRoot), null, 2));
} else {
  throw new Error(`Unsupported daily automation action: ${action ?? ""}`);
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
