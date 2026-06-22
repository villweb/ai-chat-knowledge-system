import { SCHEMA_VERSION } from "./common";
import type {
  IsoDateTimeString,
  Sensitivity,
  SourceApp,
  StableId,
  TimestampedRecord,
  VaultRelativePath
} from "./common";

export type KnowledgeAtomType = "观点" | "方法" | "决策" | "经验" | "素材" | "问题" | "偏好";

export type ReviewStatus = "pending" | "approved" | "rejected" | "merged";

export interface KnowledgeAtom extends TimestampedRecord {
  schema_version: typeof SCHEMA_VERSION.knowledgeAtom;
  atom_id: StableId;
  title: string;
  type: KnowledgeAtomType;
  content: string;
  source_app: SourceApp;
  source_record_ids: StableId[];
  source_raw_paths: VaultRelativePath[];
  project: string;
  tags: string[];
  sensitivity: Sensitivity;
  review_status: ReviewStatus;
  evidence: string;
  merged_into: StableId | "";
}

export interface KnowledgeAtomFrontMatter
  extends Omit<KnowledgeAtom, "content"> {
}

export interface KnowledgeAtomMarkdownDocument {
  front_matter: KnowledgeAtomFrontMatter;
  body: string;
  file_path: VaultRelativePath;
  updated_at: IsoDateTimeString;
}
