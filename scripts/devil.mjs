#!/usr/bin/env node
/**
 * 一键开发：soft-ensure 听力档案（不启动旁路），再启动 apps/web。
 * 用法：npm run devil
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ensureJs = path.join(root, "scripts", "listening-tts-ensure.mjs");
const webPkg = path.join(root, "apps", "web", "package.json");

if (!existsSync(webPkg)) {
  console.error("未找到 apps/web，请在 monorepo 根目录执行 npm run devil");
  process.exit(1);
}

const forceTts =
  process.env.MPG_LISTENING_TTS_AUTOSTART === "1" || process.argv.includes("--with-tts");

if (existsSync(ensureJs)) {
  console.log(
    forceTts
      ? "[devil] 听力档案 ensure + 旁路…"
      : "[devil] 听力档案 soft-ensure（不起旁路）…",
  );
  const ensureArgs = forceTts ? [ensureJs, "--soft", "--start"] : [ensureJs, "--soft"];
  const ensure = spawnSync(process.execPath, ensureArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (ensure.status !== 0 && ensure.status != null) {
    console.warn(`[devil] ensure 退出码 ${ensure.status}（继续启动前端）`);
  }
}

console.log("[devil] 启动 @zhixue/web…");
const child = spawn("npm", ["run", "dev", "-w", "@zhixue/web"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

function shutdown(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 0);
});
