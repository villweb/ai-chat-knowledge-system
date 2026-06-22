import { SCHEMA_VERSION } from "./common";
import type {
  IsoDateTimeString,
  SourceApp,
  StableId,
  TimestampedRecord
} from "./common";

export type DailyRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface DailyRunError {
  code: string;
  message: string;
  source_app?: SourceApp;
  raw_path?: string;
}

export interface DailyRun extends TimestampedRecord {
  schema_version: typeof SCHEMA_VERSION.dailyRun;
  run_id: StableId;
  run_date: string;
  status: DailyRunStatus;
  started_at: IsoDateTimeString;
  finished_at: IsoDateTimeString | null;
  source_apps: SourceApp[];
  imported_raw_paths: string[];
  normalized_record_ids: StableId[];
  generated_atom_ids: StableId[];
  errors: DailyRunError[];
}
