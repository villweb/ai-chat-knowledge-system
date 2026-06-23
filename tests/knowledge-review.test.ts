import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  dedupeKnowledgeAtomDocuments,
  listKnowledgeAtomDocuments,
  pickCanonicalKnowledgeAtomDocument,
  updateKnowledgeAtomReview
} from "../app/core/knowledge-review";
import { SCHEMA_VERSION, type KnowledgeAtom } from "../app/schemas";
import { buildKnowledgeAtomMarkdownDocument, renderKnowledgeAtomMarkdown } from "../app/storage";

test("批准知识原子会移动文件并清理重复副本", async () => {
  const vaultRoot = await createTempVault();
  const atom = buildAtom({
    atom_id: "atom_review_approve",
    title: "待批准知识",
    review_status: "pending"
  });
  const inboxDocument = buildKnowledgeAtomMarkdownDocument(atom);
  await writeAtomFile(vaultRoot, inboxDocument);

  const duplicateAtom = { ...atom, review_status: "approved" as const, updated_at: "2026-06-20T00:00:00.000Z" };
  const staleApprovedDocument = buildKnowledgeAtomMarkdownDocument(duplicateAtom);
  await writeAtomFile(vaultRoot, staleApprovedDocument);

  const result = await updateKnowledgeAtomReview({
    vault_root: vaultRoot,
    atom_id: atom.atom_id,
    review_status: "approved"
  });

  assert.equal(result.atom.review_status, "approved");
  assert.match(result.file_path, /^knowledge\/approved\//);

  const listed = await listKnowledgeAtomDocuments(vaultRoot);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.atom.review_status, "approved");
  assert.equal(listed[0]?.atom.atom_id, atom.atom_id);

  const inboxPath = path.join(vaultRoot, inboxDocument.file_path);
  const staleApprovedPath = path.join(vaultRoot, staleApprovedDocument.file_path);
  await assert.rejects(() => readFile(inboxPath, "utf8"));
  assert.equal(result.file_path, staleApprovedDocument.file_path);
  assert.match(await readFile(staleApprovedPath, "utf8"), /review_status: approved/);

  const index = JSON.parse(await readFile(path.join(vaultRoot, "data/runtime/knowledge-atoms-index.json"), "utf8")) as KnowledgeAtom[];
  assert.equal(index.length, 1);
  assert.equal(index[0]?.review_status, "approved");
});

test("列表读取会按 atom_id 去重并优先保留目录与状态一致的副本", () => {
  const atom = buildAtom({
    atom_id: "atom_dedupe",
    title: "重复知识",
    review_status: "approved",
    updated_at: "2026-06-23T12:00:00.000Z"
  });
  const documents = dedupeKnowledgeAtomDocuments([
    {
      atom: { ...atom, review_status: "pending", updated_at: "2026-06-23T11:00:00.000Z" },
      file_path: "knowledge/inbox/2026-06-23-atom_dedupe-重复知识.md"
    },
    {
      atom,
      file_path: "knowledge/approved/2026-06-23-atom_dedupe-重复知识.md"
    }
  ]);

  assert.equal(documents.length, 1);
  assert.equal(pickCanonicalKnowledgeAtomDocument(documents).atom.review_status, "approved");
});

async function createTempVault(): Promise<string> {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "ai-kb-review-"));
  await mkdir(path.join(vaultRoot, "data/runtime"), { recursive: true });
  await writeFile(path.join(vaultRoot, "data/runtime/knowledge-atoms-index.json"), "[]\n", "utf8");
  return vaultRoot;
}

async function writeAtomFile(vaultRoot: string, document: ReturnType<typeof buildKnowledgeAtomMarkdownDocument>): Promise<void> {
  const filePath = path.join(vaultRoot, document.file_path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderKnowledgeAtomMarkdown(document), "utf8");
}

function buildAtom(input: Partial<KnowledgeAtom>): KnowledgeAtom {
  const now = input.created_at ?? "2026-06-23T09:00:00.000Z";
  return {
    schema_version: SCHEMA_VERSION.knowledgeAtom,
    atom_id: input.atom_id ?? "atom_one",
    title: input.title ?? "默认知识",
    type: input.type ?? "观点",
    content: input.content ?? "这是一条用于审查流程验收的知识内容。",
    source_app: input.source_app ?? "codex",
    source_record_ids: input.source_record_ids ?? ["record_one"],
    source_raw_paths: input.source_raw_paths ?? ["raw/imports/codex/one.md"],
    project: input.project ?? "personal",
    tags: input.tags ?? ["review"],
    sensitivity: input.sensitivity ?? "personal",
    review_status: input.review_status ?? "pending",
    evidence: input.evidence ?? "用户明确表达了该观点。",
    merged_into: input.merged_into ?? "",
    created_at: now,
    updated_at: input.updated_at ?? now
  };
}
