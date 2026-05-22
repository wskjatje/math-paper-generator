#!/usr/bin/env node
/**
 * 首次在本仓库运行 dev 时执行一次环境检查；通过后写入 .zhixue-env-ok，后续启动跳过。
 * 控制：
 *   SKIP_FIRST_RUN_ENV=1     跳过
 *   npm run dev -- --doctor   强制再跑（需配合 package.json 传参时另用 npm run doctor）
 * 重新检查：删除仓库根目录 .zhixue-env-ok 后再次 npm run dev
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const MARKER = path.join(REPO_ROOT, ".zhixue-env-ok");
const DOCTOR = path.join(__dirname, "check-dev-environment.mjs");

if (process.env.SKIP_FIRST_RUN_ENV === "1") {
  process.exit(0);
}
if (existsSync(MARKER)) {
  process.exit(0);
}

const r = spawnSync(process.execPath, [DOCTOR], {
  stdio: "inherit",
  cwd: REPO_ROOT,
});
const status = typeof r.status === "number" ? r.status : 0;
// 仅在必需项通过时写入标记，避免 Node 未就绪等问题修复后仍跳过检查
if (status === 0) {
  try {
    writeFileSync(
      MARKER,
      `generated ${new Date().toISOString()}\ndelete this file to run env check again on next npm run dev\n`,
      "utf8",
    );
  } catch {
    // 若无法写入（只读目录），不阻断 dev
  }
}
process.exit(status);
