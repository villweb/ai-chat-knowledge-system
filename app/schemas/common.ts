export const SCHEMA_VERSION = {
  normalizedRecord: "normalized_record.v1",
  knowledgeAtom: "knowledge_atom.v1",
  dailyRun: "daily_run.v1",
  schemaMigration: "schema_migration.v1"
} as const;

export type SchemaVersion = (typeof SCHEMA_VERSION)[keyof typeof SCHEMA_VERSION];

export type SourceApp = "codex" | "cursor" | "deepseek" | "doubao" | "workbuddy";

export type SourceType = "local_app" | "web_export" | "manual_export";

export type Sensitivity = "personal" | "private" | "confidential";

export type IsoDateTimeString = string;

export type VaultRelativePath = string;

export type StableId = string;

export interface TimestampedRecord {
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}
