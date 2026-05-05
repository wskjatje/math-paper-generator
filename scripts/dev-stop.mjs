#!/usr/bin/env node
/**
 * 结束由 scripts/dev-background.mjs 写入 .dev-server.pid 的进程。
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pidPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".dev-server.pid");

if (!existsSync(pidPath)) {
  console.error("未找到 .dev-server.pid（可能没有执行过 npm run dev:bg）");
  process.exit(1);
}

const pid = Number(readFileSync(pidPath, "utf8").trim());
if (!Number.isFinite(pid) || pid <= 0) {
  console.error("无效的 PID");
  process.exit(1);
}

try {
  process.kill(pid, "SIGTERM");
  console.log(`已发送 SIGTERM → PID ${pid}`);
} catch (e) {
  console.error("结束进程失败（可能已退出）:", e instanceof Error ? e.message : e);
}

try {
  unlinkSync(pidPath);
} catch {
  /* ignore */
}
