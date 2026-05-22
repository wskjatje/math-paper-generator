/**
 * 选择题选项呈现 · 内置约定（与 data/exam-math-repair-overrides 并列，供 UI / Markdown / 导出共用）。
 * 模型入库的 options 常为纯数值或短句，不带 A/B/C/D；展示与导出时统一补字母并单行紧凑排列。
 */

const CHOICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" as const;

/** 第 idx 项（0-based）对应的选项字母，最多 26 项 */
export function choiceLetterFromIndex(index: number): string {
  if (!Number.isFinite(index) || index < 0 || index >= CHOICE_LETTERS.length) {
    return String(index + 1);
  }
  return CHOICE_LETTERS[index] ?? String(index + 1);
}

/**
 * 去掉选项正文首部的重复标号（如「A.」「B．」「(A)」「（B）」），避免界面出现「A. (A) xx」。
 * 仅处理串首；不触碰正文中的合法括号数字（如 (10)）。
 */
export function stripLeadingChoiceMarker(raw: string): string {
  let s = String(raw ?? "").trimStart();
  for (let i = 0; i < 6; i++) {
    const prev = s;
    s = s.replace(/^[（(]\s*[A-Za-zＡ-Ｚ]\s*[）)]\s*/u, "").trimStart();
    s = s.replace(/^[A-Za-zＡ-Ｚ]\s*[.．。、]\s*/u, "").trimStart();
    if (s === prev) break;
  }
  return s.trim();
}
