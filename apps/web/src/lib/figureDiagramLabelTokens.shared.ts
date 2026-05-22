/**
 * 图注 token 规范化：OCR 常输出 图(1)/图(2)，卷面印刷为 图①/图②。
 * 供 linker、registry labels、裁图 URL 匹配共用（精确别名表，非模糊匹配）。
 */

const CIRCLED_DIGITS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

export function circledDigitFromArabic(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > CIRCLED_DIGITS.length) return null;
  return CIRCLED_DIGITS[n - 1]!;
}

/** 将「图(1)」「图1」「①」等规范为 linker/registry 用的主 token（优先「图①」）。 */
export function canonicalFigureLabelToken(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;

  const circledOnly = /^[①②③④⑤⑥⑦⑧⑨⑩]$/.exec(t);
  if (circledOnly) return `图${circledOnly[0]}`;

  const paren = /^图\s*[\(（]\s*([0-9]{1,2})\s*[\)）]$/.exec(t);
  if (paren?.[1]) {
    const c = circledDigitFromArabic(Number(paren[1]));
    return c ? `图${c}` : null;
  }

  const arabic = /^图\s*([1-9])$/.exec(t);
  if (arabic?.[1]) {
    const c = circledDigitFromArabic(Number(arabic[1]));
    return c ? `图${c}` : null;
  }

  if (/^图[①②③④⑤⑥⑦⑧⑨⑩]$/.test(t)) return t;

  return null;
}

/** 与 registry.labels 做 === 比较时的别名集合（含主 token）。 */
export function expandFigureLabelTokenAliases(token: string): string[] {
  const seen = new Set<string>();
  const push = (s: string | null | undefined) => {
    const x = s?.trim();
    if (!x || seen.has(x)) return;
    seen.add(x);
  };

  const raw = String(token ?? "").trim();
  push(raw);

  const canon = canonicalFigureLabelToken(raw);
  push(canon);

  if (canon?.startsWith("图")) {
    const tail = canon.slice(1);
    push(tail);
  }

  return [...seen];
}

/** 从题干锚点原文抽取可与 registry 匹配的 token 列表。 */
export function extractLinkerTokensFromTextAnchor(anchor: string): string[] {
  const t = String(anchor ?? "");
  const seen = new Set<string>();
  const out: string[] = [];
  const pushCanon = (raw: string) => {
    const c = canonicalFigureLabelToken(raw) ?? raw.trim();
    if (!c || seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };

  for (const m of t.matchAll(/图[①②③④⑤⑥⑦⑧⑨⑩]/gu)) pushCanon(m[0]!);
  for (const m of t.matchAll(/如图[①②③④⑤⑥⑦⑧⑨⑩]/gu)) pushCanon(m[0]!.replace(/^如/, ""));
  for (const m of t.matchAll(/如图\s*[\(（]\s*([0-9]{1,2})\s*[\)）]/g)) {
    pushCanon(`图(${m[1]})`);
  }
  for (const m of t.matchAll(/(?<!如)图\s*[\(（]\s*([0-9]{1,2})\s*[\)）]/g)) {
    pushCanon(`图(${m[1]})`);
  }
  for (const m of t.matchAll(/如图([A-Za-z]{1,20})/g)) {
    const raw = `图${m[1]!}`;
    pushCanon(canonicalFigureLabelToken(raw) ?? raw);
  }
  for (const m of t.matchAll(/(?<!地)(?<!如)图[A-Za-z]{1,20}/g)) {
    const raw = m[0]!;
    pushCanon(canonicalFigureLabelToken(raw) ?? raw);
  }
  for (const m of t.matchAll(/图[1-9]/g)) pushCanon(m[0]!);

  const figEn = /Fig\.?\s*[0-9]+/gi;
  let me: RegExpExecArray | null;
  while ((me = figEn.exec(t)) != null) {
    pushCanon(me[0]!.replace(/\s+/g, ""));
  }

  return out;
}
