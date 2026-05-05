import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TanStack / Vite 预览或 Worker 里 `process.cwd()` 可能为 `/`，若直接用 cwd 拼 `data/` 会变成 `/data`。
 * 优先读环境变量（Electron 子进程、脚本注入），否则从本模块路径向上查找 `package.json`。
 */
export function resolveProjectRoot(): string {
  const fromEnv = process.env.MPG_PROJECT_ROOT ?? process.env.INIT_CWD;
  if (fromEnv) {
    const resolved = path.resolve(fromEnv.trim());
    if (existsSync(path.join(resolved, "package.json"))) return resolved;
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 20; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}
