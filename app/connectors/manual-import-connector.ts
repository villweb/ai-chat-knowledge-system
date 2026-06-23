import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceApp, SourceType, VaultRelativePath } from "../schemas";
import { resolveVaultPath, toVaultRelativePath } from "../storage/paths";
import type {
  RawContentType,
  RawSourceDocument,
  SourceCandidate,
  SourceConnector,
  SourceConnectorListInput,
  SourceConnectorManifest,
  SourceConnectorReadInput
} from "./source-connector";

const SUPPORTED_EXTENSIONS = new Map<string, RawContentType>([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".txt", "txt"],
  [".json", "json"]
]);

export class ManualImportConnector implements SourceConnector {
  readonly source_app: SourceApp;
  readonly supported_source_types: readonly SourceType[];

  constructor(readonly manifest: SourceConnectorManifest) {
    this.source_app = manifest.source_app;
    this.supported_source_types = manifest.supported_source_types;
  }

  async listCandidates(input: SourceConnectorListInput): Promise<SourceCandidate[]> {
    const root = resolveVaultPath(input.vault_root, `${input.import_root}/${this.source_app}`);
    const candidates = await listImportFiles(root, input.vault_root, this.manifest);

    return candidates
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

async function listImportFiles(root: string, vaultRoot: string, manifest: SourceConnectorManifest): Promise<SourceCandidate[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  const candidates: SourceCandidate[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      candidates.push(...await listImportFiles(absolutePath, vaultRoot, manifest));
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
      source_app: manifest.source_app,
      source_type: primarySourceType(manifest),
      raw_path: toVaultRelativePath(vaultRoot, absolutePath),
      raw_source: manifest.raw_source,
      detected_at: fileStat.mtime.toISOString()
    });
  }

  return candidates;
}

function primarySourceType(manifest: SourceConnectorManifest): SourceType {
  const [sourceType] = manifest.supported_source_types;
  if (!sourceType) {
    throw new Error(`Connector has no supported source type: ${manifest.source_app}`);
  }

  return sourceType;
}

function getContentType(rawPath: VaultRelativePath): RawContentType {
  const extension = path.extname(rawPath).toLowerCase();
  const contentType = SUPPORTED_EXTENSIONS.get(extension);

  if (!contentType) {
    throw new Error(`Unsupported manual import extension: ${extension}`);
  }

  return contentType;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
