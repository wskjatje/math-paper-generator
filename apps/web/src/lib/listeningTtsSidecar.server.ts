/**
 * 按需拉起听力克隆旁路（不在日常 vite/devil 启动时常驻）。
 * 证据：tools/listening-tts 加载 Torch/Chatterbox 后 RSS/MPS 占用高，发热明显。
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const HEALTH_URL = "http://127.0.0.1:7778/health";

function toolsPaths() {
  const root = resolveProjectRoot();
  return {
    root,
    venvPython: path.join(root, "tools", "listening-tts", ".venv", "bin", "python"),
    serverPy: path.join(root, "tools", "listening-tts", "server.py"),
    pidPath: path.join(root, ".listening-tts.pid"),
    logPath: path.join(root, "listening-tts.log"),
  };
}

async function healthOk(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return Boolean(j?.ok);
  } catch {
    return false;
  }
}

function startDetached(): void {
  const { venvPython, serverPy, pidPath, logPath, root } = toolsPaths();
  if (!existsSync(venvPython) || !existsSync(serverPy)) {
    throw new Error(
      "听力旁路未安装。需要合成时请先执行：npm run listening-tts:install（或 listening-tts:setup）",
    );
  }
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8").trim());
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return;
      } catch {
        /* stale */
      }
    }
  }
  const logFd = openSync(logPath, "a");
  const child = spawn(venvPython, [serverPy], {
    cwd: path.join(root, "tools", "listening-tts"),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      HF_ENDPOINT:
        process.env.MPG_HF_ENDPOINT?.trim() ||
        process.env.HF_ENDPOINT?.trim() ||
        "https://hf-mirror.com",
    },
  });
  child.unref();
  if (child.pid) writeFileSync(pidPath, String(child.pid), "utf8");
}

/**
 * 听力合成前调用：旁路未运行则后台启动并等待 /health。
 * 模型仍在旁路内懒加载；空闲卸载见 server.py。
 */
export async function ensureListeningTtsSidecarRunning(): Promise<void> {
  if (await healthOk()) return;
  startDetached();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await healthOk()) return;
  }
  throw new Error(
    `听力旁路启动超时（见 listening-tts.log）。也可手动：npm run listening-tts:ensure -- --start`,
  );
}
