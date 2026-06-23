import { createHash, randomUUID } from "node:crypto";
import { createSourceConnector } from "../connectors";
import { LocalRunLogger } from "../services";
import {
  buildKnowledgeAtomMarkdownDocument,
  LocalStorageProvider
} from "../storage";
import {
  SCHEMA_VERSION,
  type KnowledgeAtom,
  type NormalizedRecord,
  type SourceApp,
  type VaultRelativePath
} from "../schemas";
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
  generated_atom_count: number;
  failed_file_count: number;
  failures: ManualImportNormalizationFailure[];
}

export async function runManualImportNormalization(
  input: ManualImportNormalizationInput
): Promise<ManualImportNormalizationSummary> {
  const paths = buildWorkspacePaths(input);
  const runId = input.run_id ?? `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const logger = new LocalRunLogger({ vault_root: input.vault_root, logs_dir: paths.logs_dir });
  const connector = createSourceConnector(input.source_app);
  const storage = new LocalStorageProvider({
    vault_root: input.vault_root,
    sqlite_path: paths.sqlite_path
  });
  const importedRawPaths: VaultRelativePath[] = [];
  const normalizedRecordIds: string[] = [];
  const generatedAtomIds: string[] = [];

  const summary: ManualImportNormalizationSummary = {
    run_id: runId,
    source_app: input.source_app,
    imported_file_count: 0,
    normalized_record_count: 0,
    generated_atom_count: 0,
    failed_file_count: 0,
    failures: []
  };

  try {
    await storage.ensureWorkspace(paths);
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
        const archiveRef = await storage.archiveRawDocument(document);

        const records = normalizeManualImport(document).map((record) => ({
          ...record,
          raw_archive_path: archiveRef.archived_path,
          raw_checksum: archiveRef.checksum
        }));
        await storage.saveNormalizedRecords(records);

        const atoms = records.filter((record) => record.can_enter_personal_kb).map(buildP1PendingKnowledgeAtom);
        for (const atom of atoms) {
          await storage.writeKnowledgeAtom(buildKnowledgeAtomMarkdownDocument(atom));
        }

        summary.imported_file_count += 1;
        summary.normalized_record_count += records.length;
        summary.generated_atom_count += atoms.length;
        importedRawPaths.push(archiveRef.archived_path);
        normalizedRecordIds.push(...records.map((record) => record.record_id));
        generatedAtomIds.push(...atoms.map((atom) => atom.atom_id));

        await logger.info({
          run_id: runId,
          event_type: "manual_import_file_completed",
          message: `Manual import normalized ${records.length} record(s) and wrote ${atoms.length} pending atom(s).`,
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

    const finishedAt = new Date().toISOString();
    await storage.saveDailyRun({
      schema_version: SCHEMA_VERSION.dailyRun,
      run_id: runId,
      run_date: finishedAt.slice(0, 10),
      status: summary.failed_file_count > 0 ? "failed" : "completed",
      started_at: startedAt,
      finished_at: finishedAt,
      source_apps: [input.source_app],
      imported_raw_paths: importedRawPaths,
      normalized_record_ids: normalizedRecordIds,
      generated_atom_ids: generatedAtomIds,
      errors: summary.failures.map((failure) => ({
        code: "manual_import_file_failed",
        message: failure.error_message,
        source_app: input.source_app,
        raw_path: failure.raw_path
      })),
      created_at: startedAt,
      updated_at: finishedAt
    });

    await logger.info({
      run_id: runId,
      event_type: "manual_import_completed",
      message: `Manual import completed: ${summary.imported_file_count} file(s), ${summary.normalized_record_count} record(s), ${summary.generated_atom_count} pending atom(s), ${summary.failed_file_count} failure(s).`,
      source_app: input.source_app,
      record_count: summary.normalized_record_count
    });

    return summary;
  } finally {
    storage.close();
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

function buildP1PendingKnowledgeAtom(record: NormalizedRecord): KnowledgeAtom {
  const createdAt = record.message_time === "unknown" ? record.created_at : record.message_time;
  const evidence = truncateText(record.user_message, 120);

  return {
    schema_version: SCHEMA_VERSION.knowledgeAtom,
    atom_id: createAtomId(record),
    title: buildPendingAtomTitle(record),
    type: "素材",
    content: [
      "这是一条 P1 固定示例候选卡片，用于验证导入记录能够进入待确认区。",
      "",
      `待确认素材：用户在「${record.topic}」中提出了一条需要人工判断是否沉淀的对话内容。`,
      "",
      "后续 P2 会由 AI 根据完整上下文提炼真实观点、方法、经验或问题。"
    ].join("\n"),
    source_app: record.source_app,
    source_record_ids: [record.record_id],
    source_raw_paths: [record.raw_archive_path],
    project: record.project,
    tags: ["P1验证", "AI对话"],
    sensitivity: record.sensitivity,
    review_status: "pending",
    evidence,
    merged_into: "",
    created_at: createdAt,
    updated_at: record.updated_at
  };
}

function createAtomId(record: NormalizedRecord): string {
  return `atom_${createHash("sha256").update(record.record_id).digest("hex").slice(0, 24)}`;
}

function buildPendingAtomTitle(record: NormalizedRecord): string {
  if (record.topic !== "unknown") {
    return `待确认：${record.topic}`;
  }

  return `待确认：${truncateText(record.user_message, 24)}`;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
