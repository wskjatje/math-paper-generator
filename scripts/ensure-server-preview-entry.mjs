/**
 * TanStack Start 的 `configurePreviewServer` 会按 server 入口名解析为 `dist/server/server.js`，
 * 而当前构建输出为 `index.js`，导致 `vite preview` 与 Electron 内嵌预览报 500。
 * 在构建后复制一份，使路径与插件一致（内容与 `index.js` 相同，相对 import 仍有效）。
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "dist", "server", "index.js");
const serverPath = path.join(root, "dist", "server", "server.js");

if (!existsSync(indexPath)) {
  console.warn("[ensure-server-preview-entry] 跳过：未找到 dist/server/index.js");
  process.exit(0);
}

copyFileSync(indexPath, serverPath);
console.log("[ensure-server-preview-entry] 已写入 dist/server/server.js（供 vite preview / Electron）");
