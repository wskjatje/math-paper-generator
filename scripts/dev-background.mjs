#!/usr/bin/env node
/**
 * 后台启动 `vite dev`，关闭终端后进程仍保留。
 * 日志：dev-server.log；PID：.dev-server.pid
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const webRoot = path.join(repoRoot, "apps", "web");
const logPath = path.join(repoRoot, "dev-server.log");
const pidPath = path.join(repoRoot, ".dev-server.pid");

const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteCli)) {
  console.error("请先在本目录执行: npm install");
  process.exit(1);
}

if (existsSync(pidPath)) {
  const existingPid = Number(readFileSync(pidPath, "utf8").trim());
  if (Number.isFinite(existingPid) && existingPid > 0) {
    try {
      // 仅探活，不发送信号
      process.kill(existingPid, 0);
      console.error(`开发服务已在运行（PID ${existingPid}）`);
      console.error("如需重启，请先执行: npm run dev:stop");
      process.exit(1);
    } catch {
      // PID 文件残留，继续启动并覆盖
    }
  }
}

const logFd = openSync(logPath, "a");
const child = spawn(process.execPath, [viteCli, "dev", "--host", "0.0.0.0", "--port", "8080", "--strictPort"], {
  cwd: webRoot,
  detached: true,
  stdio: ["ignore", logFd, logFd],
  env: { ...process.env, MPG_PROJECT_ROOT: repoRoot },
});
child.unref();
writeFileSync(pidPath, String(child.pid), "utf8");

console.log(`已后台启动开发服务（PID ${child.pid}）`);
console.log("访问地址: http://localhost:8080/");
console.log(`日志文件: ${logPath}`);
console.log("停止服务: npm run dev:stop");
