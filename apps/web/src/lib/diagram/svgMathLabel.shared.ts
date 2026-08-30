/**
 * SVG 文本无 KaTeX：把标识符下标 V_A / a_n 转为 tspan，避免卷面露出下划线。
 * 通用规则，不绑定题号。
 */

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 将纯文本中的 base_sub 转为带下标的 SVG 内联片段（已转义） */
export function formatSvgMathLabel(text: string): string {
  const raw = String(text ?? "");
  if (!raw) return "";
  const esc = escXml(raw);
  return esc.replace(
    /([A-Za-z][A-Za-z0-9]{0,3})_([A-Za-z0-9]{1,4})/g,
    '$1<tspan baseline-shift="sub" font-size="0.72em">$2</tspan>',
  );
}
