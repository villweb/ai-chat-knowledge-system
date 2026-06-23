import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawSourceDocument } from "../connectors";
import type { VaultRelativePath } from "../schemas";
import type { RawArchiveRef, StorageProvider } from "./storage-provider";

export interface LocalRawArchiveOptions {
  vault_root: string;
}

export type RawArchiveProvider = Pick<StorageProvider, "archiveRawDocument">;

export class LocalRawArchive implements RawArchiveProvider {
  constructor(private readonly options: LocalRawArchiveOptions) {}

  async archiveRawDocument(document: RawSourceDocument): Promise<RawArchiveRef> {
    const absolutePath = resolveVaultPath(this.options.vault_root, document.raw_path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, document.content, "utf8");

    return {
      raw_path: document.raw_path,
      checksum: sha256(document.content)
    };
  }

  async archive(document: RawSourceDocument): Promise<RawArchiveRef> {
    return this.archiveRawDocument(document);
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resolveVaultPath(vaultRoot: string, vaultRelativePath: VaultRelativePath): string {
  const resolved = path.resolve(vaultRoot, vaultRelativePath);
  const root = path.resolve(vaultRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes vault root: ${vaultRelativePath}`);
  }

  return resolved;
}
