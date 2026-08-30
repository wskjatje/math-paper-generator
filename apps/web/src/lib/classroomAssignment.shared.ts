/**
 * 课堂作业：年级校验、定向发布可见性、开始计时与用时（纯函数，服务端与测试共用）。
 *
 * 历史数据兼容口径：
 * - 无定向名单（null / 空数组）→ 全体可见；
 * - 无 started_at → 用时为 null（不倒推、不猜测）。
 */
import { GRADE_LEVEL_OPTIONS } from "@/lib/generateCatalog";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import { questionTypeLabelFromId } from "@/lib/types";

export type AssignmentTargetMode = "all" | "selected";

/** 学生视角的作业进度：未开始 / 进行中（已开始未提交） / 已提交 */
export type AssignmentAttemptStatus = "pending" | "in_progress" | "submitted";

export function isGradeLevelId(id: string | null | undefined): boolean {
  const v = String(id ?? "").trim();
  if (!v) return false;
  return GRADE_LEVEL_OPTIONS.some((o) => o.id === v);
}

/** 空值 → null；非法年级抛错，避免把脏值写进作业 */
export function normalizeGradeIdOrThrow(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!isGradeLevelId(v)) throw new Error("年级不在可选范围，请从年级列表中重新选择");
  return v;
}

/** 去空白、去重、保持首次出现顺序 */
export function normalizeStudentIdList(
  raw: ReadonlyArray<string | null | undefined> | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const v = String(item ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function assignmentTargetMode(
  targetStudentIds: ReadonlyArray<string> | null | undefined,
): AssignmentTargetMode {
  return targetStudentIds && targetStudentIds.length > 0 ? "selected" : "all";
}

/**
 * 同班同卷已覆盖到的学生（用于防重复布置，不猜测历史无 class_id 的作业）。
 * - 全体可见（无定向名单）→ 覆盖当时班成员全集；
 * - 定向 → 仅名单内学生。
 */
export function studentIdsAlreadyCoveredByExamInClass(opts: {
  examId: string;
  classId: string;
  classMemberIds: ReadonlyArray<string>;
  existing: ReadonlyArray<{
    exam_id: string;
    class_id?: string | null;
    target_student_ids?: ReadonlyArray<string> | null;
  }>;
}): Set<string> {
  const examId = String(opts.examId ?? "").trim();
  const classId = String(opts.classId ?? "").trim();
  const covered = new Set<string>();
  if (!examId || !classId) return covered;
  const memberSet = new Set(opts.classMemberIds.map((id) => String(id).trim()).filter(Boolean));
  for (const a of opts.existing) {
    if (String(a.exam_id ?? "").trim() !== examId) continue;
    if (String(a.class_id ?? "").trim() !== classId) continue;
    const targets = normalizeStudentIdList(a.target_student_ids);
    if (targets.length === 0) {
      for (const id of memberSet) covered.add(id);
    } else {
      for (const id of targets) {
        if (memberSet.has(id)) covered.add(id);
      }
    }
  }
  return covered;
}

/** 从拟发布名单中去掉已覆盖学生；保持原顺序 */
export function filterStudentsNotYetAssignedExam(
  intendedAudience: ReadonlyArray<string>,
  alreadyCovered: ReadonlySet<string>,
): string[] {
  return normalizeStudentIdList(intendedAudience).filter((id) => !alreadyCovered.has(id));
}

/**
 * 定向可见性：无名单 → 全体可见（含历史数据）；有名单且学生未登录 → 不可见。
 */
export function assignmentVisibleToStudent(
  targetStudentIds: ReadonlyArray<string> | null | undefined,
  studentUserId: string | null | undefined,
): boolean {
  if (!targetStudentIds || targetStudentIds.length === 0) return true;
  const uid = String(studentUserId ?? "").trim();
  if (!uid) return false;
  return targetStudentIds.includes(uid);
}

/**
 * 学生可见 + 年级适用：
 * - 定向命中 → 一律可见（教师点名布置优先于年级）；
 * - 全体可见作业：双方年级均已知且不同 → 不适用（隐藏）；任一未知 → 保持可见（历史兼容）。
 */
export function assignmentApplicableToStudent(opts: {
  targetStudentIds?: ReadonlyArray<string> | null;
  assignmentGradeId?: string | null;
  studentUserId?: string | null;
  studentGradeId?: string | null;
}): boolean {
  if (!assignmentVisibleToStudent(opts.targetStudentIds, opts.studentUserId)) return false;
  if (opts.targetStudentIds && opts.targetStudentIds.length > 0) return true;
  const assignmentGrade = String(opts.assignmentGradeId ?? "").trim();
  const studentGrade = String(opts.studentGradeId ?? "").trim();
  if (!assignmentGrade || !studentGrade) return true;
  return assignmentGrade === studentGrade;
}

/** 已提交判定：有 submitted_at 或已有阅卷结果；否则为进行中占位行 */
export function submissionAttemptStatus(
  row: { submitted_at?: string | null; grade_result?: unknown } | null | undefined,
): AssignmentAttemptStatus {
  if (!row) return "pending";
  const submittedAt = typeof row.submitted_at === "string" ? row.submitted_at.trim() : "";
  if (submittedAt) return "submitted";
  if (row.grade_result) return "submitted";
  return "in_progress";
}

/** 用时（秒）；缺 started_at / submitted_at 或时序异常时返回 null */
export function computeDurationSec(
  startedAt: string | null | undefined,
  submittedAt: string | null | undefined,
): number | null {
  const start = Date.parse(String(startedAt ?? ""));
  const end = Date.parse(String(submittedAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) return null;
  return Math.round((end - start) / 1000);
}

/** 学生作答进度展示文案（教师/学生两端复用，避免各写各的措辞） */
export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentAttemptStatus, string> = {
  pending: "未开始",
  in_progress: "进行中",
  submitted: "已提交",
};

/** 用时展示：无 started_at（历史数据/未开始计时）→「—」，不倒推、不猜测 */
export function formatDurationSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const totalSec = Math.round(sec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

/** 错题题型摘要（取自 grade_result 逐题结果，不依赖试卷再次加载） */
export function wrongTypeCountsFromGrade(
  grade: SubmissionGradeResult | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of grade?.questions ?? []) {
    if (q.verdict !== "wrong") continue;
    const type = String(q.type ?? "").trim() || "unknown";
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

/**
 * 名册展示用：将 wrongTypeCounts 格式化为「填空题×2 · 解答题×1」。
 * 题型文案走配置映射，禁止按卷号硬编码。
 */
export function formatWrongTypeCountsSummary(
  counts: Record<string, number> | null | undefined,
  labelOf: (typeId: string) => string = questionTypeLabelFromId,
): string {
  if (!counts) return "";
  const parts = Object.entries(counts)
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!))
    .map(([type, n]) => `${labelOf(type)}×${n}`);
  return parts.join(" · ");
}
