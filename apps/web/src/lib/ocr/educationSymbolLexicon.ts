/**
 * 教育场景 OCR 规则纠错：通用 OCR 易混淆符号 → 数学/几何常见写法。
 * 保守匹配（优先整词/短语），避免误伤正文中的合法数字「4」。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

/** 整段文本替换（按顺序执行，先长后短） */
const ORDERED_PHRASES: Array<[RegExp, string]> = [
  [/在\s*A4BC\s*中/g, "在△ABC中"],
  [/在\s*A4BC\b/g, "在△ABC"],
  [/△\s*A4BC/g, "△ABC"],
  [/\bA4BC\b/g, "△ABC"],
  [/正方形\s*4BCD/g, "正方形ABCD"],
  [/\b4BCD\b/g, "ABCD"],
  [/矩形\s*PNMDN/g, "矩形PMDN"],
  [/\bPNMDN\b/g, "PMDN"],
  [/第\s*@\s*步/g, "第②步"],
  [/红\s*弧/g, "圆弧"],
  [/对的红/g, "对的弧"],
  [/长的红/g, "长的弧"],
];

export function applyEducationSymbolLexicon(text: string): string {
  const coordPlane = stemLooksLikeCoordinatePlaneExam(text);
  let out = text;
  for (const [re, to] of ORDERED_PHRASES) {
    if (coordPlane && /A4BC|4BCD/.test(re.source)) continue;
    out = out.replace(re, to);
  }

  /** 仅在出现三角形语境时，将独立 token「4B」「4C」视作 AB、AC 误识（避免误伤物理/化学计量）。 */
  const geoHint =
    !coordPlane &&
    /△\s*ABC|三角形|在△ABC|A4BC|尺规|旋转|⊙|∠|第\s*\(\s*\d+\s*\)\s*题/i.test(out);
  if (geoHint) {
    out = out.replace(/(?<![A-Za-z0-9])4C\b/g, "AC");
    out = out.replace(/(?<![A-Za-z0-9])4B\b/g, "AB");
    /** 拉丁点名常被误识为形近汉字（仅几何语境） */
    out = out.replace(/点\s*刀\b/g, "点D");
    out = out.replace(/以点\s*刀\b/g, "以点D");
    out = out.replace(/点\s*吾\b/g, "点H");
    out = out.replace(/以点\s*吾\b/g, "以点H");
  }

  return out;
}
