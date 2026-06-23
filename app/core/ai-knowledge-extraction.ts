import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalRunLogger } from "../services";
import {
  buildKnowledgeAtomMarkdownDocument,
  LocalStorageProvider,
  resolveVaultPath
} from "../storage";
import {
  SCHEMA_VERSION,
  type KnowledgeAtom,
  type KnowledgeAtomType,
  type NormalizedRecord,
  type Sensitivity,
  type SourceApp,
  type StableId,
  type VaultRelativePath
} from "../schemas";

export type KnowledgeExtractionProviderName = "fixture" | "openai-compatible";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface ExtractKnowledgeAtomsInput {
  vault_root: string;
  allow_ai: boolean;
  provider: KnowledgeExtractionProviderName;
  source_app?: SourceApp;
  run_id?: string;
  max_records?: number;
  sqlite_path?: VaultRelativePath;
  knowledge_dir?: VaultRelativePath;
  logs_dir?: VaultRelativePath;
}

export interface AIRecordInput {
  record_id: StableId;
  source_app: SourceApp;
  topic: string;
  project: string;
  message_time: string | "unknown";
  turn_index: number;
  user_excerpt: string;
  ai_excerpt: string;
  context_summary: string;
}

export interface KnowledgeAtomDraft {
  title: string;
  type: KnowledgeAtomType;
  content: string;
  evidence: string;
  source_record_ids: StableId[];
  tags: string[];
  sensitivity: Sensitivity;
  confidence_level: ConfidenceLevel;
}

export interface KnowledgeAtomGenerationRequest {
  records: AIRecordInput[];
}

export interface KnowledgeAtomGenerator {
  generateKnowledgeAtoms(request: KnowledgeAtomGenerationRequest): Promise<KnowledgeAtomDraft[]>;
}

export interface ExtractKnowledgeAtomsSummary {
  run_id: string;
  provider: KnowledgeExtractionProviderName;
  selected_record_count: number;
  sent_record_count: number;
  blocked_record_count: number;
  generated_atom_count: number;
  skipped_low_value_count: number;
  duplicate_atom_count: number;
  merge_suggestion_count: number;
  generated_atom_ids: StableId[];
  daily_summary_path: VaultRelativePath;
}

interface PreparedRecord {
  original: NormalizedRecord;
  ai_input: AIRecordInput;
}

export async function extractKnowledgeAtoms(
  input: ExtractKnowledgeAtomsInput,
  generator: KnowledgeAtomGenerator = createKnowledgeAtomGenerator(input.provider)
): Promise<ExtractKnowledgeAtomsSummary> {
  if (!input.allow_ai) {
    throw new Error("AI extraction requires explicit user authorization.");
  }

  const runId = input.run_id ?? `p2_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}`;
  const now = new Date().toISOString();
  const sqlitePath = input.sqlite_path ?? "data/runtime/normalized-records.sqlite";
  const logsDir = input.logs_dir ?? "logs";
  const knowledgeDir = input.knowledge_dir ?? "knowledge";
  const storage = new LocalStorageProvider({
    vault_root: input.vault_root,
    sqlite_path: sqlitePath
  });
  const logger = new LocalRunLogger({ vault_root: input.vault_root, logs_dir: logsDir });

  try {
    await storage.ensureWorkspace({
      vault_root: input.vault_root,
      raw_imports_dir: "raw/imports",
      sqlite_path: sqlitePath,
      knowledge_dir: knowledgeDir,
      logs_dir: logsDir
    });

    const records = await storage.findNormalizedRecords({
      ...(input.source_app ? { source_app: input.source_app } : {}),
      include_blocked: true
    });
    const selectedRecords = records.slice(0, input.max_records ?? 10);
    const preparedRecords = selectedRecords.map(prepareRecordForAI);
    const sendableRecords = preparedRecords.filter((record) => record !== null);
    const blockedRecordCount = selectedRecords.length - sendableRecords.length;

    await logger.info({
      run_id: runId,
      event_type: "p2_ai_extraction_started",
      message: `P2 extraction started with ${sendableRecords.length} record(s).`,
      ...(input.source_app ? { source_app: input.source_app } : {}),
      record_count: sendableRecords.length
    });

    const drafts = sendableRecords.length > 0
      ? await generator.generateKnowledgeAtoms({ records: sendableRecords.map((record) => record.ai_input) })
      : [];
    const recordsById = new Map(sendableRecords.map((record) => [record.original.record_id, record.original]));
    const existingTitles = new Set<string>();
    let skippedLowValueCount = 0;
    let duplicateAtomCount = 0;
    let mergeSuggestionCount = 0;
    const generatedAtomIds: StableId[] = [];

    for (const draft of drafts) {
      const validation = validateDraft(draft, recordsById);
      if (!validation.ok || isLowValueDraft(draft)) {
        skippedLowValueCount += 1;
        continue;
      }

      const atom = buildKnowledgeAtomFromDraft(draft, recordsById, now);
      const titleKey = atom.title.trim().toLowerCase();
      const existingAtom = await storage.findKnowledgeAtom(atom.atom_id);
      if (existingAtom || existingTitles.has(titleKey)) {
        duplicateAtomCount += 1;
        mergeSuggestionCount += 1;
        continue;
      }

      await storage.writeKnowledgeAtom(buildKnowledgeAtomMarkdownDocument(atom));
      existingTitles.add(titleKey);
      generatedAtomIds.push(atom.atom_id);
    }

    const dailySummaryPath = await writeDailySummary(input.vault_root, runId, {
      run_id: runId,
      provider: input.provider,
      selected_record_count: selectedRecords.length,
      sent_record_count: sendableRecords.length,
      blocked_record_count: blockedRecordCount,
      generated_atom_count: generatedAtomIds.length,
      skipped_low_value_count: skippedLowValueCount,
      duplicate_atom_count: duplicateAtomCount,
      merge_suggestion_count: mergeSuggestionCount,
      generated_atom_ids: generatedAtomIds,
      created_at: now
    });

    await storage.saveDailyRun({
      schema_version: SCHEMA_VERSION.dailyRun,
      run_id: runId,
      run_date: now.slice(0, 10),
      status: "completed",
      started_at: now,
      finished_at: new Date().toISOString(),
      source_apps: input.source_app ? [input.source_app] : Array.from(new Set(selectedRecords.map((record) => record.source_app))),
      imported_raw_paths: [],
      normalized_record_ids: selectedRecords.map((record) => record.record_id),
      generated_atom_ids: generatedAtomIds,
      errors: [],
      created_at: now,
      updated_at: new Date().toISOString()
    });

    await logger.info({
      run_id: runId,
      event_type: "p2_ai_extraction_completed",
      message: `P2 extraction completed with ${generatedAtomIds.length} pending atom(s).`,
      ...(input.source_app ? { source_app: input.source_app } : {}),
      record_count: generatedAtomIds.length
    });

    return {
      run_id: runId,
      provider: input.provider,
      selected_record_count: selectedRecords.length,
      sent_record_count: sendableRecords.length,
      blocked_record_count: blockedRecordCount,
      generated_atom_count: generatedAtomIds.length,
      skipped_low_value_count: skippedLowValueCount,
      duplicate_atom_count: duplicateAtomCount,
      merge_suggestion_count: mergeSuggestionCount,
      generated_atom_ids: generatedAtomIds,
      daily_summary_path: dailySummaryPath
    };
  } finally {
    storage.close();
  }
}

export function prepareRecordForAI(record: NormalizedRecord): PreparedRecord | null {
  if (!record.can_enter_personal_kb || record.sensitivity !== "personal" || hasBlockedBusinessRisk(record)) {
    return null;
  }

  return {
    original: record,
    ai_input: {
      record_id: record.record_id,
      source_app: record.source_app,
      topic: sanitizeAIText(record.topic, 120),
      project: sanitizeAIText(record.project, 120),
      message_time: record.message_time,
      turn_index: record.turn_index,
      user_excerpt: sanitizeAIText(record.user_message, 2000),
      ai_excerpt: sanitizeAIText(record.ai_message, 2000),
      context_summary: sanitizeAIText(`${record.topic} / ${record.project}`, 300)
    }
  };
}

export function sanitizeAIText(value: string, maxLength: number): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted_api_key]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\b1[3-9]\d{9}\b/g, "<phone>")
    .replace(/\/Users\/[^\s，。；;]+/g, "<local_path>")
    .replace(/[A-Za-z]:\\[^\s，。；;]+/g, "<local_path>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function createKnowledgeAtomGenerator(provider: KnowledgeExtractionProviderName): KnowledgeAtomGenerator {
  if (provider === "fixture") {
    return new FixtureKnowledgeAtomGenerator();
  }

  return new OpenAICompatibleKnowledgeAtomGenerator();
}

export class FixtureKnowledgeAtomGenerator implements KnowledgeAtomGenerator {
  async generateKnowledgeAtoms(request: KnowledgeAtomGenerationRequest): Promise<KnowledgeAtomDraft[]> {
    return request.records.map((record) => ({
      title: `AI提炼：${record.topic}`,
      type: inferDraftType(record),
      content: `用户在「${record.topic}」中表达了一个值得沉淀的要点：${record.user_excerpt}`,
      evidence: record.user_excerpt.slice(0, 300),
      source_record_ids: [record.record_id],
      tags: ["AI提炼", record.source_app],
      sensitivity: "personal",
      confidence_level: "high"
    }));
  }
}

export class OpenAICompatibleKnowledgeAtomGenerator implements KnowledgeAtomGenerator {
  async generateKnowledgeAtoms(request: KnowledgeAtomGenerationRequest): Promise<KnowledgeAtomDraft[]> {
    const apiKey = process.env.AI_KB_OPENAI_API_KEY;
    const baseUrl = process.env.AI_KB_OPENAI_BASE_URL;
    const model = process.env.AI_KB_OPENAI_MODEL;

    if (!apiKey || !baseUrl || !model) {
      throw new Error("OpenAI-compatible provider requires AI_KB_OPENAI_API_KEY, AI_KB_OPENAI_BASE_URL and AI_KB_OPENAI_MODEL.");
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "你是个人知识库提炼助手。只输出 JSON，字段为 atoms，atoms 是候选知识原子数组。"
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "从脱敏后的 AI 对话片段中提炼 pending 知识原子。",
              output_schema: {
                atoms: [{
                  title: "string",
                  type: "观点|方法|决策|经验|素材|问题|偏好",
                  content: "string",
                  evidence: "string",
                  source_record_ids: ["string"],
                  tags: ["string"],
                  sensitivity: "personal|private|confidential",
                  confidence_level: "high|medium|low"
                }]
              },
              records: request.records
            })
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed: ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI-compatible response missing message content.");
    }

    const parsed = JSON.parse(content) as { atoms?: KnowledgeAtomDraft[] };
    return parsed.atoms ?? [];
  }
}

function inferDraftType(record: AIRecordInput): KnowledgeAtomType {
  if (/怎么|如何|步骤|方法|拆/.test(record.user_excerpt)) {
    return "方法";
  }

  if (/问题|为什么|是否/.test(record.user_excerpt)) {
    return "问题";
  }

  return "观点";
}

function validateDraft(draft: KnowledgeAtomDraft, recordsById: Map<StableId, NormalizedRecord>): { ok: boolean } {
  if (!draft.title || !draft.content || !draft.evidence || draft.source_record_ids.length === 0) {
    return { ok: false };
  }

  if (!isKnowledgeAtomType(draft.type) || !isSensitivity(draft.sensitivity)) {
    return { ok: false };
  }

  if (!draft.source_record_ids.every((id) => recordsById.has(id))) {
    return { ok: false };
  }

  return { ok: true };
}

function isLowValueDraft(draft: KnowledgeAtomDraft): boolean {
  return draft.confidence_level === "low" || draft.content.trim().length < 12 || draft.evidence.trim().length < 4;
}

function buildKnowledgeAtomFromDraft(
  draft: KnowledgeAtomDraft,
  recordsById: Map<StableId, NormalizedRecord>,
  now: string
): KnowledgeAtom {
  const records = draft.source_record_ids.map((id) => recordsById.get(id)).filter((record): record is NormalizedRecord => record !== undefined);

  return {
    schema_version: SCHEMA_VERSION.knowledgeAtom,
    atom_id: createAtomId(draft),
    title: draft.title,
    type: draft.type,
    content: draft.content,
    source_app: records[0]?.source_app ?? "codex",
    source_record_ids: draft.source_record_ids,
    source_raw_paths: Array.from(new Set(records.map((record) => record.raw_archive_path))),
    project: records[0]?.project ?? "unknown",
    tags: Array.from(new Set(draft.tags)),
    sensitivity: draft.sensitivity,
    review_status: "pending",
    evidence: draft.evidence.slice(0, 300),
    merged_into: "",
    created_at: now,
    updated_at: now
  };
}

function createAtomId(draft: KnowledgeAtomDraft): StableId {
  const seed = [
    draft.title,
    draft.type,
    draft.content,
    draft.source_record_ids.slice().sort().join(",")
  ].join("\n");

  return `atom_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

function hasBlockedBusinessRisk(record: NormalizedRecord): boolean {
  return /公司|客户|合同|内部|confidential|client/i.test(`${record.project}\n${record.topic}\n${record.user_message}\n${record.ai_message}`);
}

function isKnowledgeAtomType(value: string): value is KnowledgeAtomType {
  return value === "观点" || value === "方法" || value === "决策" || value === "经验" || value === "素材" || value === "问题" || value === "偏好";
}

function isSensitivity(value: string): value is Sensitivity {
  return value === "personal" || value === "private" || value === "confidential";
}

async function writeDailySummary(
  vaultRoot: string,
  runId: string,
  summary: Omit<ExtractKnowledgeAtomsSummary, "daily_summary_path"> & { created_at: string }
): Promise<VaultRelativePath> {
  const dailySummaryPath = `data/daily_runs/${runId}-p2-summary.json`;
  const absolutePath = resolveVaultPath(vaultRoot, dailySummaryPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return dailySummaryPath;
}
