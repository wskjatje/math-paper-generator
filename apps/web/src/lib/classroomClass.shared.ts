/**
 * 班级实体共享类型与校验（前后端共用）。
 */
import { GRADE_LEVEL_OPTIONS, gradeBaseId } from "@/lib/generateCatalog";

export type ClassroomClassStatus = "active" | "archived";

export type ClassroomClass = {
  id: string;
  name: string;
  grade_id: string;
  owner_teacher_id: string;
  status: ClassroomClassStatus;
  created_at: string;
  updated_at?: string;
};

export type ClassroomClassMember = {
  id: string;
  class_id: string;
  student_user_id: string;
  joined_at: string;
};

export function isValidClassGradeId(gradeId: string): boolean {
  return GRADE_LEVEL_OPTIONS.some((g) => g.id === gradeId);
}

export function normalizeClassName(raw: string): string {
  return raw.trim().slice(0, 80);
}

/** 年级在目录中的升序下标；未知 id 排最后 */
export function gradeLevelSortIndex(gradeId: string): number {
  const i = GRADE_LEVEL_OPTIONS.findIndex((g) => g.id === gradeId);
  return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
}

/** 班级列表：年级从小到大，同级按名称 */
export function compareClassesByGradeAsc(
  a: { grade_id: string; name: string },
  b: { grade_id: string; name: string },
): number {
  const byGrade = gradeLevelSortIndex(a.grade_id) - gradeLevelSortIndex(b.grade_id);
  if (byGrade !== 0) return byGrade;
  return a.name.localeCompare(b.name, "zh");
}

/** 学年基准 id 按学制从小到大（去重保序） */
function gradeBaseOrder(): string[] {
  const seen: string[] = [];
  for (const g of GRADE_LEVEL_OPTIONS) {
    const base = gradeBaseId(g.id);
    if (!seen.includes(base)) seen.push(base);
  }
  return seen;
}

/**
 * 班级升级一步：
 * - 上学期（_s1）→ 同学年下学期（_s2）
 * - 下学期（_s2）→ 下一学年上学期（_s1）
 * - 已是最高年级下学期 → null（应取消/归档）
 */
export function nextClassGradeId(gradeId: string): string | null {
  if (!isValidClassGradeId(gradeId)) return null;
  if (gradeId.endsWith("_s1")) {
    const next = `${gradeBaseId(gradeId)}_s2`;
    return isValidClassGradeId(next) ? next : null;
  }
  if (gradeId.endsWith("_s2")) {
    const bases = gradeBaseOrder();
    const i = bases.indexOf(gradeBaseId(gradeId));
    if (i < 0 || i >= bases.length - 1) return null;
    const next = `${bases[i + 1]!}_s1`;
    return isValidClassGradeId(next) ? next : null;
  }
  return null;
}
