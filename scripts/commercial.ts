import {
  activateLicense,
  createFeedbackDraft,
  getCommercialState,
  saveAccountLoginIntent,
  type AccountLoginInput,
  type FeedbackDraftInput,
  type LicenseActivationInput
} from "../app/core";

const { action, vaultRoot } = parseArgs(process.argv.slice(2));

if (action === "state") {
  console.log(JSON.stringify(await getCommercialState(vaultRoot), null, 2));
} else if (action === "activate-license") {
  console.log(JSON.stringify(await activateLicense(vaultRoot, await readStdinJson<LicenseActivationInput>()), null, 2));
} else if (action === "save-account") {
  console.log(JSON.stringify(await saveAccountLoginIntent(vaultRoot, await readStdinJson<AccountLoginInput>()), null, 2));
} else if (action === "create-feedback") {
  console.log(JSON.stringify(await createFeedbackDraft(vaultRoot, await readStdinJson<FeedbackDraftInput>()), null, 2));
} else {
  throw new Error(`Unsupported commercial action: ${action ?? ""}`);
}

function parseArgs(args: string[]): { action: string; vaultRoot: string } {
  return {
    action: args[0] ?? "",
    vaultRoot: readOption(args, "--vault-root") ?? process.cwd()
  };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks).toString("utf8").trim();
  return (content ? JSON.parse(content) : {}) as T;
}
