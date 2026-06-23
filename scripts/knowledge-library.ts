import {
  buildKnowledgeLibraryView,
  createKnowledgeBackup,
  ensureObsidianCompatibility,
  exportKnowledgeMarkdown,
  restoreLatestKnowledgeBackup,
  type KnowledgeLibraryFilters
} from "../app/core";

const { action, vaultRoot } = parseArgs(process.argv.slice(2));

if (action === "view") {
  const input = await readStdinJson<KnowledgeLibraryFilters>();
  console.log(JSON.stringify(await buildKnowledgeLibraryView(vaultRoot, input), null, 2));
} else if (action === "export-markdown") {
  console.log(JSON.stringify(await exportKnowledgeMarkdown(vaultRoot), null, 2));
} else if (action === "ensure-obsidian") {
  console.log(JSON.stringify(await ensureObsidianCompatibility(vaultRoot), null, 2));
} else if (action === "backup") {
  console.log(JSON.stringify(await createKnowledgeBackup(vaultRoot), null, 2));
} else if (action === "restore-latest") {
  console.log(JSON.stringify(await restoreLatestKnowledgeBackup(vaultRoot), null, 2));
} else {
  throw new Error(`Unsupported knowledge library action: ${action ?? ""}`);
}

function parseArgs(args: string[]): { action: string; vaultRoot: string } {
  const action = args[0] ?? "";
  const vaultRoot = readOption(args, "--vault-root") ?? process.cwd();
  return { action, vaultRoot };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const content = Buffer.concat(chunks).toString("utf8").trim();
  return (content ? JSON.parse(content) : {}) as T;
}
