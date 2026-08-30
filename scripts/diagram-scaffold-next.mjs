#!/usr/bin/env node
/**
 * 从 data/diagram-packs/registry.json 取下一个 planned Pack，生成骨架文件。
 * 不发明学科规则；仅脚手架。数学达标后再用。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data/diagram-packs/registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

const next = (registry.packs || []).find((p) => p.status === "planned");
if (!next) {
  console.log("没有 status=planned 的 Pack。");
  process.exit(0);
}

const slug = String(next.id).replace(/\./g, "_");
const outDir = path.join(root, "src/lib/diagram/packs");
const outFile = path.join(outDir, `${slug}.shared.ts`);
if (existsSync(outFile)) {
  console.error(`已存在：${outFile}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const stub = `/**
 * Pack stub: ${next.id}（${next.subject}）
 * 状态：scaffolded — 实现 schema / 校验 / 渲染前勿标为 active。
 * 见 docs/diagram-system.md
 */

export const PACK_ID = "${next.id}" as const;

export function parseScene(_raw: unknown): null {
  return null;
}

export function validateScene(_scene: unknown): { ok: false; errors: string[] } {
  return { ok: false, errors: ["${next.id} 尚未实现"] };
}

export function renderSceneSvg(_scene: unknown): { svg: string; width: number; height: number } {
  throw new Error("${next.id} 尚未实现");
}
`;

writeFileSync(outFile, stub, "utf8");

next.status = "scaffolded";
next.module = path.relative(root, outFile).replace(/\\/g, "/");
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

console.log(`已脚手架：${next.id}`);
console.log(`  文件：${outFile}`);
console.log(`  注册表已标 scaffolded。实现并通过标定后再改为 active。`);
