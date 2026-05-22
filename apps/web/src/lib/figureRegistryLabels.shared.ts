/**
 * P7-1B STEP 1：producer 写入 `FigureRegistryItemV1.labels` 的**确定性**片段来源（当前仅 URL）。
 * 产出的是 **resource metadata**（资源曾被标为哪些 token），不是 ownership 结论；不做 OCR、不做
 * 锚点→图 resolve；后续可由 caption / 结构化导入追加同一字段。
 */

/**
 * 从 page_crop 类 URL 路径中抽取可进 registry 的图注标签（字面匹配，不近似）。
 * 未命中则 `undefined`（不写空数组，避免与「无标签」语义混淆）。
 */
export function deriveFigureRegistryLabelsFromPageCropUrl(url: string): string[] | undefined {
  let path = url.split(/[?#]/, 1)[0] ?? url;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* 保持原始 path */
  }

  const out = new Set<string>();

  for (const m of path.matchAll(/图[①②③④⑤⑥⑦⑧⑨⑩]/gu)) {
    const token = m[0];
    if (!token) continue;
    out.add(token);
    const tail = token.replace(/^图/u, "");
    if (tail.length > 0) out.add(tail);
  }

  for (const m of path.matchAll(/图[1-9]/g)) {
    const token = m[0];
    if (!token) continue;
    out.add(token);
    out.add(token.replace(/^图/, ""));
  }

  for (const m of path.matchAll(/图\s*[\(（]\s*([0-9]{1,2})\s*[\)）]/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 10) continue;
    const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"][n - 1];
    if (!circled) continue;
    out.add(`图${circled}`);
    out.add(circled);
  }

  const figEn = /Fig\.?\s*([0-9]+)/gi;
  let me: RegExpExecArray | null;
  while ((me = figEn.exec(path)) != null) {
    const n = me[1];
    if (!n) continue;
    out.add(`Fig.${n}`);
    out.add(n);
  }

  if (out.size === 0) return undefined;
  return [...out].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}
