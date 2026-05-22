/**
 * 试卷库列表与持久化策略（由 Cookie + localStorage 同步）。
 * - auto / supabase / local：见设置页说明
 * - builtin：列表 = 仓库内置演示卷 ∪ 本地目录 data/local-exams；写入优先本地再云端
 * - 未配 Supabase 且 MySQL 可用时：自动与云端一体对齐（试卷 + 教育 OS 均走 MySQL），无需单独选项
 */
export type ExamStoragePreference = "auto" | "supabase" | "local" | "builtin";

export const EXAM_STORAGE_COOKIE = "mpg_exam_storage";

export function normalizeExamStoragePreference(
  raw: string | null | undefined,
): ExamStoragePreference {
  if (raw === "mysql") return "auto";
  if (raw === "supabase" || raw === "local" || raw === "auto" || raw === "builtin") return raw;
  return "auto";
}
