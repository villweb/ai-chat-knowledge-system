import { SCHEMA_VERSION } from "./common";
import type { IsoDateTimeString, SchemaVersion } from "./common";

export type MigrationTarget = "sqlite" | "markdown_front_matter";

export interface SchemaMigration {
  schema_version: typeof SCHEMA_VERSION.schemaMigration;
  migration_id: string;
  target: MigrationTarget;
  from_version: SchemaVersion;
  to_version: SchemaVersion;
  description: string;
  created_at: IsoDateTimeString;
}

export interface SchemaMigrationEntry {
  migration: SchemaMigration;
  run(): Promise<void>;
}
