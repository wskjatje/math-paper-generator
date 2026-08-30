/**
 * AI / 外源 SVG 消毒：只保留安全几何绘图子集，拒绝脚本与超大载荷。
 */

const MAX_SVG_CHARS = 40_000;

/** 从模型输出中抽出单个 <svg>…</svg> */
export function extractSvgMarkup(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const fenced = t.match(/```(?:svg)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? t).trim();
  const m = body.match(/<svg\b[\s\S]*?<\/svg>/i);
  return m ? m[0].trim() : null;
}

export function sanitizeFigureSvg(raw: string): string | null {
  const extracted = extractSvgMarkup(raw);
  if (!extracted) return null;
  if (extracted.length > MAX_SVG_CHARS) return null;

  let s = extracted;
  // 去掉危险节点与事件
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\shref\s*=\s*("|')\s*javascript:[^"']*\1/gi, "");
  s = s.replace(/\sxlink:href\s*=\s*("|')\s*javascript:[^"']*\1/gi, "");

  if (!/^<svg\b/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null;
  if (/<script\b/i.test(s) || /foreignObject/i.test(s)) return null;

  // 保证 xmlns，便于浏览器与打印
  if (!/\sxmlns\s*=/.test(s)) {
    s = s.replace(/^<svg\b/i, `<svg xmlns="http://www.w3.org/2000/svg"`);
  }

  return s;
}
