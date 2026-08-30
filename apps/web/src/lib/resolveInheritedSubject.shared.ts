/**
 * 学科字段解析：禁止静默默认为「数学」。
 * 优先题目自身 subject，其次试卷/导入提示；皆空则返回空串（由闸门按「空=严格」处理）。
 */

export function resolveInheritedSubject(
  questionSubject: unknown,
  examOrHintSubject: unknown,
): string {
  const q = String(questionSubject ?? "").trim();
  if (q) return q.slice(0, 200);
  const e = String(examOrHintSubject ?? "").trim();
  if (e) return e.slice(0, 200);
  return "";
}
