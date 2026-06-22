import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceApp, VaultRelativePath } from "../schemas";
import type {
  RawContentType,
  RawSourceDocument,
  SourceCandidate,
  SourceConnector,
  SourceConnectorListInput,
  SourceConnectorReadInput
} from "./source-connector";

const SUPPORTED_EXTENSIONS = new Map<string, RawContentType>([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".txt", "txt"],
  [".json", "json"]
]);

export class ManualImportConnector implements SourceConnector {
  readonly supported_source_types = ["manual_export"] as const;

  constructor(readonly source_app: SourceApp) {}

  async listCandidates(input: SourceConnectorListInput): Promise<SourceCandidate[]> {
    const root = resolveVaultPath(input.vault_root, input.import_root);
    const candidates = await listImportFiles(root, input.vault_root);

    return candidates
      .filter((candidate) => candidate.raw_path.includes(`/imports/${this.source_app}/`))
      .filter((candidate) => !input.since || candidate.detected_at >= input.since);
  }

  async read(input: SourceConnectorReadInput): Promise<RawSourceDocument> {
    const candidate = input.candidate;
    const contentType = getContentType(candidate.raw_path);
    const absolutePath = resolveVaultPath(input.vault_root, candidate.raw_path);
    const content = await readFile(absolutePath, "utf8");

    return {
      ...candidate,
      content_type: contentType,
      content
    };
  }
}

async function listImportFiles(root: string, vaultRoot: string): Promise<SourceCandidate[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const candidates: SourceCandidate[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      candidates.push(...await listImportFiles(absolutePath, vaultRoot));
      continue;
    }

    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }

    if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    candidates.push({
      source_app: inferSourceApp(absolutePath),
      source_type: "manual_export",
      raw_path: toVaultRelativePath(vaultRoot, absolutePath),
      raw_source: "manual_import",
      detected_at: fileStat.mtime.toISOString()
    });
  }

  return candidates;
}

function getContentType(rawPath: VaultRelativePath): RawContentType {
  const extension = path.extname(rawPath).toLowerCase();
  const contentType = SUPPORTED_EXTENSIONS.get(extension);

  if (!contentType) {
    throw new Error(`Unsupported manual import extension: ${extension}`);
  }

  return contentType;
}

function inferSourceApp(absolutePath: string): SourceApp {
  const parts = absolutePath.split(path.sep);
  const importsIndex = parts.lastIndexOf("imports");
  const app = parts[importsIndex + 1];

  if (app === "codex" || app === "cursor" || app === "deepseek" || app === "doubao" || app === "workbuddy") {
    return app;
  }

  throw new Error(`Cannot infer source app from path: ${absolutePath}`);
}

function resolveVaultPath(vaultRoot: string, vaultRelativePath: VaultRelativePath): string {
  const resolved = path.resolve(vaultRoot, vaultRelativePath);
  const root = path.resolve(vaultRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes vault root: ${vaultRelativePath}`);
  }

  return resolved;
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): VaultRelativePath {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
}
