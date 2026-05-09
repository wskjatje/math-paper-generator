/**
 * OCR 修复词典：字面或正则替换规则（顺序按 priority 降序）。
 * 纯函数可在服务端应用；规则列表来自数据库或 data 文件，不写死在前端。
 */

export type OcrRepairLexiconRule = {
  id: string;
  match_kind: "literal" | "regex";
  pattern: string;
  replacement: string;
  priority: number;
};

/** 将服务端加载的规则应用到正文（同一规则可重复执行直至稳定，由调用方决定调用次数） */
export function applyOcrRepairLexiconRules(text: string, rules: OcrRepairLexiconRule[]): string {
  if (!rules.length) return text;
  const sorted = [...rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  let out = text;
  for (const r of sorted) {
    if (!r.pattern) continue;
    try {
      if (r.match_kind === "literal") {
        out = out.split(r.pattern).join(r.replacement);
      } else {
        const re = new RegExp(r.pattern, "g");
        out = out.replace(re, r.replacement);
      }
    } catch {
      /* 跳过无效正则 */
    }
  }
  return out;
}

/** 含附图 Markdown 或导入路径的行不参与词典逐行替换，避免污染 OCR 规则库 */
function lineTouchesFigureOrImportArtifact(line: string): boolean {
  if (line.includes("/import-figures/")) return true;
  if (line.includes("/offline-import/")) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(line)) return true;
  return false;
}

/** 按行对比生成字面替换条目（用于导入对话框「记入词典」） */
export function diffPlaintextLinesToLiteralRules(
  before: string,
  after: string,
  opts?: { minLen?: number; maxRules?: number; requireSameLineCount?: boolean },
): Array<{ pattern: string; replacement: string }> {
  const minLen = opts?.minLen ?? 8;
  const maxRules = opts?.maxRules ?? 24;
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  if (opts?.requireSameLineCount && a.length !== b.length) {
    return [];
  }
  const out: Array<{ pattern: string; replacement: string }> = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n && out.length < maxRules; i++) {
    const L = a[i] ?? "";
    const R = b[i] ?? "";
    if (L === R) continue;
    if (lineTouchesFigureOrImportArtifact(L) || lineTouchesFigureOrImportArtifact(R)) continue;
    const lt = L.trim();
    const rt = R.trim();
    if (lt.length < minLen || rt.length < minLen) continue;
    if (lt.length > 2000 || rt.length > 2000) continue;
    out.push({ pattern: L, replacement: R });
  }
  return dedupeLiteralRules(out);
}

function dedupeLiteralRules(
  rules: Array<{ pattern: string; replacement: string }>,
): Array<{ pattern: string; replacement: string }> {
  const map = new Map<string, string>();
  for (const r of rules) {
    map.set(r.pattern, r.replacement);
  }
  return [...map.entries()].map(([pattern, replacement]) => ({ pattern, replacement }));
}
