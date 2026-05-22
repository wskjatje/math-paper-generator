/**
 * 初中平面几何题干：规则解析（不调用 LLM）。
 * 当前识别「复制角 / 尺规多步弧」类作图描述的最小特征。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

/** 顶点撇号 / Unicode 撇（$\triangle A'B'C'$）统一去掉再比对 */
export function normalizeVertexLetter(ch: string): string {
  return ch.replace(/['′\u2019]/g, "").toUpperCase();
}

/**
 * 剥离噪声但保留 `$...$`、`\(...\)` 内可读文本，避免 `$\triangle ABC$` 整块丢失导致规则永不命中。
 */
export function stripStemNoiseForGeometry(text: string): string {
  let s = text
    .replace(/\$([^$]*)\$/g, (_, inner: string) => ` ${inner.replace(/\\/g, " ")} `)
    .replace(/\\\(([^)]*)\\\)/g, (_, inner: string) => ` ${inner.replace(/\\/g, " ")} `)
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\btriangle\b/gi, "△");
  return s;
}

/** 解析 △ABC / 三角形 ABC / $\triangle ABC$ 展开后的 triangle ABC；支持顶点撇号 */
export function parseTriangleVertices(text: string): [string, string, string] | null {
  const t = stripStemNoiseForGeometry(text);
  const letter = "([A-Za-z])['′\u2019]?";
  const m1 = new RegExp(`(?:△|三角形|triangle)\\s*${letter}\\s*${letter}\\s*${letter}`, "iu").exec(
    t,
  );
  if (m1) {
    return [
      normalizeVertexLetter(m1[1]!),
      normalizeVertexLetter(m1[2]!),
      normalizeVertexLetter(m1[3]!),
    ];
  }
  const m2 = new RegExp(`在\\s*△\\s*${letter}\\s*${letter}\\s*${letter}`, "u").exec(t);
  if (m2) {
    return [
      normalizeVertexLetter(m2[1]!),
      normalizeVertexLetter(m2[2]!),
      normalizeVertexLetter(m2[3]!),
    ];
  }
  return null;
}

export function parseOptionalSegmentLengths(text: string): {
  AD?: number;
  BD?: number;
  DE?: number;
} {
  const t = stripStemNoiseForGeometry(text);
  const out: { AD?: number; BD?: number; DE?: number } = {};
  const ad = /(?:^|[^A-Za-z])AD\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  const bd = /(?:^|[^A-Za-z])BD\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  const de = /(?:^|[^A-Za-z])DE\s*[=＝]\s*(\d+(?:\.\d+)?)/i.exec(t);
  if (ad) out.AD = Number(ad[1]);
  if (bd) out.BD = Number(bd[1]);
  if (de) out.DE = Number(de[1]);
  return out;
}

/**
 * 是否为「多步尺规 + 弧 + 圆心」类题干（适合走约束布局而非裸坐标 LLM）。
 */
export function stemLooksLikeAngleCopyConstruction(text: string): boolean {
  if (stemLooksLikeCoordinatePlaneExam(text)) return false;
  const t = stripStemNoiseForGeometry(text);
  if (!/(?:△|三角形|triangle\b)/i.test(t)) return false;
  const stepHints = /[①②③④⑤⑥⑦]|\(\s*[1-7]\s*\)|步骤\s*[1-7]/.test(t);
  /** 勿把坐标系题「边与…相交于点 G」当成尺规作图（会误出 ABC+DG 母图） */
  const compass =
    /圆心|半径|画弧|圆弧|弧交|尺规|复制角|以\s*.+\s*为圆心/u.test(t) ||
    (/射线/u.test(t) && /画弧|圆弧/u.test(t));
  if (!compass) return false;
  if (stepHints) return true;
  return (
    /以\s*.+\s*为圆心/.test(t) &&
    /交\s*(?:边|线段)?\s*[A-Za-z]{2}\s*于|与\s*[A-Za-z]{2}\s*交于/.test(t)
  );
}
