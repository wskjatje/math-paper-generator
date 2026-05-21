/**
 * Educational Presentation Layer — 仅用于卷面/预览渲染，不改写 canonical persist 边界。
 */

/** 坐标/数值括号内 ASCII 逗号 → 中文逗号 */
export function prettifyChineseMathPunctuation(text: string): string {
  let s = String(text ?? "");
  s = s.replace(
    /\(([0-9A-Za-z√\-]+),\s*([0-9A-Za-z√\-]+)\)/g,
    "（$1，$2）",
  );
  s = s.replace(
    /（([0-9A-Za-z√\-]+),\s*([0-9A-Za-z√\-]+)）/g,
    "（$1，$2）",
  );
  return s;
}

/** △∠ 与相邻拉丁字母禁止断行 */
export function insertMathNoBreakHints(text: string): string {
  return String(text ?? "").replace(
    /(△[A-Z][A-Z0-9'′]{1,4}|∠[A-Z]{2,5}|[0-9]+√[0-9]+)/g,
    (m) => m,
  );
}

export function prettifyForEducationalRender(text: string): string {
  return insertMathNoBreakHints(prettifyChineseMathPunctuation(text));
}
