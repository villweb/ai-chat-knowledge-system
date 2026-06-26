import {
  applyRawRetentionPolicy,
  deleteAllUserData,
  deleteSourceData,
  exportUserData,
  getPrivacySecurityState,
  loadSecureCredential,
  savePrivacySecuritySettings,
  saveSecureCredential,
  scanSensitiveContent,
  writePrivacyLegalDrafts,
  type PrivacySecuritySettings,
  type SecureCredentialInput
} from "../app/core";
import type { SourceApp } from "../app/schemas";

const { action, vaultRoot, sourceApp, deleteDerivedKnowledge } = parseArgs(process.argv.slice(2));

if (action === "state") {
  console.log(JSON.stringify(await getPrivacySecurityState(vaultRoot), null, 2));
} else if (action === "save-settings") {
  console.log(JSON.stringify(await savePrivacySecuritySettings(vaultRoot, await readStdinJson<Partial<PrivacySecuritySettings>>()), null, 2));
} else if (action === "scan") {
  const input = await readStdinJson<{ content: string }>();
  console.log(JSON.stringify(scanSensitiveContent(input.content ?? ""), null, 2));
} else if (action === "save-credential") {
  console.log(JSON.stringify(await saveSecureCredential(vaultRoot, await readStdinJson<SecureCredentialInput>()), null, 2));
} else if (action === "load-credential") {
  console.log(JSON.stringify(await loadSecureCredential(vaultRoot), null, 2));
} else if (action === "apply-retention") {
  console.log(JSON.stringify(await applyRawRetentionPolicy(vaultRoot), null, 2));
} else if (action === "delete-source") {
  if (!sourceApp) throw new Error("delete-source requires --source-app.");
  console.log(JSON.stringify(await deleteSourceData(vaultRoot, sourceApp, { deleteDerivedKnowledge }), null, 2));
} else if (action === "export-user-data") {
  console.log(JSON.stringify(await exportUserData(vaultRoot), null, 2));
} else if (action === "delete-all-user-data") {
  console.log(JSON.stringify(await deleteAllUserData(vaultRoot), null, 2));
} else if (action === "write-legal-drafts") {
  console.log(JSON.stringify(await writePrivacyLegalDrafts(vaultRoot), null, 2));
} else {
  throw new Error(`Unsupported privacy action: ${action ?? ""}`);
}

function parseArgs(args: string[]): { action: string; vaultRoot: string; sourceApp?: SourceApp; deleteDerivedKnowledge: boolean } {
  const sourceApp = readOption(args, "--source-app") as SourceApp | undefined;
  return {
    action: args[0] ?? "",
    vaultRoot: readOption(args, "--vault-root") ?? process.cwd(),
    ...(sourceApp ? { sourceApp } : {}),
    deleteDerivedKnowledge: args.includes("--delete-derived-knowledge")
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
