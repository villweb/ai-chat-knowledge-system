import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { RawContentType, RawSourceDocument } from "../connectors";
import type { KnowledgeAtom, SourceApp, VaultRelativePath } from "../schemas";
import { LocalStorageProvider, resolveVaultPath, toVaultRelativePath } from "../storage";
import type { WorkspacePaths } from "../storage";
import { normalizeManualImport } from "./normalize-manual-import";

export interface RebuildLocalIndexesInput {
  vault_root: string;
  raw_archive_dir?: VaultRelativePath;
  sqlite_path?: VaultRelativePath;
  knowledge_dir?: VaultRelativePath;
  logs_dir?: VaultRelativePath;
}

export interface RebuildLocalIndexesSummary {
  archived_file_count: number;
  normalized_record_count: number;
  knowledge_atom_count: number;
}

export async function rebuildLocalIndexes(input: RebuildLocalIndexesInput): Promise<RebuildLocalIndexesSummary> {
  const paths = buildWorkspacePaths(input);
  const storage = new LocalStorageProvider({
    vault_root: input.vault_root,
    sqlite_path: paths.sqlite_path
  });
  const summary: RebuildLocalIndexesSummary = {
    archived_file_count: 0,
    normalized_record_count: 0,
    knowledge_atom_count: 0
  };

  try {
    await storage.ensureWorkspace(paths);

    const documents = await listRawArchiveDocuments(input.vault_root, input.raw_archive_dir ?? "raw/archive");
    for (const document of documents) {
      const checksum = createHash("sha256").update(document.content, "utf8").digest("hex");
      const records = normalizeManualImport(document).map((record) => ({
        ...record,
        raw_archive_path: document.raw_path,
        raw_checksum: checksum
      }));

      await storage.saveNormalizedRecords(records);
      summary.archived_file_count += 1;
      summary.normalized_record_count += records.length;
    }

    const atoms = await listKnowledgeAtoms(input.vault_root, paths.knowledge_dir);
    for (const atom of atoms) {
      await storage.mirrorKnowledgeAtomIndex(atom);
      summary.knowledge_atom_count += 1;
    }

    return summary;
  } finally {
    storage.close();
  }
}

function buildWorkspacePaths(input: RebuildLocalIndexesInput): WorkspacePaths {
  return {
    vault_root: input.vault_root,
    raw_imports_dir: "raw/imports",
    sqlite_path: input.sqlite_path ?? "data/runtime/normalized-records.sqlite",
    knowledge_dir: input.knowledge_dir ?? "knowledge",
    logs_dir: input.logs_dir ?? "logs"
  };
}

async function listRawArchiveDocuments(vaultRoot: string, archiveDir: VaultRelativePath): Promise<RawSourceDocument[]> {
  const root = resolveVaultPath(vaultRoot, archiveDir);
  const files = await listFiles(root);
  const documents: RawSourceDocument[] = [];

  for (const file of files) {
    const rawPath = toVaultRelativePath(vaultRoot, file);
    const contentType = getRawContentType(rawPath);
    if (!contentType) {
      continue;
    }

    documents.push({
      source_app: inferSourceAppFromArchivePath(rawPath),
      source_type: "manual_export",
      raw_path: rawPath,
      raw_source: "raw_archive",
      detected_at: new Date().toISOString(),
      content_type: contentType,
      content: await readFile(file, "utf8")
    });
  }

  return documents;
}

async function listKnowledgeAtoms(vaultRoot: string, knowledgeDir: VaultRelativePath): Promise<KnowledgeAtom[]> {
  const root = resolveVaultPath(vaultRoot, knowledgeDir);
  const files = (await listFiles(root)).filter((file) => path.extname(file).toLowerCase() === ".md");
  const atoms: KnowledgeAtom[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    atoms.push(parseKnowledgeAtomMarkdown(content));
  }

  return atoms;
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getRawContentType(rawPath: VaultRelativePath): RawContentType | null {
  const extension = path.extname(rawPath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }

  if (extension === ".json") {
    return "json";
  }

  if (extension === ".txt") {
    return "txt";
  }

  return null;
}

function inferSourceAppFromArchivePath(rawPath: VaultRelativePath): SourceApp {
  const parts = rawPath.split("/");
  const archiveIndex = parts.indexOf("archive");
  const sourceApp = parts[archiveIndex + 1];
  if (sourceApp === "codex" || sourceApp === "cursor" || sourceApp === "deepseek" || sourceApp === "doubao" || sourceApp === "workbuddy") {
    return sourceApp;
  }

  throw new Error(`Cannot infer source app from archive path: ${rawPath}`);
}

function parseKnowledgeAtomMarkdown(content: string): KnowledgeAtom {
  if (!content.startsWith("---\n")) {
    throw new Error("Knowledge atom markdown requires YAML front matter.");
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error("Knowledge atom front matter is not closed.");
  }

  const frontMatter = parse(content.slice(4, end)) as Omit<KnowledgeAtom, "content">;
  const body = content.slice(end + 4);

  return {
    ...frontMatter,
    content: extractContentSection(body)
  };
}

function extractContentSection(body: string): string {
  const heading = "## 内容";
  const headingIndex = body.indexOf(heading);
  if (headingIndex === -1) {
    return body.trim();
  }

  const contentStart = body.indexOf("\n", headingIndex);
  if (contentStart === -1) {
    return "";
  }

  const nextHeading = body.indexOf("\n## ", contentStart + 1);
  const contentEnd = nextHeading === -1 ? body.length : nextHeading;
  return body.slice(contentStart, contentEnd).trim();
}
