#!/usr/bin/env node
/**
 * 确保本机 Docker 守护进程可用：
 * - 已就绪：立即退出 0
 * - macOS：若未就绪则尝试启动 Docker Desktop 并轮询等待（最多约 3 分钟）
 * - 其他系统：仅检测，不自动启动 GUI
 */
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

function dockerInfoOk() {
  const r = spawnSync("docker", ["info"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
  });
  return r.status === 0;
}

function openDockerDesktopMac() {
  spawnSync("open", ["-a", "Docker"], { stdio: "ignore" });
}

const maxWaitMs = 180_000;
const pollMs = 1500;

async function main() {
  if (process.env.SKIP_DOCKER_ENSURE === "1") {
    process.exit(0);
  }

  if (dockerInfoOk()) {
    process.exit(0);
  }

  const platform = process.platform;
  if (platform === "darwin") {
    console.error("[ensure-docker] Docker 未就绪，正在启动 Docker Desktop…");
    openDockerDesktopMac();
  } else {
    console.error("[ensure-docker] Docker 未就绪。请先手动启动 Docker（本脚本在非 macOS 上不会自动启动 GUI）。");
    process.exit(1);
  }

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (dockerInfoOk()) {
      console.error("[ensure-docker] Docker 已就绪。");
      process.exit(0);
    }
    await delay(pollMs);
  }

  console.error(
    `[ensure-docker] 等待超时（${maxWaitMs / 1000}s）。请在 Docker Desktop 中查看是否报错，或在 Docker Desktop → Settings → General 勾选「登录计算机时启动 Docker Desktop」。`,
  );
  process.exit(1);
}

main();
