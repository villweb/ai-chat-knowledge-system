const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { copyFile, mkdir, readdir, readFile } = require("node:fs/promises");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const state = {
  vaultRoot: repoRoot,
  sourceApp: "codex",
  aiProvider: "fixture",
  apiKeyConfigured: false,
  events: []
};

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

  ipcMain.handle("import:choose-files", async (_event, sourceApp) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "AI chat exports", extensions: ["md", "markdown", "txt", "json"] }]
    });
    if (result.canceled) {
      return { copied_file_count: 0 };
    }

    const targetDir = path.join(state.vaultRoot, "raw/imports", sourceApp || state.sourceApp);
    await mkdir(targetDir, { recursive: true });
    for (const file of result.filePaths) {
      await copyFile(file, path.join(targetDir, path.basename(file)));
    }
    pushEvent("manual_import_files", `已导入 ${result.filePaths.length} 个文件。`);
    return { copied_file_count: result.filePaths.length };
  });

  ipcMain.handle("workflow:run-import", async () => {
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
    const importResult = await runScript("scripts/run-manual-import-normalization.ts", [
      "--source-app",
      state.sourceApp,
      "--vault-root",
      state.vaultRoot
    ]);
    if (!importResult.ok) {
      pushEvent("daily_run", importResult.stderr);
      throw new Error(importResult.stderr || "导入失败，已停止每日运行。");
    }

    const extractResult = await runScript("scripts/extract-knowledge-atoms.ts", [
      "--source-app",
      state.sourceApp,
      "--provider",
      state.aiProvider,
      "--allow-ai",
      "--vault-root",
      state.vaultRoot
    ]);
    if (!extractResult.ok) {
      pushEvent("daily_run", extractResult.stderr);
      throw new Error(extractResult.stderr || "知识提炼失败。");
    }

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
}

function runCommand(command, args, stdin) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
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
  return runCommand(process.execPath, ["--import", "tsx", path.join(repoRoot, scriptPath), ...args], stdin);
}

async function listAtoms() {
  const result = await runScript("scripts/review-knowledge-atom.ts", ["list", "--vault-root", state.vaultRoot]);
  if (!result.ok) {
    throw new Error(result.stderr || "读取知识列表失败。");
  }
  return JSON.parse(result.stdout);
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
