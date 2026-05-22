#!/usr/bin/env node
/**
 * 删除已废弃的 Q24 专规垫片（勿提交）。
 * 用法：node apps/web/scripts/remove-legacy-q24-shim.mjs
 */
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "src/lib/importedExamQ24PaperAlignment.shared.ts"),
  path.join(root, "src/lib/legacyImportRepairAliases.ts"),
];

for (const p of targets) {
  try {
    await unlink(p);
    console.log("removed:", path.relative(root, p));
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      console.log("absent (ok):", path.relative(root, p));
    } else {
      throw e;
    }
  }
}

console.log("通用模块: @/lib/importParentQuestionPaperAlignment.shared");
