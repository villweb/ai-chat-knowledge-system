const { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor } = require("electron");
const { spawn } = require("node:child_process");
const { copyFile, mkdir, readdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const sourceApps = ["codex", "cursor", "deepseek", "doubao", "workbuddy"];
const AUTOMATION_CHECK_MS = 30_000;
const state = {
  vaultRoot: repoRoot,
  sourceApp: "codex",
  aiProvider: "fixture",
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
    void win.loadFile(path.join(repoRoot, "dist/desktop/index.html"));
  }
}

app.whenReady().then(() => {
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
  ipcMain.handle("app:get-state", async () => ({
    ...state,
    automation: await getAutomationState(),
    connectors: await listConnectors(),
    atoms: await listAtoms(),
    logs: await listLogs()
  }));

  ipcMain.handle("vault:choose", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (!result.canceled && result.filePaths[0]) {
      state.vaultRoot = result.filePaths[0];
      pushEvent("vault_selected", `知识库位置已切换：${path.basename(state.vaultRoot)}`);
    }
    return { vaultRoot: state.vaultRoot };
  });

  ipcMain.handle("settings:save-session-config", async (_event, input) => {
    if (input.sourceApp) {
      if (!isSourceEnabled(input.sourceApp)) {
        throw new Error(`连接器未启用，不能设为默认来源：${input.sourceApp}`);
      }
      state.sourceApp = input.sourceApp;
    }
    state.aiProvider = input.aiProvider === "openai-compatible" ? "openai-compatible" : "fixture";
    state.apiKeyConfigured = Boolean(input.apiKey);
    if (input.apiKey) {
      process.env.AI_KB_OPENAI_API_KEY = input.apiKey;
    }
    if (input.baseUrl) {
      process.env.AI_KB_OPENAI_BASE_URL = input.baseUrl;
    }
    if (input.model) {
      process.env.AI_KB_OPENAI_MODEL = input.model;
    }
    pushEvent("settings_saved", "AI 服务配置已保存到当前会话。");
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
    pushEvent("connector_updated", `${connector.display_name} 已${state.enabledConnectors[input.sourceApp] ? "启用" : "停用"}。`);
    return { connectors: await listConnectors(), sourceApp: state.sourceApp };
  });

  ipcMain.handle("import:choose-files", async (_event, sourceApp) => {
    const targetSource = sourceApp || state.sourceApp;
    ensureSourceEnabled(targetSource);
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "AI chat exports", extensions: ["md", "markdown", "txt", "json"] }]
    });
    if (result.canceled) {
      return { copied_file_count: 0 };
    }

    const targetDir = path.join(state.vaultRoot, "raw/imports", targetSource);
    await mkdir(targetDir, { recursive: true });
    for (const file of result.filePaths) {
      await copyFile(file, path.join(targetDir, path.basename(file)));
    }
    pushEvent("manual_import_files", `已导入 ${result.filePaths.length} 个文件。`);
    return { copied_file_count: result.filePaths.length };
  });

  ipcMain.handle("workflow:run-import", async () => {
    ensureSourceEnabled(state.sourceApp);
    const result = await runScript("scripts/run-manual-import-normalization.ts", [
      "--source-app",
      state.sourceApp,
      "--vault-root",
      state.vaultRoot
    ]);
    if (!result.ok) {
      pushEvent("p1_import", result.stderr);
      throw new Error(result.stderr || "导入和标准化失败。");
    }
    pushEvent("p1_import", "导入和标准化完成。");
    return result;
  });

  ipcMain.handle("workflow:run-daily", async () => {
    const { importResult, extractResult } = await runDailyWorkflow();
    pushEvent("daily_run", "每日沉淀完成。");
    return { importResult, extractResult };
  });

  ipcMain.handle("atoms:list", async () => listAtoms());

  ipcMain.handle("atoms:update", async (_event, input) => {
    const result = await runScript("scripts/review-knowledge-atom.ts", ["update", "--vault-root", state.vaultRoot], JSON.stringify(input));
    if (!result.ok) {
      pushEvent("atom_updated", result.stderr);
      throw new Error(result.stderr || "知识状态更新失败。");
    }
    pushEvent("atom_updated", "知识状态已更新。");
    return JSON.parse(result.stdout);
  });

  ipcMain.handle("logs:list", async () => listLogs());

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
    await runAutomationDate(runDate, "confirmed");
    return getAutomationState();
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

    await runAutomationDate(input.run_date, "manual_rerun");
    return getAutomationState();
  });

  ipcMain.handle("automation:list-history", async () => listDailyRunHistory());
}

function runCommand(command, args, stdin) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env },
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
  return runCommand(getNodeBinary(), ["--import", "tsx", path.join(repoRoot, scriptPath), ...args], stdin);
}

function getNodeBinary() {
  return process.env.AI_KB_NODE_BINARY || process.env.npm_node_execpath || "node";
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

async function runDailyWorkflow(runDate, runIdPrefix) {
  ensureSourceEnabled(state.sourceApp);
  const importArgs = [
    "--source-app",
    state.sourceApp,
    "--vault-root",
    state.vaultRoot
  ];
  const extractArgs = [
    "--source-app",
    state.sourceApp,
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

  const importResult = await runScript("scripts/run-manual-import-normalization.ts", importArgs);
  if (!importResult.ok) {
    pushEvent("daily_run", importResult.stderr);
    throw new Error(importResult.stderr || "导入失败，已停止每日运行。");
  }

  const extractResult = await runScript("scripts/extract-knowledge-atoms.ts", extractArgs);
  if (!extractResult.ok) {
    pushEvent("daily_run", extractResult.stderr);
    throw new Error(extractResult.stderr || "知识提炼失败。");
  }

  return { importResult, extractResult };
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

function isSourceEnabled(sourceApp) {
  return Boolean(state.enabledConnectors[sourceApp]);
}

function ensureSourceEnabled(sourceApp) {
  if (!isSourceEnabled(sourceApp)) {
    throw new Error(`连接器未启用，无法读取来源：${sourceApp}`);
  }
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
