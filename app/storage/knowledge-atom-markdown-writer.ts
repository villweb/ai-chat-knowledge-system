import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import type {
  KnowledgeAtom,
  KnowledgeAtomFrontMatter,
  KnowledgeAtomMarkdownDocument,
  ReviewStatus,
  VaultRelativePath
} from "../schemas";
import { resolveVaultPath } from "./paths";
import type { StorageProvider } from "./storage-provider";

export interface KnowledgeAtomMarkdownWriterOptions {
  vault_root: string;
}

export type KnowledgeAtomMarkdownWriteProvider = Pick<StorageProvider, "writeKnowledgeAtom">;

export class KnowledgeAtomMarkdownWriter implements KnowledgeAtomMarkdownWriteProvider {
  constructor(private readonly options: KnowledgeAtomMarkdownWriterOptions) {}

  async writeKnowledgeAtom(document: KnowledgeAtomMarkdownDocument): Promise<void> {
    const absolutePath = resolveVaultPath(this.options.vault_root, document.file_path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, renderKnowledgeAtomMarkdown(document), "utf8");
  }
}

export function buildKnowledgeAtomMarkdownDocument(atom: KnowledgeAtom): KnowledgeAtomMarkdownDocument {
  return {
    front_matter: buildFrontMatter(atom),
    body: buildKnowledgeAtomBody(atom),
    file_path: buildKnowledgeAtomPath(atom),
    updated_at: atom.updated_at
  };
}

export function renderKnowledgeAtomMarkdown(document: KnowledgeAtomMarkdownDocument): string {
  return `---\n${stringify(document.front_matter)}---\n\n${document.body.trim()}\n`;
}

export function buildKnowledgeAtomPath(atom: KnowledgeAtom): VaultRelativePath {
  const createdDate = atom.created_at.slice(0, 10);
  const safeTitle = toSafeTitle(atom.title);
  return `knowledge/${statusToDirectory(atom.review_status)}/${createdDate}-${atom.atom_id}-${safeTitle}.md`;
}

export function toSafeTitle(title: string): string {
  const cleaned = title
    .replace(/[\/\\:\*\?"<>\|\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return cleaned || "untitled";
}

function buildFrontMatter(atom: KnowledgeAtom): KnowledgeAtomFrontMatter {
  return {
    schema_version: atom.schema_version,
    atom_id: atom.atom_id,
    title: atom.title,
    type: atom.type,
    review_status: atom.review_status,
    source_app: atom.source_app,
    source_record_ids: atom.source_record_ids,
    source_raw_paths: atom.source_raw_paths,
    project: atom.project,
    tags: atom.tags,
    sensitivity: atom.sensitivity,
    created_at: atom.created_at,
    updated_at: atom.updated_at,
    evidence: atom.evidence,
    merged_into: atom.merged_into
  };
}

function buildKnowledgeAtomBody(atom: KnowledgeAtom): string {
  return `# ${atom.title}

## 内容

${atom.content}

## 证据

- 摘录：${atom.evidence}
- 判断：该内容来自用户对 AI 对话的明确问题、判断或选择。

## 来源

- 来源应用：${atom.source_app}
- 来源记录：${atom.source_record_ids.join(", ")}
- 原始路径：${atom.source_raw_paths.join(", ")}

## 处理记录

- ${atom.created_at.slice(0, 10)}：创建为 ${atom.review_status}。`;
}

function statusToDirectory(status: ReviewStatus): string {
  if (status === "pending") {
    return "inbox";
  }

  return status;
}
