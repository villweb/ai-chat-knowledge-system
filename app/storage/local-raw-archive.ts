import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawSourceDocument } from "../connectors";
import type { VaultRelativePath } from "../schemas";
import { resolveVaultPath } from "./paths";
import type { RawArchiveRef, StorageProvider } from "./storage-provider";

export interface LocalRawArchiveOptions {
  vault_root: string;
}

export type RawArchiveProvider = Pick<StorageProvider, "archiveRawDocument">;

export class LocalRawArchive implements RawArchiveProvider {
  constructor(private readonly options: LocalRawArchiveOptions) {}

  async archiveRawDocument(document: RawSourceDocument): Promise<RawArchiveRef> {
    const checksum = sha256(document.content);
    const archived_path = buildArchivePath(document, checksum);
    const absolutePath = resolveVaultPath(this.options.vault_root, archived_path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, document.content, "utf8");
    await writeFile(
      `${absolutePath}.meta.json`,
      `${JSON.stringify(buildArchiveMetadata(document, archived_path, checksum), null, 2)}\n`,
      "utf8"
    );

    return {
      raw_path: document.raw_path,
      archived_path,
      checksum
    };
  }

  async archive(document: RawSourceDocument): Promise<RawArchiveRef> {
    return this.archiveRawDocument(document);
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildArchivePath(document: RawSourceDocument, checksum: string): VaultRelativePath {
  const extension = path.extname(document.raw_path) || extensionForContentType(document.content_type);
  return `raw/archive/${document.source_app}/${checksum}${extension}`;
}

function buildArchiveMetadata(
  document: RawSourceDocument,
  archivedPath: VaultRelativePath,
  checksum: string
): Record<string, string> {
  return {
    raw_path: document.raw_path,
    archived_path: archivedPath,
    checksum,
    source_app: document.source_app,
    source_type: document.source_type,
    raw_source: document.raw_source,
    content_type: document.content_type,
    detected_at: document.detected_at
  };
}

function extensionForContentType(contentType: RawSourceDocument["content_type"]): string {
  if (contentType === "markdown") {
    return ".md";
  }

  if (contentType === "json") {
    return ".json";
  }

  return ".txt";
}
