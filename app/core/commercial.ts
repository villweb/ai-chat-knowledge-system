import { createPublicKey, sign, verify } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveVaultPath } from "../storage";

export type CommercialPlanId = "free" | "trial" | "pro";
export type CommercialLicenseStatus = "free" | "trial_active" | "trial_expired" | "active" | "expired" | "invalid";

export interface CommercialPlan {
  plan_id: CommercialPlanId;
  label: string;
  price_label: string;
  feature_ids: string[];
  limits: {
    daily_runs: number | "unlimited";
    connectors: number | "unlimited";
    automation: boolean;
    export_existing_data: boolean;
  };
}

export interface CommercialRuntimeState {
  schema_version: "commercial_state.v1";
  plan_id: CommercialPlanId;
  license_status: CommercialLicenseStatus;
  trial_started_at: string;
  trial_ends_at: string;
  account_email: string;
  license_id: string;
  activated_at: string;
  expires_at: string;
  last_verified_at: string;
  offline_valid_until: string;
  updated_at: string;
}

export interface CommercialAccess {
  effective_plan_id: CommercialPlanId;
  can_use_paid_features: boolean;
  can_export_existing_data: boolean;
  blocked_feature_ids: string[];
  days_until_trial_end: number;
  days_until_license_expiry: number;
}

export interface CommercialNotice {
  level: "info" | "warning" | "danger";
  title: string;
  message: string;
}

export interface PurchaseEntry {
  purchase_url: string;
  pricing_url: string;
  manage_license_url: string;
}

export interface WebsiteRequirement {
  website_url: string;
  required_pages: Array<{ page_id: string; title: string; path: string; purpose: string }>;
}

export interface UpdateAnnouncement {
  version: string;
  channel: string;
  title: string;
  body: string;
  announcement_url: string;
}

export interface FeedbackEntry {
  feedback_url: string;
  support_email: string;
  subject_template: string;
}

export interface CommercialState {
  plans: CommercialPlan[];
  runtime: CommercialRuntimeState;
  access: CommercialAccess;
  notices: CommercialNotice[];
  purchase: PurchaseEntry;
  website: WebsiteRequirement;
  update_announcement: UpdateAnnouncement;
  feedback: FeedbackEntry;
}

export interface LicenseActivationInput {
  activation_code: string;
}

export interface AccountLoginInput {
  account_email: string;
}

export interface FeedbackDraftInput {
  contact_email?: string;
  category: "bug" | "feature" | "billing" | "other";
  message: string;
}

export interface LicenseActivationPayload {
  schema_version: "license_activation.v1";
  license_id: string;
  plan_id: "pro";
  account_email: string;
  issued_at: string;
  expires_at: string;
}

export interface LicenseActivationResult {
  ok: boolean;
  error_message: string;
  state: CommercialState;
}

const COMMERCIAL_STATE_PATH = "data/runtime/commercial-state.json";
const FEEDBACK_DRAFT_DIR = "data/runtime/feedback-drafts";
const TRIAL_DAYS = 14;
const OFFLINE_VALID_DAYS = 30;
const DEFAULT_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPm/nX/Vpy9nrkDMmu09eJieyK5lOulBpF4uKCbh1GEc=
-----END PUBLIC KEY-----`;

export const COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    plan_id: "free",
    label: "Free",
    price_label: "免费",
    feature_ids: ["manual_import", "review_pending_atoms", "export_existing_data"],
    limits: { daily_runs: 1, connectors: 1, automation: false, export_existing_data: true }
  },
  {
    plan_id: "trial",
    label: "Trial",
    price_label: "14 天试用",
    feature_ids: ["manual_import", "review_pending_atoms", "daily_automation", "all_connectors", "export_existing_data"],
    limits: { daily_runs: "unlimited", connectors: "unlimited", automation: true, export_existing_data: true }
  },
  {
    plan_id: "pro",
    label: "Pro",
    price_label: "付费版",
    feature_ids: ["manual_import", "review_pending_atoms", "daily_automation", "all_connectors", "priority_updates", "export_existing_data"],
    limits: { daily_runs: "unlimited", connectors: "unlimited", automation: true, export_existing_data: true }
  }
];

export async function getCommercialState(vaultRoot: string, now = new Date()): Promise<CommercialState> {
  const runtime = await readOrCreateCommercialRuntime(vaultRoot, now);
  const normalized = normalizeRuntimeStatus(runtime, now);
  if (normalized.updated_at !== runtime.updated_at || normalized.license_status !== runtime.license_status || normalized.plan_id !== runtime.plan_id) {
    await writeCommercialRuntime(vaultRoot, normalized);
  }
  return buildCommercialState(normalized, now);
}

export async function activateLicense(vaultRoot: string, input: LicenseActivationInput, now = new Date(), publicKeyPem = process.env.AI_KB_LICENSE_PUBLIC_KEY || DEFAULT_LICENSE_PUBLIC_KEY): Promise<LicenseActivationResult> {
  const currentState = await getCommercialState(vaultRoot, now);
  const parsed = verifyActivationCode(input.activation_code, publicKeyPem);
  if (!parsed.ok) {
    const invalidRuntime = {
      ...currentState.runtime,
      license_status: "invalid" as const,
      updated_at: now.toISOString()
    };
    await writeCommercialRuntime(vaultRoot, invalidRuntime);
    return { ok: false, error_message: parsed.error_message, state: await getCommercialState(vaultRoot, now) };
  }

  const payload = parsed.payload;
  const runtime: CommercialRuntimeState = {
    ...currentState.runtime,
    plan_id: "pro",
    license_status: new Date(payload.expires_at).getTime() > now.getTime() ? "active" : "expired",
    account_email: payload.account_email,
    license_id: payload.license_id,
    activated_at: now.toISOString(),
    expires_at: payload.expires_at,
    last_verified_at: now.toISOString(),
    offline_valid_until: minIso(addDays(now, OFFLINE_VALID_DAYS), new Date(payload.expires_at)),
    updated_at: now.toISOString()
  };
  await writeCommercialRuntime(vaultRoot, runtime);
  return { ok: runtime.license_status === "active", error_message: runtime.license_status === "active" ? "" : "授权码已过期。", state: await getCommercialState(vaultRoot, now) };
}

export async function saveAccountLoginIntent(vaultRoot: string, input: AccountLoginInput, now = new Date()): Promise<CommercialState> {
  const state = await getCommercialState(vaultRoot, now);
  const runtime: CommercialRuntimeState = {
    ...state.runtime,
    account_email: input.account_email.trim(),
    updated_at: now.toISOString()
  };
  await writeCommercialRuntime(vaultRoot, runtime);
  return getCommercialState(vaultRoot, now);
}

export async function createFeedbackDraft(vaultRoot: string, input: FeedbackDraftInput, now = new Date()): Promise<{ draft_path: string; feedback: FeedbackEntry }> {
  const draft = {
    schema_version: "feedback_draft.v1",
    category: input.category,
    contact_email: input.contact_email ?? "",
    message: input.message,
    created_at: now.toISOString()
  };
  const draftPath = `${FEEDBACK_DRAFT_DIR}/feedback-${toTimestamp(now)}.json`;
  const absolutePath = resolveVaultPath(vaultRoot, draftPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return { draft_path: draftPath, feedback: buildFeedbackEntry() };
}

export function createActivationCode(payload: LicenseActivationPayload, privateKeyPem: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = Buffer.from(signActivationPayload(payloadPart, privateKeyPem)).toString("base64url");
  return `AIKB1.${payloadPart}.${signature}`;
}

function buildCommercialState(runtime: CommercialRuntimeState, now: Date): CommercialState {
  return {
    plans: COMMERCIAL_PLANS,
    runtime,
    access: buildCommercialAccess(runtime, now),
    notices: buildCommercialNotices(runtime, now),
    purchase: buildPurchaseEntry(),
    website: buildWebsiteRequirement(),
    update_announcement: buildUpdateAnnouncement(),
    feedback: buildFeedbackEntry()
  };
}

function buildCommercialAccess(runtime: CommercialRuntimeState, now: Date): CommercialAccess {
  const canUsePaidFeatures = runtime.license_status === "active" || runtime.license_status === "trial_active";
  return {
    effective_plan_id: canUsePaidFeatures ? runtime.plan_id : "free",
    can_use_paid_features: canUsePaidFeatures,
    can_export_existing_data: true,
    blocked_feature_ids: canUsePaidFeatures ? [] : ["daily_automation", "all_connectors", "priority_updates"],
    days_until_trial_end: daysUntil(now, runtime.trial_ends_at),
    days_until_license_expiry: runtime.expires_at ? daysUntil(now, runtime.expires_at) : 0
  };
}

function buildCommercialNotices(runtime: CommercialRuntimeState, now: Date): CommercialNotice[] {
  if (runtime.license_status === "trial_active") {
    return [{ level: "info", title: "试用中", message: `试用还剩 ${Math.max(daysUntil(now, runtime.trial_ends_at), 0)} 天。` }];
  }
  if (runtime.license_status === "trial_expired") {
    return [{ level: "warning", title: "试用已结束", message: "付费功能已锁定，已有本地数据仍可导出。" }];
  }
  if (runtime.license_status === "expired") {
    return [{ level: "danger", title: "授权已过期", message: "付费功能已锁定，已有本地数据仍可导出。" }];
  }
  if (runtime.license_status === "invalid") {
    return [{ level: "warning", title: "授权校验失败", message: "请检查激活码或联系支持，已有本地数据仍可导出。" }];
  }
  if (runtime.license_status === "active" && daysUntil(now, runtime.expires_at) <= 7) {
    return [{ level: "warning", title: "授权即将到期", message: "请及时续费以继续使用付费功能。" }];
  }
  return [];
}

function buildPurchaseEntry(): PurchaseEntry {
  return {
    purchase_url: "https://villweb.com/ai-chat-knowledge/pricing",
    pricing_url: "https://villweb.com/ai-chat-knowledge/pricing",
    manage_license_url: "https://villweb.com/ai-chat-knowledge/account"
  };
}

function buildWebsiteRequirement(): WebsiteRequirement {
  return {
    website_url: "https://villweb.com/ai-chat-knowledge",
    required_pages: [
      { page_id: "home", title: "产品介绍", path: "/", purpose: "说明产品价值、隐私边界和核心流程。" },
      { page_id: "pricing", title: "价格页", path: "/pricing", purpose: "展示 Free、Trial、Pro 差异和购买入口。" },
      { page_id: "download", title: "下载页", path: "/download", purpose: "提供 macOS 和 Windows 安装包。" },
      { page_id: "privacy", title: "隐私政策", path: "/privacy", purpose: "说明本地优先、授权读取和数据删除能力。" },
      { page_id: "support", title: "支持与反馈", path: "/support", purpose: "承接问题反馈、账单支持和更新公告。" }
    ]
  };
}

function buildUpdateAnnouncement(): UpdateAnnouncement {
  return {
    version: "0.1.0",
    channel: "stable",
    title: "首个本地优先桌面版本",
    body: "包含本地导入、AI 提炼、每日自动化、知识库管理、隐私安全、跨平台安装包和商业化入口。",
    announcement_url: "https://villweb.com/ai-chat-knowledge/changelog"
  };
}

function buildFeedbackEntry(): FeedbackEntry {
  return {
    feedback_url: "https://villweb.com/ai-chat-knowledge/support",
    support_email: "support@villweb.com",
    subject_template: "[AI Chat Knowledge] 反馈"
  };
}

async function readOrCreateCommercialRuntime(vaultRoot: string, now: Date): Promise<CommercialRuntimeState> {
  try {
    return JSON.parse(await readFile(resolveVaultPath(vaultRoot, COMMERCIAL_STATE_PATH), "utf8")) as CommercialRuntimeState;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    const runtime = buildDefaultCommercialRuntime(now);
    await writeCommercialRuntime(vaultRoot, runtime);
    return runtime;
  }
}

function buildDefaultCommercialRuntime(now: Date): CommercialRuntimeState {
  return {
    schema_version: "commercial_state.v1",
    plan_id: "trial",
    license_status: "trial_active",
    trial_started_at: now.toISOString(),
    trial_ends_at: addDays(now, TRIAL_DAYS).toISOString(),
    account_email: "",
    license_id: "",
    activated_at: "",
    expires_at: "",
    last_verified_at: "",
    offline_valid_until: "",
    updated_at: now.toISOString()
  };
}

async function writeCommercialRuntime(vaultRoot: string, runtime: CommercialRuntimeState): Promise<void> {
  const filePath = resolveVaultPath(vaultRoot, COMMERCIAL_STATE_PATH);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
}

function normalizeRuntimeStatus(runtime: CommercialRuntimeState, now: Date): CommercialRuntimeState {
  if (runtime.license_status === "active" && runtime.expires_at && new Date(runtime.expires_at).getTime() <= now.getTime()) {
    return { ...runtime, plan_id: "free", license_status: "expired", updated_at: now.toISOString() };
  }
  if (runtime.license_status === "trial_active" && new Date(runtime.trial_ends_at).getTime() <= now.getTime()) {
    return { ...runtime, plan_id: "free", license_status: "trial_expired", updated_at: now.toISOString() };
  }
  if (runtime.license_status === "invalid") {
    return { ...runtime, plan_id: "free" };
  }
  return runtime;
}

function verifyActivationCode(code: string, publicKeyPem: string): { ok: true; payload: LicenseActivationPayload } | { ok: false; error_message: string } {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "AIKB1") {
    return { ok: false, error_message: "激活码格式无效。" };
  }
  const payloadPart = parts[1] ?? "";
  const signaturePart = parts[2] ?? "";
  const signature = Buffer.from(signaturePart, "base64url");
  const publicKey = createPublicKey(publicKeyPem);
  const verified = verify(null, Buffer.from(payloadPart, "utf8"), publicKey, signature);
  if (!verified) {
    return { ok: false, error_message: "激活码签名无效。" };
  }
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as LicenseActivationPayload;
  if (payload.schema_version !== "license_activation.v1" || payload.plan_id !== "pro") {
    return { ok: false, error_message: "激活码内容无效。" };
  }
  return { ok: true, payload };
}

function signActivationPayload(payloadPart: string, privateKeyPem: string): Buffer {
  return sign(null, Buffer.from(payloadPart, "utf8"), privateKeyPem);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function daysUntil(now: Date, iso: string): number {
  if (!iso) return 0;
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function minIso(first: Date, second: Date): string {
  return new Date(Math.min(first.getTime(), second.getTime())).toISOString();
}

function toTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
