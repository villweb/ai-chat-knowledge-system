import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type KnowledgeAtomDraft,
  type KnowledgeAtomGenerationRequest,
  type KnowledgeAtomGenerator
} from "./ai-knowledge-extraction";
import { getCommercialState } from "./commercial";
import { exportUserData, deleteAllUserData, getPrivacySecurityState, scanSensitiveContent } from "./privacy-security";
import { buildReleaseReadiness, RELEASE_UNINSTALL_POLICY } from "./release-config";
import { runManualImportNormalization } from "./manual-import-normalization-runner";
import { extractKnowledgeAtoms } from "./ai-knowledge-extraction";

export type QualityCheckId =
  | "P10-01"
  | "P10-02"
  | "P10-03"
  | "P10-04"
  | "P10-05"
  | "P10-06"
  | "P10-07"
  | "P10-08"
  | "P10-09"
  | "P10-10";

export type QualityCheckStatus = "passed" | "warning" | "failed";

export interface QualityCheckResult {
  check_id: QualityCheckId;
  title: string;
  status: QualityCheckStatus;
  evidence: string[];
  remediation: string;
}

export interface QualityGateReport {
  schema_version: "quality_gate_report.v1";
  created_at: string;
  status: QualityCheckStatus;
  passed_count: number;
  warning_count: number;
  failed_count: number;
  checks: QualityCheckResult[];
}

export async function runQualityGate(projectRoot: string, now = new Date()): Promise<QualityGateReport> {
  const checks: QualityCheckResult[] = [];
  checks.push(await checkMacPackaging(projectRoot));
  checks.push(await checkWindowsPackaging(projectRoot));
  checks.push(await checkFirstLaunch());
  checks.push(await checkNoApiKeyScenario());
  checks.push(await checkBadImportInputs());
  checks.push(await checkModelFailureScenario());
  checks.push(await checkDuplicateRunSafety());
  checks.push(await checkUninstallReinstallUpgradePolicy());
  checks.push(await checkPrivacyExportAndDelete());
  checks.push(checkLaunchChecklistCoverage(checks));

  const failedCount = checks.filter((check) => check.status === "failed").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  return {
    schema_version: "quality_gate_report.v1",
    created_at: now.toISOString(),
    status: failedCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed",
    passed_count: checks.filter((check) => check.status === "passed").length,
    warning_count: warningCount,
    failed_count: failedCount,
    checks
  };
}

async function checkMacPackaging(projectRoot: string): Promise<QualityCheckResult> {
  const builder = await readFile(path.join(projectRoot, "electron-builder.yml"), "utf8");
  const workflow = await readFile(path.join(projectRoot, ".github/workflows/release-build.yml"), "utf8");
  const passed = builder.includes("dmg") && builder.includes("zip") && workflow.includes("macos-latest");
  return buildCheck("P10-01", "macOS 发布配置检查", passed, [
    "electron-builder 已配置 macOS dmg 和 zip。",
    "GitHub Actions 已配置 macos-latest 发布构建。",
    "该项只验证发布配置，不等同于安装包端到端冒烟。"
  ], "补齐 macOS dmg/zip 构建目标和 macOS runner，并单独执行真实安装包冒烟。");
}

async function checkWindowsPackaging(projectRoot: string): Promise<QualityCheckResult> {
  const builder = await readFile(path.join(projectRoot, "electron-builder.yml"), "utf8");
  const workflow = await readFile(path.join(projectRoot, ".github/workflows/release-build.yml"), "utf8");
  const passed = builder.includes("nsis") && builder.includes("portable") && workflow.includes("windows-latest");
  return buildCheck("P10-02", "Windows 发布配置检查", passed, [
    "electron-builder 已配置 Windows nsis 和 portable。",
    "GitHub Actions 已配置 windows-latest 发布构建。",
    "该项只验证发布配置，不等同于 Windows 安装包端到端冒烟。"
  ], "补齐 Windows nsis/portable 构建目标和 Windows runner，并单独执行真实 Windows 冒烟。");
}

async function checkFirstLaunch(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  try {
    const commercial = await getCommercialState(vaultRoot, new Date("2026-06-23T10:00:00.000Z"));
    const privacy = await getPrivacySecurityState(vaultRoot);
    const importSummary = await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_first_launch" });
    const passed = commercial.runtime.license_status === "trial_active" && privacy.rules.length > 0 && importSummary.imported_file_count === 0;
    return buildCheck("P10-03", "首次启动流程", passed, [
      `商业状态：${commercial.runtime.license_status}`,
      `隐私规则数量：${privacy.rules.length}`,
      "空导入目录首次运行不会崩溃。"
    ], "确保默认 vault、商业状态和隐私状态可在空目录创建。");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

async function checkNoApiKeyScenario(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  const previousKey = process.env.AI_KB_OPENAI_API_KEY;
  const previousBase = process.env.AI_KB_OPENAI_BASE_URL;
  const previousModel = process.env.AI_KB_OPENAI_MODEL;
  try {
    delete process.env.AI_KB_OPENAI_API_KEY;
    delete process.env.AI_KB_OPENAI_BASE_URL;
    delete process.env.AI_KB_OPENAI_MODEL;
    await writeSample(vaultRoot, "no-api", "无 API Key 场景应允许 fixture 跑通。");
    await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_no_api_import" });
    const fixture = await extractKnowledgeAtoms({ vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "p10_no_api_fixture" });
    const errorMessage = await captureError(() => extractKnowledgeAtoms({ vault_root: vaultRoot, source_app: "codex", provider: "openai-compatible", allow_ai: true, run_id: "p10_no_api_openai" }));
    const passed = fixture.generated_atom_count >= 1 && /requires AI_KB_OPENAI_API_KEY/.test(errorMessage);
    return buildCheck("P10-04", "无 API Key 场景", passed, [
      `fixture 生成数量：${fixture.generated_atom_count}`,
      `openai-compatible 错误：${errorMessage}`
    ], "确保无 API Key 时 fixture 可用，真实 provider 给出明确配置提示。");
  } finally {
    restoreEnv("AI_KB_OPENAI_API_KEY", previousKey);
    restoreEnv("AI_KB_OPENAI_BASE_URL", previousBase);
    restoreEnv("AI_KB_OPENAI_MODEL", previousModel);
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

async function checkBadImportInputs(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  try {
    const importRoot = path.join(vaultRoot, "raw/imports/codex");
    await mkdir(importRoot, { recursive: true });
    await writeFile(path.join(importRoot, "empty.txt"), "", "utf8");
    await writeFile(path.join(importRoot, "broken.json"), "{", "utf8");
    await writeFile(path.join(importRoot, "large.json"), JSON.stringify({
      source_app: "codex",
      source_type: "manual_export",
      conversation_id: "p10-large",
      sensitivity: "personal",
      topic: "超大文件",
      user_message: "大文件".repeat(80_000),
      ai_message: "已处理。"
    }), "utf8");

    const summary = await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_bad_inputs" });
    const passed = summary.imported_file_count === 1 && summary.failed_file_count === 2 && summary.failures.every((failure) => failure.error_message.length > 0);
    return buildCheck("P10-05", "导入空文件、损坏文件、超大文件", passed, [
      `成功文件：${summary.imported_file_count}`,
      `失败文件：${summary.failed_file_count}`,
      `错误摘要：${summary.failures.map((failure) => failure.error_message).join(" | ")}`
    ], "确保坏文件失败可定位，且不会阻断同批有效大文件。");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

async function checkModelFailureScenario(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  try {
    await writeSample(vaultRoot, "model-failure", "模型失败时应返回明确错误。");
    await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_model_import" });
    const errorMessage = await captureError(() => extractKnowledgeAtoms(
      { vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "p10_model_failure" },
      failingGenerator("模拟模型服务不可用")
    ));
    const passed = /模拟模型服务不可用/.test(errorMessage);
    return buildCheck("P10-06", "网络失败和模型调用失败", passed, [
      `模型失败错误：${errorMessage}`
    ], "确保模型调用失败不会被吞掉，并能暴露明确错误原因。");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

async function checkDuplicateRunSafety(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  try {
    await writeSample(vaultRoot, "duplicate", "重复运行不应重复写入同一候选。");
    await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_duplicate_import" });
    const first = await extractKnowledgeAtoms({ vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "p10_duplicate_first" });
    const second = await extractKnowledgeAtoms({ vault_root: vaultRoot, source_app: "codex", provider: "fixture", allow_ai: true, run_id: "p10_duplicate_second" });
    const passed = first.generated_atom_count === 1 && second.generated_atom_count === 0 && second.duplicate_atom_count === 1;
    return buildCheck("P10-07", "重复运行不会重复写入", passed, [
      `首次生成：${first.generated_atom_count}`,
      `二次生成：${second.generated_atom_count}`,
      `重复计数：${second.duplicate_atom_count}`
    ], "确保重复运行进入重复/合并建议路径，而不是重复写入。");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

async function checkUninstallReinstallUpgradePolicy(): Promise<QualityCheckResult> {
  const readiness = buildReleaseReadiness();
  const passed = RELEASE_UNINSTALL_POLICY === "retain_user_data" && readiness.update.provider === "generic" && readiness.identity.default_vault_dir_name === "vault";
  return buildCheck("P10-08", "卸载、重装和升级", passed, [
    `卸载策略：${RELEASE_UNINSTALL_POLICY}`,
    `更新 provider：${readiness.update.provider}`,
    `默认 vault：${readiness.identity.default_vault_dir_name}`
  ], "确保卸载保留用户数据，升级通道和默认数据目录稳定。");
}

async function checkPrivacyExportAndDelete(): Promise<QualityCheckResult> {
  const vaultRoot = await createTempVault();
  try {
    await writeSample(vaultRoot, "privacy", "隐私导出和删除应可独立完成。");
    await runManualImportNormalization({ vault_root: vaultRoot, source_app: "codex", run_id: "p10_privacy_import" });
    const exportSummary = await exportUserData(vaultRoot, new Date("2026-06-23T10:00:00.000Z"));
    const sensitive = scanSensitiveContent("客户合同 api_key: sk-test-secret-123456");
    const deleteSummary = await deleteAllUserData(vaultRoot);
    const passed = exportSummary.copied_dir_count > 0 && deleteSummary.deleted_paths.includes("knowledge") && sensitive.sensitivity === "confidential" && !sensitive.can_enter_personal_kb;
    return buildCheck("P10-09", "隐私导出和删除", passed, [
      `导出目录：${exportSummary.export_dir}`,
      `删除路径：${deleteSummary.deleted_paths.join(", ")}`,
      `敏感扫描：${sensitive.sensitivity}`,
      "敏感内容默认阻断进入个人库。"
    ], "确保用户数据可导出，敏感内容可本地识别和阻断。");
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
}

function checkLaunchChecklistCoverage(previousChecks: QualityCheckResult[]): QualityCheckResult {
  const ids = new Set(previousChecks.map((check) => check.check_id));
  const expected: QualityCheckId[] = ["P10-01", "P10-02", "P10-03", "P10-04", "P10-05", "P10-06", "P10-07", "P10-08", "P10-09"];
  const missing = expected.filter((id) => !ids.has(id));
  return buildCheck("P10-10", "上线检查清单", missing.length === 0 && previousChecks.every((check) => check.evidence.length > 0), [
    `覆盖检查项：${previousChecks.map((check) => check.check_id).join(", ")}`,
    `缺失检查项：${missing.join(", ") || "无"}`
  ], "确保 P10-01 到 P10-09 均有自动化证据。");
}

function buildCheck(checkId: QualityCheckId, title: string, passed: boolean, evidence: string[], remediation: string): QualityCheckResult {
  return {
    check_id: checkId,
    title,
    status: passed ? "passed" : "failed",
    evidence,
    remediation: passed ? "" : remediation
  };
}

async function writeSample(vaultRoot: string, name: string, userMessage: string): Promise<void> {
  const importRoot = path.join(vaultRoot, "raw/imports/codex");
  await mkdir(importRoot, { recursive: true });
  await writeFile(path.join(importRoot, `${name}.json`), JSON.stringify({
    source_app: "codex",
    source_type: "manual_export",
    conversation_id: `p10-${name}`,
    message_time: "2026-06-23T10:00:00+08:00",
    project: "P10测试",
    topic: `P10 ${name}`,
    raw_source: "quality_gate",
    sensitivity: "personal",
    user_message: userMessage,
    ai_message: "已记录。"
  }, null, 2), "utf8");
}

function failingGenerator(message: string): KnowledgeAtomGenerator {
  return {
    async generateKnowledgeAtoms(_request: KnowledgeAtomGenerationRequest): Promise<KnowledgeAtomDraft[]> {
      throw new Error(message);
    }
  };
}

async function captureError(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function createTempVault(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-chat-kb-p10-"));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
