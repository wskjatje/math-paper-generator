import type { Exam } from "@/lib/types";

/** 与数据库 `exams.source` 对齐；缺省按历史本机数据视为 generated */
export function examProvenance(e: Exam): "curated" | "generated" | "imported" {
  const s = e.source;
  if (s === "curated" || s === "imported" || s === "generated") return s;
  return "generated";
}

/** 非仓库内置、且为 AI 命题或线下导入的卷，可逻辑删除 */
export function userExamSoftDeletable(e: Exam): boolean {
  if (e.storage_source === "project") return false;
  const p = examProvenance(e);
  return p === "generated" || p === "imported";
}
