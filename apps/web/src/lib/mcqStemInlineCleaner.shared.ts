/**
 * 选择题：结构化 options 已就绪时，剥离题干末尾误并入的「行内 (A)(B)(C)(D)」OCR 残留，
 * 避免与下方 A. B. C. D. 选项块重复展示。
 */

/** OCR 常把 (B) 扫成 (BY */
function fixByTypoInOptionRun(s: string): string {
  return s.replace(/\(BY\s+/gi, "(B) ").replace(/（\s*BY\s*）/gi, "（B）");
}

/**
 * 从题干末尾迭代去掉连续的 `（A）` / `(A)` 片段（含半角全角括号、字母间空格）。
 */
export function stripTrailingParenLetterRunFromStem(stem: string): string {
  let s = String(stem ?? "").replace(/\r\n/g, "\n");
  s = fixByTypoInOptionRun(s);
  for (let i = 0; i < 24; i++) {
    const before = s;
    s = s
      .replace(/(?:\s*[（(]\s*[A-Ea-eＡ-Ｅ]\s*[）)])+\s*$/u, "")
      .replace(/\s*第[（(]?\d{1,2}[）)]?\s*题\s*$/u, "")
      .trimEnd();
    if (s === before) break;
  }
  return s.trim();
}

/**
 * 「应为 / 是 / 为」后紧跟一整段仅由 (A)…(D) 及短乱码构成的 OCR 尾巴时整段删除。
 */
export function stripTrailingInlineMcqEchoAfterPredicate(stem: string): string {
  let s = String(stem ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  s = fixByTypoInOptionRun(s);
  /** 避免单字「为」误切「表示为 …」等非选项尾巴；仅保留句末常见的谓词 +「应为」。 */
  const predicates = ["应为", "是"];
  for (const pred of predicates) {
    const idx = s.lastIndexOf(pred);
    if (idx < 0) continue;
    const tail = s.slice(idx + pred.length);
    if (tail.length < 8 || tail.length > 320) continue;
    const parenHits = tail.match(/[（(]\s*[A-Da-dＡ-Ｄ]\s*[）)]/g) ?? [];
    if (parenHits.length < 3) continue;
    const nonWs = tail.replace(/\s/g, "");
    const density = nonWs.length > 0 ? parenHits.length / nonWs.length : 0;
    // 典型四选项行内 OCR：A–D 齐全且紧跟在谓词后；或括号标记在尾巴中占比足够高
    const looksLikeFourInlineMcq = parenHits.length >= 4 && /^\s*[（(]\s*A\s*[）)]/i.test(tail);
    if (looksLikeFourInlineMcq || density > 0.065) {
      s = s.slice(0, idx + pred.length).trimEnd();
      break;
    }
  }
  return stripTrailingParenLetterRunFromStem(s);
}

/** 结构化选择题题干收尾清洗（与 options 是否存在无关，幂等）。 */
export function cleanMcqStemInlineOptionResidue(stem: string): string {
  return stripTrailingInlineMcqEchoAfterPredicate(stripTrailingParenLetterRunFromStem(stem));
}

/**
 * 题干内联/块级 A. / B． 选项区（至少 4 个不同字母）→ 拆 stem + options。
 * 与生成/入库侧 extractMcqOptionsInline 同规则，供卷面展示去重。
 */
export function extractLetterDotOptionsBlock(
  content: string,
): { stem: string; options: string[] } | undefined {
  const s = fixByTypoInOptionRun(String(content ?? "")).replace(/\r\n/g, "\n");
  const re = /(?:^|[\n\s])([A-Za-z])([.．、。:：)）])\s*/g;
  const hits: { start: number; endLabel: number; L: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const L = m[1]!.toUpperCase();
    if (!/^[A-Z]$/.test(L)) continue;
    hits.push({ start: m.index, endLabel: m.index + m[0].length, L });
  }
  if (hits.length < 4) return undefined;
  const options: string[] = [];
  const used = new Set<string>();
  for (let h = 0; h < hits.length; h++) {
    const L = hits[h]!.L;
    if (used.has(L)) continue;
    used.add(L);
    const t0 = hits[h]!.endLabel;
    const t1 = h + 1 < hits.length ? hits[h + 1]!.start : s.length;
    const text = s.slice(t0, t1).trim().replace(/\s+/g, " ");
    options.push(`${L}. ${text}`);
    if (options.length >= 8) break;
  }
  if (options.length < 4) return undefined;
  const stem = hits[0] ? s.slice(0, hits[0]!.start).trim() : "";
  return { stem: stem || s, options };
}

/** 结构化 options 已存在时，剥离题干末尾 A.…D. 块，避免与选项列表重复展示。 */
export function stripTrailingLetterDotOptionsBlock(stem: string): string {
  const extracted = extractLetterDotOptionsBlock(stem);
  if (!extracted || extracted.options.length < 4) return stem;
  const stripped = extracted.stem.trim();
  return stripped.length > 0 ? stripped : stem;
}
