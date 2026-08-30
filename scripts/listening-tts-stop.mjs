#!/usr/bin/env node
/**
 * 停止 listening-tts 旁路（.listening-tts.pid）。
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidPath = path.join(root, ".listening-tts.pid");
if (!existsSync(pidPath)) {
  console.log("无 .listening-tts.pid，旁路可能未由 ensure 启动");
  process.exit(0);
}
const pid = Number(readFileSync(pidPath, "utf8").trim());
if (Number.isFinite(pid) && pid > 0) {
  try {
    process.kill(pid, "SIGTERM");
    console.log(`已发送 SIGTERM → PID ${pid}`);
  } catch (e) {
    console.warn(`无法停止 PID ${pid}：${e?.message || e}`);
  }
}
unlinkSync(pidPath);
