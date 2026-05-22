/**
 * TanStack Start / Vite 7 通常直接产出 `dist/server/server.js`；
 * 旧版曾产出 `index.js`，需复制为 `server.js` 以匹配 `configurePreviewServer` 与 Electron 预览入口。
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(webRoot, "dist", "server", "index.js");
const serverPath = path.join(webRoot, "dist", "server", "server.js");

if (existsSync(serverPath) && !existsSync(indexPath)) {
  console.log(
    "[ensure-server-preview-entry] 已存在 dist/server/server.js（当前构建链直接产出），跳过复制",
  );
  process.exit(0);
}

if (existsSync(indexPath)) {
  copyFileSync(indexPath, serverPath);
  console.log(
    "[ensure-server-preview-entry] 已从 dist/server/index.js 写入 dist/server/server.js（vite preview / Electron）",
  );
  process.exit(0);
}

console.error(
  "[ensure-server-preview-entry] 未找到 dist/server/server.js 或 dist/server/index.js，请先成功执行 vite build",
);
process.exit(1);
