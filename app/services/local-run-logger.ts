import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { SourceApp, VaultRelativePath } from "../schemas";

export type RunLogLevel = "info" | "warn" | "error";

export interface RunLogEventInput {
  run_id: string;
  level: RunLogLevel;
  event_type: string;
  message: string;
  source_app?: SourceApp;
  raw_path?: VaultRelativePath;
  record_count?: number;
}

export interface RunLogErrorInput {
  run_id: string;
  error_code: string;
  message: string;
  source_app?: SourceApp;
  raw_path?: VaultRelativePath;
}

export interface RunLogEvent {
  event_id: string;
  run_id: string;
  level: RunLogLevel;
  event_type: string;
  message: string;
  source_app?: SourceApp;
  raw_file_name?: string;
  record_count?: number;
  created_at: string;
}

export interface LocalRunLoggerOptions {
  vault_root: string;
  logs_dir: VaultRelativePath;
}

export class LocalRunLogger {
  constructor(private readonly options: LocalRunLoggerOptions) {}

  async info(input: Omit<RunLogEventInput, "level">): Promise<void> {
    await this.appendEvent({ ...input, level: "info" });
  }

  async warn(input: Omit<RunLogEventInput, "level">): Promise<void> {
    await this.appendEvent({ ...input, level: "warn" });
  }

  async error(input: RunLogErrorInput): Promise<void> {
    const event: RunLogEventInput = {
      run_id: input.run_id,
      level: "error",
      event_type: input.error_code,
      message: input.message
    };

    if (input.source_app) {
      event.source_app = input.source_app;
    }

    if (input.raw_path) {
      event.raw_path = input.raw_path;
    }

    await this.appendEvent(event);
  }

  async appendEvent(input: RunLogEventInput): Promise<void> {
    const event = buildRunLogEvent(input);
    const filePath = this.getLogFilePath(event.created_at);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  private getLogFilePath(createdAt: string): string {
    const logDate = createdAt.slice(0, 10);
    return resolveVaultPath(this.options.vault_root, `${this.options.logs_dir}/run-${logDate}.jsonl`);
  }
}

export function buildRunLogEvent(input: RunLogEventInput, createdAt = new Date().toISOString()): RunLogEvent {
  const event: RunLogEvent = {
    event_id: `evt_${randomUUID()}`,
    run_id: input.run_id,
    level: input.level,
    event_type: input.event_type,
    message: sanitizeLogMessage(input.message),
    created_at: createdAt
  };

  if (input.source_app) {
    event.source_app = input.source_app;
  }

  if (input.raw_path) {
    event.raw_file_name = path.basename(input.raw_path);
  }

  if (input.record_count !== undefined) {
    event.record_count = input.record_count;
  }

  return event;
}

export function sanitizeLogMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted_api_key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function resolveVaultPath(vaultRoot: string, vaultRelativePath: VaultRelativePath): string {
  const resolved = path.resolve(vaultRoot, vaultRelativePath);
  const root = path.resolve(vaultRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes vault root: ${vaultRelativePath}`);
  }

  return resolved;
}
