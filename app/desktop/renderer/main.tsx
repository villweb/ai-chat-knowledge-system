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

type ReviewStatus = "pending" | "approved" | "rejected" | "merged";
type KnowledgeAtomType = "观点" | "方法" | "决策" | "经验" | "素材" | "问题" | "偏好";
type NavKey = "guide" | "sources" | "import" | "run" | "library" | "privacy" | "commercial" | "pending" | "detail" | "settings" | "logs";
type SourceConnectorStatus = "available" | "reserved";
type PipelinePhase = "idle" | "importing" | "processing" | "waiting_review" | "done";
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
  label: string;
  updated_at: string;
}

interface ImportResult {
  copied_file_count?: number;
  copied_file_names?: string[];
  source_app?: string;
  import_path?: string;
  auto_processed?: boolean;
  pending_atom_count?: number;
  total_atom_count?: number;
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
  chooseImportFiles(sourceApp: string): Promise<ImportResult>;
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

const desktopApi = getDesktopApi();

const ONBOARDING_DISMISS_KEY = "ai-kb-onboarding-dismissed";

const onboardingSteps = [
  { step: 1, label: "导入", hint: "选择 AI 聊天导出文件" },
  { step: 2, label: "自动提炼", hint: "系统自动标准化并生成候选知识" },
  { step: 3, label: "待确认审查", hint: "在「待确认」中批准或拒绝" }
];

const navItems: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "guide", label: "引导", icon: BookOpenCheck },
  { key: "sources", label: "来源", icon: Database },
  { key: "import", label: "导入", icon: FileInput },
  { key: "run", label: "运行", icon: Play },
  { key: "library", label: "知识库", icon: BookOpenCheck },
  { key: "privacy", label: "隐私", icon: Lock },
  { key: "commercial", label: "商业", icon: BadgeCheck },
  { key: "pending", label: "待确认", icon: ListChecks },
  { key: "detail", label: "详情", icon: SquarePen },
  { key: "settings", label: "设置", icon: Settings },
  { key: "logs", label: "日志", icon: Archive }
];

const typeOptions: KnowledgeAtomType[] = ["观点", "方法", "决策", "经验", "素材", "问题", "偏好"];

function getDesktopApi(): DesktopApi {
  if (window.desktopApi) {
    return window.desktopApi;
  }

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
    async chooseImportFiles() {
      return {
        copied_file_count: 1,
        copied_file_names: ["preview-chat.md"],
        source_app: "codex",
        import_path: "raw/imports/codex",
        auto_processed: true,
        pending_atom_count: 1,
        total_atom_count: previewState.atoms.length
      };
    },
    async runImport() {
      return { ok: true };
    },
    async runDaily() {
      return { ok: true };
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
      previewState.apiKeyConfigured = Boolean(input.apiKey);
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
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hasInitializedNav, setHasInitializedNav] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(() => {
    return state?.atoms.find((item) => item.atom.atom_id === selectedId) ?? state?.atoms[0] ?? null;
  }, [selectedId, state]);

  const pendingAtoms = useMemo(() => {
    return (state?.atoms ?? []).filter((item) => item.atom.review_status === "pending");
  }, [state]);

  const filteredPendingAtoms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pendingAtoms.filter((item) => {
      if (!needle) {
        return true;
      }

      return [item.atom.title, item.atom.content, item.atom.evidence, item.atom.project, item.atom.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [pendingAtoms, query]);

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
    if (busy) {
      return { phase: "processing" as PipelinePhase, label: "正在处理" };
    }
    if (counts.pending > 0) {
      return { phase: "waiting_review" as PipelinePhase, label: "等待审查" };
    }
    if (state?.pipeline && state.pipeline.phase !== "waiting_review") {
      return state.pipeline;
    }
    return { phase: "idle" as PipelinePhase, label: "空闲" };
  }, [busy, counts.pending, state?.pipeline]);

  async function refresh() {
    try {
      const nextState = await desktopApi.getState() as DesktopState;
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

  function dismissOnboarding() {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_DISMISS_KEY, "1");
    } catch {
      // 忽略本地存储不可用
    }
  }

  function formatImportSuccess(result: ImportResult): string {
    if (!result.copied_file_count) {
      return "未选择文件。";
    }

    const names = result.copied_file_names?.join("、") ?? `${result.copied_file_count} 个文件`;
    const importPath = result.import_path ?? "raw/imports";
    const pending = result.pending_atom_count ?? 0;
    return `已导入 ${names} 到 ${importPath}，并完成自动提炼。${pending} 条知识在「待确认」等待审查。`;
  }

  async function withBusy(action: () => Promise<unknown>, successMessage: string, kind: "info" | "error" = "info") {
    setBusy(true);
    setNotice("");
    setNoticeKind("info");
    try {
      await action();
      setNotice(successMessage);
      setNoticeKind(kind);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    setNotice("");
    setNoticeKind("info");
    try {
      const result = await desktopApi.chooseImportFiles(state!.sourceApp) as ImportResult;
      if (!result.copied_file_count) {
        setNotice("未选择文件。");
        return;
      }
      setNotice(formatImportSuccess(result));
      await refresh();
      if ((result.pending_atom_count ?? 0) > 0) {
        setActive("pending");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setNoticeKind("error");
    } finally {
      setBusy(false);
    }
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const showBadge = item.key === "pending" && counts.pending > 0;
            return (
              <button key={item.key} className={active === item.key ? "nav active" : "nav"} onClick={() => setActive(item.key)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
                {showBadge && <span className="navBadge">{counts.pending}</span>}
              </button>
            );
          })}
        </nav>
        <div className="vaultBox">
          <span>知识库</span>
          <strong>{compactPath(state.vaultRoot)}</strong>
          <button className="iconText" onClick={() => withBusy(() => desktopApi.chooseVault(), "知识库位置已更新")} disabled={busy}>
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
            <PipelineStatusBar pipeline={pipeline} pendingCount={counts.pending} />
            {counts.pending > 0 && active !== "pending" && (
              <button className="primary nextAction" onClick={() => setActive("pending")} disabled={busy}>
                <ListChecks size={16} />
                <span>去审查待确认知识</span>
                <span className="navBadge">{counts.pending}</span>
              </button>
            )}
            <button className="iconOnly" onClick={() => void refresh()} title="刷新" disabled={busy}>
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {!onboardingDismissed && (
          <OnboardingBanner
            steps={onboardingSteps}
            activeStep={counts.pending > 0 ? 3 : (state.atoms.length > 0 ? 2 : 1)}
            onDismiss={dismissOnboarding}
            onGoImport={() => setActive("import")}
            onGoPending={() => setActive("pending")}
          />
        )}

        {notice && <div className={noticeKind === "error" ? "notice error" : "notice"}>{notice}</div>}

        {active === "guide" && <GuidePanel state={state} counts={counts} onGoImport={() => setActive("import")} onGoPending={() => setActive("pending")} />}
        {active === "sources" && <SourcesPanel connectors={state.connectors} sourceApp={state.sourceApp} busy={busy} onToggle={(sourceApp, enabled) => withBusy(() => desktopApi.setConnectorEnabled({ sourceApp, enabled }), "连接器状态已更新")} />}
        {active === "import" && (
          <ImportPanel
            busy={busy}
            sourceApp={state.sourceApp}
            importPath={`raw/imports/${state.sourceApp}`}
            onImport={() => void handleImport()}
            onRunNormalize={() => withBusy(() => desktopApi.runImport(), "标准化完成，请到「待确认」查看结果。")}
          />
        )}
        {active === "run" && (
          <RunPanel
            busy={busy}
            events={state.events}
            automation={state.automation}
            onRun={() => withBusy(() => desktopApi.runDaily(), "每日沉淀完成")}
            onSaveAutomation={(input) => withBusy(() => desktopApi.saveAutomationSettings(input), "每日自动化设置已保存")}
            onConfirmAutomation={() => withBusy(() => desktopApi.confirmAutomationRun(), "自动运行已确认")}
            onSkipAutomation={() => withBusy(() => desktopApi.skipAutomationRun(), "已跳过本次自动运行")}
            onRerunDate={(runDate) => withBusy(() => desktopApi.rerunAutomationDate({ run_date: runDate }), "指定日期已重新运行")}
          />
        )}
        {active === "library" && (
          <LibraryPanel
            atoms={state.atoms}
            knowledge={state.knowledge}
            busy={busy}
            onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }}
            onMerge={(atomId, targetId) => withBusy(() => desktopApi.updateAtom({ atom_id: atomId, review_status: "merged", merged_into: targetId }), "知识已合并")}
            onExport={() => withBusy(() => desktopApi.exportKnowledgeMarkdown(), "Markdown 导出完成")}
            onObsidian={() => withBusy(() => desktopApi.ensureObsidianCompatibility(), "Obsidian 索引已更新")}
            onBackup={() => withBusy(() => desktopApi.backupKnowledge(), "知识库备份已创建")}
            onRestore={() => withBusy(() => desktopApi.restoreLatestKnowledgeBackup(), "最近备份已恢复")}
          />
        )}
        {active === "privacy" && (
          <PrivacyPanel
            privacy={state.privacy}
            connectors={state.connectors}
            busy={busy}
            onSaveSettings={(input) => withBusy(() => desktopApi.savePrivacySettings(input), "隐私和安全设置已保存")}
            onScan={(content) => desktopApi.scanSensitiveContent({ content })}
            onApplyRetention={() => withBusy(() => desktopApi.applyRawRetention(), "原始记录保留策略已执行")}
            onDeleteSource={(sourceApp) => withBusy(() => desktopApi.deleteSourceData({ source_app: sourceApp }), "来源数据已删除")}
            onExportUserData={() => withBusy(() => desktopApi.exportUserData(), "用户数据导出完成")}
            onDeleteAllUserData={() => withBusy(() => desktopApi.deleteAllUserData(), "本地用户数据已删除")}
            onWriteLegalDrafts={() => withBusy(() => desktopApi.writePrivacyLegalDrafts(), "隐私政策和用户协议草案已生成")}
          />
        )}
        {active === "commercial" && (
          <CommercialPanel
            commercial={state.commercial}
            busy={busy}
            onActivate={(activationCode) => withBusy(() => desktopApi.activateLicense({ activation_code: activationCode }), "授权状态已更新")}
            onSaveAccount={(accountEmail) => withBusy(() => desktopApi.saveCommercialAccount({ account_email: accountEmail }), "账号入口已保存")}
            onCreateFeedback={(input) => withBusy(() => desktopApi.createFeedbackDraft(input), "反馈草稿已创建")}
          />
        )}
        {active === "pending" && (
          <PendingPanel
            atoms={filteredPendingAtoms}
            counts={counts}
            query={query}
            selectedId={selected?.atom.atom_id ?? ""}
            onQuery={setQuery}
            onSelect={(atomId) => { setSelectedId(atomId); setActive("detail"); }}
          />
        )}
        {active === "detail" && selected && <DetailPanel document={selected} atoms={state.atoms} busy={busy} onUpdate={(input) => withBusy(() => desktopApi.updateAtom(input), "知识已更新")} />}
        {active === "settings" && <SettingsPanel state={state} busy={busy} onSave={(input) => withBusy(() => desktopApi.saveSessionConfig(input), "会话配置已保存")} onCheckUpdates={() => withBusy(() => desktopApi.checkForUpdates(), "更新检查完成")} />}
        {active === "logs" && <LogsPanel logs={[...state.events, ...state.logs]} />}
      </section>
    </main>
  );
}

function OnboardingBanner({
  steps,
  activeStep,
  onDismiss,
  onGoImport,
  onGoPending
}: {
  steps: Array<{ step: number; label: string; hint: string }>;
  activeStep: number;
  onDismiss: () => void;
  onGoImport: () => void;
  onGoPending: () => void;
}) {
  return (
    <div className="onboardingBanner">
      <div className="onboardingHead">
        <strong>三步完成首次沉淀</strong>
        <button className="iconOnly" onClick={onDismiss} title="关闭引导"><X size={16} /></button>
      </div>
      <div className="onboardingSteps">
        {steps.map((item) => (
          <div key={item.step} className={activeStep >= item.step ? "onboardingStep active" : "onboardingStep"}>
            <span className="stepNumber">{item.step}</span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="onboardingActions">
        <button className="primary" onClick={onGoImport}><FileInput size={16} />去导入</button>
        {activeStep >= 3 && <button onClick={onGoPending}><ListChecks size={16} />去待确认</button>}
      </div>
    </div>
  );
}

function PipelineStatusBar({ pipeline, pendingCount }: { pipeline: { phase: PipelinePhase; label: string }; pendingCount: number }) {
  return (
    <div className={`pipelineStatus phase-${pipeline.phase}`}>
      <Clock size={15} />
      <span>{pipeline.label}</span>
      {pendingCount > 0 && <span className="pipelineMeta">待确认 {pendingCount}</span>}
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
          {counts.pending > 0 && <button onClick={onGoPending}><ListChecks size={16} />审查待确认 ({counts.pending})</button>}
        </div>
      </section>
      <section className="panel">
        <h2>启动检查</h2>
        <ul className="checkList">
          <li><Check size={16} />知识库位置：{compactPath(state.vaultRoot)}</li>
          <li><Check size={16} />来源：{state.sourceApp}</li>
          <li><Shield size={16} />AI 服务：{state.aiProvider}</li>
          <li><Shield size={16} />API Key：{state.apiKeyConfigured ? "已配置" : "未配置"}</li>
        </ul>
      </section>
    </div>
  );
}

function SourcesPanel({ connectors, sourceApp, busy, onToggle }: { connectors: SourceConnectorView[]; sourceApp: string; busy: boolean; onToggle: (sourceApp: string, enabled: boolean) => void }) {
  return (
    <section className="panel">
      <h2>来源管理</h2>
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
  sourceApp,
  importPath,
  onImport,
  onRunNormalize
}: {
  busy: boolean;
  sourceApp: string;
  importPath: string;
  onImport: () => void;
  onRunNormalize: () => void;
}) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>导入聊天文件</h2>
        <p className="muted">选择 AI 聊天导出文件（Markdown、TXT、JSON）。导入后会自动标准化并提炼候选知识。</p>
        <div className="importMeta">
          <span>当前来源：{sourceApp}</span>
          <span>保存位置：{importPath}</span>
        </div>
        <button className="primary importCta" onClick={onImport} disabled={busy}>
          <FolderOpen size={17} />
          <span>{busy ? "正在处理..." : "选择文件并自动处理"}</span>
        </button>
        <p className="muted hint">导入完成后，知识会出现在「待确认」页面。</p>
      </section>
      <section className="panel">
        <h2>高级：仅重新标准化</h2>
        <p className="muted">如果文件已在导入目录但尚未处理，可单独运行标准化（不选文件时使用）。</p>
        <button onClick={onRunNormalize} disabled={busy}><Play size={17} /><span>仅运行标准化</span></button>
      </section>
    </div>
  );
}

function RunPanel({
  busy,
  events,
  automation,
  onRun,
  onSaveAutomation,
  onConfirmAutomation,
  onSkipAutomation,
  onRerunDate
}: {
  busy: boolean;
  events: LogEvent[];
  automation: DailyAutomationState;
  onRun: () => void;
  onSaveAutomation: (input: Partial<DailyAutomationSettings>) => void;
  onConfirmAutomation: () => void;
  onSkipAutomation: () => void;
  onRerunDate: (runDate: string) => void;
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
    <div className="grid twoWide">
      <section className="panel">
        <h2>每日运行</h2>
        <p className="muted">串联导入、标准化、P2 候选提炼和每日摘要。</p>
        <div className="actions runActions">
          <button className="primary" onClick={onRun} disabled={busy}><Play size={17} />立即运行</button>
          <button onClick={() => onRerunDate(rerunDate)} disabled={busy || !rerunDate}><CalendarClock size={16} />重跑日期</button>
        </div>
        <label className="fullField compactField">重跑日期<input type="date" value={rerunDate} onChange={(event) => setRerunDate(event.target.value)} /></label>
        {automation.pending_run && (
          <div className="pendingAutomation">
            <strong>等待确认：{automation.pending_run.run_date}</strong>
            <span>{automation.pending_run.reason}</span>
            <div className="actions">
              <button className="primary" onClick={onConfirmAutomation} disabled={busy}><Check size={16} />确认运行</button>
              <button onClick={onSkipAutomation} disabled={busy}><X size={16} />跳过本次</button>
            </div>
          </div>
        )}
        <div className="automationStatus">
          <Clock size={16} />
          <span>{automation.decision.reason}</span>
        </div>
      </section>

      <section className="panel">
        <h2>自动化设置</h2>
        <div className="formGrid">
          <label>启用自动运行<select value={settings.enabled ? "yes" : "no"} onChange={(event) => updateSetting("enabled", event.target.value === "yes")}><option value="no">关闭</option><option value="yes">开启</option></select></label>
          <label>运行时间<input type="time" value={settings.run_time_local} onChange={(event) => updateSetting("run_time_local", event.target.value)} /></label>
          <label>仅空闲时运行<select value={settings.only_when_idle ? "yes" : "no"} onChange={(event) => updateSetting("only_when_idle", event.target.value === "yes")}><option value="yes">开启</option><option value="no">关闭</option></select></label>
          <label>空闲秒数<input type="number" min="0" value={settings.idle_threshold_seconds} onChange={(event) => updateSetting("idle_threshold_seconds", Number(event.target.value))} /></label>
          <label>运行前确认<select value={settings.require_confirmation ? "yes" : "no"} onChange={(event) => updateSetting("require_confirmation", event.target.value === "yes")}><option value="yes">需要</option><option value="no">不需要</option></select></label>
          <label>完成通知<select value={settings.notify_on_complete ? "yes" : "no"} onChange={(event) => updateSetting("notify_on_complete", event.target.value === "yes")}><option value="yes">开启</option><option value="no">关闭</option></select></label>
          <label>重试次数<input type="number" min="0" value={settings.retry_count} onChange={(event) => updateSetting("retry_count", Number(event.target.value))} /></label>
          <label>重试间隔分钟<input type="number" min="0" value={settings.retry_delay_minutes} onChange={(event) => updateSetting("retry_delay_minutes", Number(event.target.value))} /></label>
        </div>
        <button className="primary" onClick={() => onSaveAutomation(settings)} disabled={busy}><Bell size={17} /><span>保存自动化</span></button>
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
  onSelect,
  onMerge,
  onExport,
  onObsidian,
  onBackup,
  onRestore
}: {
  atoms: KnowledgeAtomDocument[];
  knowledge: KnowledgeLibraryView;
  busy: boolean;
  onSelect: (atomId: string) => void;
  onMerge: (atomId: string, targetId: string) => void;
  onExport: () => void;
  onObsidian: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sourceApp, setSourceApp] = useState("");
  const [type, setType] = useState("");
  const [project, setProject] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(() => filterKnowledgeItems(atoms, { query, sourceApp, type, project, tag, status }), [atoms, query, sourceApp, type, project, tag, status]);

  return (
    <div className="libraryLayout">
      <section className="panel">
        <div className="listHeader">
          <div className="statusPills">
            <span>全部 {atoms.length}</span>
            {knowledge.facets.statuses.map((item) => <span key={item.value}>{item.value} {item.count}</span>)}
          </div>
          <label className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、证据、标签" /></label>
        </div>
        <div className="filterGrid">
          <label><Filter size={15} />来源<select value={sourceApp} onChange={(event) => setSourceApp(event.target.value)}><option value="">全部</option>{knowledge.facets.source_apps.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
          <label><Filter size={15} />类型<select value={type} onChange={(event) => setType(event.target.value)}><option value="">全部</option>{knowledge.facets.types.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
          <label><Filter size={15} />项目<select value={project} onChange={(event) => setProject(event.target.value)}><option value="">全部</option>{knowledge.facets.projects.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
          <label><Filter size={15} />标签<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">全部</option>{knowledge.facets.tags.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
          <label><Filter size={15} />状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{knowledge.facets.statuses.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
        </div>
        <div className="libraryToolbar">
          <button onClick={onExport} disabled={busy}><Download size={16} />导出 Markdown</button>
          <button onClick={onObsidian} disabled={busy}><BookOpenCheck size={16} />Obsidian 索引</button>
          <button onClick={onBackup} disabled={busy}><HardDriveDownload size={16} />备份</button>
          <button onClick={onRestore} disabled={busy}><RefreshCw size={16} />恢复最近备份</button>
        </div>
      </section>

      <section className="panel libraryResults">
        <h2>知识列表</h2>
        <div className="atomList">
          {filtered.map((item) => (
            <button key={item.atom.atom_id} className="atomRow" onClick={() => onSelect(item.atom.atom_id)}>
              <strong>{item.atom.title}</strong>
              <span>{item.atom.type} · {item.atom.review_status} · {item.atom.source_app} · {item.atom.project || "未分项目"}</span>
              <small>{item.atom.tags.join(", ") || item.atom.evidence}</small>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="emptyState">
              <p>导入聊天文件后，已批准的知识会出现在这里。</p>
              <p className="muted">新导入的内容请先前往「待确认」审查。</p>
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
                    <button onClick={() => onSelect(item.atom.atom_id)}>{item.atom.title}</button>
                    {target && item.atom.atom_id !== target.atom.atom_id && <button onClick={() => onMerge(item.atom.atom_id, target.atom.atom_id)} disabled={busy}><Split size={15} />合并到首条</button>}
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
      <section className="panel">
        <h2>隐私和安全设置</h2>
        <div className="formGrid">
          <label>来源授权<select value={settings.require_source_authorization ? "yes" : "no"} onChange={(event) => updateSetting("require_source_authorization", event.target.value === "yes")}><option value="yes">需要</option><option value="no">不需要</option></select></label>
          <label>云端 AI 处理 private<select value={settings.allow_cloud_ai_for_private ? "yes" : "no"} onChange={(event) => updateSetting("allow_cloud_ai_for_private", event.target.value === "yes")}><option value="no">禁止</option><option value="yes">允许</option></select></label>
          <label>原始记录保留<select value={settings.raw_retention_mode} onChange={(event) => updateSetting("raw_retention_mode", event.target.value as RawRetentionMode)}><option value="keep_forever">长期保留</option><option value="delete_after_days">按天数删除</option><option value="delete_after_successful_run">成功运行后删除</option></select></label>
          <label>保留天数<input type="number" min="0" value={settings.raw_retention_days} onChange={(event) => updateSetting("raw_retention_days", Number(event.target.value))} /></label>
        </div>
        <div className="privacyActions">
          <button className="primary" onClick={() => onSaveSettings(settings)} disabled={busy}><Shield size={16} />保存设置</button>
          <button onClick={onApplyRetention} disabled={busy}><Trash2 size={16} />执行保留策略</button>
          <button onClick={onWriteLegalDrafts} disabled={busy}><FileText size={16} />生成协议草案</button>
        </div>
        <div className="secureState"><KeyRound size={16} /><span>API Key：{privacy.secure_credentials.openai_compatible_saved ? `已加密保存 ${privacy.secure_credentials.updated_at ?? ""}` : "未保存到本地"}</span></div>
      </section>

      <section className="panel">
        <h2>敏感内容扫描</h2>
        <label className="fullField">待扫描文本<textarea value={scanText} onChange={(event) => setScanText(event.target.value)} /></label>
        <button className="primary" onClick={() => void onScan(scanText).then(setScanResult)} disabled={busy}><Search size={16} />扫描</button>
        {scanResult && <div className="scanResult"><strong>{scanResult.sensitivity} · {scanResult.can_enter_personal_kb ? "可进入个人库" : "默认阻断"}</strong>{scanResult.findings.map((finding, index) => <span key={`${finding.rule_id}-${index}`}>{finding.label} · {finding.severity} · {finding.match_preview}</span>)}{scanResult.findings.length === 0 && <span>未发现敏感规则命中</span>}</div>}
      </section>

      <section className="panel">
        <h2>来源授权说明</h2>
        <div className="sourceAuthList">{privacy.sources.map((source) => <div className="sourceAuthRow" key={source.source_app}><strong>{source.display_name} · {source.authorized ? "已授权" : "未授权"}</strong><span>{source.permission_scope}</span><small>读取：{source.reads.join("；")}</small><small>不读取：{source.does_not_read.join("；")}</small></div>)}</div>
      </section>

      <section className="panel">
        <h2>用户数据</h2>
        <div className="formGrid"><label>删除来源<select value={sourceToDelete} onChange={(event) => setSourceToDelete(event.target.value)}>{connectors.map((connector) => <option key={connector.source_app} value={connector.source_app}>{connector.display_name}</option>)}</select></label></div>
        <div className="privacyActions">
          <button onClick={() => onDeleteSource(sourceToDelete)} disabled={busy}><Trash2 size={16} />删除来源数据</button>
          <button onClick={onExportUserData} disabled={busy}><Download size={16} />导出用户数据</button>
          <button onClick={onDeleteAllUserData} disabled={busy}><Trash2 size={16} />彻底删除本地数据</button>
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
      <section className="panel commercialHero">
        <h2>授权状态</h2>
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
          <button className="primary" onClick={() => onActivate(activationCode)} disabled={busy || !activationCode.trim()}><BadgeCheck size={16} />激活授权</button>
        </div>
        <label>账号邮箱<input value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="you@example.com" /></label>
        <div className="commercialActions">
          <button onClick={() => onSaveAccount(accountEmail)} disabled={busy || !accountEmail.trim()}><KeyRound size={16} />保存账号入口</button>
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
          <button className="primary" onClick={() => onCreateFeedback({ category: feedbackCategory, contact_email: feedbackEmail, message: feedbackMessage })} disabled={busy || !feedbackMessage.trim()}><FileText size={16} />创建反馈草稿</button>
          <a href={commercial.feedback.feedback_url} target="_blank" rel="noreferrer"><Globe size={16} />在线支持</a>
        </div>
      </section>
    </div>
  );
}

function PendingPanel({ atoms, counts, query, selectedId, onQuery, onSelect }: { atoms: KnowledgeAtomDocument[]; counts: Record<ReviewStatus, number>; query: string; selectedId: string; onQuery: (value: string) => void; onSelect: (atomId: string) => void }) {
  return (
    <section className="panel fill">
      <div className="listHeader">
        <div className="statusPills">
          <span>待确认 {counts.pending}</span>
          <span>已批准 {counts.approved}</span>
          <span>已拒绝 {counts.rejected}</span>
          <span>已合并 {counts.merged}</span>
        </div>
        <label className="search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索标题、正文、证据" /></label>
      </div>
      <div className="atomList">
        {atoms.map((item) => (
          <button key={item.atom.atom_id} className={selectedId === item.atom.atom_id ? "atomRow active" : "atomRow"} onClick={() => onSelect(item.atom.atom_id)}>
            <strong>{item.atom.title}</strong>
            <span>{item.atom.type} · {item.atom.review_status} · {item.atom.source_app}</span>
            <small>{item.atom.evidence}</small>
          </button>
        ))}
        {atoms.length === 0 && (
          <div className="emptyState">
            <p>导入聊天文件后，候选知识会出现在这里等待你批准或拒绝。</p>
            <p className="muted">点击左侧「导入」，选择文件后会自动提炼。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DetailPanel({ document, atoms, busy, onUpdate }: { document: KnowledgeAtomDocument; atoms: KnowledgeAtomDocument[]; busy: boolean; onUpdate: (input: AtomUpdateInput) => void }) {
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
      <div className="evidence"><strong>证据</strong><p>{document.atom.evidence}</p><small>{document.atom.source_raw_paths.join(", ")}</small></div>
      <div className="actions">
        <button onClick={() => onUpdate(baseInput)} disabled={busy}><SquarePen size={16} />保存</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "approved" })} disabled={busy}><Check size={16} />批准</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "rejected" })} disabled={busy}><X size={16} />拒绝</button>
        <button onClick={() => onUpdate({ ...baseInput, review_status: "merged", merged_into: mergedInto })} disabled={busy || !mergedInto}><Split size={16} />合并</button>
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
  const [aiProvider, setAiProvider] = useState(state.aiProvider);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="grid two">
      <section className="panel settingsPanel">
        <h2>设置</h2>
        <div className="formGrid">
          <label>默认来源<select value={sourceApp} onChange={(event) => setSourceApp(event.target.value)}>{state.connectors.filter((connector) => connector.status === "available" && connector.enabled).map((connector) => <option key={connector.source_app} value={connector.source_app}>{connector.display_name}</option>)}</select></label>
          <label>AI 服务<select value={aiProvider} onChange={(event) => setAiProvider(event.target.value)}><option value="fixture">fixture</option><option value="openai-compatible">openai-compatible</option></select></label>
          <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
          <label>模型<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" /></label>
          <label>API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="本地加密保存" /></label>
        </div>
        <button className="primary" onClick={() => onSave({ sourceApp, aiProvider, baseUrl, model, apiKey })} disabled={busy}><Shield size={17} /><span>保存会话配置</span></button>
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
        <button className="secondary" onClick={onCheckUpdates} disabled={busy || !state.release.update_enabled}><PackageCheck size={17} /><span>检查更新</span></button>
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

function titleFor(active: NavKey): string {
  return navItems.find((item) => item.key === active)?.label ?? "工作台";
}

function subtitleFor(active: NavKey): string {
  const subtitles: Record<NavKey, string> = {
    guide: "首次启动、知识库位置和运行状态",
    sources: "来源启用状态和后续连接器边界",
    import: "选择 AI 聊天导出文件，系统自动完成后续步骤",
    run: "执行每日沉淀流程",
    library: "搜索、筛选、合并、日历和导出",
    privacy: "来源授权、敏感识别、数据导出和删除",
    commercial: "试用、授权、购买、更新公告和反馈",
    pending: "审查候选知识原子",
    detail: "编辑、批准、拒绝或合并",
    settings: "AI 服务和本地配置",
    logs: "运行事件和错误摘要"
  };
  return subtitles[active];
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
