import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { listSourceConnectorManifests } from "../connectors";
import type { Sensitivity, SourceApp, VaultRelativePath } from "../schemas";
import { resolveVaultPath } from "../storage";

export type RawRetentionMode = "keep_forever" | "delete_after_days" | "delete_after_successful_run";
export type SensitiveFindingSeverity = "low" | "medium" | "high";

export interface PrivacyRule {
  rule_id: string;
  label: string;
  sensitivity: Sensitivity;
  severity: SensitiveFindingSeverity;
  description: string;
}

export interface SensitiveFinding {
  rule_id: string;
  label: string;
  sensitivity: Sensitivity;
  severity: SensitiveFindingSeverity;
  match_preview: string;
}

export interface SensitiveScanResult {
  sensitivity: Sensitivity;
  can_enter_personal_kb: boolean;
  findings: SensitiveFinding[];
}

export interface SourceAuthorizationInfo {
  source_app: SourceApp;
  display_name: string;
  status: string;
  authorized: boolean;
  permission_scope: string;
  reads: string[];
  does_not_read: string[];
  import_path: string;
}

export interface PrivacySecuritySettings {
  require_source_authorization: boolean;
  raw_retention_mode: RawRetentionMode;
  raw_retention_days: number;
  allow_cloud_ai_for_private: boolean;
  updated_at: string;
}

export interface PrivacySecurityState {
  rules: PrivacyRule[];
  settings: PrivacySecuritySettings;
  sources: SourceAuthorizationInfo[];
  secure_credentials: SecureCredentialState;
}

export interface SecureCredentialInput {
  service: "openai-compatible";
  api_key: string;
  base_url?: string;
  model?: string;
}

export interface SecureCredentialState {
  openai_compatible_saved: boolean;
  updated_at: string | null;
}

export interface UserDataExportSummary {
  export_dir: VaultRelativePath;
  manifest_path: VaultRelativePath;
  copied_dir_count: number;
}

export interface SourceDataDeleteSummary {
  source_app: SourceApp;
  deleted_paths: VaultRelativePath[];
}

export interface UserDataDeleteSummary {
  deleted_paths: VaultRelativePath[];
}

export interface RawRetentionApplySummary {
  mode: RawRetentionMode;
  deleted_paths: VaultRelativePath[];
}

const SETTINGS_PATH = "data/runtime/privacy-security-settings.json";
const SECURE_KEY_PATH = "data/runtime/secure/local-secret.key";
const SECURE_CREDENTIAL_PATH = "data/runtime/secure/credentials.json.enc";
const DATA_EXPORT_DIRS = ["knowledge", "raw", "data/runtime", "data/daily_runs", "data/backups", "logs"] as const;
const DATA_DELETE_DIRS = [...DATA_EXPORT_DIRS, "data/exports"] as const;

export const PRIVACY_RULES: PrivacyRule[] = [
  { rule_id: "api_key", label: "API Key 或访问令牌", sensitivity: "confidential", severity: "high", description: "识别 sk-、ghp_、xoxb- 等常见密钥和令牌格式。" },
  { rule_id: "password", label: "密码或密钥字段", sensitivity: "confidential", severity: "high", description: "识别 password、secret、token、密钥 等字段。" },
  { rule_id: "business_private", label: "公司、客户或合同内容", sensitivity: "confidential", severity: "high", description: "识别公司项目、客户资料、合同、报价、内部资料等内容。" },
  { rule_id: "email", label: "邮箱地址", sensitivity: "private", severity: "medium", description: "识别常见邮箱地址。" },
  { rule_id: "phone", label: "手机号", sensitivity: "private", severity: "medium", description: "识别中国大陆手机号。" },
  { rule_id: "id_card", label: "身份证号", sensitivity: "private", severity: "medium", description: "识别 18 位身份证号。" }
];

const SCAN_RULES: Array<PrivacyRule & { pattern: RegExp }> = [
  { ...PRIVACY_RULES[0]!, pattern: /\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g },
  { ...PRIVACY_RULES[1]!, pattern: /(password|passwd|secret|token|api[_-]?key|密钥|密码)\s*[:=：]\s*[^\s,，;；]{4,}/gi },
  { ...PRIVACY_RULES[2]!, pattern: /(公司项目|客户|合同|报价|内部资料|保密|NDA|workbuddy|企业微信|飞书)/gi },
  { ...PRIVACY_RULES[3]!, pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { ...PRIVACY_RULES[4]!, pattern: /\b1[3-9]\d{9}\b/g },
  { ...PRIVACY_RULES[5]!, pattern: /\b\d{6}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g }
];

export function buildDefaultPrivacySecuritySettings(now = new Date().toISOString()): PrivacySecuritySettings {
  return {
    require_source_authorization: true,
    raw_retention_mode: "keep_forever",
    raw_retention_days: 30,
    allow_cloud_ai_for_private: false,
    updated_at: now
  };
}

export async function getPrivacySecurityState(vaultRoot: string): Promise<PrivacySecurityState> {
  return {
    rules: PRIVACY_RULES,
    settings: await readPrivacySecuritySettings(vaultRoot),
    sources: listSourceAuthorizationInfo(),
    secure_credentials: await getSecureCredentialState(vaultRoot)
  };
}

export async function readPrivacySecuritySettings(vaultRoot: string): Promise<PrivacySecuritySettings> {
  try {
    return normalizePrivacySecuritySettings(JSON.parse(await readFile(resolveVaultPath(vaultRoot, SETTINGS_PATH), "utf8")) as Partial<PrivacySecuritySettings>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return buildDefaultPrivacySecuritySettings();
    }
    throw error;
  }
}

export async function savePrivacySecuritySettings(vaultRoot: string, input: Partial<PrivacySecuritySettings>, now = new Date().toISOString()): Promise<PrivacySecuritySettings> {
  const settings = normalizePrivacySecuritySettings({ ...input, updated_at: now });
  const filePath = resolveVaultPath(vaultRoot, SETTINGS_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return settings;
}

export function scanSensitiveContent(content: string): SensitiveScanResult {
  const findings: SensitiveFinding[] = [];
  for (const rule of SCAN_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      findings.push({
        rule_id: rule.rule_id,
        label: rule.label,
        sensitivity: rule.sensitivity,
        severity: rule.severity,
        match_preview: redactPreview(match[0] ?? "")
      });
    }
  }
  const sensitivity = highestSensitivity(findings);
  return { sensitivity, can_enter_personal_kb: sensitivity === "personal", findings };
}

export function listSourceAuthorizationInfo(): SourceAuthorizationInfo[] {
  return listSourceConnectorManifests().map((manifest) => ({
    source_app: manifest.source_app,
    display_name: manifest.display_name,
    status: manifest.status,
    authorized: manifest.status === "available" && manifest.default_enabled,
    permission_scope: manifest.permission_scope,
    reads: [...manifest.reads],
    does_not_read: [...manifest.does_not_read],
    import_path: manifest.import_path
  }));
}

export async function saveSecureCredential(vaultRoot: string, input: SecureCredentialInput, now = new Date().toISOString()): Promise<SecureCredentialState> {
  const key = await readOrCreateSecretKey(vaultRoot);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ ...input, base_url: input.base_url ?? "", model: input.model ?? "", updated_at: now });
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const filePath = resolveVaultPath(vaultRoot, SECURE_CREDENTIAL_PATH);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify({
    version: "secure_credential.v1",
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    updated_at: now
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return getSecureCredentialState(vaultRoot);
}

export async function loadSecureCredential(vaultRoot: string): Promise<SecureCredentialInput | null> {
  try {
    const envelope = JSON.parse(await readFile(resolveVaultPath(vaultRoot, SECURE_CREDENTIAL_PATH), "utf8")) as { iv: string; auth_tag: string; ciphertext: string };
    const decipher = createDecipheriv("aes-256-gcm", await readOrCreateSecretKey(vaultRoot), Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.auth_tag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as SecureCredentialInput;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getSecureCredentialState(vaultRoot: string): Promise<SecureCredentialState> {
  try {
    const envelope = JSON.parse(await readFile(resolveVaultPath(vaultRoot, SECURE_CREDENTIAL_PATH), "utf8")) as { updated_at?: string };
    return { openai_compatible_saved: true, updated_at: envelope.updated_at ?? null };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { openai_compatible_saved: false, updated_at: null };
    }
    throw error;
  }
}

export async function applyRawRetentionPolicy(vaultRoot: string, now = new Date()): Promise<RawRetentionApplySummary> {
  const settings = await readPrivacySecuritySettings(vaultRoot);
  const deletedPaths: VaultRelativePath[] = [];
  if (settings.raw_retention_mode === "keep_forever") {
    return { mode: settings.raw_retention_mode, deleted_paths: deletedPaths };
  }
  const files = await listFiles(resolveVaultPath(vaultRoot, "raw/archive"));
  const cutoff = now.getTime() - settings.raw_retention_days * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const fileStat = await stat(file);
    if (settings.raw_retention_mode === "delete_after_days" && settings.raw_retention_days > 0 && fileStat.mtime.getTime() > cutoff) {
      continue;
    }
    await rm(file, { force: true });
    deletedPaths.push(toVaultRelativePath(vaultRoot, file));
  }
  return { mode: settings.raw_retention_mode, deleted_paths: deletedPaths };
}

export async function deleteSourceData(vaultRoot: string, sourceApp: SourceApp): Promise<SourceDataDeleteSummary> {
  const deletedPaths: VaultRelativePath[] = [];
  for (const item of [`raw/imports/${sourceApp}`, `raw/archive/${sourceApp}`]) {
    const absolutePath = resolveVaultPath(vaultRoot, item);
    if (await exists(absolutePath)) {
      await rm(absolutePath, { recursive: true, force: true });
      deletedPaths.push(item);
    }
  }
  return { source_app: sourceApp, deleted_paths: deletedPaths };
}

export async function exportUserData(vaultRoot: string, now = new Date()): Promise<UserDataExportSummary> {
  const exportDir = `data/exports/user-data-${toTimestamp(now)}`;
  const absoluteExportDir = resolveVaultPath(vaultRoot, exportDir);
  await mkdir(absoluteExportDir, { recursive: true });
  let copiedDirCount = 0;
  for (const dir of DATA_EXPORT_DIRS) {
    const source = resolveVaultPath(vaultRoot, dir);
    if (await exists(source)) {
      await cp(source, path.join(absoluteExportDir, dir), { recursive: true });
      copiedDirCount += 1;
    }
  }
  const manifestPath = `${exportDir}/manifest.json`;
  await writeFile(resolveVaultPath(vaultRoot, manifestPath), `${JSON.stringify({ schema_version: "user_data_export.v1", created_at: now.toISOString(), copied_dirs: DATA_EXPORT_DIRS }, null, 2)}\n`, "utf8");
  return { export_dir: exportDir, manifest_path: manifestPath, copied_dir_count: copiedDirCount };
}

export async function deleteAllUserData(vaultRoot: string): Promise<UserDataDeleteSummary> {
  const deletedPaths: VaultRelativePath[] = [];
  for (const dir of DATA_DELETE_DIRS) {
    const absolutePath = resolveVaultPath(vaultRoot, dir);
    if (await exists(absolutePath)) {
      await rm(absolutePath, { recursive: true, force: true });
      deletedPaths.push(dir);
    }
  }
  return { deleted_paths: deletedPaths };
}

export async function writePrivacyLegalDrafts(vaultRoot: string, now = new Date()): Promise<{ privacy_policy_path: VaultRelativePath; terms_path: VaultRelativePath }> {
  const privacyPolicyPath = "legal/隐私政策草案.md";
  const termsPath = "legal/用户协议草案.md";
  await mkdir(resolveVaultPath(vaultRoot, "legal"), { recursive: true });
  await writeFile(resolveVaultPath(vaultRoot, privacyPolicyPath), `# 隐私政策草案\n\n更新时间：${now.toISOString()}\n\n本产品只读取用户明确选择或放入导入目录的 AI 对话导出文件，不自动网页登录，不读取浏览器 Cookie，不绕过平台权限采集。\n\n原始记录、标准化记录、知识库、运行日志和索引默认保存在用户本机。\n\n用户可以导出本地数据，也可以按来源删除数据或彻底删除本地用户数据。\n`, "utf8");
  await writeFile(resolveVaultPath(vaultRoot, termsPath), `# 用户协议草案\n\n更新时间：${now.toISOString()}\n\n用户应确保导入的 AI 对话记录来源合法，并拥有处理这些内容的必要权限。\n\nAI 生成的候选知识需要用户人工确认。\n`, "utf8");
  return { privacy_policy_path: privacyPolicyPath, terms_path: termsPath };
}

function normalizePrivacySecuritySettings(input: Partial<PrivacySecuritySettings>): PrivacySecuritySettings {
  const settings = { ...buildDefaultPrivacySecuritySettings(input.updated_at), ...input };
  if (!["keep_forever", "delete_after_days", "delete_after_successful_run"].includes(settings.raw_retention_mode)) {
    throw new Error("raw_retention_mode is invalid.");
  }
  if (!Number.isInteger(settings.raw_retention_days) || settings.raw_retention_days < 0) {
    throw new Error("raw_retention_days must be a non-negative integer.");
  }
  return settings;
}

async function readOrCreateSecretKey(vaultRoot: string): Promise<Buffer> {
  const filePath = resolveVaultPath(vaultRoot, SECURE_KEY_PATH);
  try {
    return Buffer.from((await readFile(filePath, "utf8")).trim(), "base64");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    const key = randomBytes(32);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
    return key;
  }
}

function highestSensitivity(findings: SensitiveFinding[]): Sensitivity {
  if (findings.some((finding) => finding.sensitivity === "confidential")) return "confidential";
  if (findings.some((finding) => finding.sensitivity === "private")) return "private";
  return "personal";
}

function redactPreview(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 8 ? "***" : `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

async function listFiles(root: string): Promise<string[]> {
  if (!await exists(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string): VaultRelativePath {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
}

function toTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
