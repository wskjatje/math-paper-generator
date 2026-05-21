import type { EducationalTextSegmentV1 } from "@/lib/educationalAst.shared";
import { parseMathInlineNode, segmentPlainText } from "@/lib/parseMathInlineNode.shared";

export { segmentPlainText };

/** 认知单元：几何 / 坐标 / 根号 / 代数（优先于 prose 切分） */
const MATH_INLINE_RE =
  /(\$[^$\n]+\$|\\\([^)]+\\\)|△[A-Z][A-Z0-9'′]{0,4}|∠[A-Z]{2,6}|[A-Z][A-Z0-9'′]?\([^)]*\)|[0-9]+(?:\.[0-9]+)?√[0-9]+|-√[0-9]+|\(\s*-?\d+\s*,\s*-?\d+\s*\))/g;

/** 将段落文本拆为 text / MathInlineNode（P2.3.1；renderer 禁止再 parse） */
export function splitEducationalMathSegments(raw: string): EducationalTextSegmentV1[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  const segments: EducationalTextSegmentV1[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      const plain = text.slice(last, idx);
      if (plain.trim()) segments.push({ kind: "text", value: plain });
    }
    segments.push(parseMathInlineNode(m[0]!));
    last = idx + m[0]!.length;
  }
  if (last < text.length) {
    const tail = text.slice(last);
    if (/\\frac|\\sqrt|\\leqslant|\\geqslant|\\backslash/.test(tail)) {
      segments.push(parseMathInlineNode(tail));
    } else if (tail.trim()) {
      segments.push({ kind: "text", value: tail });
    }
  }
  if (segments.length === 0) segments.push({ kind: "text", value: text });
  return segments;
}
