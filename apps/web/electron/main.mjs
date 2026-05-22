/**
 * Electron 主进程：在本机启动 `vite preview`，再打开窗口访问本地站点。
 * 开发：在项目根执行 `npm run desktop`（会先 build）。
 * 打包：Mac 下生成 `release/知学试卷-x.x.x.dmg`，双击安装或直接从 .app 启动。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_PORT = 4173;
const PREVIEW_ORIGIN = `http://127.0.0.1:${PREVIEW_PORT}`;

/** `apps/web`：Vite 预览的工作目录（含 dist、node_modules 解析） */
function getWebAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-root");
  }
  return path.join(__dirname, "..");
}

/** 仓库根：`data/`、`schemas/`、`supabase/`；注入 MPG_PROJECT_ROOT 供 SSR 解析 */
function getMonorepoRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-root");
  }
  return path.join(__dirname, "..", "..");
}

function findNodeExecutable() {
  if (process.env.MPG_DESKTOP_NODE && existsSync(process.env.MPG_DESKTOP_NODE)) {
    return process.env.MPG_DESKTOP_NODE;
  }
  return "node";
}

let serverProcess = null;
let mainWindow = null;
let previewReady = false;
let previewStarting = null;

function spawnPreview(webRoot, monorepoRoot) {
  const viteCli = path.join(monorepoRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteCli)) {
    return new Error(
      `未找到 Vite：${viteCli}\n请在仓库根目录执行 npm install（workspaces 悬停依赖）`,
    );
  }
  const distDir = path.join(webRoot, "dist");
  if (!existsSync(distDir)) {
    return new Error("未找到 dist 目录，请先执行：npm run build");
  }

  const node = findNodeExecutable();
  serverProcess = spawn(
    node,
    [viteCli, "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT)],
    {
      cwd: webRoot,
      env: { ...process.env, NODE_ENV: "production", MPG_PROJECT_ROOT: monorepoRoot },
      stdio: "pipe",
    },
  );

  serverProcess.on("error", (err) => {
    console.error("预览进程启动失败:", err);
  });

  return null;
}

function httpPingOnce() {
  return new Promise((resolve) => {
    const req = http.get(PREVIEW_ORIGIN + "/", (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await httpPingOnce()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("本地服务启动超时，请确认端口 " + PREVIEW_PORT + " 未被占用");
}

function stopServer() {
  previewReady = false;
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    serverProcess = null;
  }
}

async function ensurePreviewRunning() {
  if (previewReady) return;
  if (previewStarting) return previewStarting;

  previewStarting = (async () => {
    const err = spawnPreview(getWebAppRoot(), getMonorepoRoot());
    if (err) {
      previewStarting = null;
      throw err;
    }
    try {
      await waitForServer();
      previewReady = true;
    } catch (e) {
      stopServer();
      throw e;
    } finally {
      previewStarting = null;
    }
  })();

  return previewStarting;
}

async function openMainWindow() {
  try {
    await ensurePreviewRunning();
  } catch (e) {
    await dialog.showErrorBox("无法启动本地服务", e instanceof Error ? e.message : String(e));
    app.quit();
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "知学 · 数学试卷生成器",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(PREVIEW_ORIGIN + "/");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  openMainWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopServer();
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServer();
});
