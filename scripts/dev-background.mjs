#!/usr/bin/env node
/**
 * 后台启动 `vite dev`，关闭终端后进程仍保留。
 * 日志：dev-server.log；PID：.dev-server.pid
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const logPath = path.join(root, "dev-server.log");
const pidPath = path.join(root, ".dev-server.pid");

const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteCli)) {
  console.error("请先在本目录执行: npm install");
  process.exit(1);
}

const logFd = openSync(logPath, "a");
const child = spawn(process.execPath, [viteCli, "dev"], {
  cwd: root,
  detached: true,
  stdio: ["ignore", logFd, logFd],
  env: process.env,
});
child.unref();
writeFileSync(pidPath, String(child.pid), "utf8");

console.log(`已后台启动开发服务（PID ${child.pid}）`);
console.log(`日志文件: ${logPath}`);
console.log("停止服务: npm run dev:stop");
