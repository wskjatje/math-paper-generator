/**
 * 读卷调试用：从题干纯文本中粗扫「如图①」「图9」「如图O」「图ABC」等锚点，以及 Markdown 插图 URL。
 * 不参与 P7-1A 持久化；用于区分「文本层有图引用 vs 资源层无 figure_refs」。
 *
 * **STEP 2B**：字母图名（几何中常见「如图O」「图A」）仅作**观测锚点**；与 linker 的 exact token 一致，
 * 不放宽 degraded / authoritative 策略。
 */

/** 题干中出现的常见图引用片段（去重保序） */
export function scanQuestionContentForFigureTextAnchors(content: string): string[] {
  const t = String(content ?? "");
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string | undefined) => {
    const s = raw?.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  const patterns: RegExp[] = [
    /如图[①②③④⑤⑥⑦⑧⑨⑩0-9]/g,
    /如图[A-Za-z]{1,20}/g,
    /如图\s*[\(\（]\s*[0-9]+\s*[\)\）]/g,
    /图\s*[\(\（]?\s*[0-9]+\s*[\)\）]?/g,
    // STEP 2B：独立「图+字母」；排除「如图…」内子串与常见「地图…」前缀误报
    /(?<!地)(?<!如)图[A-Za-z]{1,20}/g,
    /第\s*[0-9]+\s*题(?:图|所示)/g,
  ];

  for (const re of patterns) {
    const r = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(t)) != null) push(m[0]);
  }

  return out;
}

/** `![](url)` 中的 url 列表（顺序保留，不去重） */
export function extractMarkdownImageUrlsFromContent(content: string): string[] {
  const t = String(content ?? "");
  const out: string[] = [];
  const re = /!\[[^\]]*]\(\s*([^)\s]+)\s*(?:\s+"[^"]*")?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) != null) {
    const u = m[1]?.trim();
    if (u) out.push(u);
  }
  return out;
}
