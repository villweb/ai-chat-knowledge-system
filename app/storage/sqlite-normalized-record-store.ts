import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../schemas";
import type {
  NormalizedRecord,
  NormalizedRecordQuery,
  Sensitivity,
  SourceApp,
  SourceType,
  VaultRelativePath
} from "../schemas";
import { resolveVaultPath } from "./paths";
import type { StorageProvider } from "./storage-provider";

export interface SQLiteNormalizedRecordStoreOptions {
  vault_root: string;
  sqlite_path: VaultRelativePath;
}

export type NormalizedRecordStorageProvider = Pick<
  StorageProvider,
  "saveNormalizedRecords" | "findNormalizedRecords"
>;

type NormalizedRecordRow = {
  schema_version: typeof SCHEMA_VERSION.normalizedRecord;
  record_id: string;
  source_app: SourceApp;
  source_type: SourceType;
  conversation_id: string;
  parent_conversation_id: string;
  turn_index: number;
  message_index_start: number;
  message_index_end: number;
  message_time: string;
  project: string;
  topic: string;
  user_message: string;
  ai_message: string;
  raw_path: string;
  raw_archive_path: string;
  raw_checksum: string;
  raw_source: string;
  sensitivity: Sensitivity;
  can_enter_personal_kb: 0 | 1;
  created_at: string;
  updated_at: string;
};

export class SQLiteNormalizedRecordStore implements NormalizedRecordStorageProvider {
  private readonly db: Database.Database;

  constructor(options: SQLiteNormalizedRecordStoreOptions) {
    const sqlitePath = resolveVaultPath(options.vault_root, options.sqlite_path);
    mkdirSync(path.dirname(sqlitePath), { recursive: true });
    this.db = new Database(sqlitePath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  close(): void {
    this.db.close();
  }

  async saveNormalizedRecords(records: readonly NormalizedRecord[]): Promise<void> {
    const statement = this.db.prepare(`
      INSERT INTO normalized_records (
        schema_version,
        record_id,
        source_app,
        source_type,
        conversation_id,
        parent_conversation_id,
        turn_index,
        message_index_start,
        message_index_end,
        message_time,
        project,
        topic,
        user_message,
        ai_message,
        raw_path,
        raw_archive_path,
        raw_checksum,
        raw_source,
        sensitivity,
        can_enter_personal_kb,
        created_at,
        updated_at
      ) VALUES (
        @schema_version,
        @record_id,
        @source_app,
        @source_type,
        @conversation_id,
        @parent_conversation_id,
        @turn_index,
        @message_index_start,
        @message_index_end,
        @message_time,
        @project,
        @topic,
        @user_message,
        @ai_message,
        @raw_path,
        @raw_archive_path,
        @raw_checksum,
        @raw_source,
        @sensitivity,
        @can_enter_personal_kb,
        @created_at,
        @updated_at
      )
      ON CONFLICT(record_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        source_app = excluded.source_app,
        source_type = excluded.source_type,
        conversation_id = excluded.conversation_id,
        parent_conversation_id = excluded.parent_conversation_id,
        turn_index = excluded.turn_index,
        message_index_start = excluded.message_index_start,
        message_index_end = excluded.message_index_end,
        message_time = excluded.message_time,
        project = excluded.project,
        topic = excluded.topic,
        user_message = excluded.user_message,
        ai_message = excluded.ai_message,
        raw_path = excluded.raw_path,
        raw_archive_path = excluded.raw_archive_path,
        raw_checksum = excluded.raw_checksum,
        raw_source = excluded.raw_source,
        sensitivity = excluded.sensitivity,
        can_enter_personal_kb = excluded.can_enter_personal_kb,
        updated_at = excluded.updated_at
    `);

    const transaction = this.db.transaction((items: readonly NormalizedRecord[]) => {
      for (const record of items) {
        statement.run(recordToRow(record));
      }
    });

    transaction(records);
  }

  async findNormalizedRecords(query: NormalizedRecordQuery = {}): Promise<NormalizedRecord[]> {
    const clauses: string[] = [];
    const params: Record<string, string | number> = {};

    if (query.source_app) {
      clauses.push("source_app = @source_app");
      params.source_app = query.source_app;
    }

    if (query.project) {
      clauses.push("project = @project");
      params.project = query.project;
    }

    if (query.topic) {
      clauses.push("topic = @topic");
      params.topic = query.topic;
    }

    if (query.from_time) {
      clauses.push("message_time >= @from_time");
      params.from_time = query.from_time;
    }

    if (query.to_time) {
      clauses.push("message_time <= @to_time");
      params.to_time = query.to_time;
    }

    if (!query.include_blocked) {
      clauses.push("can_enter_personal_kb = 1");
    }

    if (query.record_ids && query.record_ids.length > 0) {
      const placeholders = query.record_ids.map((_, index) => `@record_id_${index}`).join(", ");
      clauses.push(`record_id IN (${placeholders})`);
      for (const [index, recordId] of query.record_ids.entries()) {
        params[`record_id_${index}`] = recordId;
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM normalized_records ${where} ORDER BY message_time ASC, turn_index ASC`)
      .all(params) as NormalizedRecordRow[];

    return rows.map(rowToRecord);
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS normalized_records (
        schema_version TEXT NOT NULL,
        record_id TEXT PRIMARY KEY,
        source_app TEXT NOT NULL,
        source_type TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        parent_conversation_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        message_index_start INTEGER NOT NULL,
        message_index_end INTEGER NOT NULL,
        message_time TEXT NOT NULL,
        project TEXT NOT NULL,
        topic TEXT NOT NULL,
        user_message TEXT NOT NULL,
        ai_message TEXT NOT NULL,
        raw_path TEXT NOT NULL,
        raw_archive_path TEXT NOT NULL,
        raw_checksum TEXT NOT NULL,
        raw_source TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        can_enter_personal_kb INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_normalized_records_source_app
        ON normalized_records(source_app);

      CREATE INDEX IF NOT EXISTS idx_normalized_records_message_time
        ON normalized_records(message_time);

      CREATE INDEX IF NOT EXISTS idx_normalized_records_project
        ON normalized_records(project);

      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("normalized_records", "raw_archive_path", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("normalized_records", "raw_checksum", "TEXT NOT NULL DEFAULT ''");
    this.recordSchemaMigration();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private recordSchemaMigration(): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (
        migration_id,
        target,
        from_version,
        to_version,
        description,
        created_at
      ) VALUES (
        @migration_id,
        @target,
        @from_version,
        @to_version,
        @description,
        @created_at
      )
    `).run({
      migration_id: "p1_normalized_records_archive_metadata",
      target: "normalized_records",
      from_version: "none",
      to_version: SCHEMA_VERSION.normalizedRecord,
      description: "Ensure normalized records persist archive path and raw checksum.",
      created_at: new Date().toISOString()
    });
  }
}

function recordToRow(record: NormalizedRecord): NormalizedRecordRow {
  return {
    ...record,
    can_enter_personal_kb: record.can_enter_personal_kb ? 1 : 0
  };
}

function rowToRecord(row: NormalizedRecordRow): NormalizedRecord {
  if (row.schema_version !== SCHEMA_VERSION.normalizedRecord) {
    throw new Error(`Unsupported normalized record schema version: ${row.schema_version}`);
  }

  return {
    ...row,
    raw_archive_path: row.raw_archive_path || row.raw_path,
    raw_checksum: row.raw_checksum || "",
    can_enter_personal_kb: row.can_enter_personal_kb === 1
  };
}
