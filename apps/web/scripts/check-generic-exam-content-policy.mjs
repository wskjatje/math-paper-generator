#!/usr/bin/env node
/**
 * 对照 docs/governance/generic-exam-content-policy.md 的轻量自检（grep 级）。
 * 扫描 apps/web/src/lib 与 apps/web/scripts（跳过 *.test.ts）；失败 exit 1。
 *
 * 用法：
 *   node apps/web/scripts/check-generic-exam-content-policy.mjs
 *   npm run governance:generic-exam-content -w @zhixue/web
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const policyPath = path.resolve(webRoot, "../../docs/governance/generic-exam-content-policy.md");

const SCAN_ROOTS = [
  path.join(webRoot, "src/lib"),
  path.join(webRoot, "scripts"),
];

const CORPUS_ROOT = path.join(webRoot, "tests/fixtures/import-pipeline/corpus");

/** 行内豁免：紧挨上一行或同行注释含此标记 */
const ALLOW_TAG = "@generic-exam-policy-allow";

const LINE_RULES = [
  {
    id: "exam-id-slug",
    re: /\b(q24|Q24)\b/,
    hint: "题号/卷 slug（q24）；改用拓扑或标签驱动，或迁入 data 词典",
  },
  {
    id: "region-exam-name",
    re: /上海卷|和平区/,
    hint: "地区/卷面专名；迁入可配置层",
  },
  {
    id: "q24-url-slug",
    re: /p\d+-q24|[-_/]q24[-_/]/i,
    hint: "URL 中含题 24 专号 slug；改用 p0-图① / opt-A 等通用片段",
  },
  {
    id: "legacy-q24-module",
    re: /importedExamQ24|q24Geometry|legacyImportRepairAliases|apply-imported-exam-q24/i,
    hint: "已废弃的 Q24 专规模块/脚本名",
  },
  {
    id: "fixed-figure-pair",
    re: /\[\s*['"`][^'"`]*图①[^'"`]*['"`]\s*,\s*['"`][^'"`]*图②/,
    hint: "写死「图①+图②」URL 数组；改由题干/图池推导",
  },
];

const CORPUS_DIR_RULE = {
  re: /q24|shanghai-q24/i,
  hint: "corpus 目录名勿含题号；用拓扑名（如 parent-question-double-figure）",
};

/** 文件名（basename）禁止含题号/卷专名或已废弃 Q24 垫片 */
const FORBIDDEN_BASENAME_RULES = [
  { id: "basename-q24", re: /q24/i, hint: "文件名勿含 q24；改用拓扑/结构命名" },
  {
    id: "basename-legacy-q24-module",
    re: /importedExamQ24|apply-imported-exam-q24|q24Geometry|legacyImportRepairAliases/i,
    hint: "删除 Q24 专规文件；通用逻辑在 importParentQuestionPaperAlignment.shared",
  },
  { id: "basename-region-exam", re: /和平区|上海卷/i, hint: "文件名勿含地区/卷专名" },
];

async function* walkFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      yield* walkFiles(full);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js)$/.test(ent.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(ent.name)) continue;
    if (ent.name === "check-generic-exam-content-policy.mjs") continue;
    yield full;
  }
}

function lineAllowed(lines, index) {
  const line = lines[index] ?? "";
  if (line.includes(ALLOW_TAG)) return true;
  const prev = lines[index - 1] ?? "";
  if (prev.includes(ALLOW_TAG)) return true;
  return false;
}

async function scanFile(filePath) {
  const rel = path.relative(webRoot, filePath).replace(/\\/g, "/");
  const text = await readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    if (lineAllowed(lines, i)) continue;
    const line = lines[i];
    for (const rule of LINE_RULES) {
      if (rule.re.test(line)) {
        hits.push({ rule: rule.id, line: i + 1, hint: rule.hint, sample: line.trim().slice(0, 120) });
      }
    }
  }
  return hits.length ? { rel, hits } : null;
}

async function scanForbiddenBasenames(filePath) {
  const rel = path.relative(webRoot, filePath).replace(/\\/g, "/");
  const base = path.basename(filePath);
  if (base === "check-generic-exam-content-policy.mjs") return null;
  const hits = [];
  for (const rule of FORBIDDEN_BASENAME_RULES) {
    if (rule.re.test(base)) {
      hits.push({ rule: rule.id, line: 0, hint: rule.hint, sample: base });
    }
  }
  return hits.length ? { rel, hits } : null;
}

async function scanCorpusDirs() {
  const hits = [];
  let entries;
  try {
    entries = await readdir(CORPUS_ROOT, { withFileTypes: true });
  } catch {
    return hits;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (CORPUS_DIR_RULE.re.test(ent.name)) {
      hits.push({
        rel: `tests/fixtures/import-pipeline/corpus/${ent.name}/`,
        hits: [{ rule: "corpus-dir-name", line: 0, hint: CORPUS_DIR_RULE.hint, sample: ent.name }],
      });
    }
  }
  return hits;
}

async function main() {
  const violations = [];

  for (const root of SCAN_ROOTS) {
    for await (const file of walkFiles(root)) {
      const v = await scanFile(file);
      if (v) violations.push(v);
      const fb = await scanForbiddenBasenames(file);
      if (fb) violations.push(fb);
    }
  }
  violations.push(...(await scanCorpusDirs()));

  if (violations.length === 0) {
    console.log("generic-exam-content-policy: OK (no violations in src/lib, scripts, corpus dirs)");
    console.log(`policy: ${path.relative(process.cwd(), policyPath)}`);
    return;
  }

  console.error("generic-exam-content-policy: FAILED\n");
  console.error(`See: ${policyPath}\n`);
  for (const { rel, hits } of violations) {
    console.error(`  ${rel}`);
    for (const h of hits) {
      const loc = h.line > 0 ? `:${h.line}` : "";
      console.error(`    [${h.rule}]${loc} ${h.hint}`);
      if (h.sample) console.error(`      ${h.sample}`);
    }
    console.error("");
  }
  console.error(`Exempt one line: // ${ALLOW_TAG}: <reason>`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
