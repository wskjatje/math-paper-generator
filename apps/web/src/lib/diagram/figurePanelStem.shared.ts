/**
 * 一题多图（如图①/②）分镜：按「选项甲」——每幅图与对应文段对齐，禁止单 scene 吃全文点名。
 */

const CIRCLED_NUMS = "①②③④⑤⑥⑦⑧⑨⑩";

/** 如图① / 图(2) / 如图 2 等标记 */
const PANEL_MARK_RE =
  /如图\s*[（(]?\s*([①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})\s*[）)]?|图\s*[（(]?\s*([①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})\s*[）)]/g;

export function normalizeFigurePanelKey(raw: string): string {
  const t = String(raw ?? "").trim();
  const circled = CIRCLED_NUMS.indexOf(t);
  if (circled >= 0) return String(circled + 1);
  const n = Number.parseInt(t, 10);
  if (Number.isFinite(n) && n > 0) return String(n);
  return t;
}

export type FigurePanelSlice = {
  /** 归一化键："1" | "2" | … */
  key: string;
  /** 标记在全文中的起始下标 */
  markIndex: number;
  /** 自该「如图N」至下一标记（或文末）的片段 */
  section: string;
  /**
   * 对齐用全文语境：文首至本段（含前文公共题设）。
   * scene 中的点名必须落在此范围内（allowed）。
   */
  stemForAlign: string;
  /**
   * 本图必现点名来源：仅本段（不含其他「如图K」段）。
   * 题干本段出现的点必须出现在对应 scene 中（required）。
   */
  requiredStem: string;
};

/**
 * 收紧「本图必现」文段：自如图N 起，遇下一如图 / 大题号（Ⅱ）等即止。
 * 避免把「如图①」与「如图②」之间的过渡叙述（已出现 D' 但尚未见图②）算进图①。
 */
function tightenPanelRequiredSection(section: string): string {
  if (!section.trim()) return section;
  // 跳过开头「如图N」标记本身再搜截断点
  const mark = section.match(/^如图\s*[（(]?\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})\s*[）)]?|图\s*[（(]?\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})\s*[）)]/);
  const from = mark ? mark[0].length : 0;
  const rest = section.slice(from);
  const cutCandidates = [
    rest.search(/如图\s*[（(]?\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})/),
    rest.search(/（[ⅡⅢⅣⅤⅥⅦⅧⅨⅩ]）/),
    rest.search(/\n\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*如图/),
  ].filter((i) => i >= 0);
  if (cutCandidates.length === 0) return section;
  const cut = Math.min(...cutCandidates);
  return section.slice(0, from + cut).trimEnd();
}

/**
 * 若题干含 ≥2 个如图标记，按标记切分；否则返回空数组（调用方走单图/全文逻辑）。
 */
export function splitContentByFigurePanels(content: string): FigurePanelSlice[] {
  const text = String(content ?? "");
  if (!text.trim()) return [];

  const marks: { key: string; index: number; markLen: number }[] = [];
  PANEL_MARK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PANEL_MARK_RE.exec(text)) !== null) {
    const raw = m[1] || m[2] || "";
    const key = normalizeFigurePanelKey(raw);
    if (!key) continue;
    // 同一 key 只保留首次出现（避免「见图①」重复）
    if (marks.some((x) => x.key === key)) continue;
    marks.push({ key, index: m.index, markLen: m[0].length });
  }
  if (marks.length < 2) return [];

  marks.sort((a, b) => a.index - b.index);
  const firstMark = marks[0]!.index;
  const preamble = text.slice(0, firstMark);

  return marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1]!.index : text.length;
    const section = text.slice(mark.index, end);
    const requiredStem = tightenPanelRequiredSection(section);
    const stemForAlign = `${preamble}${requiredStem}`;
    return {
      key: mark.key,
      markIndex: mark.index,
      section,
      stemForAlign,
      requiredStem,
    };
  });
}

/** 从 alt / 说明中解析图序号 */
export function panelKeyFromFigureAlt(alt: string | undefined): string | null {
  if (!alt) return null;
  const m = alt.match(
    /图\s*[（(]?\s*([①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2})\s*[）)]?/,
  );
  if (!m?.[1]) return null;
  return normalizeFigurePanelKey(m[1]);
}

/**
 * 为面板挑选 attachments 下标：优先 alt 含「图N」，否则按未占用顺序。
 */
export function pickFigureIndexForPanel(
  figures: Array<{ alt?: string }>,
  panelKey: string,
  used: Set<number>,
): number {
  for (let i = 0; i < figures.length; i++) {
    if (used.has(i)) continue;
    const k = panelKeyFromFigureAlt(figures[i]?.alt);
    if (k === panelKey) return i;
  }
  // 顺序回退：第 k 个未占用 → 对应第 k 个面板（调用方按 panels 顺序调用）
  for (let i = 0; i < figures.length; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}
