import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileText,
  FileInput,
  Filter,
  FolderOpen,
  Globe,
  HardDriveDownload,
  KeyRound,
  ListChecks,
  Lock,
  Megaphone,
  PackageCheck,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Split,
  SquarePen,
  Trash2,
  X
} from "lucide-react";
import "./styles.css";
import {
  AI_PROVIDER_PRESETS,
  findPresetById,
  resolvePresetId,
  type AiProviderPresetId
} from "../ai-provider-presets";
import { FieldLabel, FirstTimeBanner, HelpTip, HintText, SectionHeading } from "./help-components";

type ReviewStatus = "pending" | "approved" | "rejected" | "merged";
type KnowledgeAtomType = "观点" | "方法" | "决策" | "经验" | "素材" | "问题" | "偏好";
type NavKey = "guide" | "sources" | "import" | "run" | "library" | "ask" | "privacy" | "commercial" | "pending" | "detail" | "settings" | "logs";
type SourceConnectorStatus = "available" | "reserved";
type PipelinePhase = "idle" | "importing" | "processing" | "waiting_review" | "done" | "failed";
type PipelineSubstep = "copying" | "normalizing" | "extracting" | null;
type RawRetentionMode = "keep_forever" | "delete_after_days" | "delete_after_successful_run";
type FeedbackCategory = "bug" | "feature" | "billing" | "other";

interface KnowledgeAtom {
  atom_id: string;
  title: string;
  type: KnowledgeAtomType;
  content: string;
  review_status: ReviewStatus;
  source_app: string;
  source_record_ids: string[];
  source_raw_paths: string[];
  project: string;
  tags: string[];
  sensitivity: string;
  evidence: string;
  merged_into: string;
  updated_at: string;
}

interface KnowledgeAtomDocument {
  atom: KnowledgeAtom;
  file_path: string;
}

interface LogEvent {
  event_id: string;
  event_type: string;
  message: string;
  level?: string;
  source_app?: string;
  record_count?: number;
  created_at: string;
}

interface DailyAutomationSettings {
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

interface DailyRunHistoryItem {
  run_id: string;
  run_date: string;
  status: string;
  source_apps: string[];
  generated_atom_count: number;
  error_summary: string;
  started_at: string;
  finished_at: string | null;
}

interface DailyAutomationDecision {
  action: string;
  run_date: string;
  reason: string;
  attempt_count: number;
  next_retry_at?: string;
}

interface PendingAutomationRun {
  run_date: string;
  source_app: string;
  reason: string;
  created_at: string;
}

interface DailyAutomationState {
  settings: DailyAutomationSettings;
  history: DailyRunHistoryItem[];
  decision: DailyAutomationDecision;
  pending_run: PendingAutomationRun | null;
  last_decision: DailyAutomationDecision | null;
}

interface KnowledgeFacetItem {
  value: string;
  count: number;
}

interface DuplicateKnowledgeGroup {
  key: string;
  title: string;
  atom_ids: string[];
  items: KnowledgeAtomDocument[];
}

interface DailyKnowledgeCalendarItem {
  date: string;
  run_count: number;
  generated_atom_count: number;
  approved_atom_count: number;
  pending_atom_count: number;
  failed_run_count: number;
}

interface KnowledgeLibraryView {
  items: KnowledgeAtomDocument[];
  facets: {
    source_apps: KnowledgeFacetItem[];
    types: KnowledgeFacetItem[];
    projects: KnowledgeFacetItem[];
    tags: KnowledgeFacetItem[];
    statuses: KnowledgeFacetItem[];
  };
  duplicate_groups: DuplicateKnowledgeGroup[];
  calendar: DailyKnowledgeCalendarItem[];
}

interface SourceConnectorView {
  source_app: string;
  display_name: string;
  status: SourceConnectorStatus;
  enabled: boolean;
  supported_source_types: string[];
  supported_content_types: string[];
  supported_extensions: string[];
  import_path: string;
  permission_scope: string;
  reads: string[];
  does_not_read: string[];
  local_record_recognition: string;
  failure_help: string;
}

interface PrivacySecuritySettings {
  require_source_authorization: boolean;
  raw_retention_mode: RawRetentionMode;
  raw_retention_days: number;
  allow_cloud_ai_for_private: boolean;
  updated_at: string;
}

interface PrivacySecurityState {
  rules: Array<{ rule_id: string; label: string; sensitivity: string; severity: string; description: string }>;
  settings: PrivacySecuritySettings;
  sources: Array<{ source_app: string; display_name: string; status: string; authorized: boolean; permission_scope: string; reads: string[]; does_not_read: string[]; import_path: string }>;
  secure_credentials: { openai_compatible_saved: boolean; updated_at: string | null };
}

interface SensitiveScanResult {
  sensitivity: string;
  can_enter_personal_kb: boolean;
  findings: Array<{ rule_id: string; label: string; sensitivity: string; severity: string; match_preview: string }>;
}

interface PipelineState {
  phase: PipelinePhase;
  substep?: PipelineSubstep;
  label: string;
  error?: string | null;
  can_retry?: boolean;
  updated_at: string;
}

interface ImportResult {
  copied_file_count?: number;
  copied_file_names?: string[];
  copied_raw_paths?: string[];
  source_app?: string;
  import_path?: string;
  auto_processed?: boolean;
  pending_atom_count?: number;
  total_atom_count?: number;
  normalized_record_count?: number;
  generated_atom_count?: number;
  failed_file_count?: number;
  blocked_record_count?: number;
  used_personal_default?: boolean;
  import_batch_atom_ids?: string[];
  import_batch_record_ids?: string[];
}

interface DailyRunResult {
  pending_atom_count?: number;
  normalized_record_count?: number;
  generated_atom_count?: number;
}

interface KnowledgeExportResult {
  export_dir?: string;
  index_path?: string;
  exported_file_count?: number;
}

interface KnowledgeBackupResult {
  backup_dir?: string;
  manifest_path?: string;
  copied_dir_count?: number;
  restored_dir_count?: number;
}

interface OperationResultCardState {
  title: string;
  message: string;
  paths: Array<{ label: string; path: string }>;
  metric_label?: string;
  metric_value?: number;
}

interface ReleaseState {
  app_name: string;
  app_id: string;
  executable_name: string;
  data_dir_name: string;
  default_vault_dir_name: string;
  update_channel: string;
  update_url: string;
  update_url_env: string;
  uninstall_policy: string;
  version: string;
  is_packaged: boolean;
  app_data_dir: string;
  default_vault_root: string;
  update_enabled: boolean;
}

interface CommercialPlan {
  plan_id: string;
  label: string;
  price_label: string;
  feature_ids: string[];
  limits: { daily_runs: number | "unlimited"; connectors: number | "unlimited"; automation: boolean; export_existing_data: boolean };
}

interface CommercialState {
  plans: CommercialPlan[];
  runtime: {
    plan_id: string;
    license_status: string;
    trial_started_at: string;
    trial_ends_at: string;
    account_email: string;
    license_id: string;
    activated_at: string;
    expires_at: string;
    offline_valid_until: string;
    updated_at: string;
  };
  access: {
    effective_plan_id: string;
    can_use_paid_features: boolean;
    can_export_existing_data: boolean;
    blocked_feature_ids: string[];
    days_until_trial_end: number;
    days_until_license_expiry: number;
  };
  notices: Array<{ level: string; title: string; message: string }>;
  purchase: { purchase_url: string; pricing_url: string; manage_license_url: string };
  website: { website_url: string; required_pages: Array<{ page_id: string; title: string; path: string; purpose: string }> };
  update_announcement: { version: string; channel: string; title: string; body: string; announcement_url: string };
  feedback: { feedback_url: string; support_email: string; subject_template: string };
}

interface DesktopState {
  vaultRoot: string;
  sourceApp: string;
  aiProvider: string;
  aiProviderPreset?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  apiKeyConfigured: boolean;
  automation: DailyAutomationState;
  connectors: SourceConnectorView[];
  events: LogEvent[];
  atoms: KnowledgeAtomDocument[];
  knowledge: KnowledgeLibraryView;
  privacy: PrivacySecurityState;
  release: ReleaseState;
  commercial: CommercialState;
  logs: LogEvent[];
  pipeline?: PipelineState;
}

interface SessionConfigInput {
  sourceApp: string;
  aiProvider: string;
  aiProviderPreset?: string;
  baseUrl?: string;
  model?: string;
  apiKey: string;
}

interface AtomUpdateInput {
  atom_id: string;
  title?: string;
  type?: KnowledgeAtomType;
  content?: string;
  tags?: string[];
  review_status?: ReviewStatus;
  merged_into?: string;
}

interface DesktopApi {
  getState(): Promise<DesktopState>;
  chooseVault(): Promise<DesktopState>;
  showVaultPath(input: { vault_path: string }): Promise<unknown>;
  chooseImportFiles(sourceApp: string): Promise<ImportResult>;
  retryImport(): Promise<ImportResult>;
  runImport(): Promise<unknown>;
  runDaily(): Promise<unknown>;
  listAtoms(): Promise<KnowledgeAtomDocument[]>;
  updateAtom(input: AtomUpdateInput): Promise<KnowledgeAtomDocument>;
  getKnowledgeView(input: Record<string, unknown>): Promise<KnowledgeLibraryView>;
  exportKnowledgeMarkdown(): Promise<unknown>;
  ensureObsidianCompatibility(): Promise<unknown>;
  backupKnowledge(): Promise<unknown>;
  restoreLatestKnowledgeBackup(): Promise<unknown>;
  getPrivacyState(): Promise<PrivacySecurityState>;
  savePrivacySettings(input: Partial<PrivacySecuritySettings>): Promise<PrivacySecurityState>;
  scanSensitiveContent(input: { content: string }): Promise<SensitiveScanResult>;
  applyRawRetention(): Promise<unknown>;
  deleteSourceData(input: { source_app: string }): Promise<unknown>;
  exportUserData(): Promise<unknown>;
  deleteAllUserData(): Promise<unknown>;
  writePrivacyLegalDrafts(): Promise<unknown>;
  getReleaseState(): Promise<ReleaseState>;
  checkForUpdates(): Promise<unknown>;
  getCommercialState(): Promise<CommercialState>;
  activateLicense(input: { activation_code: string }): Promise<unknown>;
  saveCommercialAccount(input: { account_email: string }): Promise<unknown>;
  createFeedbackDraft(input: { contact_email?: string; category: FeedbackCategory; message: string }): Promise<unknown>;
  listLogs(): Promise<LogEvent[]>;
  setConnectorEnabled(input: { sourceApp: string; enabled: boolean }): Promise<unknown>;
  getAutomationState(): Promise<DailyAutomationState>;
  saveAutomationSettings(input: Partial<DailyAutomationSettings>): Promise<DailyAutomationState>;
  confirmAutomationRun(): Promise<DailyAutomationState>;
  skipAutomationRun(): Promise<DailyAutomationState>;
  rerunAutomationDate(input: { run_date: string }): Promise<DailyAutomationState>;
  listAutomationHistory(): Promise<DailyRunHistoryItem[]>;
  saveSessionConfig(input: SessionConfigInput): Promise<DesktopState>;
}

declare global {
  interface Window {
    desktopApi?: DesktopApi;
    aiKnowledgeRoot?: ReturnType<typeof createRoot>;
  }
}

let previewDesktopApi: DesktopApi | null = null;

function isDesktopRuntime(): boolean {
  return Boolean(window.desktopApi);
}

const PRODUCT_GUIDE_DISMISS_KEY = "ai-kb-product-guide-dismissed";
const ONBOARDING_COMPLETED_KEY = "ai-kb-onboarding-completed";

const pipelineSubsteps = [
  { key: "copying", label: "复制中" },
  { key: "normalizing", label: "标准化" },
  { key: "extracting", label: "AI 提炼" }
] as const;

// 主栏：用户主路径，只保留最高频闭环入口
const primaryNavItems: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "import", label: "导入", icon: FileInput },
  { key: "pending", label: "待确认", icon: ListChecks },
  { key: "library", label: "知识库", icon: BookOpenCheck },
  { key: "ask", label: "提问", icon: Search }
];

// 更多：配置来源与低频管理
const secondaryNavItems: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "guide", label: "引导", icon: BookOpenCheck },
  { key: "sources", label: "来源", icon: Database },
  { key: "run", label: "运行", icon: Play },
  { key: "privacy", label: "隐私", icon: Lock },
  { key: "settings", label: "设置", icon: Settings },
  { key: "logs", label: "日志", icon: Archive },
  { key: "commercial", label: "商业", icon: BadgeCheck }
];

const allNavItems = [...primaryNavItems, ...secondaryNavItems];

const typeOptions: KnowledgeAtomType[] = ["观点", "方法", "决策", "经验", "素材", "问题", "偏好"];

function isFixtureProvider(provider: string): boolean {
  return provider !== "openai-compatible";
}

function aiProviderLabel(provider: string): string {
  return provider === "openai-compatible" ? "真实 AI API" : "本地测试模式（fixture）";
}

function getDesktopApi(): DesktopApi {
  if (window.desktopApi) {
    return window.desktopApi;
  }

  if (previewDesktopApi) {
    return previewDesktopApi;
  }

  previewDesktopApi = createPreviewDesktopApi();
  return previewDesktopApi;
}

function createPreviewDesktopApi(): DesktopApi {
  const sampleAtom: KnowledgeAtomDocument = {
    file_path: "knowledge/inbox/2026/preview-atom.md",
    atom: {
      atom_id: "preview-atom",
      title: "预览知识卡片",
      type: "观点",
      content: "桌面预览模式会展示完整交互结构；真实导入、抽取和写入需要在 Electron 应用中运行。",
      review_status: "pending",
      source_app: "codex",
      source_record_ids: ["preview-record"],
      source_raw_paths: ["raw/imports/codex/preview.md"],
      project: "personal",
      tags: ["preview", "desktop"],
      sensitivity: "personal",
      evidence: "预览数据",
      merged_into: "",
      updated_at: new Date().toISOString()
    }
  };
  const duplicateAtom: KnowledgeAtomDocument = {
    file_path: "knowledge/inbox/2026/preview-duplicate.md",
    atom: {
      ...sampleAtom.atom,
      atom_id: "preview-duplicate",
      title: "预览知识卡片",
      updated_at: new Date(Date.now() - 60_000).toISOString()
    }
  };

  const sampleLog: LogEvent = {
    event_id: "preview-log",
    event_type: "desktop_preview",
    message: "Renderer preview is active.",
    level: "info",
    source_app: "codex",
    created_at: new Date().toISOString()
  };

  const previewState: DesktopState = {
    vaultRoot: "/Users/may/Documents/Claude/Projects/探索个人天赋/ai-chat-knowledge-system",
    sourceApp: "codex",
    aiProvider: "fixture",
    apiKeyConfigured: false,
    automation: buildPreviewAutomation(),
    connectors: buildPreviewConnectors(),
    events: [sampleLog],
    atoms: [sampleAtom, duplicateAtom],
    knowledge: buildPreviewKnowledge([sampleAtom, duplicateAtom]),
    privacy: buildPreviewPrivacy(),
    release: buildPreviewRelease(),
    commercial: buildPreviewCommercial(),
    logs: [sampleLog],
    pipeline: { phase: "idle", label: "空闲", updated_at: new Date().toISOString() }
  };

  return {
    async getState() {
      return previewState;
    },
    async chooseVault() {
      return previewState;
    },
    async showVaultPath() {
      return { ok: true };
    },
    async chooseImportFiles() {
      throw new Error("当前为浏览器预览模式，无法打开文件选择框。请使用 npm run desktop:dev 或安装版桌面应用。");
    },
    async retryImport() {
      return {
        copied_file_count: 1,
        pending_atom_count: 1,
        total_atom_count: previewState.atoms.length
      };
    },
    async runImport() {
      return { ok: true };
    },
    async runDaily() {
      const pendingCount = previewState.atoms.filter((item) => item.atom.review_status === "pending").length;
      return {
        normalized_record_count: 1,
        generated_atom_count: 1,
        pending_atom_count: pendingCount
      };
    },
    async listAtoms() {
      return previewState.atoms;
    },
    async updateAtom(input) {
      previewState.atoms = previewState.atoms.map((item) => {
        if (item.atom.atom_id !== input.atom_id) {
          return item;
        }

        return {
          ...item,
          atom: {
            ...item.atom,
            ...input,
            updated_at: new Date().toISOString()
          }
        };
      });
      previewState.knowledge = buildPreviewKnowledge(previewState.atoms);
      return previewState.atoms.find((item) => item.atom.atom_id === input.atom_id) ?? sampleAtom;
    },
    async getKnowledgeView() {
      return previewState.knowledge;
    },
    async exportKnowledgeMarkdown() {
      return { export_dir: "data/exports/preview", exported_file_count: previewState.atoms.length };
    },
    async ensureObsidianCompatibility() {
      return { index_path: "knowledge/_index.md", exported_file_count: previewState.atoms.length };
    },
    async backupKnowledge() {
      return { backup_dir: "data/backups/preview", copied_dir_count: 4 };
    },
    async restoreLatestKnowledgeBackup() {
      return { backup_dir: "data/backups/preview", restored_dir_count: 4 };
    },
    async getPrivacyState() {
      return previewState.privacy;
    },
    async savePrivacySettings(input) {
      previewState.privacy = {
        ...previewState.privacy,
        settings: { ...previewState.privacy.settings, ...input, updated_at: new Date().toISOString() }
      };
      return previewState.privacy;
    },
    async scanSensitiveContent(input) {
      const hit = input.content.includes("sk-") || input.content.includes("客户");
      return {
        sensitivity: hit ? "confidential" : "personal",
        can_enter_personal_kb: !hit,
        findings: hit ? [{ rule_id: "preview", label: "预览敏感内容", sensitivity: "confidential", severity: "high", match_preview: "prev***view" }] : []
      };
    },
    async applyRawRetention() {
      return { mode: previewState.privacy.settings.raw_retention_mode, deleted_paths: [] };
    },
    async deleteSourceData(input) {
      return { source_app: input.source_app, deleted_paths: [`raw/imports/${input.source_app}`] };
    },
    async exportUserData() {
      return { export_dir: "data/exports/preview", copied_dir_count: 4 };
    },
    async deleteAllUserData() {
      return { deleted_paths: ["knowledge", "raw", "data/runtime"] };
    },
    async writePrivacyLegalDrafts() {
      return { privacy_policy_path: "legal/隐私政策草案.md", terms_path: "legal/用户协议草案.md" };
    },
    async getReleaseState() {
      return previewState.release;
    },
    async checkForUpdates() {
      return { enabled: false, message: "预览模式未配置更新发布地址。" };
    },
    async getCommercialState() {
      return previewState.commercial;
    },
    async activateLicense(input) {
      previewState.commercial = {
        ...previewState.commercial,
        runtime: {
          ...previewState.commercial.runtime,
          license_status: input.activation_code ? "active" : "invalid",
          plan_id: input.activation_code ? "pro" : "free",
          license_id: input.activation_code ? "preview-license" : "",
          updated_at: new Date().toISOString()
        },
        access: {
          ...previewState.commercial.access,
          effective_plan_id: input.activation_code ? "pro" : "free",
          can_use_paid_features: Boolean(input.activation_code),
          can_export_existing_data: true,
          blocked_feature_ids: input.activation_code ? [] : ["daily_automation"]
        }
      };
      return { ok: Boolean(input.activation_code), state: previewState.commercial };
    },
    async saveCommercialAccount(input) {
      previewState.commercial.runtime.account_email = input.account_email;
      return previewState.commercial;
    },
    async createFeedbackDraft() {
      return { draft_path: "data/runtime/feedback-drafts/preview.json", feedback: previewState.commercial.feedback };
    },
    async listLogs() {
      return previewState.logs;
    },
    async setConnectorEnabled(input) {
      previewState.connectors = previewState.connectors.map((connector) => (
        connector.source_app === input.sourceApp ? { ...connector, enabled: input.enabled } : connector
      ));
      return { ok: true };
    },
    async getAutomationState() {
      return previewState.automation;
    },
    async saveAutomationSettings(input) {
      previewState.automation = {
        ...previewState.automation,
        settings: {
          ...previewState.automation.settings,
          ...input,
          updated_at: new Date().toISOString()
        }
      };
      return previewState.automation;
    },
    async confirmAutomationRun() {
      previewState.automation.pending_run = null;
      return previewState.automation;
    },
    async skipAutomationRun() {
      previewState.automation.pending_run = null;
      return previewState.automation;
    },
    async rerunAutomationDate(input) {
      previewState.automation.history = [{
        run_id: `preview-rerun-${input.run_date}`,
        run_date: input.run_date,
        status: "completed",
        source_apps: ["codex"],
        generated_atom_count: 1,
        error_summary: "",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString()
      }, ...previewState.automation.history];
      return previewState.automation;
    },
    async listAutomationHistory() {
      return previewState.automation.history;
    },
    async saveSessionConfig(input) {
      previewState.sourceApp = input.sourceApp;
      previewState.aiProvider = input.aiProvider;
      if (input.aiProviderPreset !== undefined) {
        previewState.aiProviderPreset = input.aiProviderPreset;
      }
      if (input.baseUrl !== undefined) {
        previewState.aiBaseUrl = input.baseUrl;
      }
      if (input.model !== undefined) {
        previewState.aiModel = input.model;
      }
      previewState.apiKeyConfigured = Boolean(input.apiKey) || previewState.apiKeyConfigured;
      return previewState;
    }
  };
}

function buildPreviewCommercial(): CommercialState {
  const now = new Date().toISOString();
  return {
    plans: [
      { plan_id: "free", label: "Free", price_label: "免费", feature_ids: ["manual_import", "export_existing_data"], limits: { daily_runs: 1, connectors: 1, automation: false, export_existing_data: true } },
      { plan_id: "trial", label: "Trial", price_label: "14 天试用", feature_ids: ["daily_automation", "all_connectors", "export_existing_data"], limits: { daily_runs: "unlimited", connectors: "unlimited", automation: true, export_existing_data: true } },
      { plan_id: "pro", label: "Pro", price_label: "付费版", feature_ids: ["daily_automation", "all_connectors", "priority_updates", "export_existing_data"], limits: { daily_runs: "unlimited", connectors: "unlimited", automation: true, export_existing_data: true } }
    ],
    runtime: {
      plan_id: "trial",
      license_status: "trial_active",
      trial_started_at: now,
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      account_email: "",
      license_id: "",
      activated_at: "",
      expires_at: "",
      offline_valid_until: "",
      updated_at: now
    },
    access: {
      effective_plan_id: "trial",
      can_use_paid_features: true,
      can_export_existing_data: true,
      blocked_feature_ids: [],
      days_until_trial_end: 14,
      days_until_license_expiry: 0
    },
    notices: [{ level: "info", title: "试用中", message: "试用还剩 14 天。" }],
    purchase: {
      purchase_url: "https://villweb.com/ai-chat-knowledge/pricing",
      pricing_url: "https://villweb.com/ai-chat-knowledge/pricing",
      manage_license_url: "https://villweb.com/ai-chat-knowledge/account"
    },
    website: {
      website_url: "https://villweb.com/ai-chat-knowledge",
      required_pages: [
        { page_id: "home", title: "产品介绍", path: "/", purpose: "说明产品价值。" },
        { page_id: "pricing", title: "价格页", path: "/pricing", purpose: "展示版本差异和购买入口。" },
        { page_id: "support", title: "支持与反馈", path: "/support", purpose: "承接反馈。" }
      ]
    },
    update_announcement: {
      version: "0.1.0",
      channel: "stable",
      title: "首个本地优先桌面版本",
      body: "包含核心沉淀流程、隐私安全和商业化入口。",
      announcement_url: "https://villweb.com/ai-chat-knowledge/changelog"
    },
    feedback: {
      feedback_url: "https://villweb.com/ai-chat-knowledge/support",
      support_email: "support@villweb.com",
      subject_template: "[AI Chat Knowledge] 反馈"
    }
  };
}

function buildPreviewRelease(): ReleaseState {
  return {
    app_name: "AI Chat Knowledge",
    app_id: "com.villweb.aichatknowledge",
    executable_name: "AI Chat Knowledge",
    data_dir_name: "AI Chat Knowledge",
    default_vault_dir_name: "vault",
    update_channel: "stable",
    update_url: "https://updates.villweb.com/ai-chat-knowledge-system",
    update_url_env: "AI_KB_UPDATE_URL",
    uninstall_policy: "retain_user_data",
    version: "0.1.0",
    is_packaged: false,
    app_data_dir: "~/Library/Application Support/AI Chat Knowledge",
    default_vault_root: "~/Library/Application Support/AI Chat Knowledge/vault",
    update_enabled: false
  };
}

function buildPreviewPrivacy(): PrivacySecurityState {
  const now = new Date().toISOString();
  return {
    rules: [
      { rule_id: "api_key", label: "API Key 或访问令牌", sensitivity: "confidential", severity: "high", description: "识别常见密钥和令牌格式。" },
      { rule_id: "business_private", label: "公司、客户或合同内容", sensitivity: "confidential", severity: "high", description: "识别公司项目、客户资料、合同、报价、内部资料等内容。" }
    ],
    settings: {
      require_source_authorization: true,
      raw_retention_mode: "keep_forever",
      raw_retention_days: 30,
      allow_cloud_ai_for_private: false,
      updated_at: now
    },
    sources: buildPreviewConnectors().map((connector) => ({
      source_app: connector.source_app,
      display_name: connector.display_name,
      status: connector.status,
      authorized: connector.status === "available" && connector.enabled,
      permission_scope: connector.permission_scope,
      reads: connector.reads,
      does_not_read: connector.does_not_read,
      import_path: connector.import_path
    })),
    secure_credentials: { openai_compatible_saved: false, updated_at: null }
  };
}

function buildPreviewKnowledge(items: KnowledgeAtomDocument[]): KnowledgeLibraryView {
  const now = new Date().toISOString().slice(0, 10);
  return {
    items,
    facets: {
      source_apps: [{ value: "codex", count: items.length }],
      types: [{ value: "观点", count: items.length }],
      projects: [{ value: "personal", count: items.length }],
      tags: [{ value: "preview", count: items.length }, { value: "desktop", count: items.length }],
      statuses: [{ value: "pending", count: items.filter((item) => item.atom.review_status === "pending").length }]
    },
    duplicate_groups: [{
      key: "preview",
      title: "预览知识卡片",
      atom_ids: items.map((item) => item.atom.atom_id),
      items
    }],
    calendar: [{
      date: now,
      run_count: 1,
      generated_atom_count: items.length,
      approved_atom_count: 0,
      pending_atom_count: items.length,
      failed_run_count: 0
    }]
  };
}

function buildPreviewAutomation(): DailyAutomationState {
  const now = new Date().toISOString();
  return {
    settings: {
      enabled: false,
      run_time_local: "22:30",
      only_when_idle: true,
      idle_threshold_seconds: 300,
      require_confirmation: true,
      notify_on_complete: true,
      retry_count: 1,
      retry_delay_minutes: 10,
      updated_at: now
    },
    history: [{
      run_id: "preview-history",
      run_date: now.slice(0, 10),
      status: "completed",
      source_apps: ["codex"],
      generated_atom_count: 1,
      error_summary: "",
      started_at: now,
      finished_at: now
    }],
    decision: {
      action: "disabled",
      run_date: now.slice(0, 10),
      reason: "每日自动化未启用。",
      attempt_count: 0
    },
    pending_run: null,
    last_decision: null
  };
}

function buildPreviewConnectors(): SourceConnectorView[] {
  return [
    previewConnector("codex", "Codex", "available", true, "raw/imports/codex", "Codex 手动导出和本地记录副本。"),
    {
      ...previewConnector("cursor", "Cursor", "available", true, "raw/imports/cursor", "Cursor 手动导出和本地记录副本。"),
      does_not_read: ["不读取 Cursor 数据库原件", "不自动遍历工作区代码", "不接入公司项目目录"]
    },
    {
      ...previewConnector("deepseek", "DeepSeek", "available", true, "raw/imports/deepseek", "DeepSeek 网页导出文件。"),
      does_not_read: ["不自动网页登录", "不读取浏览器 Cookie", "不绕过平台权限采集"]
    },
    previewConnector("doubao", "豆包", "reserved", false, "raw/imports/doubao", "预留入口，本阶段不读取。"),
    previewConnector("workbuddy", "Workbuddy", "reserved", false, "raw/imports/workbuddy", "预留入口，本阶段不读取。")
  ];
}

function previewConnector(sourceApp: string, displayName: string, status: SourceConnectorStatus, enabled: boolean, importPath: string, permission: string): SourceConnectorView {
  return {
    source_app: sourceApp,
    display_name: displayName,
    status,
    enabled,
    supported_source_types: status === "reserved" ? ["manual_export"] : ["manual_export"],
    supported_content_types: ["markdown", "txt", "json"],
    supported_extensions: [".md", ".markdown", ".txt", ".json"],
    import_path: importPath,
    permission_scope: permission,
    reads: status === "reserved" ? ["暂不读取"] : ["用户放入导入目录的 Markdown/TXT/JSON"],
    does_not_read: ["不自动网页登录", "不扫描未授权目录", "不上传原始文件"],
    local_record_recognition: "按扩展名和结构化字段识别。",
    failure_help: "请检查导入目录、source_app 和 source_type。"
  };
}

function App() {
  const [active, setActive] = useState<NavKey>("import");
  const [state, setState] = useState<DesktopState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"info" | "error">("info");
  const [bootError, setBootError] = useState("");
  const [operationResult, setOperationResult] = useState<OperationResultCardState | null>(null);
  const [reviewUndo, setReviewUndo] = useState<KnowledgeAtom | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [productGuideDismissed, setProductGuideDismissed] = useState(() => {
    try {
      return localStorage.getItem(PRODUCT_GUIDE_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hasInitializedNav, setHasInitializedNav] = useState(false);
  const [importBatchAtomIds, setImportBatchAtomIds] = useState<string[]>([]);
  const [recentlyApprovedIds, setRecentlyApprovedIds] = useState<string[]>([]);
  const [libraryFocusAtomIds, setLibraryFocusAtomIds] = useState<string[]>([]);
  const [reviewSuccess, setReviewSuccess] = useState<{
    atomId: string;
    remainingPending: number;
    nextPendingId: string;
  } | null>(null);
  const [lastRunResult, setLastRunResult] = useState<DailyRunResult | null>(null);
  const [moreNavOpen, setMoreNavOpen] = useState(() => {
    try {
      return localStorage.getItem("ai-kb-more-nav-open") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (secondaryNavItems.some((item) => item.key === active)) {
      setMoreNavOpen(true);
    }
  }, [active]);

  useEffect(() => {
    void refresh();
  }, []);

  // 处理进行中轮询流水线子步骤
  useEffect(() => {
    if (!busy) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const nextState = await getDesktopApi().getState() as DesktopState;
          if (!nextState.pipeline) {
            return;
          }
          setState((previous) => (previous ? { ...previous, pipeline: nextState.pipeline! } : previous));
        } catch {
          // 轮询失败时忽略，避免打断主流程
        }
      })();
    }, 400);

    return () => window.clearInterval(timer);
  }, [busy]);

  const selected = useMemo(() => {
    return state?.atoms.find((item) => item.atom.atom_id === selectedId) ?? state?.atoms[0] ?? null;
  }, [selectedId, state]);

  const counts = useMemo(() => {
    const items = state?.atoms ?? [];
    return {
      pending: items.filter((item) => item.atom.review_status === "pending").length,
      approved: items.filter((item) => item.atom.review_status === "approved").length,
      rejected: items.filter((item) => item.atom.review_status === "rejected").length,
      merged: items.filter((item) => item.atom.review_status === "merged").length
    };
  }, [state]);

  const pipeline = useMemo(() => {
    if (state?.pipeline && (busy || state.pipeline.phase === "failed" || state.pipeline.substep)) {
      return state.pipeline;
    }
    if (counts.pending > 0) {
      return { phase: "waiting_review" as PipelinePhase, label: "等待审查", updated_at: new Date().toISOString() };
    }
    if (state?.pipeline && state.pipeline.phase !== "waiting_review") {
      return state.pipeline;
    }
    return { phase: "idle" as PipelinePhase, label: "空闲", updated_at: new Date().toISOString() };
  }, [busy, counts.pending, state?.pipeline]);

  async function refresh() {
    try {
      const nextState = await getDesktopApi().getState() as DesktopState;
      setBootError("");
      setState(nextState);
      if (!hasInitializedNav) {
        const pendingCount = nextState.atoms.filter((item) => item.atom.review_status === "pending").length;
        setActive(nextState.atoms.length === 0 ? "import" : (pendingCount > 0 ? "pending" : "import"));
        setHasInitializedNav(true);
      }
      if (!selectedId && nextState.atoms[0]) {
        setSelectedId(nextState.atoms[0].atom.atom_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!state) {
        setBootError(message);
        return;
      }
      throw error;
    }
  }

  function dismissProductGuide() {
    setProductGuideDismissed(true);
    try {
      localStorage.setItem(PRODUCT_GUIDE_DISMISS_KEY, "1");
    } catch {
      // 忽略本地存储不可用
    }
  }

  function completeOnboarding() {
    setOnboardingCompleted(true);
    try {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, "1");
    } catch {
      // 忽略本地存储不可用
    }
  }

  function goToLibrary(focusAtomIds?: string[]) {
    const ids = focusAtomIds ?? recentlyApprovedIds;
    setLibraryFocusAtomIds(ids);
    setActive("library");
    setReviewSuccess(null);
  }

  function formatImportSuccess(result: ImportResult): string {
    if (!result.copied_file_count) {
      return "未选择文件。";
    }

    const names = result.copied_file_names?.join("、") ?? `${result.copied_file_count} 个文件`;
    const importPath = result.import_path ?? "raw/imports";
    const pending = result.pending_atom_count ?? 0;
    const normalized = result.normalized_record_count ?? 0;
    const generated = result.generated_atom_count ?? 0;
    const failed = result.failed_file_count ?? 0;
    const blocked = result.blocked_record_count ?? 0;

    let message = `已导入 ${names} 到 ${importPath}，并完成自动提炼。`;
    const batchCount = result.import_batch_atom_ids?.length ?? 0;
    if (pending > 0) {
      if (batchCount > 0) {
        message += ` 本次导入产生 ${batchCount} 条待确认，已在列表中高亮。`;
      } else {
        message += `${pending} 条知识在「待确认」等待审查。`;
      }
      return message;
    }

    message += "当前 0 条待确认。";
    if (normalized > 0 || generated > 0) {
      message += " 已批准的知识可在「知识库」搜索和使用。";
    }
    if (failed > 0) {
      message += ` ${failed} 个文件处理失败，请查看「日志」。`;
    }
    if (normalized > 0 && generated === 0) {
      if (result.used_personal_default) {
        message += ` 已标准化 ${normalized} 条记录，但未生成候选知识：内容可能被敏感规则阻断（阻断 ${blocked} 条），或格式不符合要求。`;
      } else {
        message += ` 已标准化 ${normalized} 条记录，但未生成候选知识：文件未标记 sensitivity: personal，或内容被敏感规则阻断。`;
      }
    } else if (normalized === 0 && failed === 0) {
      message += " 未能从文件中解析出有效内容，请确认文件格式。";
    }
    return message;
  }

  async function applyReviewNavigation(
    reviewedAtomId: string,
    pendingBefore: string[],
    nextAtoms: KnowledgeAtomDocument[],
    reviewStatus?: ReviewStatus
  ) {
    const freshPending = nextAtoms
      .filter((item) => item.atom.review_status === "pending")
      .map((item) => item.atom.atom_id);
    const reviewLabel = reviewStatusLabel(reviewStatus);
    const currentPendingIndex = pendingBefore.indexOf(reviewedAtomId);

    if (reviewStatus === "approved") {
      setRecentlyApprovedIds((previous) => [reviewedAtomId, ...previous.filter((id) => id !== reviewedAtomId)]);
      const nextPendingId = freshPending[currentPendingIndex] ?? freshPending[currentPendingIndex - 1] ?? freshPending[0] ?? "";
      setReviewSuccess({
        atomId: reviewedAtomId,
        remainingPending: freshPending.length,
        nextPendingId
      });
      setNotice("已入库，可在知识库搜索。");
      setActive("detail");
      setSelectedId(reviewedAtomId);
      return;
    }

    setReviewSuccess(null);

    if (freshPending.length > 0) {
      const nextPendingId = freshPending[currentPendingIndex] ?? freshPending[currentPendingIndex - 1] ?? freshPending[0]!;
      setSelectedId(nextPendingId);
      setActive("detail");
      setNotice(`${reviewLabel}，继续下一条待确认（剩余 ${freshPending.length} 条）。`);
      return;
    }

    setSelectedId("");
    setActive("pending");
    setNotice(`${reviewLabel}，全部待确认已处理完毕。`);
  }

  async function handleAtomReview(input: AtomUpdateInput, options?: { stayOnList?: boolean }) {
    setBusy(true);
    setNotice("");
    setNoticeKind("info");
    setReviewUndo(null);
    const reviewedAtomId = input.atom_id;
    const previousAtom = state?.atoms.find((item) => item.atom.atom_id === reviewedAtomId)?.atom ?? null;
    const pendingBefore = (state?.atoms ?? [])
      .filter((item) => item.atom.review_status === "pending")
      .map((item) => item.atom.atom_id);

    try {
      const updateResult = await getDesktopApi().updateAtom(input) as KnowledgeAtomDocument & {
        atoms?: KnowledgeAtomDocument[];
        knowledge?: KnowledgeLibraryView;
      };
      setImportBatchAtomIds((previous) => previous.filter((id) => id !== reviewedAtomId));

      const nextAtoms = updateResult.atoms ?? (await getDesktopApi().listAtoms());
      const nextKnowledge = updateResult.knowledge ?? (state?.knowledge ?? {
        items: [],
        facets: { source_apps: [], types: [], projects: [], tags: [], statuses: [] },
        duplicate_groups: [],
        calendar: []
      });
      setState((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          atoms: nextAtoms,
          knowledge: nextKnowledge
        };
      });

      if (options?.stayOnList) {
        const freshPending = nextAtoms.filter((item) => item.atom.review_status === "pending");
        const reviewLabel = reviewStatusLabel(input.review_status);
        if (previousAtom && input.review_status) {
          setReviewUndo(previousAtom);
        }
        if (input.review_status === "approved") {
          setRecentlyApprovedIds((previous) => [reviewedAtomId, ...previous.filter((id) => id !== reviewedAtomId)]);
        }
        if (freshPending.length > 0) {
          setNotice(`${reviewLabel}，剩余 ${freshPending.length} 条待确认。`);
        } else {
          setNotice(`${reviewLabel}，全部待确认已处理完毕。`);
        }
        setActive("pending");
        return;
      }

      if (previousAtom && input.review_status) {
        setReviewUndo(previousAtom);
      }
      await applyReviewNavigation(reviewedAtomId, pendingBefore, nextAtoms, input.review_status);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function undoLastReview() {
    if (!reviewUndo) {
      return;
    }
    const atom = reviewUndo;
    setReviewUndo(null);
    await withBusy(() => getDesktopApi().updateAtom({
      atom_id: atom.atom_id,
      title: atom.title,
      type: atom.type,
      content: atom.content,
      tags: atom.tags,
      review_status: atom.review_status,
      merged_into: atom.merged_into
    }), "已撤销上一次审查操作。");
    setSelectedId(atom.atom_id);
    setActive(atom.review_status === "pending" ? "pending" : "detail");
  }

  async function handleRunDaily(
    action: () => Promise<unknown>,
    options?: { clearNotice?: boolean; successMessage?: string }
  ) {
    const clearNotice = options?.clearNotice ?? true;
    setBusy(true);
    if (clearNotice) {
      setNotice("");
      setNoticeKind("info");
    }
    setLastRunResult(null);
    try {
      const result = await action() as DailyRunResult;
      setLastRunResult({
        normalized_record_count: result.normalized_record_count ?? 0,
        generated_atom_count: result.generated_atom_count ?? 0,
        pending_atom_count: result.pending_atom_count ?? 0
      });
      if (options?.successMessage) {
        setNotice(options.successMessage);
        setNoticeKind("info");
      }
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function withBusy(action: () => Promise<unknown>, successMessage: string, kind: "info" | "error" = "info"): Promise<unknown | null> {
    setBusy(true);
    setNotice("");
    setNoticeKind("info");
    try {
      const result = await action();
      setNotice(successMessage);
      setNoticeKind(kind);
      await refresh();
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleKnowledgeExport() {
    const result = await withBusy(() => getDesktopApi().exportKnowledgeMarkdown(), "Markdown 导出完成") as KnowledgeExportResult | null;
    if (!result) {
      return;
    }
    setOperationResult({
      title: "Markdown 导出完成",
      message: "已导出全部已批准知识。",
      paths: buildResultPaths([
        { label: "导出目录", path: result.export_dir },
        { label: "索引文件", path: result.index_path }
      ]),
      metric_label: "导出文件",
      metric_value: result.exported_file_count ?? 0
    });
  }

  async function handleObsidianIndex() {
    const result = await withBusy(() => getDesktopApi().ensureObsidianCompatibility(), "Obsidian 索引已更新") as KnowledgeExportResult | null;
    if (!result) {
      return;
    }
    setOperationResult({
      title: "Obsidian 索引已更新",
      message: "已生成 Obsidian 兼容索引，可在本地知识库中打开。",
      paths: buildResultPaths([
        { label: "知识库目录", path: result.export_dir },
        { label: "索引文件", path: result.index_path }
      ]),
      metric_label: "索引条目",
      metric_value: result.exported_file_count ?? 0
    });
  }

  async function handleKnowledgeBackup() {
    const result = await withBusy(() => getDesktopApi().backupKnowledge(), "知识库备份已创建") as KnowledgeBackupResult | null;
    if (!result) {
      return;
    }
    setOperationResult({
      title: "知识库备份已创建",
      message: "已在本地创建知识库、运行记录和日志备份。",
      paths: buildResultPaths([
        { label: "备份目录", path: result.backup_dir },
        { label: "备份清单", path: result.manifest_path }
      ]),
      metric_label: "备份目录数",
      metric_value: result.copied_dir_count ?? 0
    });
  }

  async function handleKnowledgeRestore() {
    const result = await withBusy(() => getDesktopApi().restoreLatestKnowledgeBackup(), "最近备份已恢复") as KnowledgeBackupResult | null;
    if (!result) {
      return;
    }
    setOperationResult({
      title: "最近备份已恢复",
      message: "当前知识库、运行记录和日志已从最近备份恢复。",
      paths: buildResultPaths([{ label: "来源备份", path: result.backup_dir }]),
      metric_label: "恢复目录数",
      metric_value: result.restored_dir_count ?? 0
    });
  }

  function confirmDestructive(message: string): boolean {
    return window.confirm(message);
  }

  function confirmDeleteAllUserData(): boolean {
    const value = window.prompt("彻底删除会移除知识库、原始记录、运行记录、日志、导出和备份。请输入“确认删除”继续。");
    return value === "确认删除";
  }

  function copyText(value: string) {
    void navigator.clipboard?.writeText(value);
    setNotice("路径已复制。");
    setNoticeKind("info");
  }

  async function handleImport(sourceApp?: string) {
    if (!isDesktopRuntime()) {
      setNotice("当前为浏览器预览模式，无法打开文件选择框。请使用 npm run desktop:dev 或安装版桌面应用。");
      setNoticeKind("error");
      return;
    }

    const targetSource = (sourceApp ?? state!.sourceApp).trim();
    if (!targetSource) {
      setNotice("没有可用的导入来源，请先在「来源」页启用至少一个连接器。");
      setNoticeKind("error");
      return;
    }
    setBusy(true);
    setNotice("正在打开文件选择框...");
    setNoticeKind("info");
    try {
      const result = await getDesktopApi().chooseImportFiles(targetSource) as ImportResult;
      if (!result.copied_file_count) {
        setNotice("未选择文件。");
        setNoticeKind("info");
        return;
      }
      setNotice(formatImportSuccess(result));
      setImportBatchAtomIds(result.import_batch_atom_ids ?? []);
      await refresh();
      const firstBatchAtomId = result.import_batch_atom_ids?.[0];
      if (firstBatchAtomId) {
        setSelectedId(firstBatchAtomId);
      }
      if ((result.pending_atom_count ?? 0) > 0) {
        setActive("pending");
      } else if ((result.generated_atom_count ?? 0) > 0 || (result.normalized_record_count ?? 0) > 0) {
        setNotice((current) => `${current} 可到「知识库」查看已批准内容。`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryImport() {
    setBusy(true);
    setNotice("");
    setNoticeKind("info");
    try {
      const result = await getDesktopApi().retryImport() as ImportResult;
      setNotice(formatImportSuccess(result));
      setImportBatchAtomIds(result.import_batch_atom_ids ?? []);
      await refresh();
      if ((result.pending_atom_count ?? 0) > 0) {
        setActive("pending");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggleMoreNav() {
    setMoreNavOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem("ai-kb-more-nav-open", next ? "1" : "0");
      } catch {
        // 忽略本地存储不可用
      }
      return next;
    });
  }

  function renderNavButton(item: { key: NavKey; label: string; icon: React.ComponentType<{ size?: number }> }) {
    const Icon = item.icon;
    const showBadge = item.key === "pending" && counts.pending > 0;
    return (
      <button
        key={item.key}
        className={active === item.key ? "nav active" : "nav"}
        onClick={() => setActive(item.key)}
        title={item.label}
      >
        <Icon size={18} />
        <span>{item.label}</span>
        {showBadge && <span className="navBadge">{counts.pending}</span>}
      </button>
    );
  }

  if (!state) {
    return (
      <div className="boot">
        <div className="bootBox">
          <strong>{bootError ? "本地知识库启动失败" : "正在加载本地知识库"}</strong>
          {bootError && (
            <>
              <p>{bootError}</p>
              <button className="primary" onClick={() => void refresh()}>重试</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">AI</div>
          <div>
            <strong>Chat Knowledge</strong>
            <span>Local Vault</span>
          </div>
        </div>
        <nav>
          {primaryNavItems.map(renderNavButton)}
          <button
            type="button"
            className={moreNavOpen ? "nav navMoreToggle open" : "nav navMoreToggle"}
            onClick={toggleMoreNav}
            title="展开或收起高级功能"
          >
            {moreNavOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>更多</span>
          </button>
          {moreNavOpen && <div className="navSecondary">{secondaryNavItems.map(renderNavButton)}</div>}
        </nav>
        <div className="vaultBox">
          <span>知识库</span>
          <strong>{compactPath(state.vaultRoot)}</strong>
          <button className="iconText" onClick={() => withBusy(() => getDesktopApi().chooseVault(), "知识库位置已更新")} disabled={busy} title="选择本地知识库存放目录">
            <FolderOpen size={16} />
            <span>选择</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{titleFor(active)}</h1>
            <p>{subtitleFor(active)}</p>
          </div>
          <div className="topbarActions">
            <PipelineStatusBar
              pipeline={pipeline}
              pendingCount={counts.pending}
              {...(pipeline.can_retry ? { onRetry: () => { void handleRetryImport(); } } : {})}
              busy={busy}
            />
            {counts.pending > 0 && active !== "pending" && (
              <button
                className="primary nextAction"
                onClick={() => setActive("pending")}
                disabled={busy}
                title="审查 AI 生成的候选知识，批准后才进入正式库"
              >
                <ListChecks size={16} />
                <span>去审查待确认知识</span>
                <span className="navBadge">{counts.pending}</span>
              </button>
            )}
            <button className="iconOnly" onClick={() => void refresh()} title="刷新" disabled={busy}>
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        {reviewSuccess && (
          <ReviewSuccessBanner
            remainingPending={reviewSuccess.remainingPending}
            onGoLibrary={() => goToLibrary([reviewSuccess.atomId])}
            onContinueReview={() => {
              if (reviewSuccess.nextPendingId) {
                setSelectedId(reviewSuccess.nextPendingId);
                setActive("detail");
              } else {
                setActive("pending");
              }
              setReviewSuccess(null);
            }}
            onDismiss={() => setReviewSuccess(null)}
          />
        )}

        {reviewUndo && (
          <ReviewUndoBanner
            status={reviewUndo.review_status}
            onUndo={() => void undoLastReview()}
            onDismiss={() => setReviewUndo(null)}
          />
        )}

        {isFixtureProvider(state.aiProvider) && (
          <FixtureModeBanner onGoSettings={() => setActive("settings")} />
        )}

        {notice && <div className={noticeKind === "error" ? "notice error" : "notice"}>{notice}</div>}

        {active === "guide" && <GuidePanel state={state} counts={counts} onGoImport={() => setActive("import")} onGoPending={() => setActive("pending")} />}
        {active === "sources" && <SourcesPanel connectors={state.connectors} sourceApp={state.sourceApp} busy={busy} onToggle={(sourceApp, enabled) => withBusy(() => getDesktopApi().setConnectorEnabled({ sourceApp, enabled }), "连接器状态已更新")} />}
        {active === "import" && (
          <ImportPanel
            busy={busy}
            isDesktopRuntime={isDesktopRuntime()}
            sourceApp={state.sourceApp}
            connectors={state.connectors}
            aiProvider={state.aiProvider}
            vaultRoot={state.vaultRoot}
            pipeline={pipeline}
            importPath={`raw/imports/${state.sourceApp}`}
            isEmptyVault={state.atoms.length === 0}
            onboardingCompleted={onboardingCompleted}
            productGuideDismissed={productGuideDismissed}
            onCompleteOnboarding={completeOnboarding}
            onDismissProductGuide={dismissProductGuide}
            onGoPending={() => setActive("pending")}
            onGoLibrary={() => goToLibrary()}
            onChooseVault={() => void withBusy(() => getDesktopApi().chooseVault(), "知识库位置已更新")}
            onImport={(source) => void handleImport(source)}
            onImportBlocked={(message) => {
              setNotice(message);
              setNoticeKind("error");
            }}
            onRetryImport={() => void handleRetryImport()}
            onGoSettings={() => setActive("settings")}
            onRunNormalize={() => withBusy(() => getDesktopApi().runImport(), "标准化完成，请到「待确认」查看结果。")}
          />
        )}
        {active === "run" && (
          <RunPanel
            busy={busy}
            events={state.events}
            automation={state.automation}
            lastRunResult={lastRunResult}
            onRun={() => handleRunDaily(() => getDesktopApi().runDaily())}
            onSaveAutomation={(input) => withBusy(() => getDesktopApi().saveAutomationSettings(input), "定时自动沉淀设置已保存")}
            onConfirmAutomation={() => handleRunDaily(() => getDesktopApi().confirmAutomationRun(), { clearNotice: false })}
            onSkipAutomation={() => withBusy(() => getDesktopApi().skipAutomationRun(), "已跳过本次自动运行")}
            onRerunDate={(runDate) => handleRunDaily(() => getDesktopApi().rerunAutomationDate({ run_date: runDate }))}
            onGoPending={() => setActive("pending")}
            onGoLibrary={() => goToLibrary()}
            onGoLogs={() => setActive("logs")}
          />
        )}
        {active === "library" && (
          <LibraryPanel
            atoms={state.atoms}
            knowledge={state.knowledge}
            busy={busy}
            focusAtomIds={libraryFocusAtomIds}
            recentlyApprovedIds={recentlyApprovedIds}
            operationResult={operationResult}
            onClearFocus={() => setLibraryFocusAtomIds([])}
            onClearOperationResult={() => setOperationResult(null)}
            onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }}
            onMerge={(atomId, targetId) => withBusy(() => getDesktopApi().updateAtom({ atom_id: atomId, review_status: "merged", merged_into: targetId }), "知识已合并")}
            onGoImport={() => setActive("import")}
            onExport={() => void handleKnowledgeExport()}
            onObsidian={() => void handleObsidianIndex()}
            onBackup={() => void handleKnowledgeBackup()}
            onRestore={() => {
              if (confirmDestructive("恢复最近备份会覆盖当前知识库、运行记录和日志。确认继续？")) {
                void handleKnowledgeRestore();
              }
            }}
            onOpenVaultPath={(vaultPath) => void withBusy(() => getDesktopApi().showVaultPath({ vault_path: vaultPath }), "已打开本地路径")}
          />
        )}
        {active === "ask" && (
          <AskPanel
            atoms={state.atoms}
            busy={busy}
            onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }}
            onGoImport={() => setActive("import")}
            onGoLibrary={() => goToLibrary()}
          />
        )}
        {active === "privacy" && (
          <PrivacyPanel
            privacy={state.privacy}
            connectors={state.connectors}
            busy={busy}
            onSaveSettings={(input) => withBusy(() => getDesktopApi().savePrivacySettings(input), "隐私和安全设置已保存")}
            onScan={(content) => getDesktopApi().scanSensitiveContent({ content })}
            onApplyRetention={() => {
              if (confirmDestructive("执行保留策略会按当前设置删除匹配的原始归档文件。确认继续？")) {
                void withBusy(() => getDesktopApi().applyRawRetention(), "原始记录保留策略已执行");
              }
            }}
            onDeleteSource={(sourceApp) => {
              if (confirmDestructive(`删除来源原始文件会移除 ${sourceApp} 的导入文件和归档原始记录，不会删除已生成的知识库条目、运行历史或导出文件。确认继续？`)) {
                void withBusy(() => getDesktopApi().deleteSourceData({ source_app: sourceApp }), "来源原始文件已删除");
              }
            }}
            onExportUserData={() => withBusy(() => getDesktopApi().exportUserData(), "用户数据导出完成")}
            onDeleteAllUserData={() => {
              if (confirmDeleteAllUserData()) {
                void withBusy(() => getDesktopApi().deleteAllUserData(), "本地用户数据已删除");
              }
            }}
            onWriteLegalDrafts={() => withBusy(() => getDesktopApi().writePrivacyLegalDrafts(), "隐私政策和用户协议草案已生成")}
          />
        )}
        {active === "commercial" && (
          <CommercialPanel
            commercial={state.commercial}
            busy={busy}
            onActivate={(activationCode) => withBusy(() => getDesktopApi().activateLicense({ activation_code: activationCode }), "授权状态已更新")}
            onSaveAccount={(accountEmail) => withBusy(() => getDesktopApi().saveCommercialAccount({ account_email: accountEmail }), "账号入口已保存")}
            onCreateFeedback={(input) => withBusy(() => getDesktopApi().createFeedbackDraft(input), "反馈草稿已创建")}
          />
        )}
        {active === "pending" && (
          <PendingPanel
            atoms={state.atoms}
            counts={counts}
            query={query}
            selectedId={selected?.atom.atom_id ?? ""}
            importBatchAtomIds={importBatchAtomIds}
            busy={busy}
            onQuery={setQuery}
            onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }}
            onInlineReview={(input) => void handleAtomReview(input, { stayOnList: true })}
            onClearImportBatch={() => setImportBatchAtomIds([])}
            onGoImport={() => setActive("import")}
            onGoLibrary={() => goToLibrary()}
          />
        )}
        {active === "detail" && selected && (
          <DetailPanel
            document={selected}
            atoms={state.atoms}
            busy={busy}
            onUpdate={(input) => withBusy(() => getDesktopApi().updateAtom(input), "知识已更新")}
            onReview={(input) => void handleAtomReview(input)}
            onOpenVaultPath={(vaultPath) => void withBusy(() => getDesktopApi().showVaultPath({ vault_path: vaultPath }), "已打开本地路径")}
            onCopyText={copyText}
          />
        )}
        {active === "settings" && <SettingsPanel state={state} busy={busy} onSave={(input) => withBusy(() => getDesktopApi().saveSessionConfig(input), "会话配置已保存")} onCheckUpdates={() => withBusy(() => getDesktopApi().checkForUpdates(), "更新检查完成")} />}
        {active === "logs" && <LogsPanel logs={[...state.events, ...state.logs]} />}
      </section>
    </main>
  );
}

function FixtureModeBanner({ onGoSettings }: { onGoSettings: () => void }) {
  return (
    <div className="fixtureModeBanner">
      <Shield size={18} />
      <div>
        <strong>当前为本地测试模式，不调用外部 AI API，不消耗 DeepSeek 额度</strong>
        <span>提炼结果由本地模板生成。如需真实 AI 提炼，请前往「设置」切换为「真实 AI API」并配置 DeepSeek。</span>
      </div>
      <button className="primarySoft" onClick={onGoSettings}><Settings size={16} />去设置</button>
    </div>
  );
}

function ReviewSuccessBanner({
  remainingPending,
  onGoLibrary,
  onContinueReview,
  onDismiss
}: {
  remainingPending: number;
  onGoLibrary: () => void;
  onContinueReview: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="reviewSuccessBanner">
      <PackageCheck size={20} />
      <div>
        <strong>已入库，可在知识库搜索</strong>
        <span>
          {remainingPending > 0
            ? `还有 ${remainingPending} 条待确认。你可以继续审查，或先去知识库查看刚批准的内容。`
            : "全部待确认已处理完毕，已批准的知识可在知识库长期使用。"}
        </span>
      </div>
      <div className="reviewSuccessActions">
        <button className="primary" onClick={onGoLibrary} title="查看刚批准的知识"><BookOpenCheck size={16} />去知识库查看</button>
        {remainingPending > 0 && (
          <button className="secondary" onClick={onContinueReview} title="继续审查下一条待确认"><ListChecks size={16} />继续审查下一条</button>
        )}
        <button className="iconOnly" onClick={onDismiss} title="关闭"><X size={16} /></button>
      </div>
    </div>
  );
}

function ReviewUndoBanner({
  status,
  onUndo,
  onDismiss
}: {
  status: ReviewStatus;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="reviewUndoBanner">
      <PackageCheck size={18} />
      <span>审查状态已变更。原状态为「{reviewStatusLabel(status)}」，可撤销本次操作。</span>
      <div className="reviewSuccessActions">
        <button className="secondary" onClick={onUndo} title="恢复到上一次审查状态">撤销</button>
        <button className="iconOnly" onClick={onDismiss} title="关闭"><X size={16} /></button>
      </div>
    </div>
  );
}

function ProductGuideCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="productGuideCard">
      <div className="productGuideHead">
        <strong>产品怎么用</strong>
        <button className="iconOnly" onClick={onDismiss} title="关闭"><X size={16} /></button>
      </div>
      <ul className="productGuideList">
        <li>导入 AI 聊天导出文件，系统自动提炼候选知识</li>
        <li>在「待确认」审查每条候选，批准后才进入正式库</li>
        <li>在「知识库」搜索、导出、同步 Obsidian，长期使用已批准知识</li>
      </ul>
    </div>
  );
}

function OnboardingCard({
  vaultRoot,
  sourceApp,
  aiProvider,
  onChooseVault,
  onGoSettings,
  onComplete
}: {
  vaultRoot: string;
  sourceApp: string;
  aiProvider: string;
  onChooseVault: () => void;
  onGoSettings: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="onboardingBanner">
      <div className="onboardingHead">
        <strong>首次使用：先确认本地知识库</strong>
        <button className="iconOnly firstTimeBannerClose" onClick={onComplete} title="使用当前默认配置"><X size={16} /></button>
      </div>
      <div className="onboardingSteps">
        <div className="onboardingStep active">
          <span className="stepNumber">1</span>
          <div><strong>知识库位置</strong><small>{compactPath(vaultRoot)}</small></div>
        </div>
        <div className="onboardingStep active">
          <span className="stepNumber">2</span>
          <div><strong>默认来源</strong><small>{sourceApp || "未启用"}</small></div>
        </div>
        <div className="onboardingStep active">
          <span className="stepNumber">3</span>
          <div><strong>AI 模式</strong><small>{aiProviderLabel(aiProvider)}</small></div>
        </div>
      </div>
      <div className="onboardingActions">
        <button className="secondary" onClick={onChooseVault}><FolderOpen size={16} />选择知识库位置</button>
        <button className="secondary" onClick={onGoSettings}><Settings size={16} />配置 AI</button>
        <button className="primary" onClick={onComplete}><Check size={16} />使用当前配置</button>
      </div>
      <p className="hintText">跳过后将使用当前本地 vault、默认来源和当前 AI 模式；之后仍可在左侧或设置页修改。</p>
    </div>
  );
}

function PipelineStatusBar({
  pipeline,
  pendingCount,
  onRetry,
  busy
}: {
  pipeline: PipelineState;
  pendingCount: number;
  onRetry?: () => void;
  busy?: boolean;
}) {
  const activeSubstepIndex = pipeline.substep
    ? pipelineSubsteps.findIndex((item) => item.key === pipeline.substep)
    : -1;
  const showSubsteps = pipeline.phase === "importing" || pipeline.phase === "processing" || Boolean(pipeline.substep);

  return (
    <div className={`pipelineStatusWrap phase-${pipeline.phase}`}>
      <div className={`pipelineStatus phase-${pipeline.phase}`}>
        <Clock size={15} />
        <span>{pipeline.label}</span>
        {pendingCount > 0 && pipeline.phase !== "failed" && <span className="pipelineMeta">待确认 {pendingCount}</span>}
        {pipeline.phase === "failed" && onRetry && (
          <button type="button" className="pipelineRetry" onClick={onRetry} disabled={busy} title="从标准化步骤重试处理">
            <RefreshCw size={14} />
            <span>重试</span>
          </button>
        )}
      </div>
      {showSubsteps && (
        <div className="pipelineSubsteps" aria-label="处理进度">
          {pipelineSubsteps.map((item, index) => {
            const isDone = activeSubstepIndex > index;
            const isActive = activeSubstepIndex === index;
            return (
              <span
                key={item.key}
                className={["pipelineSubstep", isDone ? "done" : "", isActive ? "active" : ""].filter(Boolean).join(" ")}
              >
                {item.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuidePanel({
  state,
  counts,
  onGoImport,
  onGoPending
}: {
  state: DesktopState;
  counts: Record<ReviewStatus, number>;
  onGoImport: () => void;
  onGoPending: () => void;
}) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>当前状态</h2>
        <div className="metricGrid">
          <Metric label="待确认" value={counts.pending} />
          <Metric label="已批准" value={counts.approved} />
          <Metric label="已拒绝" value={counts.rejected} />
          <Metric label="已合并" value={counts.merged} />
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={onGoImport}><FileInput size={16} />导入聊天文件</button>
          {counts.pending > 0 && <button className="secondary" onClick={onGoPending}><ListChecks size={16} />审查待确认 ({counts.pending})</button>}
        </div>
      </section>
      <section className="panel">
        <h2>启动检查</h2>
        <ul className="checkList">
          <li><Check size={16} />知识库位置：{compactPath(state.vaultRoot)}</li>
          <li><Check size={16} />来源：{state.sourceApp}</li>
          <li className={isFixtureProvider(state.aiProvider) ? "checkWarn" : ""}>
            <Shield size={16} />AI 服务：{aiProviderLabel(state.aiProvider)}
          </li>
          <li><Shield size={16} />API Key：{state.apiKeyConfigured ? "已配置" : "未配置"}</li>
        </ul>
        {isFixtureProvider(state.aiProvider) && (
          <p className="muted hint">测试模式下 P1/P2 均不调用外部 API。P1 生成占位卡片，P2 用本地模板拼接内容。</p>
        )}
      </section>
    </div>
  );
}

function SourcesPanel({ connectors, sourceApp, busy, onToggle }: { connectors: SourceConnectorView[]; sourceApp: string; busy: boolean; onToggle: (sourceApp: string, enabled: boolean) => void }) {
  return (
    <section className="panel">
      <FirstTimeBanner section="sources">
        <strong>来源管理</strong>
        控制各 AI 聊天平台的导入入口是否启用；停用后不会读取对应目录。
      </FirstTimeBanner>
      <SectionHeading
        title="来源管理"
        hint="启用后可在「导入」页选择对应平台的导出文件；预留来源尚未开放。"
        help="每个来源对应 raw/imports 下的子目录，只读取你手动放入的文件。"
      />
      <div className="sourceTable">
        {connectors.map((connector) => (
          <div className="sourceRow" key={connector.source_app}>
            <div>
              <strong>{connector.display_name}</strong>
              <span>{connector.import_path}</span>
            </div>
            <label className="sourceToggle">
              <input
                type="checkbox"
                checked={connector.enabled}
                disabled={busy || connector.status !== "available"}
                onChange={(event) => onToggle(connector.source_app, event.target.checked)}
              />
              <span>{connector.status === "available" ? (connector.enabled ? "已启用" : "已停用") : "预留"}</span>
            </label>
            <div className="sourceMeta">
              <span>{connector.source_app === sourceApp ? "默认来源" : connector.supported_extensions.join(" ")}</span>
              <small>{connector.permission_scope}</small>
              <small>读取：{connector.reads.join("；")}</small>
              <small>不读取：{connector.does_not_read.join("；")}</small>
              <small>识别：{connector.local_record_recognition}</small>
              <small>失败提示：{connector.failure_help}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImportPanel({
  busy,
  isDesktopRuntime,
  sourceApp,
  connectors,
  aiProvider,
  vaultRoot,
  pipeline,
  importPath,
  isEmptyVault,
  onboardingCompleted,
  productGuideDismissed,
  onCompleteOnboarding,
  onDismissProductGuide,
  onGoPending,
  onGoLibrary,
  onChooseVault,
  onImport,
  onImportBlocked,
  onRetryImport,
  onGoSettings,
  onRunNormalize
}: {
  busy: boolean;
  isDesktopRuntime: boolean;
  sourceApp: string;
  connectors: SourceConnectorView[];
  aiProvider: string;
  vaultRoot: string;
  pipeline: PipelineState;
  importPath: string;
  isEmptyVault: boolean;
  onboardingCompleted: boolean;
  productGuideDismissed: boolean;
  onCompleteOnboarding: () => void;
  onDismissProductGuide: () => void;
  onGoPending: () => void;
  onGoLibrary: () => void;
  onChooseVault: () => void;
  onImport: (sourceApp: string) => void;
  onImportBlocked: (message: string) => void;
  onRetryImport: () => void;
  onGoSettings: () => void;
  onRunNormalize: () => void;
}) {
  const availableConnectors = connectors.filter((connector) => connector.status === "available" && connector.enabled);
  const [selectedSource, setSelectedSource] = useState(sourceApp);

  // 来源下拉必须与已启用连接器保持一致，避免向 IPC 传入停用来源导致选文件前即失败
  const resolvedImportSource = useMemo(() => {
    if (availableConnectors.some((connector) => connector.source_app === selectedSource)) {
      return selectedSource;
    }
    const preferred = availableConnectors.find((connector) => connector.source_app === sourceApp);
    return preferred?.source_app ?? availableConnectors[0]?.source_app ?? "";
  }, [availableConnectors, selectedSource, sourceApp]);

  useEffect(() => {
    if (resolvedImportSource && resolvedImportSource !== selectedSource) {
      setSelectedSource(resolvedImportSource);
    }
  }, [resolvedImportSource, selectedSource]);

  const canImport = isDesktopRuntime && Boolean(resolvedImportSource) && !busy;
  const selectedImportPath = resolvedImportSource ? `raw/imports/${resolvedImportSource}` : "—";

  function handleImportClick() {
    if (!isDesktopRuntime) {
      onImportBlocked("当前为浏览器预览模式，无法打开文件选择框。请使用 npm run desktop:dev 或安装版桌面应用。");
      return;
    }
    if (!resolvedImportSource) {
      onImportBlocked("没有可用的导入来源，请先在「来源」页启用至少一个可用平台。");
      return;
    }
    onImport(resolvedImportSource);
  }

  return (
    <div className="importLayout">
      <section className="panel">
        <FirstTimeBanner section="import">
          <strong>第一步：导入你的对话或随笔文件</strong>
          选择 AI 聊天导出文件后，系统会自动标准化、提炼候选知识，并进入「待确认」等你审查。
        </FirstTimeBanner>
        {isEmptyVault && !onboardingCompleted ? (
          <OnboardingCard
            vaultRoot={vaultRoot}
            sourceApp={resolvedImportSource || sourceApp}
            aiProvider={aiProvider}
            onChooseVault={onChooseVault}
            onGoSettings={onGoSettings}
            onComplete={onCompleteOnboarding}
          />
        ) : (
          isEmptyVault && !productGuideDismissed && <ProductGuideCard onDismiss={onDismissProductGuide} />
        )}
        <SectionHeading
          title="导入聊天文件"
          hint="选择导出文件后自动完成标准化与 AI 提炼，无需再去「运行」页手动触发。"
          help="支持 Markdown、TXT、JSON 格式的 AI 聊天导出文件。"
        />
        <p className="panelPurpose">导入后 AI 会生成候选，你确认后进入知识库永久保存。</p>
        {!isDesktopRuntime && (
          <div className="importAiNotice warning">
            <strong>当前不是桌面应用环境</strong>
            <span>浏览器预览无法打开系统文件选择框。请运行 npm run desktop:dev 或使用已安装的桌面应用进行导入。</span>
          </div>
        )}
        {isFixtureProvider(aiProvider) ? (
          <div className="importAiNotice warning">
            <strong>当前为测试模式</strong>
            <span>不会调用 DeepSeek 等外部 API。待确认内容来自本地占位/模板，非真实 AI 提炼。</span>
            <button className="secondary" onClick={onGoSettings} disabled={busy} title="前往设置切换为真实 AI API"><Settings size={16} />配置真实 AI</button>
          </div>
        ) : (
          <div className="importAiNotice ok">
            <strong>已启用真实 AI API</strong>
            <span>P2 提炼会调用已配置的 OpenAI 兼容接口（如 DeepSeek），仅发送脱敏、截断后的 personal 记录摘录；private/confidential 记录默认不发送。</span>
          </div>
        )}
        <div className="formGrid importSourceGrid">
          <label>
            <FieldLabel help="选择导出文件来自哪个 AI 平台" helpDetail="决定文件复制到 raw/imports 下的哪个子目录。">
              来源平台
            </FieldLabel>
            <select value={resolvedImportSource} onChange={(event) => setSelectedSource(event.target.value)} disabled={busy || !resolvedImportSource}>
              {availableConnectors.map((connector) => (
                <option key={connector.source_app} value={connector.source_app}>{connector.display_name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="importMeta">
          <span>当前来源：{resolvedImportSource || "未启用"}</span>
          <span>保存位置：{selectedImportPath}</span>
        </div>
        {!resolvedImportSource && (
          <p className="muted">请先在「来源」页启用至少一个可用平台，再选择文件导入。</p>
        )}
        {(busy || pipeline.phase === "failed") && (
          <div className={`importPipelineProgress phase-${pipeline.phase}`}>
            <strong>{pipeline.label}</strong>
            {pipeline.phase === "failed" && pipeline.error && <p className="muted">{pipeline.error}</p>}
            {pipeline.phase === "failed" && pipeline.can_retry && (
              <button type="button" className="secondary" onClick={onRetryImport} disabled={busy}>
                <RefreshCw size={16} />
                <span>一键重试</span>
              </button>
            )}
          </div>
        )}
        <div className="buttonHintWrap">
          <div className="importCtaRow">
            <button
              type="button"
              className="primary importCta"
              onClick={handleImportClick}
              disabled={!canImport && isDesktopRuntime}
              title="选择文件后自动复制到导入目录、标准化记录、AI 提炼候选，并跳转到待确认"
            >
              <FolderOpen size={16} />
              <span>{busy ? "正在处理..." : "选择文件并自动处理"}</span>
            </button>
            <HelpTip title="一键完成导入全流程" detail="复制文件、标准化、AI 提炼候选。完成后请到「待确认」逐条审查。" />
          </div>
          <HintText>自动执行：复制到导入目录 → 标准化 → AI 提炼 → 进入「待确认」</HintText>
        </div>
        <div className="importFlowLinks">
          <button type="button" className="secondary" onClick={onGoPending} disabled={busy} title="查看 AI 生成的候选知识并审查"><ListChecks size={16} />去待确认</button>
          <button type="button" className="secondary" onClick={onGoLibrary} disabled={busy} title="搜索、导出已批准的知识"><BookOpenCheck size={16} />去知识库</button>
        </div>
      </section>
      <section className="panel">
        <details className="runAdvanced">
          <summary>高级：仅重新标准化</summary>
          <SectionHeading
            title="仅重新标准化"
            hint="文件已在导入目录但未处理时使用，不会重新选文件，也不会生成待确认知识。"
            help="只运行 P1 标准化，不触发 AI 提炼。一般导入按钮已包含此步骤。"
          />
          <button className="secondary" onClick={onRunNormalize} disabled={busy} title="对导入目录中已有文件重新运行标准化"><Play size={16} /><span>仅运行标准化</span></button>
        </details>
      </section>
    </div>
  );
}

function RunResultCard({
  result,
  onGoPending,
  onGoLibrary,
  onGoLogs
}: {
  result: DailyRunResult;
  onGoPending: () => void;
  onGoLibrary: () => void;
  onGoLogs: () => void;
}) {
  const normalized = result.normalized_record_count ?? 0;
  const pending = result.pending_atom_count ?? 0;
  const generated = result.generated_atom_count ?? 0;

  return (
    <div className="runResultCard">
      <strong>本次运行完成</strong>
      <div className="runResultMetrics">
        <Metric label="标准化" value={normalized} />
        <Metric label="待确认" value={pending} />
      </div>
      {pending > 0 ? (
        <>
          <p className="muted">已生成 {generated} 条候选知识，请去「待确认」逐条审查。</p>
          <button className="primary" onClick={onGoPending}><ListChecks size={16} />去待确认审查</button>
        </>
      ) : normalized === 0 && generated === 0 ? (
        <>
          <p className="muted">导入目录里没有需要处理的新文件。若你刚导入过，流程已在导入时自动跑完。</p>
          <div className="runResultLinks">
            <button type="button" className="secondary" onClick={onGoLibrary}><BookOpenCheck size={16} />去知识库</button>
            <button type="button" className="secondary" onClick={onGoLogs}><Archive size={16} />查看日志</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">没有新的待确认条目。可能内容已入库，或本次仅完成标准化未产生候选。</p>
          <div className="runResultLinks">
            <button type="button" className="secondary" onClick={onGoLibrary}><BookOpenCheck size={16} />去知识库</button>
            <button type="button" className="secondary" onClick={onGoLogs}><Archive size={16} />查看日志</button>
          </div>
        </>
      )}
    </div>
  );
}

function RunPanel({
  busy,
  events,
  automation,
  lastRunResult,
  onRun,
  onSaveAutomation,
  onConfirmAutomation,
  onSkipAutomation,
  onRerunDate,
  onGoPending,
  onGoLibrary,
  onGoLogs
}: {
  busy: boolean;
  events: LogEvent[];
  automation: DailyAutomationState;
  lastRunResult: DailyRunResult | null;
  onRun: () => void;
  onSaveAutomation: (input: Partial<DailyAutomationSettings>) => void;
  onConfirmAutomation: () => void;
  onSkipAutomation: () => void;
  onRerunDate: (runDate: string) => void;
  onGoPending: () => void;
  onGoLibrary: () => void;
  onGoLogs: () => void;
}) {
  const [settings, setSettings] = useState(automation.settings);
  const [rerunDate, setRerunDate] = useState(automation.decision.run_date);

  useEffect(() => {
    setSettings(automation.settings);
    setRerunDate(automation.decision.run_date);
  }, [automation.settings.updated_at, automation.decision.run_date]);

  function updateSetting<K extends keyof DailyAutomationSettings>(key: K, value: DailyAutomationSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid twoWide runLayout">
      <section className="panel runMainPanel">
        <FirstTimeBanner section="run">
          <strong>运行页：批量处理与定时任务</strong>
          若你已在「导入」页用按钮导入过，通常不需要来这里。此页适合：文件已放入目录但未走导入按钮、或需要定时自动沉淀。
        </FirstTimeBanner>
        <SectionHeading
          title="每日运行"
          hint="批量处理导入目录中的文件，或配合右侧定时任务自动沉淀。"
          help="与「导入」页的手动选文件互补：导入按钮会立即处理所选文件；此页处理目录中所有待处理文件。"
        />

        <h3 className="runSectionTitle">
          <FieldLabel help="使用场景" helpDetail="刚用导入按钮处理过则无需再来；适合丢文件进目录后统一处理或开启定时任务。">
            什么时候需要点这里？
          </FieldLabel>
        </h3>
        <ul className="runWhenList">
          <li>你已经把文件放进 raw/imports，但没有走「导入」页的按钮</li>
          <li>你想手动重跑全部待处理文件</li>
          <li>你开启了定时自动沉淀</li>
          <li className="runWhenSkip">不需要：刚用「选择文件并自动处理」导入过（已经跑过了）</li>
        </ul>

        <div className="buttonHintWrap">
          <button
            className="primary importCta"
            onClick={onRun}
            disabled={busy}
            title="立即处理导入目录中所有新文件，生成候选后去「待确认」审查"
          >
            <Play size={16} />
            <span>{busy ? "正在处理..." : "处理导入目录中的新文件"}</span>
          </button>
          <HintText>处理 raw/imports 里尚未处理的新文件；完成后去「待确认」逐条审查</HintText>
        </div>

        {lastRunResult && (
          <RunResultCard
            result={lastRunResult}
            onGoPending={onGoPending}
            onGoLibrary={onGoLibrary}
            onGoLogs={onGoLogs}
          />
        )}

        <details className="runAdvanced">
          <summary>高级：重跑指定日期</summary>
          <p className="muted">用于补跑某一天的历史记录，一般不需要。</p>
          <div className="actions">
            <label className="fullField compactField">重跑日期<input type="date" value={rerunDate} onChange={(event) => setRerunDate(event.target.value)} /></label>
            <button className="secondary" onClick={() => onRerunDate(rerunDate)} disabled={busy || !rerunDate}><CalendarClock size={16} />重跑日期</button>
          </div>
        </details>
      </section>

      <section className="panel">
        <SectionHeading
          title="定时自动沉淀（可选）"
          hint="每天固定时间在电脑空闲时自动处理导入目录；与手动导入互补。"
          help="开启后到达设定时间且电脑空闲时会自动运行；可要求运行前确认。"
        />
        {!settings.enabled ? (
          <p className="automationIdleNotice">当前未开启，不影响日常使用</p>
        ) : (
          <p className="automationEnabledNotice">已开启：每天 {settings.run_time_local} 起，在电脑空闲时自动处理导入目录</p>
        )}
        <p className="muted">
          与「导入」页的手动选文件是补充关系：你可以平时手动导入，也可以把文件丢进目录后靠定时任务统一处理。
        </p>
        {settings.enabled && settings.require_confirmation && (
          <p className="muted">到达设定时间且电脑空闲时，本页会出现「等待确认」提示，并可能发送系统通知；你确认后才会开始处理。</p>
        )}
        {automation.pending_run && (
          <div className="pendingAutomation">
            <strong>等待确认：{automation.pending_run.run_date}</strong>
            <span>{automation.pending_run.reason}</span>
            <div className="actions">
              <button className="primary" onClick={onConfirmAutomation} disabled={busy} title="确认后开始本次定时沉淀任务"><Check size={16} />确认运行</button>
              <button className="secondary" onClick={onSkipAutomation} disabled={busy} title="跳过本次定时任务，等待下一次"><X size={16} />跳过本次</button>
            </div>
          </div>
        )}
        {settings.enabled && !automation.pending_run && (
          <div className="automationStatus">
            <Clock size={16} />
            <span>{automation.decision.reason}</span>
          </div>
        )}
        <div className="formGrid">
          <label>启用定时任务<select value={settings.enabled ? "yes" : "no"} onChange={(event) => updateSetting("enabled", event.target.value === "yes")}><option value="no">关闭</option><option value="yes">开启</option></select></label>
          <label>运行时间<input type="time" value={settings.run_time_local} onChange={(event) => updateSetting("run_time_local", event.target.value)} /></label>
          <label>仅空闲时运行<select value={settings.only_when_idle ? "yes" : "no"} onChange={(event) => updateSetting("only_when_idle", event.target.value === "yes")}><option value="yes">开启</option><option value="no">关闭</option></select></label>
          <label>空闲秒数<input type="number" min="0" value={settings.idle_threshold_seconds} onChange={(event) => updateSetting("idle_threshold_seconds", Number(event.target.value))} /></label>
          <label>运行前确认<select value={settings.require_confirmation ? "yes" : "no"} onChange={(event) => updateSetting("require_confirmation", event.target.value === "yes")}><option value="yes">需要</option><option value="no">不需要</option></select></label>
          <label>完成通知<select value={settings.notify_on_complete ? "yes" : "no"} onChange={(event) => updateSetting("notify_on_complete", event.target.value === "yes")}><option value="yes">开启</option><option value="no">关闭</option></select></label>
          <label>重试次数<input type="number" min="0" value={settings.retry_count} onChange={(event) => updateSetting("retry_count", Number(event.target.value))} /></label>
          <label>重试间隔分钟<input type="number" min="0" value={settings.retry_delay_minutes} onChange={(event) => updateSetting("retry_delay_minutes", Number(event.target.value))} /></label>
        </div>
        <div className="actions runActions">
          <button className="primary" onClick={() => onSaveAutomation(settings)} disabled={busy} title="保存定时任务的所有配置项"><Bell size={16} /><span>保存定时设置</span></button>
        </div>
      </section>

      <section className="panel">
        <h2>运行进度</h2>
        <EventList events={events} />
      </section>

      <section className="panel">
        <h2>运行历史</h2>
        <div className="historyList">
          {automation.history.slice(0, 12).map((item) => (
            <div className="historyRow" key={item.run_id}>
              <strong>{item.run_date} · {item.status}</strong>
              <span>{item.source_apps.join(", ") || "unknown"} · 生成 {item.generated_atom_count}</span>
              <small>{item.error_summary || item.run_id}</small>
            </div>
          ))}
          {automation.history.length === 0 && <p className="muted">暂无运行历史</p>}
        </div>
      </section>
    </div>
  );
}

function LibraryPanel({
  atoms,
  knowledge,
  busy,
  focusAtomIds,
  recentlyApprovedIds,
  operationResult,
  onClearFocus,
  onClearOperationResult,
  onSelect,
  onMerge,
  onGoImport,
  onExport,
  onObsidian,
  onBackup,
  onRestore,
  onOpenVaultPath
}: {
  atoms: KnowledgeAtomDocument[];
  knowledge: KnowledgeLibraryView;
  busy: boolean;
  focusAtomIds: string[];
  recentlyApprovedIds: string[];
  operationResult: OperationResultCardState | null;
  onClearFocus: () => void;
  onClearOperationResult: () => void;
  onSelect: (atomId: string) => void;
  onMerge: (atomId: string, targetId: string) => void;
  onGoImport: () => void;
  onExport: () => void;
  onObsidian: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onOpenVaultPath: (vaultPath: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sourceApp, setSourceApp] = useState("");
  const [type, setType] = useState("");
  const [project, setProject] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("approved");
  const focusSet = useMemo(() => new Set(focusAtomIds), [focusAtomIds]);
  const recentSet = useMemo(() => new Set(recentlyApprovedIds), [recentlyApprovedIds]);
  const showRecentHighlight = focusAtomIds.length > 0 || recentlyApprovedIds.length > 0;

  useEffect(() => {
    if (focusAtomIds.length > 0) {
      setStatus("approved");
    }
  }, [focusAtomIds]);

  const filtered = useMemo(() => {
    const base = filterKnowledgeItems(atoms, { query, sourceApp, type, project, tag, status });
    if (focusAtomIds.length === 0) {
      return base;
    }
    const focused = base.filter((item) => focusSet.has(item.atom.atom_id));
    return focused.length > 0 ? focused : base;
  }, [atoms, focusAtomIds, focusSet, project, query, sourceApp, status, tag, type]);

  function clearFilters() {
    setQuery("");
    setSourceApp("");
    setType("");
    setProject("");
    setTag("");
    setStatus("approved");
    onClearFocus();
  }

  return (
    <div className="libraryLayout">
      <section className="panel">
        <FirstTimeBanner section="library">
          <strong>知识库：已批准知识的长期存放处</strong>
          在这里搜索、筛选、导出 Markdown、同步 Obsidian。新导入的内容需先在「待确认」批准才会出现。
        </FirstTimeBanner>
        <SectionHeading
          title="知识库"
          hint="仅包含你已批准的知识；候选内容在「待确认」页审查通过后才入库。"
          help="支持全文搜索、按来源/类型/标签筛选，以及导出和 Obsidian 索引。"
        />
        {showRecentHighlight && (
          <div className="libraryRecentBar">
            <span>正在高亮刚批准的知识</span>
            <button type="button" className="ghost" onClick={onClearFocus} title="取消高亮，显示全部知识">显示全部</button>
          </div>
        )}
        <div className="listHeader">
          <div className="statusPills">
            <span>全部 {atoms.length}</span>
            {knowledge.facets.statuses.map((item) => <span key={item.value}>{item.value} {item.count}</span>)}
          </div>
        </div>
        <div className="filterBar">
          <label className="filterField filterField--wide filterField--search">
            <span className="filterLabel">搜索</span>
            <span className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、证据、标签" /></span>
          </label>
          <label className="filterField">
            <span className="filterLabel"><Filter size={15} />来源</span>
            <select value={sourceApp} onChange={(event) => setSourceApp(event.target.value)}><option value="">全部</option>{knowledge.facets.source_apps.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select>
          </label>
          <label className="filterField">
            <span className="filterLabel"><Filter size={15} />类型</span>
            <select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部</option>{knowledge.facets.types.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select>
          </label>
          <label className="filterField">
            <span className="filterLabel"><Filter size={15} />项目</span>
            <select value={project} onChange={(event) => setProject(event.target.value)}><option value="">全部</option>{knowledge.facets.projects.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select>
          </label>
          <label className="filterField">
            <span className="filterLabel"><Filter size={15} />标签</span>
            <select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">全部</option>{knowledge.facets.tags.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select>
          </label>
          <label className="filterField">
            <span className="filterLabel"><Filter size={15} />状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{knowledge.facets.statuses.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select>
          </label>
        </div>
        <div className="libraryToolbar">
          <button className="secondary" onClick={onExport} disabled={busy} title="将全部已批准知识导出为 Markdown 文件"><Download size={16} />导出 Markdown</button>
          <button className="secondary" onClick={onObsidian} disabled={busy} title="生成 Obsidian 兼容的索引和文件结构"><BookOpenCheck size={16} />Obsidian 索引</button>
          <button className="secondary" onClick={onBackup} disabled={busy} title="创建知识库完整备份到本地"><HardDriveDownload size={16} />备份</button>
          <button className="secondary" onClick={onRestore} disabled={busy} title="从最近一次备份恢复知识库"><RefreshCw size={16} />恢复最近备份</button>
        </div>
        {operationResult && (
          <OperationResultCard
            result={operationResult}
            onOpenVaultPath={onOpenVaultPath}
            onDismiss={onClearOperationResult}
          />
        )}
      </section>

      <section className="panel libraryResults">
        <h2>知识列表</h2>
        <div className="atomList">
          {filtered.map((item) => (
            <button
              key={item.atom.atom_id}
              className={[
                "atomRow",
                recentSet.has(item.atom.atom_id) || focusSet.has(item.atom.atom_id) ? "recentApproved" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(item.atom.atom_id)}
            >
              <strong>{item.atom.title}</strong>
              <span>
                {(recentSet.has(item.atom.atom_id) || focusSet.has(item.atom.atom_id)) && <em className="recentApprovedTag">刚批准</em>}
                {item.atom.type} · {item.atom.review_status} · {item.atom.source_app} · {item.atom.project || "未分项目"}
              </span>
              <small>{item.atom.tags.join(", ") || item.atom.evidence}</small>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="emptyState">
              <p>{atoms.length === 0 ? "当前还没有知识。" : "当前筛选条件下没有匹配的知识。"}</p>
              <p className="muted">{atoms.length === 0 ? "先导入文件并批准候选知识，批准后会出现在这里。" : "可以清除筛选，或换一个关键词重新搜索。"}</p>
              <div className="actions">
                {atoms.length === 0 ? (
                  <button className="primary" onClick={onGoImport}><FileInput size={16} />去导入</button>
                ) : (
                  <button className="secondary" onClick={clearFilters}><RefreshCw size={16} />清除筛选</button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>重复合并</h2>
        <div className="duplicateList">
          {knowledge.duplicate_groups.map((group) => {
            const target = group.items[0];
            return (
              <div className="duplicateGroup" key={group.key}>
                <strong>{group.title}</strong>
                <span>{group.items.length} 条相似知识</span>
                {group.items.map((item) => (
                  <div className="duplicateRow" key={item.atom.atom_id}>
                    <button className="ghost" onClick={() => onSelect(item.atom.atom_id)}>{item.atom.title}</button>
                    {target && item.atom.atom_id !== target.atom.atom_id && (
                      <button className="secondary" onClick={() => onMerge(item.atom.atom_id, target.atom.atom_id)} disabled={busy} title="将相似知识合并到首条，避免重复"><Split size={16} />合并到首条</button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {knowledge.duplicate_groups.length === 0 && <p className="muted">暂无重复建议</p>}
        </div>
      </section>

      <section className="panel">
        <h2>沉淀日历</h2>
        <div className="calendarList">
          {knowledge.calendar.slice(0, 18).map((item) => (
            <div className="calendarRow" key={item.date}>
              <CalendarDays size={16} />
              <strong>{item.date}</strong>
              <span>运行 {item.run_count} · 生成 {item.generated_atom_count} · 批准 {item.approved_atom_count} · 待确认 {item.pending_atom_count} · 失败 {item.failed_run_count}</span>
            </div>
          ))}
          {knowledge.calendar.length === 0 && <p className="muted">暂无沉淀记录</p>}
        </div>
      </section>
    </div>
  );
}

function AskPanel({
  atoms,
  busy,
  onSelect,
  onGoImport,
  onGoLibrary
}: {
  atoms: KnowledgeAtomDocument[];
  busy: boolean;
  onSelect: (atomId: string) => void;
  onGoImport: () => void;
  onGoLibrary: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const approvedAtoms = useMemo(() => atoms.filter((item) => item.atom.review_status === "approved"), [atoms]);
  const answerItems = useMemo(() => {
    return buildLocalAnswerItems(approvedAtoms, submittedQuestion).slice(0, 4);
  }, [approvedAtoms, submittedQuestion]);
  const hasQuestion = submittedQuestion.trim().length > 0;

  function submitQuestion() {
    setSubmittedQuestion(question.trim());
  }

  return (
    <div className="askLayout">
      <section className="panel">
        <FirstTimeBanner section="ask">
          <strong>提问：只基于已批准知识回答</strong>
          当前先提供本地检索式回答，不调用外部 AI。回答必须带引用，避免没有来源的结论。
        </FirstTimeBanner>
        <SectionHeading
          title="向知识库提问"
          hint="输入问题后，只检索已批准知识，并展示引用来源。待确认、已拒绝和已合并内容不会进入默认回答。"
          help="二期首版先做可验证的本地回答；后续可接入真实 AI 生成，但仍必须保留引用。"
        />
        <label className="fullField askQuestionField">
          问题
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：我最近关于个人知识库产品的核心判断是什么？"
          />
        </label>
        <div className="actions runActions">
          <button className="primary" onClick={submitQuestion} disabled={busy || !question.trim()} title="基于已批准知识生成本地检索式回答">
            <Search size={16} />
            <span>基于知识库回答</span>
          </button>
          <button className="secondary" onClick={onGoLibrary} disabled={busy} title="前往知识库搜索和筛选">
            <BookOpenCheck size={16} />
            <span>去知识库</span>
          </button>
        </div>
      </section>

      <section className="panel askAnswerPanel">
        <h2>回答</h2>
        {approvedAtoms.length === 0 ? (
          <div className="emptyState">
            <p>当前没有已批准知识，暂时无法回答。</p>
            <p className="muted">先导入文件并在「待确认」批准知识后，再回来提问。</p>
            <div className="actions">
              <button className="primary" onClick={onGoImport}><FileInput size={16} />去导入</button>
            </div>
          </div>
        ) : !hasQuestion ? (
          <div className="emptyState">
            <p>输入问题后，这里会显示本地检索式回答和引用来源。</p>
            <p className="muted">当前已批准知识 {approvedAtoms.length} 条。</p>
          </div>
        ) : answerItems.length === 0 ? (
          <div className="emptyState">
            <p>没有从已批准知识中找到足够相关的内容。</p>
            <p className="muted">可以换一个关键词，或先去知识库确认是否已有相关知识。</p>
            <div className="actions">
              <button className="secondary" onClick={onGoLibrary}><BookOpenCheck size={16} />去知识库</button>
            </div>
          </div>
        ) : (
          <div className="askAnswerCard">
            <strong>基于已批准知识，找到 {answerItems.length} 条可引用内容</strong>
            <ul className="answerPointList">
              {answerItems.map((item, index) => (
                <li key={item.atom.atom_id}>
                  <span>[{index + 1}]</span>
                  <p>{truncateText(item.atom.content, 180)}</p>
                </li>
              ))}
            </ul>
            <small>这是本地检索式回答，不调用外部 AI；请以引用来源为准。</small>
          </div>
        )}
      </section>

      {answerItems.length > 0 && (
        <section className="panel askCitationPanel">
          <h2>引用来源</h2>
          <div className="citationList">
            {answerItems.map((item, index) => (
              <button className="citationCard" key={item.atom.atom_id} onClick={() => onSelect(item.atom.atom_id)}>
                <span>引用 {index + 1}</span>
                <strong>{item.atom.title}</strong>
                <p>{truncateText(item.atom.evidence || item.atom.content, 160)}</p>
                <small>{item.atom.source_app} · {item.atom.source_raw_paths.join(", ") || "无原始路径"}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OperationResultCard({
  result,
  onOpenVaultPath,
  onDismiss
}: {
  result: OperationResultCardState;
  onOpenVaultPath: (vaultPath: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="operationResultCard">
      <div className="operationResultHead">
        <div>
          <strong>{result.title}</strong>
          <span>{result.message}</span>
        </div>
        <button className="iconOnly" onClick={onDismiss} title="关闭结果"><X size={16} /></button>
      </div>
      {result.metric_label && (
        <div className="operationMetric"><span>{result.metric_label}</span><strong>{result.metric_value ?? 0}</strong></div>
      )}
      <div className="operationPathList">
        {result.paths.map((item) => (
          <div className="operationPathRow" key={`${item.label}-${item.path}`}>
            <span>{item.label}</span>
            <code>{item.path}</code>
            <button className="secondary" onClick={() => onOpenVaultPath(item.path)} title="在系统文件夹中打开">
              <FolderOpen size={16} />
              打开
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyPanel({
  privacy,
  connectors,
  busy,
  onSaveSettings,
  onScan,
  onApplyRetention,
  onDeleteSource,
  onExportUserData,
  onDeleteAllUserData,
  onWriteLegalDrafts
}: {
  privacy: PrivacySecurityState;
  connectors: SourceConnectorView[];
  busy: boolean;
  onSaveSettings: (input: Partial<PrivacySecuritySettings>) => void;
  onScan: (content: string) => Promise<SensitiveScanResult>;
  onApplyRetention: () => void;
  onDeleteSource: (sourceApp: string) => void;
  onExportUserData: () => void;
  onDeleteAllUserData: () => void;
  onWriteLegalDrafts: () => void;
}) {
  const [settings, setSettings] = useState(privacy.settings);
  const [scanText, setScanText] = useState("客户合同里出现 api_key: sk-example-secret");
  const [scanResult, setScanResult] = useState<SensitiveScanResult | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState(connectors[0]?.source_app ?? "codex");

  useEffect(() => {
    setSettings(privacy.settings);
  }, [privacy.settings.updated_at]);

  function updateSetting<K extends keyof PrivacySecuritySettings>(key: K, value: PrivacySecuritySettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="privacyLayout">
      <FirstTimeBanner section="privacy">
        <strong>隐私与安全</strong>
        控制来源授权、敏感内容识别、原始记录保留策略，以及数据导出与删除。
      </FirstTimeBanner>
      <section className="panel">
        <SectionHeading
          title="隐私和安全设置"
          hint="决定哪些内容可进入个人库、原始文件保留多久、是否允许云端 AI 处理。"
          help="敏感规则会在导入和提炼时自动扫描，命中高风险内容默认阻断。"
        />
        <div className="formGrid">
          <label>来源授权<select value={settings.require_source_authorization ? "yes" : "no"} onChange={(event) => updateSetting("require_source_authorization", event.target.value === "yes")}><option value="yes">需要</option><option value="no">不需要</option></select></label>
          <label>云端 AI 处理 private<select value="no" disabled title="MVP 暂未开放 private 内容上云；private 记录仍默认阻断。"><option value="no">暂未开放</option></select></label>
          <label>原始记录保留<select value={settings.raw_retention_mode} onChange={(event) => updateSetting("raw_retention_mode", event.target.value as RawRetentionMode)}><option value="keep_forever">长期保留</option><option value="delete_after_days">按天数删除</option><option value="delete_after_successful_run">成功运行后删除</option></select></label>
          <label>保留天数<input type="number" min="0" value={settings.raw_retention_days} onChange={(event) => updateSetting("raw_retention_days", Number(event.target.value))} /></label>
        </div>
        <div className="privacyActions">
          <button className="primary" onClick={() => onSaveSettings(settings)} disabled={busy} title="保存隐私和安全相关配置"><Shield size={16} />保存设置</button>
          <button className="secondary" onClick={onApplyRetention} disabled={busy} title="按当前保留策略清理过期原始文件"><Trash2 size={16} />执行保留策略</button>
          <button className="secondary" onClick={onWriteLegalDrafts} disabled={busy} title="在本地生成隐私政策和用户协议草案"><FileText size={16} />生成协议草案</button>
        </div>
        <div className="secureState">
          <KeyRound size={16} />
          <span>
            API Key：{privacy.secure_credentials.openai_compatible_saved ? `已加密保存 ${privacy.secure_credentials.updated_at ?? ""}` : "未保存到本地"}。当前为本地文件加密，尚未接入 macOS Keychain 或 Windows Credential Manager。
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>本地和外部处理边界</h2>
        <div className="privacyBoundaryGrid">
          <div className="privacyBoundaryCard">
            <strong>始终本地处理</strong>
            <span>原始文件归档、SQLite 索引、运行日志、知识库 Markdown、敏感内容扫描和审查状态。</span>
          </div>
          <div className="privacyBoundaryCard">
            <strong>真实 AI 模式会外发</strong>
            <span>仅发送脱敏、截断后的 personal 记录摘录，用于候选知识提炼；private/confidential 记录默认阻断。</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>敏感内容扫描</h2>
        <label className="fullField">待扫描文本<textarea value={scanText} onChange={(event) => setScanText(event.target.value)} /></label>
        <div className="privacyActions">
          <button className="primary" onClick={() => void onScan(scanText).then(setScanResult)} disabled={busy}><Search size={16} />扫描</button>
        </div>
        {scanResult && <div className="scanResult"><strong>{scanResult.sensitivity} · {scanResult.can_enter_personal_kb ? "可进入个人库" : "默认阻断"}</strong>{scanResult.findings.map((finding, index) => <span key={`${finding.rule_id}-${index}`}>{finding.label} · {finding.severity} · {finding.match_preview}</span>)}{scanResult.findings.length === 0 && <span>未发现敏感规则命中</span>}</div>}
      </section>

      <section className="panel">
        <h2>来源授权说明</h2>
        <div className="sourceAuthList">{privacy.sources.map((source) => <div className="sourceAuthRow" key={source.source_app}><strong>{source.display_name} · {source.status === "reserved" ? "预留不可用" : (source.authorized ? "当前已启用" : "当前已停用")}</strong><span>{source.permission_scope}</span><small>读取：{source.reads.join("；")}</small><small>不读取：{source.does_not_read.join("；")}</small></div>)}</div>
      </section>

      <section className="panel">
        <h2>用户数据</h2>
        <p className="muted">删除来源原始文件只会移除该来源的导入文件和原始归档，不会删除已经批准进知识库的派生知识。</p>
        <div className="formGrid"><label>删除来源原始文件<select value={sourceToDelete} onChange={(event) => setSourceToDelete(event.target.value)}>{connectors.map((connector) => <option key={connector.source_app} value={connector.source_app}>{connector.display_name}</option>)}</select></label></div>
        <div className="privacyActions">
          <button className="danger" onClick={() => onDeleteSource(sourceToDelete)} disabled={busy}><Trash2 size={16} />删除来源原始文件</button>
          <button className="secondary" onClick={onExportUserData} disabled={busy}><Download size={16} />导出用户数据</button>
          <button className="danger" onClick={onDeleteAllUserData} disabled={busy}><Trash2 size={16} />彻底删除本地数据</button>
        </div>
      </section>

      <section className="panel">
        <h2>隐私分级规则</h2>
        <div className="ruleList">{privacy.rules.map((rule) => <div className="ruleRow" key={rule.rule_id}><strong>{rule.label}</strong><span>{rule.sensitivity} · {rule.severity}</span><small>{rule.description}</small></div>)}</div>
      </section>
    </div>
  );
}

function CommercialPanel({
  commercial,
  busy,
  onActivate,
  onSaveAccount,
  onCreateFeedback
}: {
  commercial: CommercialState;
  busy: boolean;
  onActivate: (activationCode: string) => void;
  onSaveAccount: (accountEmail: string) => void;
  onCreateFeedback: (input: { contact_email?: string; category: FeedbackCategory; message: string }) => void;
}) {
  const [activationCode, setActivationCode] = useState("");
  const [accountEmail, setAccountEmail] = useState(commercial.runtime.account_email);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("feature");
  const [feedbackEmail, setFeedbackEmail] = useState(commercial.runtime.account_email);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    setAccountEmail(commercial.runtime.account_email);
    setFeedbackEmail(commercial.runtime.account_email);
  }, [commercial.runtime.account_email]);

  return (
    <div className="commercialLayout">
      <FirstTimeBanner section="commercial">
        <strong>授权与版本</strong>
        查看试用状态、激活付费授权、对比版本差异，以及反馈入口。
      </FirstTimeBanner>
      <section className="panel commercialHero">
        <SectionHeading
          title="授权状态"
          hint="试用期内可使用付费功能；过期后部分功能将锁定。"
          help="已有数据的导出通常不受授权限制。"
        />
        <div className="commercialStatus">
          <BadgeCheck size={22} />
          <div>
            <strong>{commercial.runtime.license_status}</strong>
            <span>{commercial.access.effective_plan_id} · {commercial.access.can_use_paid_features ? "付费功能可用" : "付费功能锁定"}</span>
          </div>
        </div>
        <div className="statusPills">
          <span>试用剩余 {Math.max(commercial.access.days_until_trial_end, 0)} 天</span>
          <span>导出已有数据：{commercial.access.can_export_existing_data ? "允许" : "限制"}</span>
          <span>离线有效至：{commercial.runtime.offline_valid_until || "未激活"}</span>
        </div>
        {commercial.notices.map((notice) => (
          <div className={`commercialNotice ${notice.level}`} key={`${notice.title}-${notice.message}`}>
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>版本差异</h2>
        <div className="planGrid">
          {commercial.plans.map((plan) => (
            <div className="planCard" key={plan.plan_id}>
              <strong>{plan.label}</strong>
              <span>{plan.price_label}</span>
              <small>每日运行：{plan.limits.daily_runs}</small>
              <small>来源数量：{plan.limits.connectors}</small>
              <small>自动化：{plan.limits.automation ? "支持" : "不支持"}</small>
              <small>已有数据导出：{plan.limits.export_existing_data ? "支持" : "不支持"}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>激活和账号</h2>
        <label className="fullField">激活码<textarea value={activationCode} onChange={(event) => setActivationCode(event.target.value)} placeholder="AIKB1..." /></label>
        <div className="commercialActions">
          <button className="primary" onClick={() => onActivate(activationCode)} disabled={busy || !activationCode.trim()} title="输入购买后获得的激活码以解锁付费功能"><BadgeCheck size={16} />激活授权</button>
        </div>
        <label>账号邮箱<input value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="you@example.com" /></label>
        <div className="commercialActions">
          <button className="secondary" onClick={() => onSaveAccount(accountEmail)} disabled={busy || !accountEmail.trim()}><KeyRound size={16} />保存账号入口</button>
        </div>
      </section>

      <section className="panel">
        <h2>购买和官网</h2>
        <div className="commercialLinkList">
          <a href={commercial.purchase.purchase_url} target="_blank" rel="noreferrer"><ShoppingCart size={16} />购买入口</a>
          <a href={commercial.purchase.manage_license_url} target="_blank" rel="noreferrer"><KeyRound size={16} />授权管理</a>
          <a href={commercial.website.website_url} target="_blank" rel="noreferrer"><Globe size={16} />官网</a>
          <a href={commercial.update_announcement.announcement_url} target="_blank" rel="noreferrer"><Megaphone size={16} />更新公告</a>
        </div>
        <div className="websiteList">
          {commercial.website.required_pages.map((page) => (
            <div className="websiteRow" key={page.page_id}>
              <strong>{page.title}</strong>
              <span>{page.path}</span>
              <small>{page.purpose}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>反馈入口</h2>
        <div className="formGrid">
          <label>类型<select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value as FeedbackCategory)}><option value="feature">功能建议</option><option value="bug">问题反馈</option><option value="billing">账单授权</option><option value="other">其他</option></select></label>
          <label>邮箱<input value={feedbackEmail} onChange={(event) => setFeedbackEmail(event.target.value)} placeholder="you@example.com" /></label>
        </div>
        <label className="fullField">内容<textarea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} placeholder="写下问题、建议或购买相关反馈" /></label>
        <div className="commercialActions">
          <button className="primary feedbackSubmit" onClick={() => onCreateFeedback({ category: feedbackCategory, contact_email: feedbackEmail, message: feedbackMessage })} disabled={busy || !feedbackMessage.trim()} title="在本地创建反馈草稿，可通过支持渠道发送"><FileText size={16} />创建反馈草稿</button>
          <a href={commercial.feedback.feedback_url} target="_blank" rel="noreferrer"><Globe size={16} />在线支持</a>
        </div>
      </section>
    </div>
  );
}

function PendingPanel({
  atoms,
  counts,
  query,
  selectedId,
  importBatchAtomIds,
  busy,
  onQuery,
  onSelect,
  onInlineReview,
  onClearImportBatch,
  onGoImport,
  onGoLibrary
}: {
  atoms: KnowledgeAtomDocument[];
  counts: Record<ReviewStatus, number>;
  query: string;
  selectedId: string;
  importBatchAtomIds: string[];
  busy: boolean;
  onQuery: (value: string) => void;
  onSelect: (atomId: string) => void;
  onInlineReview: (input: AtomUpdateInput) => void;
  onClearImportBatch: () => void;
  onGoImport: () => void;
  onGoLibrary: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ReviewStatus>("pending");
  const [onlyCurrentImport, setOnlyCurrentImport] = useState(importBatchAtomIds.length > 0);

  const statusTabHints: Record<ReviewStatus, string> = {
    pending: "AI 生成的候选知识，等待你批准或拒绝",
    approved: "你已批准、可进入知识库长期使用的知识",
    rejected: "你已拒绝、不会进入正式库的内容",
    merged: "已合并到其他知识条目中"
  };

  const statusTabs: Array<{ key: ReviewStatus; label: string; count: number }> = [
    { key: "pending", label: "待确认", count: counts.pending },
    { key: "approved", label: "已批准", count: counts.approved },
    { key: "rejected", label: "已拒绝", count: counts.rejected },
    { key: "merged", label: "已合并", count: counts.merged }
  ];

  const importBatchSet = useMemo(() => new Set(importBatchAtomIds), [importBatchAtomIds]);

  const filteredAtoms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = atoms.filter((item) => {
      if (item.atom.review_status !== statusFilter) {
        return false;
      }
      if (onlyCurrentImport && importBatchSet.size > 0 && !importBatchSet.has(item.atom.atom_id)) {
        return false;
      }
      if (!needle) {
        return true;
      }

      return [item.atom.title, item.atom.content, item.atom.evidence, item.atom.project, item.atom.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    if (importBatchSet.size === 0) {
      return items;
    }

    return [...items].sort((left, right) => {
      const leftInBatch = importBatchSet.has(left.atom.atom_id) ? 0 : 1;
      const rightInBatch = importBatchSet.has(right.atom.atom_id) ? 0 : 1;
      return leftInBatch - rightInBatch;
    });
  }, [atoms, importBatchSet, onlyCurrentImport, query, statusFilter]);

  return (
    <section className="panel fill">
      <FirstTimeBanner section="pending">
        <strong>待确认：人工把关质量</strong>
        AI 只生成候选草稿，你必须逐条批准后才进入正式知识库，避免错误内容自动入库。
      </FirstTimeBanner>
      <div className="pendingPurpose">
        <SectionHeading
          title="待确认"
          hint="审查 AI 候选的质量与隐私，批准后才可搜索和使用。"
          help="这是质量关卡：批准进入知识库，拒绝则丢弃，合并则归入已有知识。"
        />
        {counts.pending > 0 ? (
          <p className="muted pendingMeta">
            当前 {counts.pending} 条待审查。确认后可在
            <button type="button" className="inlineLink" onClick={onGoLibrary} title="查看已批准的知识">知识库</button>
            搜索和使用。
          </p>
        ) : (
          <p className="muted pendingMeta">暂无待审查内容。已批准的知识可在知识库搜索和使用。</p>
        )}
      </div>
      <div className="listHeader">
        <div className="statusPills">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={statusFilter === tab.key ? `statusPill active status ${tab.key}` : `statusPill status ${tab.key}`}
              onClick={() => setStatusFilter(tab.key)}
              title={statusTabHints[tab.key]}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
        {importBatchAtomIds.length > 0 && (
          <div className="importBatchBar">
            <button
              type="button"
              className={onlyCurrentImport ? "statusPill active" : "statusPill"}
              onClick={() => setOnlyCurrentImport(true)}
            >
              本次导入 {importBatchAtomIds.length}
            </button>
            <button type="button" className={!onlyCurrentImport ? "statusPill active" : "statusPill"} onClick={() => setOnlyCurrentImport(false)}>
              全部待确认
            </button>
            <button type="button" className="statusPill" onClick={onClearImportBatch}>
              清除筛选
            </button>
          </div>
        )}
      </div>
      <div className="filterBar">
        <label className="filterField filterField--wide">
          <span className="filterLabel">搜索</span>
          <span className="search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索标题、正文、证据" /></span>
        </label>
      </div>
      <div className="atomList">
        {filteredAtoms.map((item) => (
          statusFilter === "pending" ? (
            <article
              key={item.atom.atom_id}
              className={[
                "atomRow",
                "atomRowInline",
                selectedId === item.atom.atom_id ? "active" : "",
                importBatchSet.has(item.atom.atom_id) ? "importBatch" : ""
              ].filter(Boolean).join(" ")}
            >
              <div className="atomRowMain">
                <strong>{item.atom.title}</strong>
                <span>
                  {importBatchSet.has(item.atom.atom_id) && <em className="importBatchTag">本次导入</em>}
                  {item.atom.type} · {item.atom.source_app}
                </span>
                <p className="atomPreview">{item.atom.content}</p>
                <small>{item.atom.evidence}</small>
              </div>
              <div className="atomInlineActions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => onInlineReview({
                    atom_id: item.atom.atom_id,
                    title: item.atom.title,
                    type: item.atom.type,
                    content: item.atom.content,
                    tags: item.atom.tags,
                    review_status: "approved"
                  })}
                  title="批准后将进入正式知识库"
                >
                  <Check size={16} />
                  <span>批准</span>
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => onInlineReview({
                    atom_id: item.atom.atom_id,
                    title: item.atom.title,
                    type: item.atom.type,
                    content: item.atom.content,
                    tags: item.atom.tags,
                    review_status: "rejected"
                  })}
                  title="拒绝后不会进入知识库"
                >
                  <X size={16} />
                  <span>拒绝</span>
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => onSelect(item.atom.atom_id)} title="打开详情页编辑后审查">
                  <SquarePen size={16} />
                  <span>详情</span>
                </button>
              </div>
            </article>
          ) : (
            <button
              key={item.atom.atom_id}
              className={[
                selectedId === item.atom.atom_id ? "atomRow active" : "atomRow",
                importBatchSet.has(item.atom.atom_id) ? "importBatch" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => onSelect(item.atom.atom_id)}
            >
              <strong>{item.atom.title}</strong>
              <span>
                {importBatchSet.has(item.atom.atom_id) && <em className="importBatchTag">本次导入</em>}
                {item.atom.type} · {item.atom.review_status} · {item.atom.source_app}
              </span>
              <small>{item.atom.evidence}</small>
            </button>
          )
        ))}
        {filteredAtoms.length === 0 && (
          <div className="emptyState">
            <p>
              {statusFilter === "pending"
                ? (atoms.length === 0 ? "当前还没有导入内容。" : "当前没有待确认知识。")
                : `当前没有「${statusTabs.find((tab) => tab.key === statusFilter)?.label ?? statusFilter}」状态的知识。`}
            </p>
            {statusFilter === "pending" && (
              <p className="muted">{atoms.length === 0 ? "点击「导入」选择文件，系统会自动提炼候选。" : "全部候选已处理完毕，已批准内容可在知识库搜索和提问。"}</p>
            )}
            <div className="actions">
              {atoms.length === 0 ? (
                <button className="primary" onClick={onGoImport}><FileInput size={16} />去导入</button>
              ) : (
                <button className="secondary" onClick={onGoLibrary}><BookOpenCheck size={16} />去知识库</button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailPanel({
  document,
  atoms,
  busy,
  onUpdate,
  onReview,
  onOpenVaultPath,
  onCopyText
}: {
  document: KnowledgeAtomDocument;
  atoms: KnowledgeAtomDocument[];
  busy: boolean;
  onUpdate: (input: AtomUpdateInput) => void;
  onReview: (input: AtomUpdateInput) => void;
  onOpenVaultPath: (vaultPath: string) => void;
  onCopyText: (text: string) => void;
}) {
  const [title, setTitle] = useState(document.atom.title);
  const [type, setType] = useState<KnowledgeAtomType>(document.atom.type);
  const [content, setContent] = useState(document.atom.content);
  const [tags, setTags] = useState(document.atom.tags.join(", "));
  const [mergedInto, setMergedInto] = useState(document.atom.merged_into);

  useEffect(() => {
    setTitle(document.atom.title);
    setType(document.atom.type);
    setContent(document.atom.content);
    setTags(document.atom.tags.join(", "));
    setMergedInto(document.atom.merged_into);
  }, [document.atom.atom_id]);

  const baseInput = { atom_id: document.atom.atom_id, title, type, content, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) };

  return (
    <section className="panel detail">
      <div className="detailHead">
        <div>
          <h2>{document.atom.title}</h2>
          <p>{document.file_path}</p>
        </div>
        <span className={`status ${document.atom.review_status}`}>{document.atom.review_status}</span>
      </div>
      <div className="formGrid">
        <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>类型<select value={type} onChange={(event) => setType(event.target.value as KnowledgeAtomType)}>{typeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        <label>合并到<select value={mergedInto} onChange={(event) => setMergedInto(event.target.value)}><option value="">不合并</option>{atoms.filter((item) => item.atom.atom_id !== document.atom.atom_id).map((item) => <option key={item.atom.atom_id} value={item.atom.atom_id}>{item.atom.title}</option>)}</select></label>
      </div>
      <label className="fullField">内容<textarea value={content} onChange={(event) => setContent(event.target.value)} /></label>
      <div className="evidence sourceEvidence">
        <strong>引用来源</strong>
        <p>{document.atom.evidence || "暂无证据摘录。"}</p>
        <div className="sourceCitationList">
          {document.atom.source_raw_paths.length > 0 ? document.atom.source_raw_paths.map((rawPath, index) => (
            <div className="sourceCitationCard" key={`${rawPath}-${index}`}>
              <span>{document.atom.source_app} · 记录 {document.atom.source_record_ids[index] ?? document.atom.source_record_ids[0] ?? "unknown"}</span>
              <code>{rawPath}</code>
              <div className="sourceCitationActions">
                <button className="secondary" onClick={() => onOpenVaultPath(rawPath)} disabled={busy} title="在系统文件夹中打开原始文件">
                  <FolderOpen size={16} />
                  打开
                </button>
                <button className="secondary" onClick={() => onCopyText(rawPath)} disabled={busy} title="复制 vault 内相对路径">
                  <FileText size={16} />
                  复制路径
                </button>
              </div>
            </div>
          )) : (
            <div className="sourceCitationCard">
              <span>{document.atom.source_app} · 来源路径不可用</span>
              <small>原始文件可能已被清理，但证据摘录仍保留在知识卡片中。</small>
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="secondary" onClick={() => onUpdate(baseInput)} disabled={busy} title="保存标题、类型、标签和正文的修改"><SquarePen size={16} />保存</button>
        <button className="primary" onClick={() => onReview({ ...baseInput, review_status: "approved" })} disabled={busy} title="批准后将进入正式知识库，可在知识库搜索和使用"><Check size={16} />批准</button>
        <button className="danger" onClick={() => onReview({ ...baseInput, review_status: "rejected" })} disabled={busy} title="拒绝后不会进入知识库，可从列表中移除"><X size={16} />拒绝</button>
        <button className="secondary" onClick={() => onReview({ ...baseInput, review_status: "merged", merged_into: mergedInto })} disabled={busy || !mergedInto} title="将本条知识合并到已选目标，避免重复"><Split size={16} />合并</button>
      </div>
    </section>
  );
}

function SettingsPanel({
  state,
  busy,
  onSave,
  onCheckUpdates
}: {
  state: DesktopState;
  busy: boolean;
  onSave: (input: SessionConfigInput) => void;
  onCheckUpdates: () => void;
}) {
  const [sourceApp, setSourceApp] = useState(state.sourceApp);
  const [presetId, setPresetId] = useState<AiProviderPresetId>(() =>
    resolvePresetId(state.aiProvider, state.aiBaseUrl, state.aiProviderPreset)
  );
  const [aiProvider, setAiProvider] = useState(state.aiProvider);
  const [baseUrl, setBaseUrl] = useState(state.aiBaseUrl ?? "");
  const [model, setModel] = useState(state.aiModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const selectedPreset = findPresetById(presetId);
  const showCustomBaseUrl = presetId === "custom";
  const showRealAiFields = !isFixtureProvider(aiProvider);

  useEffect(() => {
    setSourceApp(state.sourceApp);
    setPresetId(resolvePresetId(state.aiProvider, state.aiBaseUrl, state.aiProviderPreset));
    setAiProvider(state.aiProvider);
    setBaseUrl(state.aiBaseUrl ?? "");
    setModel(state.aiModel ?? "");
  }, [state.sourceApp, state.aiProvider, state.aiProviderPreset, state.aiBaseUrl, state.aiModel]);

  function handlePresetChange(nextPresetId: AiProviderPresetId) {
    const preset = findPresetById(nextPresetId);
    if (!preset) {
      return;
    }
    setPresetId(nextPresetId);
    setAiProvider(preset.aiProvider);
    if (preset.aiProvider === "fixture") {
      return;
    }
    if (nextPresetId === "custom") {
      return;
    }
    if (preset.baseUrl) {
      setBaseUrl(preset.baseUrl);
    }
    if (preset.defaultModel) {
      setModel(preset.defaultModel);
    }
  }

  function handleSave() {
    if (showRealAiFields && state.aiProvider !== "openai-compatible") {
      const confirmed = window.confirm(
        "启用真实 AI 后，系统会把脱敏、截断后的 personal 记录摘录发送到你配置的外部 AI 服务。private/confidential 记录默认不会发送。确认继续？"
      );
      if (!confirmed) {
        return;
      }
    }
    onSave({
      sourceApp,
      aiProvider,
      aiProviderPreset: presetId,
      baseUrl: showRealAiFields ? baseUrl : "",
      model: showRealAiFields ? model : "",
      apiKey
    });
  }

  return (
    <div className="grid two">
      <section className="panel settingsPanel">
        <FirstTimeBanner section="settings">
          <strong>配置 AI 服务与默认来源</strong>
          测试模式不调用外部 API；选择常见服务商后会自动填入官方接口地址，仅需填写 API Key。
        </FirstTimeBanner>
        <SectionHeading
          title="设置"
          hint="默认来源决定导入文件保存位置；AI 服务商决定提炼是否调用真实接口。"
          help="API Key 加密保存在本地，不会上传到云端。"
        />
        {isFixtureProvider(aiProvider) && (
          <div className="importAiNotice warning">
            <strong>当前为本地测试模式（fixture）</strong>
            <span>不消耗 API 额度，提炼结果为本地模板。切换下方「AI 服务商」为 DeepSeek 等常见服务并填写 API Key 后可启用真实调用。</span>
          </div>
        )}
        {showRealAiFields && (
          <div className="externalAiBoundary">
            <strong>真实 AI 调用边界</strong>
            <span>会发送：topic、project、user_excerpt、ai_excerpt、context_summary 的脱敏截断内容。</span>
            <span>不会发送：API Key 原文、被规则阻断的 private/confidential 记录、大段完整原始文件。</span>
          </div>
        )}
        <div className="formGrid">
          <label>
            <FieldLabel help="导入文件的默认平台" helpDetail="决定 raw/imports 下的子目录和默认连接器。">
              默认来源
            </FieldLabel>
            <select value={sourceApp} onChange={(event) => setSourceApp(event.target.value)}>{state.connectors.filter((connector) => connector.status === "available" && connector.enabled).map((connector) => <option key={connector.source_app} value={connector.source_app}>{connector.display_name}</option>)}</select>
          </label>
          <label>
            <FieldLabel
              help="官方接口与中转的区别"
              helpDetail="常见服务商已预填官方 OpenAI 兼容地址，无需手输 URL。若使用第三方中转或自建网关，请选择「自定义（手动填写）」并填写 Base URL。"
            >
              AI 服务商
            </FieldLabel>
            <select value={presetId} onChange={(event) => handlePresetChange(event.target.value as AiProviderPresetId)}>
              {AI_PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          {showCustomBaseUrl && showRealAiFields && (
            <label>
              <FieldLabel help="自定义 API 地址" helpDetail="填写 OpenAI 兼容接口的完整 Base URL，例如第三方中转或自建网关地址。">
                Base URL
              </FieldLabel>
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-relay.example.com/v1" />
            </label>
          )}
          {showRealAiFields && (
            <label>
              <FieldLabel
                help="调用的模型名称"
                helpDetail={selectedPreset?.defaultModel ? `默认推荐：${selectedPreset.defaultModel}，可按账号权限修改为其他模型。` : "填写服务商支持的模型 ID。"}
              >
                模型
              </FieldLabel>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={selectedPreset?.defaultModel ?? "deepseek-chat"}
              />
            </label>
          )}
          {showRealAiFields && (
            <label>
              <FieldLabel help="访问密钥" helpDetail="本地加密保存；留空则保持已保存的密钥不变。">
                API Key
              </FieldLabel>
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder={state.apiKeyConfigured ? "已保存，留空则不修改" : "本地加密保存"} />
            </label>
          )}
        </div>
        <div className="actions runActions">
	        <button
	          className="primary"
	          onClick={handleSave}
	          disabled={busy}
	          title="保存来源、AI 服务和 API 配置"
	        >
          <Shield size={16} />
          <span>保存会话配置</span>
        </button>
        </div>
      </section>

      <section className="panel releasePanel">
        <h2>发布状态</h2>
        <div className="releaseGrid">
          <span>应用</span><strong>{state.release.app_name}</strong>
          <span>版本</span><strong>{state.release.version}</strong>
          <span>包名</span><strong>{state.release.app_id}</strong>
          <span>运行</span><strong>{state.release.is_packaged ? "安装包" : "开发预览"}</strong>
          <span>数据目录</span><strong>{compactPath(state.release.app_data_dir)}</strong>
          <span>默认 vault</span><strong>{compactPath(state.release.default_vault_root)}</strong>
          <span>更新通道</span><strong>{state.release.update_channel}</strong>
          <span>更新地址</span><strong>{state.release.update_url}</strong>
          <span>卸载策略</span><strong>{state.release.uninstall_policy === "retain_user_data" ? "保留用户数据" : state.release.uninstall_policy}</strong>
        </div>
        <div className="actions runActions">
        <button className="secondary" onClick={onCheckUpdates} disabled={busy || !state.release.update_enabled}><PackageCheck size={16} /><span>检查更新</span></button>
        </div>
      </section>
    </div>
  );
}

function LogsPanel({ logs }: { logs: LogEvent[] }) {
  return (
    <section className="panel fill">
      <h2>日志和错误</h2>
      <EventList events={logs} />
    </section>
  );
}

function EventList({ events }: { events: LogEvent[] }) {
  return (
    <div className="eventList">
      {events.map((event, index) => (
        <div className="eventRow" key={`${event.event_id}-${event.created_at}-${index}`}>
          <span>{new Date(event.created_at).toLocaleString()}</span>
          <strong>{event.event_type}</strong>
          <p>{event.message}</p>
        </div>
      ))}
      {events.length === 0 && <p className="muted">暂无记录</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function reviewStatusLabel(status?: ReviewStatus): string {
  switch (status) {
    case "pending":
      return "待确认";
    case "approved":
      return "已批准";
    case "rejected":
      return "已拒绝";
    case "merged":
      return "已合并";
    default:
      return "知识已更新";
  }
}

function titleFor(active: NavKey): string {
  return allNavItems.find((item) => item.key === active)?.label ?? (active === "detail" ? "详情" : "工作台");
}

function subtitleFor(active: NavKey): string {
  const subtitles: Record<NavKey, string> = {
    guide: "首次启动、知识库位置和运行状态",
    sources: "来源启用状态和后续连接器边界",
    import: "导入对话，AI 提炼候选后等你确认",
    run: "批量处理已放入导入目录的文件，或按日程自动沉淀",
    library: "已批准知识可搜索、导出、同步 Obsidian",
    ask: "只基于已批准知识回答，并展示引用来源",
    privacy: "来源授权、敏感识别、数据导出和删除",
    commercial: "试用、授权、购买、更新公告和反馈",
    pending: "审查 AI 候选，确认后才进入正式库",
    detail: "编辑、批准、拒绝或合并",
    settings: "AI 服务和本地配置",
    logs: "运行事件和错误摘要"
  };
  return subtitles[active];
}

function buildLocalAnswerItems(items: KnowledgeAtomDocument[], question: string): KnowledgeAtomDocument[] {
  const normalizedQuestion = question.trim().toLowerCase();
  if (!normalizedQuestion) {
    return [];
  }

  const terms = buildQuestionTerms(normalizedQuestion);

  return items
    .map((item) => ({ item, score: scoreKnowledgeAtomForQuestion(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.item.atom.updated_at.localeCompare(left.item.atom.updated_at))
    .map((entry) => entry.item);
}

function buildQuestionTerms(normalizedQuestion: string): string[] {
  const normalized = normalizedQuestion.replace(/[，。！？、,.!?;；:：]/g, " ").replace(/\s+/g, " ").trim();
  const terms = new Set<string>();
  if (normalized.length >= 2) {
    terms.add(normalized);
  }
  for (const item of normalized.split(" ")) {
    if (item.length >= 2) {
      terms.add(item);
    }
    if (/[\u4e00-\u9fff]/.test(item) && item.length >= 4) {
      for (let index = 0; index <= item.length - 2; index += 1) {
        terms.add(item.slice(index, index + 2));
      }
      for (let index = 0; index <= item.length - 3; index += 1) {
        terms.add(item.slice(index, index + 3));
      }
    }
  }
  return [...terms].slice(0, 48);
}

function scoreKnowledgeAtomForQuestion(item: KnowledgeAtomDocument, terms: string[]): number {
  const searchable = [
    item.atom.title,
    item.atom.content,
    item.atom.evidence,
    item.atom.project,
    item.atom.source_app,
    item.atom.type,
    item.atom.tags.join(" "),
    item.atom.source_raw_paths.join(" ")
  ].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (searchable.includes(term)) {
      score += term.length === 1 ? 1 : term.length;
    }
  }
  return score;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function buildResultPaths(items: Array<{ label: string; path: string | undefined }>): Array<{ label: string; path: string }> {
  return items
    .filter((item): item is { label: string; path: string } => Boolean(item.path && item.path.trim()))
    .map((item) => ({ label: item.label, path: item.path }));
}

function filterKnowledgeItems(
  items: KnowledgeAtomDocument[],
  filters: { query: string; sourceApp: string; type: string; project: string; tag: string; status: string }
): KnowledgeAtomDocument[] {
  const query = filters.query.trim().toLowerCase();
  const project = filters.project.trim().toLowerCase();
  const tag = filters.tag.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.sourceApp && item.atom.source_app !== filters.sourceApp) {
      return false;
    }
    if (filters.type && item.atom.type !== filters.type) {
      return false;
    }
    if (filters.status && item.atom.review_status !== filters.status) {
      return false;
    }
    if (project && item.atom.project.trim().toLowerCase() !== project) {
      return false;
    }
    if (tag && !item.atom.tags.some((itemTag) => itemTag.trim().toLowerCase() === tag)) {
      return false;
    }
    if (!query) {
      return true;
    }

    return [
      item.atom.title,
      item.atom.content,
      item.atom.evidence,
      item.atom.project,
      item.atom.source_app,
      item.atom.type,
      item.atom.tags.join(" "),
      item.atom.source_raw_paths.join(" ")
    ].join(" ").toLowerCase().includes(query);
  });
}

function compactPath(value: string): string {
  const parts = value.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : value;
}

const rootElement = document.getElementById("root") as HTMLElement;
const root = window.aiKnowledgeRoot ?? createRoot(rootElement);
window.aiKnowledgeRoot = root;
root.render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
    delete window.aiKnowledgeRoot;
  });
}
