#!/usr/bin/env node
/**
 * 清理本地开发状态：结束 dev:bg 写入的后台 vite（若有），并删除 Vite 依赖预构建缓存。
 * 与 `dev:stop` 不同：无 PID 文件时正常退出 0，便于作为「干净重启」前置步骤。
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidPath = path.join(root, ".dev-server.pid");
const viteCache = path.join(root, "node_modules", ".vite");

if (existsSync(pidPath)) {
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`已发送 SIGTERM → PID ${pid}`);
    } catch (e) {
      console.log("结束旧进程（可能已退出）:", e instanceof Error ? e.message : e);
    }
  }
  try {
    unlinkSync(pidPath);
  } catch {
    /* ignore */
  }
} else {
  console.log("无 .dev-server.pid，跳过停止后台服务");
}

try {
  await rm(viteCache, { recursive: true, force: true });
  console.log("已清除 node_modules/.vite");
} catch (e) {
  console.log("清除 Vite 缓存跳过:", e instanceof Error ? e.message : e);
}

console.log("完成。可执行 npm run dev 或 npm run dev:bg");
