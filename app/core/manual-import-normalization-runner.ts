import { randomUUID } from "node:crypto";
import { ManualImportConnector } from "../connectors";
import { LocalRunLogger } from "../services";
import {
  ensureWorkspaceDirectories,
  LocalRawArchive,
  SQLiteNormalizedRecordStore
} from "../storage";
import type { SourceApp, VaultRelativePath } from "../schemas";
import type { WorkspacePaths } from "../storage";
import { normalizeManualImport } from "./normalize-manual-import";

export interface ManualImportNormalizationInput {
  vault_root: string;
  source_app: SourceApp;
  run_id?: string;
  raw_imports_dir?: VaultRelativePath;
  sqlite_path?: VaultRelativePath;
  knowledge_dir?: VaultRelativePath;
  logs_dir?: VaultRelativePath;
}

export interface ManualImportNormalizationFailure {
  raw_path: VaultRelativePath;
  error_message: string;
}

export interface ManualImportNormalizationSummary {
  run_id: string;
  source_app: SourceApp;
  imported_file_count: number;
  normalized_record_count: number;
  failed_file_count: number;
  failures: ManualImportNormalizationFailure[];
}

export async function runManualImportNormalization(
  input: ManualImportNormalizationInput
): Promise<ManualImportNormalizationSummary> {
  const paths = buildWorkspacePaths(input);
  const runId = input.run_id ?? `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}`;
  const logger = new LocalRunLogger({ vault_root: input.vault_root, logs_dir: paths.logs_dir });
  const connector = new ManualImportConnector(input.source_app);
  const archive = new LocalRawArchive({ vault_root: input.vault_root });
  const normalizedStore = new SQLiteNormalizedRecordStore({
    vault_root: input.vault_root,
    sqlite_path: paths.sqlite_path
  });

  const summary: ManualImportNormalizationSummary = {
    run_id: runId,
    source_app: input.source_app,
    imported_file_count: 0,
    normalized_record_count: 0,
    failed_file_count: 0,
    failures: []
  };

  try {
    await ensureWorkspaceDirectories(paths);
    await logger.info({
      run_id: runId,
      event_type: "manual_import_started",
      message: `Manual import normalization started for ${input.source_app}.`,
      source_app: input.source_app
    });

    const candidates = await connector.listCandidates({
      vault_root: input.vault_root,
      import_root: paths.raw_imports_dir
    });

    for (const candidate of candidates) {
      try {
        const document = await connector.read({
          vault_root: input.vault_root,
          candidate
        });
        await archive.archiveRawDocument(document);

        const records = normalizeManualImport(document);
        await normalizedStore.saveNormalizedRecords(records);

        summary.imported_file_count += 1;
        summary.normalized_record_count += records.length;

        await logger.info({
          run_id: runId,
          event_type: "manual_import_file_completed",
          message: `Manual import normalized ${records.length} record(s).`,
          source_app: input.source_app,
          raw_path: candidate.raw_path,
          record_count: records.length
        });
      } catch (error) {
        const message = toErrorMessage(error);
        summary.failed_file_count += 1;
        summary.failures.push({
          raw_path: candidate.raw_path,
          error_message: message
        });

        await logger.error({
          run_id: runId,
          error_code: "manual_import_file_failed",
          message,
          source_app: input.source_app,
          raw_path: candidate.raw_path
        });
      }
    }

    await logger.info({
      run_id: runId,
      event_type: "manual_import_completed",
      message: `Manual import completed: ${summary.imported_file_count} file(s), ${summary.normalized_record_count} record(s), ${summary.failed_file_count} failure(s).`,
      source_app: input.source_app,
      record_count: summary.normalized_record_count
    });

    return summary;
  } finally {
    normalizedStore.close();
  }
}

function buildWorkspacePaths(input: ManualImportNormalizationInput): WorkspacePaths {
  return {
    vault_root: input.vault_root,
    raw_imports_dir: input.raw_imports_dir ?? "raw/imports",
    sqlite_path: input.sqlite_path ?? "data/runtime/normalized-records.sqlite",
    knowledge_dir: input.knowledge_dir ?? "knowledge",
    logs_dir: input.logs_dir ?? "logs"
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
