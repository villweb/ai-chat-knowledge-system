import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawSourceDocument } from "../connectors";
import type {
  DailyRun,
  KnowledgeAtom,
  KnowledgeAtomMarkdownDocument,
  NormalizedRecord,
  NormalizedRecordQuery,
  StableId,
  VaultRelativePath
} from "../schemas";
import { KnowledgeAtomMarkdownWriter } from "./knowledge-atom-markdown-writer";
import { LocalRawArchive } from "./local-raw-archive";
import { resolveVaultPath } from "./paths";
import { SQLiteNormalizedRecordStore } from "./sqlite-normalized-record-store";
import type { RawArchiveRef, StorageProvider, WorkspacePaths } from "./storage-provider";
import { ensureWorkspaceDirectories } from "./workspace";

export interface LocalStorageProviderOptions {
  vault_root: string;
  sqlite_path: VaultRelativePath;
  knowledge_atom_index_path?: VaultRelativePath;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly rawArchive: LocalRawArchive;
  private readonly normalizedRecords: SQLiteNormalizedRecordStore;
  private readonly knowledgeWriter: KnowledgeAtomMarkdownWriter;
  private readonly knowledgeAtomIndexPath: VaultRelativePath;

  constructor(private readonly options: LocalStorageProviderOptions) {
    this.rawArchive = new LocalRawArchive({ vault_root: options.vault_root });
    this.normalizedRecords = new SQLiteNormalizedRecordStore({
      vault_root: options.vault_root,
      sqlite_path: options.sqlite_path
    });
    this.knowledgeWriter = new KnowledgeAtomMarkdownWriter({ vault_root: options.vault_root });
    this.knowledgeAtomIndexPath = options.knowledge_atom_index_path ?? "data/runtime/knowledge-atoms-index.json";
  }

  close(): void {
    this.normalizedRecords.close();
  }

  async ensureWorkspace(paths: WorkspacePaths): Promise<void> {
    await ensureWorkspaceDirectories(paths);
  }

  async archiveRawDocument(document: RawSourceDocument): Promise<RawArchiveRef> {
    return this.rawArchive.archiveRawDocument(document);
  }

  async saveNormalizedRecords(records: NormalizedRecord[]): Promise<void> {
    await this.normalizedRecords.saveNormalizedRecords(records);
  }

  async findNormalizedRecords(query: NormalizedRecordQuery): Promise<NormalizedRecord[]> {
    return this.normalizedRecords.findNormalizedRecords(query);
  }

  async saveDailyRun(run: DailyRun): Promise<void> {
    const filePath = resolveVaultPath(this.options.vault_root, `data/daily_runs/${run.run_id}.json`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  }

  async writeKnowledgeAtom(document: KnowledgeAtomMarkdownDocument): Promise<void> {
    await this.knowledgeWriter.writeKnowledgeAtom(document);
    await this.mirrorKnowledgeAtomIndex(documentToKnowledgeAtom(document));
  }

  async mirrorKnowledgeAtomIndex(atom: KnowledgeAtom): Promise<void> {
    const items = await this.readKnowledgeAtomIndex();
    const nextItems = items.filter((item) => item.atom_id !== atom.atom_id);
    nextItems.push(atom);
    await this.writeKnowledgeAtomIndex(nextItems);
  }

  async writeKnowledgeAtomIndex(atoms: KnowledgeAtom[]): Promise<void> {
    const nextItems = [...atoms].sort((left, right) => left.updated_at.localeCompare(right.updated_at));
    const filePath = resolveVaultPath(this.options.vault_root, this.knowledgeAtomIndexPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(nextItems, null, 2)}\n`, "utf8");
  }

  async findKnowledgeAtom(atom_id: StableId): Promise<KnowledgeAtom | null> {
    const items = await this.readKnowledgeAtomIndex();
    return items.find((item) => item.atom_id === atom_id) ?? null;
  }

  private async readKnowledgeAtomIndex(): Promise<KnowledgeAtom[]> {
    const filePath = resolveVaultPath(this.options.vault_root, this.knowledgeAtomIndexPath);

    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as KnowledgeAtom[];
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    }
  }
}

function documentToKnowledgeAtom(document: KnowledgeAtomMarkdownDocument): KnowledgeAtom {
  return {
    ...document.front_matter,
    content: extractContentSection(document.body)
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
