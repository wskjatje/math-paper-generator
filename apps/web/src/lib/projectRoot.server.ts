import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * TanStack / Vite 预览或 Worker 里 `process.cwd()` 可能为 `/`，若直接用 cwd 拼 `data/` 会变成 `/data`。
 * 优先读环境变量（Electron 子进程、脚本注入）；否则向上查找**仓库根**（同时含 `package.json` 与 `schemas/v1`），
 * 以支持 `apps/web` 子包与根目录的 `data/`、`supabase/` 并存。
 */
function isMonorepoRoot(dir: string): boolean {
  return existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "schemas", "v1"));
}

export function resolveProjectRoot(): string {
  /** npm 在 workspace 子目录执行时 `INIT_CWD` 常为 `apps/web`，不能仅凭 package.json 当作 monorepo 根（会误拼 `sql/`、`schemas/`）。 */
  const fromEnv = process.env.MPG_PROJECT_ROOT ?? process.env.INIT_CWD;
  if (fromEnv?.trim()) {
    let dir = path.resolve(fromEnv.trim());
    for (let i = 0; i < 25; i++) {
      if (isMonorepoRoot(dir)) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 25; i++) {
    if (isMonorepoRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}
