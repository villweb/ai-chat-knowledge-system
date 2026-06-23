import { SCHEMA_VERSION } from "./common";
import type {
  IsoDateTimeString,
  Sensitivity,
  SourceApp,
  SourceType,
  StableId,
  TimestampedRecord,
  VaultRelativePath
} from "./common";

export interface NormalizedRecord extends TimestampedRecord {
  schema_version: typeof SCHEMA_VERSION.normalizedRecord;
  record_id: StableId;
  source_app: SourceApp;
  source_type: SourceType;
  conversation_id: StableId;
  parent_conversation_id: StableId;
  turn_index: number;
  message_index_start: number;
  message_index_end: number;
  message_time: IsoDateTimeString | "unknown";
  project: string;
  topic: string;
  user_message: string;
  ai_message: string;
  raw_path: VaultRelativePath;
  raw_archive_path: VaultRelativePath;
  raw_checksum: string;
  raw_source: string;
  sensitivity: Sensitivity;
  can_enter_personal_kb: boolean;
}

export interface NormalizedRecordQuery {
  source_app?: SourceApp;
  project?: string;
  topic?: string;
  from_time?: IsoDateTimeString;
  to_time?: IsoDateTimeString;
  include_blocked?: boolean;
}
