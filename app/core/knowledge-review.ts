import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  KnowledgeAtom,
  KnowledgeAtomType,
  ReviewStatus,
  StableId,
  VaultRelativePath
} from "../schemas";
import {
  buildKnowledgeAtomMarkdownDocument,
  directoryForReviewStatus,
  LocalStorageProvider,
  resolveVaultPath,
  toVaultRelativePath
} from "../storage";

export interface KnowledgeAtomDocument {
  atom: KnowledgeAtom;
  file_path: VaultRelativePath;
}

export interface KnowledgeAtomReviewInput {
  vault_root: string;
  atom_id: StableId;
  title?: string;
  type?: KnowledgeAtomType;
  content?: string;
  tags?: string[];
  review_status?: ReviewStatus;
  merged_into?: StableId | "";
}

export interface KnowledgeReviewResult {
  atom: KnowledgeAtom;
  file_path: VaultRelativePath;
}

const KNOWLEDGE_DIRS = [
  "knowledge/inbox",
  "knowledge/approved",
  "knowledge/rejected",
  "knowledge/merged"
] as const;

export async function listKnowledgeAtomDocuments(vaultRoot: string): Promise<KnowledgeAtomDocument[]> {
  const documents = await listAllKnowledgeAtomDocuments(vaultRoot);
  return dedupeKnowledgeAtomDocuments(documents);
}

async function listAllKnowledgeAtomDocuments(vaultRoot: string): Promise<KnowledgeAtomDocument[]> {
  const documents: KnowledgeAtomDocument[] = [];

  for (const dir of KNOWLEDGE_DIRS) {
    const absoluteDir = resolveVaultPath(vaultRoot, dir);
    const files = await listMarkdownFiles(absoluteDir);
    for (const file of files) {
      documents.push(await readKnowledgeAtomDocument(vaultRoot, file));
    }
  }

  return documents.sort((left, right) => right.atom.updated_at.localeCompare(left.atom.updated_at));
}

export function dedupeKnowledgeAtomDocuments(documents: KnowledgeAtomDocument[]): KnowledgeAtomDocument[] {
  const grouped = new Map<StableId, KnowledgeAtomDocument[]>();
  for (const document of documents) {
    const current = grouped.get(document.atom.atom_id) ?? [];
    current.push(document);
    grouped.set(document.atom.atom_id, current);
  }

  return [...grouped.values()]
    .map((items) => pickCanonicalKnowledgeAtomDocument(items))
    .sort((left, right) => right.atom.updated_at.localeCompare(left.atom.updated_at));
}

export function pickCanonicalKnowledgeAtomDocument(documents: KnowledgeAtomDocument[]): KnowledgeAtomDocument {
  const matchingDirectory = documents.filter((document) =>
    matchesReviewStatusDirectory(document.file_path, document.atom.review_status)
  );
  const pool = matchingDirectory.length > 0 ? matchingDirectory : documents;
  return [...pool].sort((left, right) => right.atom.updated_at.localeCompare(left.atom.updated_at))[0]!;
}

export async function getKnowledgeAtomDocument(
  vaultRoot: string,
  atomId: StableId
): Promise<KnowledgeAtomDocument | null> {
  const documents = await listAllKnowledgeAtomDocuments(vaultRoot);
  const matches = documents.filter((document) => document.atom.atom_id === atomId);
  if (matches.length === 0) {
    return null;
  }

  return pickCanonicalKnowledgeAtomDocument(matches);
}

export async function updateKnowledgeAtomReview(input: KnowledgeAtomReviewInput): Promise<KnowledgeReviewResult> {
  const allDocuments = await listAllKnowledgeAtomDocuments(input.vault_root);
  const matches = allDocuments.filter((document) => document.atom.atom_id === input.atom_id);
  if (matches.length === 0) {
    throw new Error(`Knowledge atom not found: ${input.atom_id}`);
  }

  const current = pickCanonicalKnowledgeAtomDocument(matches);
  const stalePaths = matches
    .map((document) => document.file_path)
    .filter((filePath, index, items) => items.indexOf(filePath) === index);

  const now = new Date().toISOString();
  const nextAtom: KnowledgeAtom = {
    ...current.atom,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.review_status !== undefined ? { review_status: input.review_status } : {}),
    ...(input.merged_into !== undefined ? { merged_into: input.merged_into } : {}),
    updated_at: now
  };

  if (nextAtom.review_status !== "merged") {
    nextAtom.merged_into = "";
  }

  const document = buildKnowledgeAtomMarkdownDocument(nextAtom);
  const storage = new LocalStorageProvider({
    vault_root: input.vault_root,
    sqlite_path: "data/runtime/normalized-records.sqlite"
  });

  try {
    await storage.writeKnowledgeAtom(document);
    const pathsToDelete = new Set(stalePaths);
    pathsToDelete.delete(document.file_path);
    for (const stalePath of pathsToDelete) {
      await unlink(resolveVaultPath(input.vault_root, stalePath)).catch((error: unknown) => {
        if (!isMissingFileError(error)) {
          throw error;
        }
      });
    }

    const refreshedDocuments = dedupeKnowledgeAtomDocuments(await listAllKnowledgeAtomDocuments(input.vault_root));
    await storage.writeKnowledgeAtomIndex(refreshedDocuments.map((item) => item.atom));
  } finally {
    storage.close();
  }

  return {
    atom: nextAtom,
    file_path: document.file_path
  };
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const absolutePath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listMarkdownFiles(absolutePath));
        continue;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
        files.push(absolutePath);
      }
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  return files;
}

async function readKnowledgeAtomDocument(vaultRoot: string, absolutePath: string): Promise<KnowledgeAtomDocument> {
  const content = await readFile(absolutePath, "utf8");
  const { frontMatter, body } = parseKnowledgeAtomMarkdown(content);

  return {
    atom: {
      ...frontMatter,
      content: extractContentSection(body)
    },
    file_path: toVaultRelativePath(vaultRoot, absolutePath)
  };
}

function parseKnowledgeAtomMarkdown(content: string): { frontMatter: Omit<KnowledgeAtom, "content">; body: string } {
  if (!content.startsWith("---\n")) {
    throw new Error("Knowledge atom markdown requires YAML front matter.");
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error("Knowledge atom front matter is not closed.");
  }

  return {
    frontMatter: parse(content.slice(4, end)) as Omit<KnowledgeAtom, "content">,
    body: content.slice(end + 4)
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function matchesReviewStatusDirectory(filePath: VaultRelativePath, status: ReviewStatus): boolean {
  const directory = directoryForReviewStatus(status);
  return filePath.startsWith(`knowledge/${directory}/`);
}
