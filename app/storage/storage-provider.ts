import type {
  DailyRun,
  KnowledgeAtom,
  KnowledgeAtomMarkdownDocument,
  NormalizedRecord,
  NormalizedRecordQuery,
  StableId,
  VaultRelativePath
} from "../schemas";
import type { RawSourceDocument } from "../connectors";

export interface WorkspacePaths {
  vault_root: string;
  raw_imports_dir: VaultRelativePath;
  sqlite_path: VaultRelativePath;
  knowledge_dir: VaultRelativePath;
  logs_dir: VaultRelativePath;
}

export interface RawArchiveRef {
  raw_path: VaultRelativePath;
  checksum: string;
}

export interface StorageProvider {
  ensureWorkspace(paths: WorkspacePaths): Promise<void>;
  archiveRawDocument(document: RawSourceDocument): Promise<RawArchiveRef>;
  saveNormalizedRecords(records: NormalizedRecord[]): Promise<void>;
  findNormalizedRecords(query: NormalizedRecordQuery): Promise<NormalizedRecord[]>;
  saveDailyRun(run: DailyRun): Promise<void>;
  writeKnowledgeAtom(document: KnowledgeAtomMarkdownDocument): Promise<void>;
  mirrorKnowledgeAtomIndex(atom: KnowledgeAtom): Promise<void>;
  findKnowledgeAtom(atom_id: StableId): Promise<KnowledgeAtom | null>;
}
