const { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor, shell } = require("electron");
const { spawn } = require("node:child_process");
const { copyFile, mkdir, readdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const {
  assertImportSourceEnabled,
  buildImportDialogOptions,
  ensureEnabledConnectorsDefaults,
  resolveImportTargetSource
} = require("./desktop-import.cjs");

const devRoot = path.resolve(__dirname, "../..");
const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked") : devRoot;
const assetRoot = app.isPackaged ? app.getAppPath() : devRoot;
const sourceApps = ["codex", "cursor", "deepseek", "doubao", "workbuddy"];
const AUTOMATION_CHECK_MS = 30_000;
const SESSION_CONFIG_PATH = "data/runtime/desktop-session.json";
const APP_SETTINGS_FILE = "desktop-app-settings.json";
const releaseInfo = {
  app_name: "AI Chat Knowledge",
  app_id: "com.villweb.aichatknowledge",
  executable_name: "AI Chat Knowledge",
  data_dir_name: "AI Chat Knowledge",
  default_vault_dir_name: "vault",
  update_channel: "stable",
  update_url: "https://updates.villweb.com/ai-chat-knowledge-system",
  update_url_env: "AI_KB_UPDATE_URL",
  uninstall_policy: "retain_user_data"
};
const state = {
  vaultRoot: "",
  sourceApp: "codex",
  aiProvider: "fixture",
  aiProviderPreset: "fixture",
  aiBaseUrl: "",
  aiModel: "",
  apiKeyConfigured: false,
  enabledConnectors: {
    codex: true,
    cursor: true,
    deepseek: true,
    doubao: false,
    workbuddy: false
  },
  events: []
};
let automationTimer = null;
let automationRunning = false;
let pendingAutomationRun = null;
let lastAutomationDecision = null;
let sessionConfigLoaded = false;
// 桌面端流水线状态，供界面展示当前处理阶段与子步骤
let pipelinePhase = "idle";
let pipelineSubstep = null;
let pipelineError = null;
let lastPipelineRetry = null;

function getAutoUpdater() {
  return require("electron-updater").autoUpdater;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "AI Chat Knowledge System",
    backgroundColor: "#f4f6f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServer = process.env.AI_KB_DESKTOP_DEV_SERVER;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(path.join(assetRoot, "dist/desktop/index.html"));
  }
}

app.whenReady().then(async () => {
  state.vaultRoot = await resolveInitialVaultRoot();
  applyEnabledConnectorDefaults();
  configureAutoUpdater();
  registerIpc();
  createWindow();
  startAutomationTimer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function registerIpc() {
  ipcMain.handle("app:get-state", async () => {
    await ensureSessionConfigLoaded();
    const privacy = await getPrivacyState();
    return {
      ...state,
      apiKeyConfigured: state.apiKeyConfigured || privacy.secure_credentials.openai_compatible_saved,
      automation: await getAutomationState(),
      connectors: await listConnectors(),
      atoms: await listAtoms(),
      knowledge: await getKnowledgeView({}),
      privacy,
      release: getReleaseState(),
      commercial: await getCommercialState(),
      logs: await listLogs(),
      pipeline: getPipelineState()
    };
  });

  ipcMain.handle("vault:choose", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parentWindow ?? undefined, { properties: ["openDirectory"] });
    if (!result.canceled && result.filePaths[0]) {
      state.vaultRoot = result.filePaths[0];
      resetVaultSessionState();
      await saveAppSettings();
      pushEvent("vault_selected", `知识库位置已切换：${path.basename(state.vaultRoot)}`);
    }
    return { vaultRoot: state.vaultRoot };
  });

  ipcMain.handle("vault:show-path", async (_event, input) => {
    const vaultPath = typeof input?.vault_path === "string" ? input.vault_path : "";
    if (!vaultPath.trim()) {
      throw new Error("缺少要打开的 vault 路径。");
    }
    const absolutePath = resolveVaultScopedPath(vaultPath);
    shell.showItemInFolder(absolutePath);
    return { ok: true, path: vaultPath };
  });

  ipcMain.handle("settings:save-session-config", async (_event, input) => {
    if (input.sourceApp) {
      if (!isSourceEnabled(input.sourceApp)) {
        throw new Error(`连接器未启用，不能设为默认来源：${input.sourceApp}`);
      }
      state.sourceApp = input.sourceApp;
    }
    state.aiProvider = input.aiProvider === "openai-compatible" ? "openai-compatible" : "fixture";
    if (input.aiProviderPreset) {
      state.aiProviderPreset = input.aiProviderPreset;
    } else if (state.aiProvider === "fixture") {
      state.aiProviderPreset = "fixture";
    }
    if (input.baseUrl !== undefined) {
      state.aiBaseUrl = input.baseUrl;
    }
    if (input.model !== undefined) {
      state.aiModel = input.model;
    }
    if (input.apiKey) {
      state.apiKeyConfigured = true;
    }
    if (input.apiKey) {
      process.env.AI_KB_OPENAI_API_KEY = input.apiKey;
      const credentialResult = await runScript("scripts/privacy-security.ts", ["save-credential", "--vault-root", state.vaultRoot], JSON.stringify({
        service: "openai-compatible",
        api_key: input.apiKey,
        base_url: input.baseUrl ?? state.aiBaseUrl ?? "",
        model: input.model ?? state.aiModel ?? ""
      }));
      if (!credentialResult.ok) {
        throw new Error(credentialResult.stderr || "API Key 加密保存失败。");
      }
    } else if (state.aiProvider === "openai-compatible" && state.apiKeyConfigured && (input.baseUrl || input.model)) {
      await updateStoredCredentialMetadata(input.baseUrl ?? state.aiBaseUrl ?? "", input.model ?? state.aiModel ?? "");
    }
    if (state.aiProvider === "openai-compatible") {
      if (state.aiBaseUrl) {
        process.env.AI_KB_OPENAI_BASE_URL = state.aiBaseUrl;
      }
      if (state.aiModel) {
        process.env.AI_KB_OPENAI_MODEL = state.aiModel;
      }
    } else {
      delete process.env.AI_KB_OPENAI_BASE_URL;
      delete process.env.AI_KB_OPENAI_MODEL;
    }
    await saveSessionConfig();
    pushEvent("settings_saved", input.apiKey ? "AI 服务配置已保存，API Key 已本地加密保存。" : "AI 服务配置已保存。");
    return { ok: true, aiProvider: state.aiProvider, apiKeyConfigured: state.apiKeyConfigured };
  });

  ipcMain.handle("connectors:set-enabled", async (_event, input) => {
    if (!sourceApps.includes(input.sourceApp)) {
      throw new Error(`未知连接器：${input.sourceApp}`);
    }

    const connectors = await listConnectors();
    const connector = connectors.find((item) => item.source_app === input.sourceApp);
    if (!connector) {
      throw new Error(`连接器不存在：${input.sourceApp}`);
    }
    if (connector.status !== "available") {
      throw new Error(`${connector.display_name} 仍是预留连接器，当前阶段不能启用。`);
    }

    state.enabledConnectors[input.sourceApp] = Boolean(input.enabled);
    if (!state.enabledConnectors[state.sourceApp]) {
      const nextSource = connectors.find((item) => item.status === "available" && state.enabledConnectors[item.source_app]);
      state.sourceApp = nextSource?.source_app ?? "codex";
    }
    await saveSessionConfig();
    pushEvent("connector_updated", `${connector.display_name} 已${state.enabledConnectors[input.sourceApp] ? "启用" : "停用"}。`);
    return { connectors: await listConnectors(), sourceApp: state.sourceApp };
  });

  ipcMain.handle("import:choose-files", async (event, sourceApp) => {
    applyEnabledConnectorDefaults();
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (parentWindow && !parentWindow.isDestroyed()) {
      parentWindow.focus();
    }

    // 先打开文件选择框，避免来源校验失败时用户完全无法选文件
    const result = await dialog.showOpenDialog(parentWindow ?? undefined, buildImportDialogOptions());
    if (result.canceled) {
      return { copied_file_count: 0, auto_processed: false, canceled: true };
    }

    const targetSource = resolveImportTargetSource(sourceApp, state.sourceApp);
    if (!targetSource) {
      throw new Error("没有可用的导入来源，请先在「来源」页启用至少一个连接器。");
    }
    assertImportSourceEnabled(targetSource, state.enabledConnectors);

    const importPath = `raw/imports/${targetSource}`;
    const targetDir = path.join(state.vaultRoot, importPath);
    await mkdir(targetDir, { recursive: true });
    const copiedNames = [];
    const copiedRawPaths = [];
    for (const file of result.filePaths) {
      const fileName = path.basename(file);
      await copyFile(file, path.join(targetDir, fileName));
      copiedNames.push(fileName);
      copiedRawPaths.push(`${importPath}/${fileName}`);
    }

    pipelinePhase = "importing";
    pipelineSubstep = "copying";
    pipelineError = null;
    pushEvent("manual_import_files", `已导入 ${result.filePaths.length} 个文件到 ${importPath}，正在自动标准化和提炼...`);

    try {
      pipelinePhase = "processing";
      pipelineSubstep = "normalizing";
      lastPipelineRetry = {
        kind: "manual_import",
        source_app: targetSource,
        copied_raw_paths: copiedRawPaths,
        copied_file_names: copiedNames,
        copied_file_count: result.filePaths.length,
        import_path: importPath
      };
      const pipelineResult = await runDailyWorkflow(undefined, undefined, {
        uiManualImport: true,
        copiedRawPaths,
        sourceApp: targetSource
      });
      pipelineSubstep = null;
      const atoms = await listAtoms();
      const pendingCount = atoms.filter((item) => item.atom.review_status === "pending").length;
      const importSummary = parseScriptStdout(pipelineResult.importResult);
      const extractSummary = parseScriptStdout(pipelineResult.extractResult);
      const importBatchAtomIds = Array.from(new Set([
        ...(importSummary?.generated_atom_ids ?? []),
        ...(extractSummary?.generated_atom_ids ?? [])
      ]));
      pipelinePhase = pendingCount > 0 ? "waiting_review" : "done";
      pushEvent(
        "import_pipeline_completed",
        `导入完成：${result.filePaths.length} 个文件已处理，${pendingCount} 条知识待确认。`
      );
      return {
        copied_file_count: result.filePaths.length,
        copied_file_names: copiedNames,
        copied_raw_paths: copiedRawPaths,
        source_app: targetSource,
        import_path: importPath,
        auto_processed: true,
        pending_atom_count: pendingCount,
        total_atom_count: atoms.length,
        normalized_record_count: importSummary?.normalized_record_count ?? 0,
        generated_atom_count: Math.max(
          importSummary?.generated_atom_count ?? 0,
          extractSummary?.generated_atom_count ?? 0
        ),
        failed_file_count: importSummary?.failed_file_count ?? 0,
        blocked_record_count: extractSummary?.blocked_record_count ?? 0,
        import_batch_atom_ids: importBatchAtomIds,
        import_batch_record_ids: importSummary?.normalized_record_ids ?? [],
        used_personal_default: true,
        pipeline: getPipelineState(),
        ...pipelineResult
      };
    } catch (error) {
      pipelinePhase = "failed";
      pipelineSubstep = null;
      pipelineError = toErrorMessage(error);
      throw error;
    }
  });

  ipcMain.handle("import:retry", async () => {
    if (!lastPipelineRetry) {
      throw new Error("没有可重试的导入任务。");
    }

    const ctx = lastPipelineRetry;
    pipelineError = null;
    pipelinePhase = "processing";
    pipelineSubstep = "normalizing";

    try {
      if (ctx.kind === "manual_import") {
        const pipelineResult = await runDailyWorkflow(undefined, undefined, {
          uiManualImport: true,
          copiedRawPaths: ctx.copied_raw_paths,
          sourceApp: ctx.source_app
        });
        pipelineSubstep = null;
        const atoms = await listAtoms();
        const pendingCount = atoms.filter((item) => item.atom.review_status === "pending").length;
        const importSummary = parseScriptStdout(pipelineResult.importResult);
        const extractSummary = parseScriptStdout(pipelineResult.extractResult);
        const importBatchAtomIds = Array.from(new Set([
          ...(importSummary?.generated_atom_ids ?? []),
          ...(extractSummary?.generated_atom_ids ?? [])
        ]));
        pipelinePhase = pendingCount > 0 ? "waiting_review" : "done";
        pushEvent("import_pipeline_retried", `重试完成：${pendingCount} 条知识待确认。`);
        return {
          copied_file_count: ctx.copied_file_count,
          copied_file_names: ctx.copied_file_names,
          copied_raw_paths: ctx.copied_raw_paths,
          source_app: ctx.source_app,
          import_path: ctx.import_path,
          auto_processed: true,
          pending_atom_count: pendingCount,
          total_atom_count: atoms.length,
          normalized_record_count: importSummary?.normalized_record_count ?? 0,
          generated_atom_count: Math.max(
            importSummary?.generated_atom_count ?? 0,
            extractSummary?.generated_atom_count ?? 0
          ),
          failed_file_count: importSummary?.failed_file_count ?? 0,
          blocked_record_count: extractSummary?.blocked_record_count ?? 0,
          import_batch_atom_ids: importBatchAtomIds,
          import_batch_record_ids: importSummary?.normalized_record_ids ?? [],
          used_personal_default: true,
          pipeline: getPipelineState(),
          ...pipelineResult
        };
      }

      throw new Error("不支持的重试类型。");
    } catch (error) {
      pipelinePhase = "failed";
      pipelineSubstep = null;
      pipelineError = toErrorMessage(error);
      throw error;
    }
  });

  ipcMain.handle("workflow:run-import", async () => {
    ensureSourceEnabled(state.sourceApp);
    pipelinePhase = "processing";
    try {
      const result = await runScript("scripts/run-manual-import-normalization.ts", [
        "--source-app",
        state.sourceApp,
        "--vault-root",
        state.vaultRoot,
        "--default-sensitivity-missing",
        "personal"
      ]);
      if (!result.ok) {
        pushEvent("p1_import", result.stderr);
        throw new Error(result.stderr || "导入和标准化失败。");
      }
      const importSummary = parseScriptStdout(result);
      if (importSummary?.failed_file_count > 0) {
        const preview = importSummary.failures
          ?.slice(0, 3)
          .map((failure) => `${failure.raw_path}: ${failure.error_message}`)
          .join("；");
        throw new Error(`标准化完成但有 ${importSummary.failed_file_count} 个文件失败。${preview ? ` ${preview}` : ""}`);
      }
      const atoms = await listAtoms();
      const pendingCount = atoms.filter((item) => item.atom.review_status === "pending").length;
      pipelinePhase = pendingCount > 0 ? "waiting_review" : "done";
      pushEvent("p1_import", `导入和标准化完成，${pendingCount} 条知识待确认。`);
      return { ...result, pending_atom_count: pendingCount, pipeline: getPipelineState() };
    } catch (error) {
      pipelinePhase = "failed";
      pipelineSubstep = null;
      pipelineError = toErrorMessage(error);
      throw error;
    }
  });

  ipcMain.handle("workflow:run-daily", async () => {
    pipelinePhase = "processing";
    try {
      const workflowResult = await runDailyWorkflow();
      const result = await buildDailyRunResult(workflowResult);
      pipelinePhase = result.pending_atom_count > 0 ? "waiting_review" : "done";
      pushEvent("daily_run", `每日沉淀完成，${result.pending_atom_count} 条知识待确认。`);
      return result;
    } catch (error) {
      pipelinePhase = "failed";
      pipelineSubstep = null;
      pipelineError = toErrorMessage(error);
      throw error;
    }
  });

  ipcMain.handle("atoms:list", async () => listAtoms());

  ipcMain.handle("atoms:update", async (_event, input) => {
    const result = await runScript("scripts/review-knowledge-atom.ts", ["update", "--vault-root", state.vaultRoot], JSON.stringify(input));
    if (!result.ok) {
      pushEvent("atom_updated", result.stderr);
      throw new Error(result.stderr || "知识状态更新失败。");
    }
    pushEvent("atom_updated", "知识状态已更新。");
    const updated = JSON.parse(result.stdout);
    // 审查后立即返回最新列表，避免 UI 使用陈旧 atoms / knowledge 视图
    const atoms = await listAtoms();
    const knowledge = await getKnowledgeView({});
    return { ...updated, atoms, knowledge };
  });

  ipcMain.handle("knowledge:view", async (_event, input) => {
    const result = await runScript("scripts/knowledge-library.ts", ["view", "--vault-root", state.vaultRoot], JSON.stringify(input ?? {}));
    if (!result.ok) {
      throw new Error(result.stderr || "读取知识库视图失败。");
    }

    return JSON.parse(result.stdout);
  });

  ipcMain.handle("knowledge:export-markdown", async () => {
    const result = await runScript("scripts/knowledge-library.ts", ["export-markdown", "--vault-root", state.vaultRoot]);
    if (!result.ok) {
      throw new Error(result.stderr || "导出 Markdown 失败。");
    }

    pushEvent("knowledge_exported", "知识库 Markdown 导出完成。");
    return JSON.parse(result.stdout);
  });

  ipcMain.handle("knowledge:ensure-obsidian", async () => {
    const result = await runScript("scripts/knowledge-library.ts", ["ensure-obsidian", "--vault-root", state.vaultRoot]);
    if (!result.ok) {
      throw new Error(result.stderr || "生成 Obsidian 索引失败。");
    }

    pushEvent("obsidian_index_updated", "Obsidian 知识索引已更新。");
    return JSON.parse(result.stdout);
  });

  ipcMain.handle("knowledge:backup", async () => {
    const result = await runScript("scripts/knowledge-library.ts", ["backup", "--vault-root", state.vaultRoot]);
    if (!result.ok) {
      throw new Error(result.stderr || "创建知识库备份失败。");
    }

    pushEvent("knowledge_backup_created", "知识库备份已创建。");
    return JSON.parse(result.stdout);
  });

  ipcMain.handle("knowledge:restore-latest", async () => {
    const result = await runScript("scripts/knowledge-library.ts", ["restore-latest", "--vault-root", state.vaultRoot]);
    if (!result.ok) {
      throw new Error(result.stderr || "恢复知识库备份失败。");
    }

    pushEvent("knowledge_backup_restored", "已恢复最近一次知识库备份。");
    return JSON.parse(result.stdout);
  });

  ipcMain.handle("privacy:get-state", async () => getPrivacyState());
  ipcMain.handle("privacy:save-settings", async (_event, input) => runPrivacyAction("save-settings", input ?? {}, "保存隐私设置失败。"));
  ipcMain.handle("privacy:scan", async (_event, input) => runPrivacyAction("scan", input ?? {}, "敏感内容扫描失败。"));
  ipcMain.handle("privacy:apply-retention", async () => runPrivacyAction("apply-retention", undefined, "执行原始记录保留策略失败。"));
  ipcMain.handle("privacy:delete-source", async (_event, input) => {
    if (!input?.source_app) throw new Error("缺少要删除的来源。");
    const args = ["--source-app", input.source_app];
    if (input.delete_derived_knowledge) {
      args.push("--delete-derived-knowledge");
    }
    return runPrivacyAction("delete-source", undefined, "删除来源数据失败。", args);
  });
  ipcMain.handle("privacy:export-user-data", async () => runPrivacyAction("export-user-data", undefined, "导出用户数据失败。"));
  ipcMain.handle("privacy:delete-all-user-data", async () => runPrivacyAction("delete-all-user-data", undefined, "彻底删除用户数据失败。"));
  ipcMain.handle("privacy:write-legal-drafts", async () => runPrivacyAction("write-legal-drafts", undefined, "生成隐私政策和用户协议草案失败。"));

  ipcMain.handle("logs:list", async () => listLogs());
  ipcMain.handle("records:get", async (_event, input) => {
    const recordIds = Array.isArray(input?.record_ids)
      ? input.record_ids.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    return getNormalizedRecordsByIds(recordIds);
  });

  ipcMain.handle("automation:get-state", async () => getAutomationState());

  ipcMain.handle("automation:save-settings", async (_event, input) => {
    const result = await runScript("scripts/daily-automation.ts", ["save-settings", "--vault-root", state.vaultRoot], JSON.stringify(input));
    if (!result.ok) {
      throw new Error(result.stderr || "保存自动化设置失败。");
    }
    pushEvent("automation_settings_saved", "每日自动化设置已保存。");
    await checkAutomation();
    return getAutomationState();
  });

  ipcMain.handle("automation:confirm-run", async () => {
    if (!pendingAutomationRun) {
      throw new Error("当前没有等待确认的自动运行。");
    }

    const runDate = pendingAutomationRun.run_date;
    pendingAutomationRun = null;
    pipelinePhase = "processing";
    try {
      const workflowResult = await runAutomationDate(runDate, "confirmed");
      const result = await buildDailyRunResult(workflowResult);
      pipelinePhase = result.pending_atom_count > 0 ? "waiting_review" : "done";
      return result;
    } catch (error) {
      pipelinePhase = "idle";
      throw error;
    }
  });

  ipcMain.handle("automation:skip-run", async () => {
    if (!pendingAutomationRun) {
      throw new Error("当前没有等待跳过的自动运行。");
    }

    await writeAutomationCancelledRun(pendingAutomationRun.run_date, `auto_daily_${pendingAutomationRun.run_date}_${Date.now()}_extract_cancelled`);
    pushEvent("automation_skipped", `已跳过 ${pendingAutomationRun.run_date} 的自动运行。`);
    pendingAutomationRun = null;
    return getAutomationState();
  });

  ipcMain.handle("automation:rerun-date", async (_event, input) => {
    if (!input?.run_date) {
      throw new Error("缺少重跑日期。");
    }

    pipelinePhase = "processing";
    try {
      const workflowResult = await runAutomationDate(input.run_date, "manual_rerun");
      const result = await buildDailyRunResult(workflowResult);
      pipelinePhase = result.pending_atom_count > 0 ? "waiting_review" : "done";
      return result;
    } catch (error) {
      pipelinePhase = "idle";
      throw error;
    }
  });

  ipcMain.handle("automation:list-history", async () => listDailyRunHistory());
  ipcMain.handle("release:get-state", async () => getReleaseState());
  ipcMain.handle("release:check-for-updates", async () => checkForUpdates());

  ipcMain.handle("commercial:get-state", async () => getCommercialState());
  ipcMain.handle("commercial:activate-license", async (_event, input) => runCommercialAction("activate-license", input ?? {}, "激活授权失败。"));
  ipcMain.handle("commercial:save-account", async (_event, input) => runCommercialAction("save-account", input ?? {}, "保存账号入口失败。"));
  ipcMain.handle("commercial:create-feedback", async (_event, input) => runCommercialAction("create-feedback", input ?? {}, "创建反馈草稿失败。"));
}

function runCommand(command, args, stdin) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (app.isPackaged) {
      env.ELECTRON_RUN_AS_NODE = "1";
    }
    const child = spawn(command, args, {
      cwd: runtimeRoot,
      env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

function runScript(scriptPath, args, stdin) {
  return runCommand(getNodeBinary(), ["--import", "tsx", path.join(runtimeRoot, scriptPath), ...args], stdin);
}

function getNodeBinary() {
  if (app.isPackaged) {
    return process.execPath;
  }
  return process.env.AI_KB_NODE_BINARY || process.env.npm_node_execpath || "node";
}

function buildDefaultVaultRoot() {
  return process.env.AI_KB_VAULT_ROOT || path.join(app.getPath("userData"), releaseInfo.default_vault_dir_name);
}

async function resolveInitialVaultRoot() {
  if (process.env.AI_KB_VAULT_ROOT) {
    return process.env.AI_KB_VAULT_ROOT;
  }

  try {
    const settings = JSON.parse(await readFile(getAppSettingsPath(), "utf8"));
    if (typeof settings.last_vault_root === "string" && settings.last_vault_root.trim()) {
      return settings.last_vault_root;
    }
  } catch {
    // 首次启动没有应用级设置时使用默认 vault
  }

  return buildDefaultVaultRoot();
}

async function saveAppSettings() {
  const settingsPath = getAppSettingsPath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({
    schema_version: "desktop_app_settings.v1",
    last_vault_root: state.vaultRoot,
    updated_at: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

function getAppSettingsPath() {
  return path.join(app.getPath("userData"), APP_SETTINGS_FILE);
}

function getReleaseState() {
  return {
    ...releaseInfo,
    version: app.getVersion(),
    is_packaged: app.isPackaged,
    app_data_dir: app.getPath("userData"),
    default_vault_root: buildDefaultVaultRoot(),
    update_enabled: app.isPackaged || Boolean(process.env[releaseInfo.update_url_env])
  };
}

function resolveVaultScopedPath(vaultPath) {
  const root = path.resolve(state.vaultRoot);
  const target = path.resolve(root, vaultPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`路径超出知识库范围：${vaultPath}`);
  }
  return target;
}

function configureAutoUpdater() {
  const autoUpdater = getAutoUpdater();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const updateUrl = process.env[releaseInfo.update_url_env];
  autoUpdater.setFeedURL({ provider: "generic", url: updateUrl || releaseInfo.update_url, channel: releaseInfo.update_channel });
}

async function checkForUpdates() {
  if (!app.isPackaged && !process.env[releaseInfo.update_url_env]) {
    return { enabled: false, message: "未配置更新发布地址。" };
  }
  const autoUpdater = getAutoUpdater();
  const result = await autoUpdater.checkForUpdates();
  return { enabled: true, update_info: result?.updateInfo ?? null };
}

async function listAtoms() {
  const result = await runScript("scripts/review-knowledge-atom.ts", ["list", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取知识列表失败。");
  }
  return JSON.parse(result.stdout);
}

async function listConnectors() {
  const enabled = sourceApps.filter((sourceApp) => state.enabledConnectors[sourceApp]).join(",");
  const result = await runScript("scripts/list-source-connectors.ts", ["--enabled", enabled]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取连接器列表失败。");
  }

  return JSON.parse(result.stdout);
}

async function getAutomationState() {
  const result = await runScript("scripts/daily-automation.ts", [
    "get-state",
    "--vault-root",
    state.vaultRoot,
    "--idle-seconds",
    String(getIdleSeconds())
  ]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取每日自动化状态失败。");
  }

  const automationState = JSON.parse(result.stdout);
  return {
    ...automationState,
    pending_run: pendingAutomationRun,
    last_decision: lastAutomationDecision
  };
}

async function listDailyRunHistory() {
  const result = await runScript("scripts/daily-automation.ts", ["list-history", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取运行历史失败。");
  }

  return JSON.parse(result.stdout);
}

async function getPrivacyState() {
  const result = await runScript("scripts/privacy-security.ts", ["state", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取隐私安全状态失败。");
  }
  const privacy = JSON.parse(result.stdout);
  return {
    ...privacy,
    sources: privacy.sources.map((source) => ({
      ...source,
      authorized: Boolean(state.enabledConnectors[source.source_app])
    }))
  };
}

async function getCommercialState() {
  const result = await runScript("scripts/commercial.ts", ["state", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取商业化状态失败。");
  }
  return JSON.parse(result.stdout);
}

async function runCommercialAction(action, input, errorMessage) {
  const result = await runScript("scripts/commercial.ts", [action, "--vault-root", state.vaultRoot], JSON.stringify(input));
  if (!result.ok) {
    throw new Error(result.stderr || errorMessage);
  }
  pushEvent(`commercial_${action.replaceAll("-", "_")}`, errorMessage.replace("失败。", "完成。"));
  return JSON.parse(result.stdout);
}

async function runPrivacyAction(action, input, errorMessage, extraArgs = []) {
  const args = [action, "--vault-root", state.vaultRoot, ...extraArgs];
  const result = await runScript("scripts/privacy-security.ts", args, input ? JSON.stringify(input) : undefined);
  if (!result.ok) {
    throw new Error(result.stderr || errorMessage);
  }
  pushEvent(`privacy_${action.replaceAll("-", "_")}`, errorMessage.replace("失败。", "完成。"));
  return JSON.parse(result.stdout);
}

async function getKnowledgeView(input) {
  const result = await runScript("scripts/knowledge-library.ts", ["view", "--vault-root", state.vaultRoot], JSON.stringify(input ?? {}));
  if (!result.ok) {
    throw new Error(result.stderr || "读取知识库视图失败。");
  }

  return JSON.parse(result.stdout);
}

function startAutomationTimer() {
  if (automationTimer) {
    clearInterval(automationTimer);
  }

  automationTimer = setInterval(() => {
    void checkAutomation();
  }, AUTOMATION_CHECK_MS);
  void checkAutomation();
}

async function checkAutomation() {
  if (automationRunning || pendingAutomationRun) {
    return;
  }

  try {
    const automationState = await getAutomationState();
    const decision = automationState.decision;
    lastAutomationDecision = decision;

    if (decision.action === "pending_confirmation") {
      pendingAutomationRun = {
        run_date: decision.run_date,
        source_app: state.sourceApp,
        reason: decision.reason,
        created_at: new Date().toISOString()
      };
      pushEvent("automation_pending_confirmation", `每日自动运行等待确认：${decision.run_date}`);
      showNotification("每日沉淀等待确认", "到达计划运行时间，请在应用内确认后开始。");
      return;
    }

    if (decision.action === "run_now" || decision.action === "retry_now") {
      await runAutomationDate(decision.run_date, decision.action);
    }
  } catch (error) {
    pushEvent("automation_check_failed", toErrorMessage(error));
  }
}

async function runAutomationDate(runDate, reason) {
  ensureSourceEnabled(state.sourceApp);
  if (automationRunning) {
    throw new Error("每日沉淀正在运行中。");
  }

  automationRunning = true;
  const runIdPrefix = `auto_daily_${runDate}_${Date.now()}`;
  try {
    pushEvent("automation_run_started", `开始自动每日沉淀：${runDate}`);
    const result = await runDailyWorkflow(runDate, runIdPrefix);
    pushEvent("automation_run_completed", `自动每日沉淀完成：${runDate}`);
    const automationState = await getAutomationState();
    if (automationState.settings.notify_on_complete) {
      showNotification("每日沉淀完成", `已完成 ${runDate} 的自动沉淀。`);
    }
    return result;
  } catch (error) {
    const message = toErrorMessage(error);
    await writeAutomationFailureRun(runDate, `${runIdPrefix}_extract_failed`, message);
    pushEvent("automation_run_failed", message);
    showNotification("每日沉淀失败", message);
    throw error;
  } finally {
    automationRunning = false;
    lastAutomationDecision = {
      action: "completed_check",
      run_date: runDate,
      reason,
      attempt_count: 0
    };
  }
}

async function runDailyWorkflow(runDate, runIdPrefix, options = {}) {
  const activeSourceApp = options.sourceApp ?? state.sourceApp;
  ensureSourceEnabled(activeSourceApp);
  const importArgs = [
    "--source-app",
    activeSourceApp,
    "--vault-root",
    state.vaultRoot
  ];
  if (options.uiManualImport) {
    importArgs.push("--default-sensitivity-missing", "personal");
    importArgs.push("--skip-pending-atoms");
    if (options.copiedRawPaths?.length) {
      for (const rawPath of options.copiedRawPaths) {
        importArgs.push("--only-raw-path", rawPath);
      }
    }
  }
  const extractArgs = [
    "--source-app",
    activeSourceApp,
    "--provider",
    state.aiProvider,
    "--allow-ai",
    "--vault-root",
    state.vaultRoot
  ];
  if (runDate && runIdPrefix) {
    importArgs.push("--run-date", runDate, "--run-id", `${runIdPrefix}_import`);
    extractArgs.push("--run-date", runDate, "--run-id", `${runIdPrefix}_extract`);
  }

  pipelineSubstep = "normalizing";
  const importResult = await runScript("scripts/run-manual-import-normalization.ts", importArgs);
  if (!importResult.ok) {
    pushEvent("daily_run", importResult.stderr);
    throw new Error(importResult.stderr || "导入失败，已停止每日运行。");
  }

  const importSummary = parseScriptStdout(importResult);
  if (options.uiManualImport && importSummary?.normalized_record_ids?.length) {
    for (const recordId of importSummary.normalized_record_ids) {
      extractArgs.push("--record-id", recordId);
    }
  }

  if (state.aiProvider === "openai-compatible") {
    await loadSecureCredentialIntoEnv();
  }

  pipelineSubstep = "extracting";
  const extractResult = await runScript("scripts/extract-knowledge-atoms.ts", extractArgs);
  if (!extractResult.ok) {
    pushEvent("daily_run", extractResult.stderr);
    throw new Error(extractResult.stderr || "知识提炼失败。");
  }

  return { importResult, extractResult };
}

async function loadSecureCredentialIntoEnv() {
  const result = await runScript("scripts/privacy-security.ts", ["load-credential", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取本地加密 API Key 失败。");
  }
  const credential = JSON.parse(result.stdout);
  if (!credential?.api_key) {
    throw new Error("未配置本地加密 API Key。");
  }
  process.env.AI_KB_OPENAI_API_KEY = credential.api_key;
  if (credential.base_url) process.env.AI_KB_OPENAI_BASE_URL = credential.base_url;
  if (credential.model) process.env.AI_KB_OPENAI_MODEL = credential.model;
  state.apiKeyConfigured = true;
}

async function writeAutomationFailureRun(runDate, runId, message) {
  const now = new Date().toISOString();
  const dailyRun = {
    schema_version: "daily_run.v1",
    run_id: runId,
    run_date: runDate,
    status: "failed",
    started_at: now,
    finished_at: now,
    source_apps: [state.sourceApp],
    imported_raw_paths: [],
    normalized_record_ids: [],
    generated_atom_ids: [],
    errors: [{
      code: "automation_run_failed",
      message,
      source_app: state.sourceApp
    }],
    created_at: now,
    updated_at: now
  };
  const filePath = path.join(state.vaultRoot, "data/daily_runs", `${runId}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(dailyRun, null, 2)}\n`, "utf8");
}

async function writeAutomationCancelledRun(runDate, runId) {
  const now = new Date().toISOString();
  const dailyRun = {
    schema_version: "daily_run.v1",
    run_id: runId,
    run_date: runDate,
    status: "cancelled",
    started_at: now,
    finished_at: now,
    source_apps: [state.sourceApp],
    imported_raw_paths: [],
    normalized_record_ids: [],
    generated_atom_ids: [],
    errors: [],
    created_at: now,
    updated_at: now
  };
  const filePath = path.join(state.vaultRoot, "data/daily_runs", `${runId}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(dailyRun, null, 2)}\n`, "utf8");
}

function getIdleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

function showNotification(title, body) {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({ title, body }).show();
}

function applyEnabledConnectorDefaults() {
  const next = ensureEnabledConnectorsDefaults(state.enabledConnectors, sourceApps, state.sourceApp);
  state.enabledConnectors = next.enabledConnectors;
  state.sourceApp = next.sourceApp;
}

function isSourceEnabled(sourceApp) {
  return Boolean(state.enabledConnectors[sourceApp]);
}

function ensureSourceEnabled(sourceApp) {
  applyEnabledConnectorDefaults();
  assertImportSourceEnabled(sourceApp, state.enabledConnectors);
}

async function listLogs() {
  const logsDir = path.join(state.vaultRoot, "logs");
  try {
    const files = (await readdir(logsDir)).filter((file) => file.endsWith(".jsonl")).sort().slice(-5);
    const events = [];
    for (const file of files) {
      const content = await readFile(path.join(logsDir, file), "utf8");
      for (const line of content.split("\n")) {
        if (line.trim()) {
          events.push(JSON.parse(line));
        }
      }
    }
    return events.slice(-80).reverse();
  } catch {
    return [];
  }
}

function getNormalizedRecordsByIds(recordIds) {
  if (recordIds.length === 0) {
    return [];
  }

  const Database = require("better-sqlite3");
  const db = new Database(path.join(state.vaultRoot, "data/runtime/normalized-records.sqlite"), { fileMustExist: true });
  try {
    const placeholders = recordIds.map((_, index) => `@record_id_${index}`).join(", ");
    const params = {};
    recordIds.forEach((recordId, index) => {
      params[`record_id_${index}`] = recordId;
    });
    const rows = db.prepare(`
      SELECT
        record_id,
        source_app,
        source_type,
        conversation_id,
        turn_index,
        message_time,
        project,
        topic,
        user_message,
        ai_message,
        raw_path,
        raw_archive_path,
        raw_checksum,
        sensitivity,
        can_enter_personal_kb
      FROM normalized_records
      WHERE record_id IN (${placeholders})
      ORDER BY message_time ASC, turn_index ASC
    `).all(params);
    return rows.map((row) => ({
      ...row,
      can_enter_personal_kb: Boolean(row.can_enter_personal_kb)
    }));
  } finally {
    db.close();
  }
}

async function ensureSessionConfigLoaded() {
  if (sessionConfigLoaded) {
    return;
  }

  sessionConfigLoaded = true;
  applyEnabledConnectorDefaults();
  const configPath = path.join(state.vaultRoot, SESSION_CONFIG_PATH);
  let savedConfig = null;
  try {
    savedConfig = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    savedConfig = null;
  }

  const privacy = await getPrivacyState();
  const credentialSaved = privacy.secure_credentials.openai_compatible_saved;

  if (savedConfig?.enabled_connectors && typeof savedConfig.enabled_connectors === "object") {
    for (const sourceApp of sourceApps) {
      if (typeof savedConfig.enabled_connectors[sourceApp] === "boolean") {
        state.enabledConnectors[sourceApp] = savedConfig.enabled_connectors[sourceApp];
      }
    }
    applyEnabledConnectorDefaults();
  }

  if (savedConfig?.source_app && isSourceEnabled(savedConfig.source_app)) {
    state.sourceApp = savedConfig.source_app;
  }

  if (savedConfig?.ai_provider === "openai-compatible" || savedConfig?.ai_provider === "fixture") {
    state.aiProvider = savedConfig.ai_provider;
  } else if (credentialSaved) {
    // 已保存 API Key 时默认启用真实 AI，避免重启后仍停留在测试模式
    state.aiProvider = "openai-compatible";
  }

  if (savedConfig?.ai_provider_preset) {
    state.aiProviderPreset = savedConfig.ai_provider_preset;
  } else if (state.aiProvider === "fixture") {
    state.aiProviderPreset = "fixture";
  }

  if (savedConfig?.base_url) {
    state.aiBaseUrl = savedConfig.base_url;
    process.env.AI_KB_OPENAI_BASE_URL = savedConfig.base_url;
  }
  if (savedConfig?.model) {
    state.aiModel = savedConfig.model;
    process.env.AI_KB_OPENAI_MODEL = savedConfig.model;
  }

  if (state.aiProvider === "openai-compatible" && credentialSaved) {
    try {
      await loadSecureCredentialIntoEnv();
    } catch {
      // 凭据读取失败时保留当前 provider，由后续运行报错提示
    }
  }
}

async function saveSessionConfig() {
  const configPath = path.join(state.vaultRoot, SESSION_CONFIG_PATH);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({
    schema_version: "desktop_session.v1",
    source_app: state.sourceApp,
    ai_provider: state.aiProvider,
    ai_provider_preset: state.aiProviderPreset,
    base_url: state.aiBaseUrl,
    model: state.aiModel,
    enabled_connectors: state.enabledConnectors,
    updated_at: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
}

function resetVaultSessionState() {
  state.sourceApp = "codex";
  state.aiProvider = "fixture";
  state.aiProviderPreset = "fixture";
  state.aiBaseUrl = "";
  state.aiModel = "";
  state.apiKeyConfigured = false;
  state.enabledConnectors = {
    codex: true,
    cursor: true,
    deepseek: true,
    doubao: false,
    workbuddy: false
  };
  sessionConfigLoaded = false;
  pipelinePhase = "idle";
  pipelineSubstep = null;
  pipelineError = null;
  lastPipelineRetry = null;
  delete process.env.AI_KB_OPENAI_API_KEY;
  delete process.env.AI_KB_OPENAI_BASE_URL;
  delete process.env.AI_KB_OPENAI_MODEL;
}

async function updateStoredCredentialMetadata(baseUrl, model) {
  const result = await runScript("scripts/privacy-security.ts", ["load-credential", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    return;
  }
  const credential = JSON.parse(result.stdout);
  if (!credential?.api_key) {
    return;
  }
  const credentialResult = await runScript("scripts/privacy-security.ts", ["save-credential", "--vault-root", state.vaultRoot], JSON.stringify({
    service: "openai-compatible",
    api_key: credential.api_key,
    base_url: baseUrl,
    model
  }));
  if (!credentialResult.ok) {
    throw new Error(credentialResult.stderr || "更新 API 配置元数据失败。");
  }
  process.env.AI_KB_OPENAI_API_KEY = credential.api_key;
}

function getPipelineState() {
  return {
    phase: pipelinePhase,
    substep: pipelineSubstep,
    label: pipelinePhaseLabel(pipelinePhase, pipelineSubstep),
    error: pipelineError,
    can_retry: Boolean(pipelineError && lastPipelineRetry),
    updated_at: new Date().toISOString()
  };
}

function pipelinePhaseLabel(phase, substep) {
  if (substep === "copying") {
    return "复制中";
  }
  if (substep === "normalizing") {
    return "标准化中";
  }
  if (substep === "extracting") {
    return "AI 提炼中";
  }

  const labels = {
    idle: "空闲",
    importing: "正在导入",
    processing: "正在处理",
    waiting_review: "等待审查",
    done: "已完成",
    failed: "处理失败"
  };
  return labels[phase] ?? "空闲";
}

function pushEvent(type, message) {
  state.events.unshift({
    event_id: `ui_${Date.now()}`,
    event_type: type,
    message,
    created_at: new Date().toISOString()
  });
  state.events = state.events.slice(0, 40);
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseScriptStdout(result) {
  if (!result?.stdout?.trim()) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function buildDailyRunResult(workflowResult) {
  const { importResult, extractResult } = workflowResult;
  const atoms = await listAtoms();
  const pendingCount = atoms.filter((item) => item.atom.review_status === "pending").length;
  const importSummary = parseScriptStdout(importResult);
  const extractSummary = parseScriptStdout(extractResult);
  return {
    importResult,
    extractResult,
    pending_atom_count: pendingCount,
    normalized_record_count: importSummary?.normalized_record_count ?? 0,
    generated_atom_count: Math.max(
      importSummary?.generated_atom_count ?? 0,
      extractSummary?.generated_atom_count ?? 0
    ),
    pipeline: getPipelineState()
  };
}
