import process from "node:process";
import {
  getKnowledgeAtomDocument,
  listKnowledgeAtomDocuments,
  updateKnowledgeAtomReview,
  type KnowledgeAtomReviewInput
} from "../app/core/knowledge-review";

const action = process.argv[2];
const vaultRoot = getArgValue("--vault-root") ?? process.cwd();

if (action === "list") {
  console.log(JSON.stringify(await listKnowledgeAtomDocuments(vaultRoot), null, 2));
} else if (action === "get") {
  const atomId = getPositionalArg(1);
  if (!atomId) {
    throw new Error("Missing atom_id.");
  }

  console.log(JSON.stringify(await getKnowledgeAtomDocument(vaultRoot, atomId), null, 2));
} else if (action === "update") {
  const input = await readStdinJson<KnowledgeAtomReviewInput>();
  console.log(JSON.stringify(await updateKnowledgeAtomReview({ ...input, vault_root: vaultRoot }), null, 2));
} else {
  throw new Error(`Unsupported review action: ${action ?? ""}`);
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

function getPositionalArg(position: number): string | undefined {
  return process.argv.slice(3).filter((arg) => !arg.startsWith("--"))[position - 1];
}
