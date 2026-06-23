import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DailyRun, DailyRunStatus, SourceApp } from "../schemas";
import { SCHEMA_VERSION } from "../schemas";
import { resolveVaultPath } from "../storage";

export interface DailyAutomationSettings {
  enabled: boolean;
  run_time_local: string;
  only_when_idle: boolean;
  idle_threshold_seconds: number;
  require_confirmation: boolean;
  notify_on_complete: boolean;
  retry_count: number;
  retry_delay_minutes: number;
  updated_at: string;
}

export interface DailyRunHistoryItem {
  run_id: string;
  run_date: string;
  status: DailyRunStatus;
  source_apps: SourceApp[];
  generated_atom_count: number;
  error_summary: string;
  started_at: string;
  finished_at: string | null;
}

export type DailyAutomationDecisionAction =
  | "disabled"
  | "not_due"
  | "already_completed"
  | "already_skipped"
  | "waiting_idle"
  | "pending_confirmation"
  | "run_now"
  | "retry_later"
  | "retry_now"
  | "retry_exhausted";

export interface DailyAutomationDecision {
  action: DailyAutomationDecisionAction;
  run_date: string;
  reason: string;
  attempt_count: number;
  next_retry_at?: string;
}

export interface DailyAutomationEvaluationInput {
  settings: DailyAutomationSettings;
  history: DailyRunHistoryItem[];
  now: Date;
  idle_seconds: number;
  allow_rerun?: boolean;
}

export interface DailyAutomationState {
  settings: DailyAutomationSettings;
  history: DailyRunHistoryItem[];
  decision: DailyAutomationDecision;
}

const SETTINGS_PATH = "data/runtime/daily-automation-settings.json";

export function buildDefaultDailyAutomationSettings(now = new Date().toISOString()): DailyAutomationSettings {
  return {
    enabled: false,
    run_time_local: "22:30",
    only_when_idle: true,
    idle_threshold_seconds: 300,
    require_confirmation: true,
    notify_on_complete: true,
    retry_count: 1,
    retry_delay_minutes: 10,
    updated_at: now
  };
}

export async function readDailyAutomationSettings(vaultRoot: string): Promise<DailyAutomationSettings> {
  const filePath = resolveVaultPath(vaultRoot, SETTINGS_PATH);

  try {
    const content = await readFile(filePath, "utf8");
    return normalizeDailyAutomationSettings(JSON.parse(content) as Partial<DailyAutomationSettings>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return buildDefaultDailyAutomationSettings();
    }

    throw error;
  }
}

export async function saveDailyAutomationSettings(
  vaultRoot: string,
  input: Partial<DailyAutomationSettings>,
  now = new Date().toISOString()
): Promise<DailyAutomationSettings> {
  const nextSettings = normalizeDailyAutomationSettings({ ...input, updated_at: now });
  const filePath = resolveVaultPath(vaultRoot, SETTINGS_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
  return nextSettings;
}

export async function listDailyRunHistory(vaultRoot: string): Promise<DailyRunHistoryItem[]> {
  const root = resolveVaultPath(vaultRoot, "data/daily_runs");
  const items: DailyRunHistoryItem[] = [];

  let files: string[];
  try {
    files = await readdir(root);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const content = await readFile(path.join(root, file), "utf8");
    const parsed = JSON.parse(content) as Partial<DailyRun>;
    if (parsed.schema_version !== SCHEMA_VERSION.dailyRun || !parsed.run_id || !parsed.run_date || !parsed.status) {
      continue;
    }

    items.push({
      run_id: parsed.run_id,
      run_date: parsed.run_date,
      status: parsed.status,
      source_apps: parsed.source_apps ?? [],
      generated_atom_count: parsed.generated_atom_ids?.length ?? 0,
      error_summary: (parsed.errors ?? []).map((error) => error.message).join("；"),
      started_at: parsed.started_at ?? parsed.created_at ?? "",
      finished_at: parsed.finished_at ?? null
    });
  }

  return items.sort((left, right) => {
    const rightTime = right.finished_at ?? right.started_at;
    const leftTime = left.finished_at ?? left.started_at;
    return rightTime.localeCompare(leftTime);
  });
}

export async function getDailyAutomationState(vaultRoot: string, now = new Date(), idleSeconds = 0): Promise<DailyAutomationState> {
  const settings = await readDailyAutomationSettings(vaultRoot);
  const history = await listDailyRunHistory(vaultRoot);
  return {
    settings,
    history,
    decision: evaluateDailyAutomation({
      settings,
      history,
      now,
      idle_seconds: idleSeconds
    })
  };
}

export function evaluateDailyAutomation(input: DailyAutomationEvaluationInput): DailyAutomationDecision {
  const runDate = formatLocalDate(input.now);
  const attemptCount = countFailedExtractionRuns(input.history, runDate);

  if (!input.settings.enabled) {
    return decision("disabled", runDate, "每日自动化未启用。", attemptCount);
  }

  if (!input.allow_rerun && hasCompletedExtractionRun(input.history, runDate)) {
    return decision("already_completed", runDate, "今天已有成功的每日沉淀记录。", attemptCount);
  }

  if (!input.allow_rerun && hasCancelledExtractionRun(input.history, runDate)) {
    return decision("already_skipped", runDate, "今天的自动运行已被跳过。", attemptCount);
  }

  if (!isDue(input.settings.run_time_local, input.now)) {
    return decision("not_due", runDate, `尚未到达运行时间 ${input.settings.run_time_local}。`, attemptCount);
  }

  const retryDecision = evaluateRetry(input.settings, input.history, runDate, input.now, attemptCount);
  if (retryDecision) {
    return retryDecision;
  }

  if (input.settings.only_when_idle && input.idle_seconds < input.settings.idle_threshold_seconds) {
    return decision("waiting_idle", runDate, "电脑尚未达到空闲阈值。", attemptCount);
  }

  if (attemptCount === 0 && input.settings.require_confirmation && !input.allow_rerun) {
    return decision("pending_confirmation", runDate, "等待用户确认后运行。", attemptCount);
  }

  return decision(attemptCount > 0 ? "retry_now" : "run_now", runDate, attemptCount > 0 ? "失败重试条件已满足。" : "可以开始每日沉淀。", attemptCount);
}

export function normalizeDailyAutomationSettings(input: Partial<DailyAutomationSettings>): DailyAutomationSettings {
  const defaults = buildDefaultDailyAutomationSettings(input.updated_at);
  const settings = {
    ...defaults,
    ...input
  };

  if (!/^\d{2}:\d{2}$/.test(settings.run_time_local)) {
    throw new Error("run_time_local must use HH:mm format.");
  }

  const [hour, minute] = settings.run_time_local.split(":").map((item) => Number(item));
  if (hour === undefined || minute === undefined || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("run_time_local must be a valid local time.");
  }

  if (!Number.isInteger(settings.idle_threshold_seconds) || settings.idle_threshold_seconds < 0) {
    throw new Error("idle_threshold_seconds must be a non-negative integer.");
  }

  if (!Number.isInteger(settings.retry_count) || settings.retry_count < 0) {
    throw new Error("retry_count must be a non-negative integer.");
  }

  if (!Number.isInteger(settings.retry_delay_minutes) || settings.retry_delay_minutes < 0) {
    throw new Error("retry_delay_minutes must be a non-negative integer.");
  }

  return settings;
}

function evaluateRetry(
  settings: DailyAutomationSettings,
  history: DailyRunHistoryItem[],
  runDate: string,
  now: Date,
  attemptCount: number
): DailyAutomationDecision | null {
  if (attemptCount === 0) {
    return null;
  }

  if (attemptCount > settings.retry_count) {
    return decision("retry_exhausted", runDate, "失败重试次数已用尽。", attemptCount);
  }

  const lastFailure = history
    .filter((item) => isExtractionRun(item) && item.run_date === runDate && item.status === "failed")
    .sort((left, right) => (right.finished_at ?? right.started_at).localeCompare(left.finished_at ?? left.started_at))[0];
  if (!lastFailure) {
    return null;
  }

  const lastFailureTime = new Date(lastFailure.finished_at ?? lastFailure.started_at);
  const nextRetryAt = new Date(lastFailureTime.getTime() + settings.retry_delay_minutes * 60 * 1000);
  if (now.getTime() < nextRetryAt.getTime()) {
    return {
      ...decision("retry_later", runDate, "尚未到达失败重试时间。", attemptCount),
      next_retry_at: nextRetryAt.toISOString()
    };
  }

  return null;
}

function hasCompletedExtractionRun(history: DailyRunHistoryItem[], runDate: string): boolean {
  return history.some((item) => isExtractionRun(item) && item.run_date === runDate && item.status === "completed");
}

function hasCancelledExtractionRun(history: DailyRunHistoryItem[], runDate: string): boolean {
  return history.some((item) => isExtractionRun(item) && item.run_date === runDate && item.status === "cancelled");
}

function countFailedExtractionRuns(history: DailyRunHistoryItem[], runDate: string): number {
  return history.filter((item) => isExtractionRun(item) && item.run_date === runDate && item.status === "failed").length;
}

function isExtractionRun(item: DailyRunHistoryItem): boolean {
  return item.run_id.includes("extract") || item.run_id.startsWith("p2_");
}

function isDue(runTimeLocal: string, now: Date): boolean {
  return formatLocalTime(now) >= runTimeLocal;
}

function decision(
  action: DailyAutomationDecisionAction,
  runDate: string,
  reason: string,
  attemptCount: number
): DailyAutomationDecision {
  return {
    action,
    run_date: runDate,
    reason,
    attempt_count: attemptCount
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
