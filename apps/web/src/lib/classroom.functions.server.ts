// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { profileHasRole, type AuthContext } from "@/lib/auth.shared";
import {
  parseStudentAnswerPayload,
  stripInkDataUrls,
  type StudentAnswerPayload,
} from "@/lib/studentAnswers.shared";
import {
  gradeResultForStudentView,
  gradeSubmission,
  type SubmissionGradeResult,
} from "@/lib/classroomGrade.shared";
import { WRONG_DRILL_UNTAGGED } from "@/lib/wrongDrillComposition.shared";
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import {
  curriculumSubjectIdsFromExamSubjects,
  curriculumSubjectLabel,
  examMatchesGradeFilter,
  preferredGradeIdFromExamSubjects,
  GRADE_LEVEL_OPTIONS,
  gradeLevelLabel,
} from "@/lib/generateCatalog";
import {
  assignmentApplicableToStudent,
  assignmentTargetMode,
  assignmentVisibleToStudent,
  computeDurationSec,
  filterStudentsNotYetAssignedExam,
  normalizeGradeIdOrThrow,
  normalizeStudentIdList,
  studentIdsAlreadyCoveredByExamInClass,
  submissionAttemptStatus,
  wrongTypeCountsFromGrade,
  type AssignmentAttemptStatus,
  type AssignmentTargetMode,
} from "@/lib/classroomAssignment.shared";
import { isPaperKindId } from "@/config/examDomain";
import type { Difficulty, Exam } from "@/lib/types";

type SupabaseAdmin = any;

async function loadSupabaseAdmin(): Promise<SupabaseAdmin | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabaseOptional.server");
  return getSupabaseAdmin() as any;
}

async function loadAuthHelpers() {
  return import("@/lib/auth.helpers.server");
}

async function assertAccountSchemaReady() {
  const m = await import("@/lib/runtimeReadiness.server");
  return m.assertAccountSchemaReady();
}

export type ClassroomAssignment = {
  id: string;
  exam_id: string;
  teacher_label: string;
  title: string;
  class_name: string | null;
  due_at: string | null;
  hide_answers: boolean;
  created_at: string;
  teacher_user_id?: string | null;
  /** 年级（GRADE_LEVEL_OPTIONS.id）；历史作业为 null */
  grade_id: string | null;
  /** 班级工作台：所属班级；历史作业为 null */
  class_id?: string | null;
  /** 定向发布名单（登录学生 id）；仅教师视角返回，缺省/空表示全体可见 */
  target_student_ids?: string[];
  target_mode?: AssignmentTargetMode;
};

export type ClassroomSubmission = {
  id: string;
  assignment_id: string;
  student_label: string;
  answer_payload: StudentAnswerPayload;
  submitted_at: string;
  student_user_id?: string | null;
  grade_result?: SubmissionGradeResult | null;
  /** 学生首次打开作业的时间；历史数据为 null → 用时不可算 */
  started_at?: string | null;
};

/** 内部记录：进行中占位行的 submitted_at 为 null */
type SubmissionRecord = Omit<ClassroomSubmission, "submitted_at"> & {
  submitted_at: string | null;
};

type StoredAssignment = Omit<ClassroomAssignment, "grade_id" | "target_student_ids"> & {
  grade_id?: string | null;
  /** null 表示全体可见（历史数据同样按全体处理） */
  target_student_ids?: string[] | null;
};

export type StudentAssignmentStatus = {
  assignmentId: string;
  examId: string;
  title: string;
  gradeId: string | null;
  dueAt: string | null;
  /** 作业布置时间（最新作业排序用） */
  createdAt: string;
  status: AssignmentAttemptStatus;
  score: number | null;
  maxScore: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
  /** 试卷原始 subjects 标签（与试卷库一致） */
  subjects: string[];
  /** 解析出的课程学科 id（generateCatalog），供按学科筛选 */
  subjectIds: string[];
};

export type AssignmentRosterEntry = {
  studentUserId: string | null;
  studentLabel: string;
  /** 是否在定向名单内（全体可见作业恒为 true） */
  targeted: boolean;
  status: AssignmentAttemptStatus;
  score: number | null;
  maxScore: number | null;
  ungradedCount: number | null;
  wrongCount: number | null;
  wrongTypeCounts: Record<string, number>;
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
};

export type ExamPublishStatus = {
  examId: string;
  title: string;
  subjects: string[];
  difficulty: string;
  totalScore: number;
  createdAt: string;
  published: boolean;
  /** 班内布置：本班已覆盖该卷的学生数 */
  coveredStudentCount?: number;
  /** 班内布置：已覆盖该卷的学生 id（用于定向勾选时禁用） */
  coveredStudentIds?: string[];
  classMemberCount?: number;
  assignments: Array<{
    assignmentId: string;
    title: string;
    gradeId: string | null;
    createdAt: string;
    dueAt: string | null;
    targetMode: AssignmentTargetMode;
    targetCount: number;
  }>;
};

/** 定向名单表（见 supabase/migrations/20260725140000_account_three_portal.sql） */
const ASSIGNMENT_TARGETS_TABLE = "assignment_targets" as const;

function parseGradeResult(raw: unknown): SubmissionGradeResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as SubmissionGradeResult;
  if (o.version !== 1 || !Array.isArray(o.questions)) return null;
  return o;
}

function textOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** 云端 / 本地行 → 统一作业对象（缺列缺字段均按历史兼容口径归一） */
function assignmentFromRow(raw: unknown): ClassroomAssignment {
  const o = (raw ?? {}) as Record<string, unknown>;
  const targets = normalizeStudentIdList(
    Array.isArray(o.target_student_ids) ? (o.target_student_ids as string[]) : [],
  );
  const assignment: ClassroomAssignment = {
    id: String(o.id ?? ""),
    exam_id: String(o.exam_id ?? ""),
    teacher_label: String(o.teacher_label ?? "教师"),
    title: String(o.title ?? ""),
    class_name: textOrNull(o.class_name),
    due_at: textOrNull(o.due_at),
    hide_answers: o.hide_answers !== false,
    created_at: String(o.created_at ?? new Date().toISOString()),
    teacher_user_id: textOrNull(o.teacher_user_id),
    grade_id: textOrNull(o.grade_id)?.trim() ?? null,
    class_id: textOrNull(o.class_id)?.trim() ?? null,
    target_mode: assignmentTargetMode(targets),
  };
  if (targets.length) assignment.target_student_ids = targets;
  return assignment;
}

function withAssignmentTargets(
  assignment: ClassroomAssignment,
  targetIds: string[] | undefined,
): ClassroomAssignment {
  const ids = normalizeStudentIdList(targetIds ?? assignment.target_student_ids ?? []);
  const next: ClassroomAssignment = { ...assignment, target_mode: assignmentTargetMode(ids) };
  if (ids.length) next.target_student_ids = ids;
  else delete next.target_student_ids;
  return next;
}

/** 学生视角不返回其他同学的 id */
function assignmentForStudentView(assignment: ClassroomAssignment): ClassroomAssignment {
  const { target_student_ids: _ids, ...rest } = assignment;
  return rest;
}

function submissionRecordFromRow(raw: unknown): SubmissionRecord {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    assignment_id: String(o.assignment_id ?? ""),
    student_label: String(o.student_label ?? ""),
    answer_payload:
      parseStudentAnswerPayload(o.answer_payload) ??
      ({ version: 1, answers: {} } satisfies StudentAnswerPayload),
    submitted_at: textOrNull(o.submitted_at),
    started_at: textOrNull(o.started_at),
    student_user_id: textOrNull(o.student_user_id),
    grade_result: parseGradeResult(o.grade_result),
  };
}

function isSubmittedRecord(rec: SubmissionRecord): boolean {
  return submissionAttemptStatus(rec) === "submitted";
}

/** 对外提交对象：已提交行必有时间戳；仅在缺列的历史行上回退到阅卷时间 */
function toPublicSubmission(rec: SubmissionRecord): ClassroomSubmission {
  return {
    ...rec,
    submitted_at: rec.submitted_at ?? rec.grade_result?.gradedAt ?? rec.started_at ?? "",
  };
}

/** 迁移未执行时的列/表缺失判定（不吞其它错误） */
function isMissingSchemaError(message: string, ...tokens: string[]): boolean {
  const m = String(message ?? "").toLowerCase();
  const missing =
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache") ||
    m.includes("unknown column") ||
    m.includes("no such column");
  if (!missing) return false;
  if (!tokens.length) return true;
  return tokens.some((t) => m.includes(t.toLowerCase()));
}

/** 定向名单：无行 / 表未建 → 视为全体可见 */
async function readAssignmentTargets(
  db: SupabaseAdmin,
  assignmentIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = assignmentIds.filter(Boolean);
  if (!ids.length) return out;
  const { data: rows, error } = await db
    .from(ASSIGNMENT_TARGETS_TABLE)
    .select("assignment_id, student_user_id")
    .in("assignment_id", ids);
  if (error) {
    if (isMissingSchemaError(error.message, ASSIGNMENT_TARGETS_TABLE)) return out;
    throw new Error(error.message);
  }
  for (const row of rows ?? []) {
    const aid = String((row as { assignment_id?: unknown }).assignment_id ?? "");
    const sid = String((row as { student_user_id?: unknown }).student_user_id ?? "");
    if (!aid || !sid) continue;
    const list = out.get(aid) ?? [];
    list.push(sid);
    out.set(aid, list);
  }
  return out;
}

/** 有 Supabase 服务端密钥 → 云端表；否则（本机 MySQL 账号就绪）→ JSON 文件 */
async function classroomUsesCloud(): Promise<boolean> {
  return Boolean(await loadSupabaseAdmin());
}

async function readLocalClassroomStore() {
  const m = await import("@/lib/classroomLocalStore.server");
  return m.readLocalClassroomStore();
}

async function mutateLocalClassroomStore(
  mutator: Parameters<
    Awaited<typeof import("@/lib/classroomLocalStore.server")>["mutateLocalClassroomStore"]
  >[0],
) {
  const m = await import("@/lib/classroomLocalStore.server");
  return m.mutateLocalClassroomStore(mutator);
}

async function loadAssignments(opts?: {
  teacherUserId?: string | null;
}): Promise<ClassroomAssignment[]> {
  await assertAccountSchemaReady();
  const db = await loadSupabaseAdmin();
  if (!db) {
    const store = await readLocalClassroomStore();
    let list = store.assignments.map((row) =>
      withAssignmentTargets(assignmentFromRow(row), undefined),
    );
    if (opts?.teacherUserId) {
      list = list.filter((a) => !a.teacher_user_id || a.teacher_user_id === opts.teacherUserId);
    }
    return list;
  }

  let q = db.from("classroom_assignments").select("*").order("created_at", { ascending: false });
  if (opts?.teacherUserId) q = q.eq("teacher_user_id", opts.teacherUserId);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const list = (rows ?? []).map(assignmentFromRow);
  const targets = await readAssignmentTargets(
    db,
    list.map((a) => a.id),
  );
  return list.map((a) => withAssignmentTargets(a, targets.get(a.id)));
}

async function loadSubmissionRecordsForAssignment(
  assignmentId: string,
): Promise<SubmissionRecord[]> {
  await assertAccountSchemaReady();
  const db = await loadSupabaseAdmin();
  if (!db) {
    const store = await readLocalClassroomStore();
    return store.submissions
      .filter((row) => String(row.assignment_id ?? "") === assignmentId)
      .map(submissionRecordFromRow);
  }
  const { data: rows, error } = await db
    .from("classroom_submissions")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw new Error(error.message);
  return (rows ?? []).map(submissionRecordFromRow);
}

type StudentIdentity = { userId: string | null; label: string | null };

function studentIdentityOf(
  auth: AuthContext,
  label?: string | null,
): StudentIdentity {
  return {
    userId: auth.userId ?? null,
    label: label?.trim() ? label.trim() : null,
  };
}

function recordMatchesIdentity(rec: SubmissionRecord, identity: StudentIdentity): boolean {
  if (identity.userId) return rec.student_user_id === identity.userId;
  if (!identity.label) return false;
  return rec.student_label === identity.label && !rec.student_user_id;
}

function pickPreferredRecord(list: SubmissionRecord[]): SubmissionRecord | null {
  const submitted = list
    .filter(isSubmittedRecord)
    .sort(
      (a, b) =>
        Date.parse(b.submitted_at ?? b.grade_result?.gradedAt ?? "") -
        Date.parse(a.submitted_at ?? a.grade_result?.gradedAt ?? ""),
    );
  if (submitted.length) return submitted[0];
  return list[0] ?? null;
}

async function findStudentSubmissionRecord(
  assignmentId: string,
  identity: StudentIdentity,
): Promise<SubmissionRecord | null> {
  if (!identity.userId && !identity.label) return null;
  await assertAccountSchemaReady();
  const db = await loadSupabaseAdmin();
  if (!db) {
    const store = await readLocalClassroomStore();
    const matched = store.submissions
      .map(submissionRecordFromRow)
      .filter((rec) => rec.assignment_id === assignmentId && recordMatchesIdentity(rec, identity));
    return pickPreferredRecord(matched);
  }
  let q = db.from("classroom_submissions").select("*").eq("assignment_id", assignmentId);
  if (identity.userId) q = q.eq("student_user_id", identity.userId);
  else q = q.eq("student_label", identity.label!).is("student_user_id", null);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  return pickPreferredRecord((rows ?? []).map(submissionRecordFromRow));
}

/** 本人已有作答/进行中记录的作业 id（用于结果回看，不猜测其它人的卷） */
async function loadAssignmentIdsWithStudentActivity(
  identity: StudentIdentity,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!identity.userId && !identity.label) return out;
  await assertAccountSchemaReady();
  const db = await loadSupabaseAdmin();
  if (!db) {
    const store = await readLocalClassroomStore();
    for (const row of store.submissions) {
      const rec = submissionRecordFromRow(row);
      if (recordMatchesIdentity(rec, identity) && rec.assignment_id) out.add(rec.assignment_id);
    }
    return out;
  }
  let q = db.from("classroom_submissions").select("assignment_id");
  if (identity.userId) q = q.eq("student_user_id", identity.userId);
  else q = q.eq("student_label", identity.label!).is("student_user_id", null);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  for (const row of rows ?? []) {
    const aid = String((row as { assignment_id?: unknown }).assignment_id ?? "").trim();
    if (aid) out.add(aid);
  }
  return out;
}

/** 学生档案年级：云端 user_profiles；本机 MySQL local_accounts */
async function studentProfileGradeId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const db = await loadSupabaseAdmin();
  if (db) {
    const { data: row, error } = await db
      .from("user_profiles")
      .select("grade_id")
      .eq("id", userId)
      .maybeSingle();
    if (error || !row) return null;
    return textOrNull((row as { grade_id?: unknown }).grade_id);
  }
  try {
    const { loadLocalProfile } = await import("@/lib/mysqlAccountStore.server");
    const profile = await loadLocalProfile(userId);
    return profile?.grade_id?.trim() || null;
  } catch {
    return null;
  }
}

async function loadAssignmentsVisibleToStudent(
  auth: AuthContext,
): Promise<ClassroomAssignment[]> {
  const identity: StudentIdentity = {
    userId: auth.userId ?? null,
    label: auth.displayName?.trim() || null,
  };
  const [all, studentGradeId, classIds, activityIds] = await Promise.all([
    loadAssignments(),
    studentProfileGradeId(auth.userId ?? null),
    auth.userId
      ? import("@/lib/class.helpers.server").then((m) => m.listClassIdsForStudent(auth.userId!))
      : Promise.resolve([] as string[]),
    loadAssignmentIdsWithStudentActivity(identity),
  ]);
  const classIdSet = new Set(classIds);
  const byId = new Map<string, ClassroomAssignment>();
  for (const a of all) {
    let visible = false;
    if (a.class_id) {
      visible =
        Boolean(auth.userId) &&
        classIdSet.has(a.class_id) &&
        assignmentVisibleToStudent(a.target_student_ids, auth.userId);
    } else {
      visible = assignmentApplicableToStudent({
        targetStudentIds: a.target_student_ids,
        assignmentGradeId: a.grade_id,
        studentUserId: auth.userId,
        studentGradeId,
      });
    }
    // 本人已作答/进行中的作业始终可回看（含历史无 class_id、或事后未入班的情况）
    if (!visible && activityIds.has(a.id)) visible = true;
    if (visible) byId.set(a.id, a);
  }
  return [...byId.values()];
}

async function assertAssignmentVisibleToStudentAsync(
  assignment: ClassroomAssignment,
  studentUserId: string | null,
  identity?: StudentIdentity,
): Promise<void> {
  if (identity) {
    const existing = await findStudentSubmissionRecord(assignment.id, identity);
    if (existing) return;
  }
  if (assignment.class_id) {
    if (!studentUserId) throw new Error("该作业未发布给你，无法作答");
    const { listMemberIdsForClass } = await import("@/lib/class.helpers.server");
    const members = await listMemberIdsForClass(assignment.class_id);
    if (!members.includes(studentUserId)) {
      throw new Error("该作业未发布给你，无法作答");
    }
    if (!assignmentVisibleToStudent(assignment.target_student_ids, studentUserId)) {
      throw new Error("该作业未发布给你，无法作答");
    }
    return;
  }
  if (assignmentVisibleToStudent(assignment.target_student_ids, studentUserId)) return;
  throw new Error("该作业未发布给你，无法作答");
}

const AuthTokenField = z.object({
  accessToken: z.string().min(10).optional(),
});

const AiRuntimeField = z
  .object({
    mode: z.enum(["cloud", "local"]).optional(),
    cloudModel: z.string().optional(),
    localModel: z.string().optional(),
    localBaseUrl: z.string().optional(),
    subjectModelMap: z.record(z.string()).optional(),
  })
  .passthrough()
  .optional();

const CreateAssignmentSchema = AuthTokenField.extend({
  examId: z.string().uuid(),
  title: z.string().min(2).max(200),
  teacherLabel: z.string().min(1).max(80).default("教师"),
  className: z.string().max(120).optional(),
  classId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  hideAnswers: z.boolean().default(true),
  gradeId: z.string().max(80).optional(),
  targetStudentIds: z.array(z.string().uuid()).max(500).optional(),
  visibleToAll: z.boolean().optional(),
});

const CancelAssignmentSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
});

const AnswerEntrySchema = z.object({
  value: z.string().max(8000),
  inkUri: z.string().max(400).optional(),
  /** 提交时若仍带 data URL，服务端会落盘并改成 inkUri */
  inkDataUrl: z.string().max(2_500_000).optional(),
});

const AnswerPayloadSchema = z.object({
  version: z.literal(1),
  answers: z.record(AnswerEntrySchema),
  notes: z.string().max(2000).optional(),
});

const SubmitAssignmentSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  studentLabel: z.string().min(1).max(80),
  answerPayload: AnswerPayloadSchema,
});

const SaveDraftSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  studentLabel: z.string().min(1).max(80).optional(),
  answerPayload: AnswerPayloadSchema,
});

const UploadInkSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  questionId: z.string().min(1).max(80),
  studentLabel: z.string().min(1).max(80).optional(),
  dataUrl: z.string().min(32).max(2_500_000),
});

const TeacherSubmissionDetailSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  studentUserId: z.string().uuid().optional(),
  studentLabel: z.string().min(1).max(80).optional(),
});

const ListAssignmentsSchema = AuthTokenField.extend({
  scope: z.enum(["teacher", "student"]).default("student"),
  classId: z.string().uuid().optional(),
});

const ListSubmissionsSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
});

const MySubmissionSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  studentLabel: z.string().min(1).max(80).optional(),
});

const MarkStartedSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  studentLabel: z.string().min(1).max(80).optional(),
});

const MyStatusesSchema = AuthTokenField.extend({
  studentLabel: z.string().min(1).max(80).optional(),
});

const RosterSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
});

const ExamsForGradeSchema = AuthTokenField.extend({
  gradeId: z.string().min(1).max(80),
  /** 班内布置时传入：published 仅统计本班同卷 */
  classId: z.string().uuid().optional(),
});

const WrongDrillSchema = AuthTokenField.extend({
  assignmentId: z.string().uuid(),
  /** 已废弃：年级由作业班级与试卷标签只读带入，客户端不得覆盖 */
  gradeId: z.string().max(80).optional(),
  /**
   * 仅当本卷解析出多个课程学科时必填；须属于本卷 subjectIds。
   * 单科卷忽略客户端传入，强制用卷内唯一学科。
   */
  subjectId: z.string().max(80).optional(),
  difficulty: z.enum(["beginner", "intermediate", "competition", "advanced"]).optional(),
  title: z.string().min(2).max(200).optional(),
  /** 勾选的卷内错题知识点（knowledge_tags 原文） */
  selectedKnowledgeTags: z.array(z.string().min(1).max(120)).max(40).optional(),
  /** @deprecated 兼容旧字段名，等同 selectedKnowledgeTags */
  selectedTypeIds: z.array(z.string().min(1).max(120)).max(40).optional(),
  /** 教师补充说明，并入命题 notes */
  notes: z.string().max(2000).optional(),
  ai: AiRuntimeField,
});

function resolveWrongDrillGradeSubject(opts: {
  assignmentGradeId: string | null | undefined;
  examSubjects: string[] | null | undefined;
  /** 多科卷时由教师在本卷学科集合内点选 */
  requestedSubjectId?: string | null;
}): {
  gradeId: string;
  subjectId: string;
  subjectIds: string[];
  subjectOptions: Array<{ id: string; label: string }>;
  gradeLocked: boolean;
  /** 单科：只读锁定；多科：须在本卷内选择 */
  subjectLocked: boolean;
  needsSubjectChoice: boolean;
  /** 年级是否来自试卷标签（否则为作业/班级回退） */
  gradeFromExam: boolean;
} {
  // 年级、学科以所选作业试卷为准；作业年级仅作试卷缺标签时的回退
  const examGradeId = preferredGradeIdFromExamSubjects(opts.examSubjects);
  const assignmentGrade = String(opts.assignmentGradeId ?? "").trim();
  const assignmentGradeOk =
    Boolean(assignmentGrade) && GRADE_LEVEL_OPTIONS.some((g) => g.id === assignmentGrade);
  const gradeFromExam = Boolean(examGradeId);
  const gradeId = examGradeId || (assignmentGradeOk ? assignmentGrade : "") || "";

  const subjectIds = curriculumSubjectIdsFromExamSubjects(opts.examSubjects);
  const subjectOptions = subjectIds.map((id) => ({
    id,
    label: curriculumSubjectLabel(id),
  }));
  const requested = String(opts.requestedSubjectId ?? "").trim();
  let subjectId = "";
  if (subjectIds.length === 1) {
    subjectId = subjectIds[0]!;
  } else if (subjectIds.length > 1 && requested && subjectIds.includes(requested)) {
    subjectId = requested;
  }
  return {
    gradeId,
    subjectId,
    subjectIds,
    subjectOptions,
    gradeLocked: Boolean(gradeId),
    subjectLocked: subjectIds.length === 1,
    needsSubjectChoice: subjectIds.length > 1 && !subjectId,
    gradeFromExam,
  };
}

async function resolveAssignmentExamId(assignmentId: string): Promise<{
  assignment: ClassroomAssignment;
}> {
  await assertAccountSchemaReady();
  const db = await loadSupabaseAdmin();
  if (!db) {
    const store = await readLocalClassroomStore();
    const row = store.assignments.find((a) => String(a.id ?? "") === assignmentId);
    if (!row) throw new Error("作业不存在");
    return {
      assignment: withAssignmentTargets(assignmentFromRow(row), undefined),
    };
  }
  const { data: row, error } = await db
    .from("classroom_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("作业不存在");
  const targets = await readAssignmentTargets(db, [assignmentId]);
  return {
    assignment: withAssignmentTargets(assignmentFromRow(row), targets.get(assignmentId)),
  };
}

async function gradeForAssignment(
  assignment: ClassroomAssignment,
  payload: StudentAnswerPayload,
): Promise<SubmissionGradeResult> {
  const { loadExamBundleForClassroom } = await import("@/lib/classroomExamLoad.server");
  const { questions } = await loadExamBundleForClassroom(assignment.exam_id);
  if (!questions.length) throw new Error("作业关联试卷没有题目，无法阅卷");
  return gradeSubmission(questions, payload);
}

/**
 * 列出作业：
 * - 教师：仅自己发布的（有 teacher_user_id 时）；含定向名单摘要；
 * - 学生：定向命中自己 ∪ 无定向名单（历史作业全体可见）；不返回他人 id。
 */
export const listClassroomAssignments = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListAssignmentsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });

    if (data.scope === "teacher") {
      if (profileHasRole(auth, "student") && !profileHasRole(auth, "teacher")) {
        throw new Error("需要教师权限");
      }
      (await loadAuthHelpers()).assertTeacherAccess(auth);
      const teacherUserId = auth.userId && profileHasRole(auth, "teacher") ? auth.userId : null;
      let assignments = await loadAssignments({ teacherUserId });
      if (data.classId) {
        assignments = assignments.filter((a) => a.class_id === data.classId);
      }
      const { listExamsForLibrary } = await import("@/lib/examStorage/libraryList.server");
      const { exams } = await listExamsForLibrary();
      const subjectsByExamId = new Map<string, string[]>();
      for (const exam of exams) {
        subjectsByExamId.set(exam.id, exam.subjects ?? []);
      }
      return {
        assignments: assignments.map((a) => {
          const subjects = subjectsByExamId.get(a.exam_id) ?? [];
          const subjectIds = curriculumSubjectIdsFromExamSubjects(subjects);
          return {
            ...a,
            subjects,
            subjectIds,
            subjectLabels: subjectIds.map((id) => curriculumSubjectLabel(id)),
          };
        }),
      };
    }

    const visible = await loadAssignmentsVisibleToStudent(auth);
    return { assignments: visible.map(assignmentForStudentView) };
  });

/**
 * 教师端：发布作业（可带年级与定向名单）。
 * 班内布置：同班同卷已覆盖的学生默认跳过，不重复发布；本班无学生时拒绝布置。
 * 讲解视频：布置不触发生成/成片。学生作业页按 examId+questionId 播放已 ready 的包；
 * 须先在 /explain-practice 一键生成。
 */
export const createClassroomAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertTeacherAccess(auth);

    const gradeId = normalizeGradeIdOrThrow(data.gradeId);
    const requestedTargets = normalizeStudentIdList(data.targetStudentIds);
    const visibleToAll = data.visibleToAll !== false;
    await assertAccountSchemaReady();

    const classId: string | null = data.classId?.trim() || null;
    let className = data.className?.trim() || null;
    let classGradeId: string | null = null;
    if (classId) {
      const { getClassById } = await import("@/lib/class.helpers.server");
      const cls = await getClassById(classId);
      if (!cls || cls.status !== "active") throw new Error("班级不存在");
      if (auth.userId && cls.owner_teacher_id !== auth.userId) {
        throw new Error("只能在自己的班级布置作业");
      }
      className = className || cls.name;
      classGradeId = cls.grade_id;
    }
    const effectiveGradeId = gradeId || classGradeId;

    {
      const { loadExamBundleForClassroom } = await import("@/lib/classroomExamLoad.server");
      const {
        examIsAssignableByQuality,
        examQualityAssignRejectMessage,
      } = await import("@/lib/examQualityReport.shared");
      const { exam } = await loadExamBundleForClassroom(data.examId);
      if (!examIsAssignableByQuality(exam)) {
        throw new Error(examQualityAssignRejectMessage());
      }
    }

    const db = await loadSupabaseAdmin();
    const canTarget = Boolean(auth.userId) && ((await classroomUsesCloud()) || Boolean(classId));
    if (canTarget && !visibleToAll && requestedTargets.length === 0) {
      throw new Error("请选择接收学生或勾选全体可见");
    }

    let targetIds = visibleToAll || !canTarget ? [] : requestedTargets;
    let skippedAlreadyAssigned = 0;

    if (classId) {
      const { listMemberIdsForClass } = await import("@/lib/class.helpers.server");
      const memberIds = await listMemberIdsForClass(classId);
      if (memberIds.length === 0) {
        throw new Error("本班暂无学生，请先在「学生」页签加入后再布置");
      }
      const teacherUserId = auth.userId && profileHasRole(auth, "teacher") ? auth.userId : null;
      const existing = await loadAssignments({ teacherUserId });
      const covered = studentIdsAlreadyCoveredByExamInClass({
        examId: data.examId,
        classId,
        classMemberIds: memberIds,
        existing,
      });
      const intended =
        visibleToAll || !canTarget
          ? memberIds
          : requestedTargets.filter((id) => memberIds.includes(id));
      if (!visibleToAll && canTarget && intended.length === 0) {
        throw new Error("所选学生不在本班名册中");
      }
      const fresh = filterStudentsNotYetAssignedExam(intended, covered);
      skippedAlreadyAssigned = intended.length - fresh.length;
      if (fresh.length === 0) {
        throw new Error("该试卷已对本班相关学生布置过，未重复发布");
      }
      // 有跳过或部分定向：必须写成定向名单，避免「全体可见」再次覆盖已布置学生
      if (skippedAlreadyAssigned > 0 || !visibleToAll || fresh.length < memberIds.length) {
        targetIds = fresh;
      } else {
        targetIds = [];
      }
    }

    const row: ClassroomAssignment = {
      id: crypto.randomUUID(),
      exam_id: data.examId,
      teacher_label: data.teacherLabel,
      title: data.title,
      class_name: className,
      due_at: data.dueAt ?? null,
      hide_answers: data.hideAnswers,
      created_at: new Date().toISOString(),
      teacher_user_id: auth.userId,
      grade_id: effectiveGradeId,
      class_id: classId,
      target_mode: assignmentTargetMode(targetIds),
      ...(targetIds.length ? { target_student_ids: targetIds } : {}),
    };

    if (!db) {
      await mutateLocalClassroomStore((store) => {
        store.assignments.unshift({
          id: row.id,
          exam_id: row.exam_id,
          teacher_label: row.teacher_label,
          title: row.title,
          class_name: row.class_name,
          due_at: row.due_at,
          hide_answers: row.hide_answers,
          created_at: row.created_at,
          teacher_user_id: row.teacher_user_id,
          grade_id: row.grade_id,
          class_id: row.class_id,
          ...(targetIds.length ? { target_student_ids: targetIds } : {}),
        });
      });
      return {
        assignment: row,
        skippedAlreadyAssigned,
        publishedStudentCount: targetIds.length > 0 ? targetIds.length : undefined,
      };
    }

    const base = {
      id: row.id,
      exam_id: row.exam_id,
      teacher_label: row.teacher_label,
      title: row.title,
      class_name: row.class_name,
      due_at: row.due_at,
      hide_answers: row.hide_answers,
      teacher_user_id: row.teacher_user_id,
      class_id: row.class_id,
    };
    let { error } = await db
      .from("classroom_assignments")
      .insert({ ...base, grade_id: row.grade_id } as never);
    if (error && isMissingSchemaError(error.message, "class_id")) {
      const { class_id: _cid, ...withoutClass } = base;
      ({ error } = await db
        .from("classroom_assignments")
        .insert({ ...withoutClass, grade_id: row.grade_id } as never));
      if (!error) row.class_id = null;
    }
    if (error && isMissingSchemaError(error.message, "grade_id")) {
      // 兼容尚未执行年级迁移的环境：作业仍可发布，年级留空
      const { class_id: cid, ...rest } = base;
      ({ error } = await db.from("classroom_assignments").insert({
        ...rest,
        ...(cid ? { class_id: cid } : {}),
      } as never));
      if (!error) row.grade_id = null;
    }
    if (error) throw new Error(error.message);

    if (targetIds.length) {
      const { error: tErr } = await db
        .from(ASSIGNMENT_TARGETS_TABLE)
        .insert(targetIds.map((sid) => ({ assignment_id: row.id, student_user_id: sid })));
      if (tErr) {
        // 定向失败不得降级为全体可见：回滚作业并明确报错
        await db.from("classroom_assignments").delete().eq("id", row.id);
        if (isMissingSchemaError(tErr.message, ASSIGNMENT_TARGETS_TABLE)) {
          throw new Error("数据库尚未完成建表。请在配库页完成初始化后再试。");
        }
        throw new Error(tErr.message);
      }
    }
    return {
      assignment: row,
      skippedAlreadyAssigned,
      publishedStudentCount: targetIds.length > 0 ? targetIds.length : undefined,
    };
  });

/**
 * 教师端：取消已发布作业（删除作业 + 定向名单 + 全部学生作答/占位记录）。
 * 不可逆；仅作业所有者可操作。
 */
export const cancelClassroomAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CancelAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const assignment = await assertTeacherOwnsAssignment(
      auth,
      data.assignmentId,
      "只能取消自己发布的作业",
    );

    const db = await loadSupabaseAdmin();
    if (!db) {
      await mutateLocalClassroomStore((store) => {
        store.assignments = store.assignments.filter(
          (row) => String(row.id ?? "") !== assignment.id,
        );
        store.submissions = store.submissions.filter(
          (row) => String(row.assignment_id ?? "") !== assignment.id,
        );
      });
      return { ok: true as const, assignmentId: assignment.id };
    }

    const { error: tErr } = await db
      .from(ASSIGNMENT_TARGETS_TABLE)
      .delete()
      .eq("assignment_id", assignment.id);
    if (tErr && !isMissingSchemaError(tErr.message, ASSIGNMENT_TARGETS_TABLE)) {
      throw new Error(tErr.message);
    }

    const { error: sErr } = await db
      .from("classroom_submissions")
      .delete()
      .eq("assignment_id", assignment.id);
    if (sErr) throw new Error(sErr.message);

    const { error: aErr } = await db
      .from("classroom_assignments")
      .delete()
      .eq("id", assignment.id);
    if (aErr) throw new Error(aErr.message);

    return { ok: true as const, assignmentId: assignment.id };
  });

/** 云端写入：已提交行（逐级降级兼容未执行迁移的环境） */
async function insertSubmittedRowInCloud(
  db: SupabaseAdmin,
  rec: SubmissionRecord & { submitted_at: string },
): Promise<void> {
  const base = {
    id: rec.id,
    assignment_id: rec.assignment_id,
    student_label: rec.student_label,
    answer_payload: rec.answer_payload as unknown as Json,
    student_user_id: rec.student_user_id,
    submitted_at: rec.submitted_at,
  };
  const attempts = [
    { ...base, started_at: rec.started_at, grade_result: rec.grade_result as unknown as Json },
    { ...base, grade_result: rec.grade_result as unknown as Json },
    { ...base },
  ];
  let lastMessage = "";
  for (const payload of attempts) {
    const { error } = await db.from("classroom_submissions").insert(payload as never);
    if (!error) return;
    lastMessage = error.message;
    if (!isMissingSchemaError(error.message, "started_at", "grade_result")) break;
  }
  throw new Error(lastMessage || "提交写入失败");
}

/** 云端写入：把进行中占位行升级为已提交（保留原 started_at） */
async function updateSubmittedRowInCloud(
  db: SupabaseAdmin,
  recordId: string,
  patch: { payload: StudentAnswerPayload; submittedAt: string; grade: SubmissionGradeResult },
): Promise<void> {
  const base = {
    answer_payload: patch.payload as unknown as Json,
    submitted_at: patch.submittedAt,
  };
  const attempts = [{ ...base, grade_result: patch.grade as unknown as Json }, { ...base }];
  let lastMessage = "";
  for (const payload of attempts) {
    const { error } = await db
      .from("classroom_submissions")
      .update(payload as never)
      .eq("id", recordId);
    if (!error) return;
    lastMessage = error.message;
    if (!isMissingSchemaError(error.message, "grade_result")) break;
  }
  throw new Error(lastMessage || "提交写入失败");
}

function duplicateSubmitMessage(identity: StudentIdentity): string {
  return identity.userId ? "你已提交过该作业，不能重复提交" : "该姓名已提交过本作业，请勿重复提交";
}

/** 将答案中的 data URL 落盘为 /student-answers/...，写入前再 strip 残留 */
async function materializeInkPayload(
  assignmentId: string,
  identity: StudentIdentity,
  raw: StudentAnswerPayload,
): Promise<StudentAnswerPayload> {
  const { studentInkStorageKey, writeStudentInkFromDataUrl } = await import(
    "@/lib/studentInk.server"
  );
  const studentKey = studentInkStorageKey({
    userId: identity.userId,
    label: identity.label,
  });
  const answers: StudentAnswerPayload["answers"] = {};
  for (const [questionId, entry] of Object.entries(raw.answers ?? {})) {
    const value = entry.value ?? "";
    if (entry.inkDataUrl?.startsWith("data:image/")) {
      const inkUri = await writeStudentInkFromDataUrl({
        assignmentId,
        studentKey,
        questionId,
        dataUrl: entry.inkDataUrl,
      });
      answers[questionId] = { value, inkUri };
      continue;
    }
    if (entry.inkUri?.startsWith("/student-answers/")) {
      answers[questionId] = { value, inkUri: entry.inkUri };
      continue;
    }
    answers[questionId] = { value };
  }
  return stripInkDataUrls({ version: 1, answers, notes: raw.notes });
}

/**
 * 学生端：提交作答并同步确定性阅卷。
 * 已有阅卷结果 → 拒绝重复提交；仅「进行中」占位行会被更新（保留 started_at 以计算用时）。
 */
export const submitClassroomAssignment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SubmitAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);

    const parsed =
      parseStudentAnswerPayload(data.answerPayload) ??
      ({
        version: 1 as const,
        answers: data.answerPayload.answers,
        notes: data.answerPayload.notes,
      } satisfies StudentAnswerPayload);

    const { assignment } = await resolveAssignmentExamId(data.assignmentId);
    const identity = studentIdentityOf(auth, data.studentLabel);
    await assertAssignmentVisibleToStudentAsync(assignment, auth.userId, identity);

    const existing = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (existing && isSubmittedRecord(existing)) {
      throw new Error(duplicateSubmitMessage(identity));
    }

    const payload = await materializeInkPayload(data.assignmentId, identity, parsed);
    const gradeResult = await gradeForAssignment(assignment, payload);
    const studentView = gradeResultForStudentView(gradeResult);
    const submittedAt = new Date().toISOString();
    const startedAt = existing?.started_at ?? null;
    const durationSec = computeDurationSec(startedAt, submittedAt);

    const db = await loadSupabaseAdmin();
    if (!db) {
      await mutateLocalClassroomStore((store) => {
        if (existing) {
          const idx = store.submissions.findIndex((r) => String(r.id ?? "") === existing.id);
          if (idx >= 0) {
            store.submissions[idx] = {
              ...store.submissions[idx],
              answer_payload: payload,
              submitted_at: submittedAt,
              grade_result: gradeResult,
              started_at: startedAt,
              student_user_id: auth.userId,
              student_label: data.studentLabel,
            };
            return;
          }
        }
        store.submissions.push({
          id: crypto.randomUUID(),
          assignment_id: data.assignmentId,
          student_label: data.studentLabel,
          answer_payload: payload,
          submitted_at: submittedAt,
          started_at: startedAt,
          student_user_id: auth.userId,
          grade_result: gradeResult,
        });
      });
    } else if (existing) {
      await updateSubmittedRowInCloud(db, existing.id, {
        payload,
        submittedAt,
        grade: gradeResult,
      });
    } else {
      await insertSubmittedRowInCloud(db, {
        id: crypto.randomUUID(),
        assignment_id: data.assignmentId,
        student_label: data.studentLabel,
        answer_payload: payload,
        submitted_at: submittedAt,
        started_at: null,
        student_user_id: auth.userId,
        grade_result: gradeResult,
      });
    }
    return {
      ok: true as const,
      gradeResult: studentView,
      startedAt,
      submittedAt,
      durationSec,
    };
  });

/**
 * 学生端：标记开始作答（开始计时）。幂等：已有 started_at 或已提交则不改动。
 * 占位行 answer_payload 为空、submitted_at 为空，提交时原地升级，唯一约束仍成立。
 */
export const markAssignmentStarted = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MarkStartedSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);

    const { assignment } = await resolveAssignmentExamId(data.assignmentId);
    const identity = studentIdentityOf(auth, data.studentLabel);
    await assertAssignmentVisibleToStudentAsync(assignment, auth.userId, identity);

    if (!identity.userId && !identity.label) {
      return {
        ok: false as const,
        status: "pending" as AssignmentAttemptStatus,
        startedAt: null as string | null,
        reason: "需要学生姓名才能开始计时",
      };
    }

    const existing = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (existing && isSubmittedRecord(existing)) {
      return {
        ok: true as const,
        status: "submitted" as AssignmentAttemptStatus,
        startedAt: existing.started_at,
      };
    }
    if (existing?.started_at) {
      return {
        ok: true as const,
        status: "in_progress" as AssignmentAttemptStatus,
        startedAt: existing.started_at,
      };
    }

    const startedAt = new Date().toISOString();
    const db = await loadSupabaseAdmin();
    if (!db) {
      await mutateLocalClassroomStore((store) => {
        if (existing) {
          const idx = store.submissions.findIndex((r) => String(r.id ?? "") === existing.id);
          if (idx >= 0) {
            store.submissions[idx] = {
              ...store.submissions[idx],
              started_at: startedAt,
            };
            return;
          }
        }
        store.submissions.push({
          id: crypto.randomUUID(),
          assignment_id: data.assignmentId,
          student_label: identity.label ?? auth.displayName ?? "",
          answer_payload: { version: 1, answers: {} },
          student_user_id: auth.userId,
          started_at: startedAt,
          submitted_at: null,
        });
      });
    } else if (existing) {
      const { error } = await db
        .from("classroom_submissions")
        .update({ started_at: startedAt } as never)
        .eq("id", existing.id);
      if (error) {
        if (isMissingSchemaError(error.message, "started_at")) {
          throw new Error("数据库缺少开始计时字段，请先在配库页完成迁移后重试");
        }
        throw new Error(error.message);
      }
    } else {
      const { error } = await db.from("classroom_submissions").insert({
        id: crypto.randomUUID(),
        assignment_id: data.assignmentId,
        student_label: identity.label ?? auth.displayName ?? "",
        answer_payload: { version: 1, answers: {} } as unknown as Json,
        student_user_id: auth.userId,
        started_at: startedAt,
        submitted_at: null,
      } as never);
      if (error) {
        if (
          isMissingSchemaError(error.message, "started_at", "submitted_at") ||
          /submitted_at/i.test(error.message)
        ) {
          throw new Error("数据库尚未支持开始计时，请先在配库页完成迁移后重试");
        }
        throw new Error(error.message);
      }
    }
    return {
      ok: true as const,
      status: "in_progress" as AssignmentAttemptStatus,
      startedAt,
    };
  });

/** 学生端：作业详情（含是否隐藏答案）；不返回定向名单 */
export const getClassroomAssignment = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { assignment } = await resolveAssignmentExamId(data.id);
    return { assignment: assignmentForStudentView(assignment) };
  });

/** 学生端：读取自己的提交与阅卷结果（仅本人；进行中返回 draft 供恢复） */
export const getMyClassroomSubmission = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MySubmissionSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);

    const identity = studentIdentityOf(auth, data.studentLabel);
    const rec = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (!rec || !isSubmittedRecord(rec)) {
      const draft =
        rec && !isSubmittedRecord(rec)
          ? stripInkDataUrls(
              parseStudentAnswerPayload(rec.answer_payload) ?? { version: 1, answers: {} },
            )
          : null;
      return {
        submission: null as ClassroomSubmission | null,
        draft,
        startedAt: rec?.started_at ?? null,
        durationSec: null as number | null,
      };
    }
    const submission = toPublicSubmission(rec);
    if (submission.grade_result) {
      submission.grade_result = gradeResultForStudentView(submission.grade_result);
    }
    return {
      submission,
      draft: null as StudentAnswerPayload | null,
      startedAt: rec.started_at ?? null,
      durationSec: computeDurationSec(rec.started_at, submission.submitted_at),
    };
  });

/** 学生端：上传单题手写笔迹 → 落盘并返回 URI */
export const uploadStudentInk = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UploadInkSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);
    const { assignment } = await resolveAssignmentExamId(data.assignmentId);
    const identity = studentIdentityOf(auth, data.studentLabel);
    await assertAssignmentVisibleToStudentAsync(assignment, auth.userId, identity);
    const existing = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (existing && isSubmittedRecord(existing)) {
      throw new Error("作业已提交，无法再改手写");
    }
    const { studentInkStorageKey, writeStudentInkFromDataUrl } = await import(
      "@/lib/studentInk.server"
    );
    const inkUri = await writeStudentInkFromDataUrl({
      assignmentId: data.assignmentId,
      studentKey: studentInkStorageKey({ userId: identity.userId, label: identity.label }),
      questionId: data.questionId,
      dataUrl: data.dataUrl,
    });
    return { inkUri };
  });

/** 学生端：清空单题手写文件 */
export const clearStudentInk = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({
      assignmentId: z.string().uuid(),
      questionId: z.string().min(1).max(80),
      studentLabel: z.string().min(1).max(80).optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);
    const { assignment } = await resolveAssignmentExamId(data.assignmentId);
    const identity = studentIdentityOf(auth, data.studentLabel);
    await assertAssignmentVisibleToStudentAsync(assignment, auth.userId, identity);
    const existing = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (existing && isSubmittedRecord(existing)) {
      throw new Error("作业已提交，无法再改手写");
    }
    const { studentInkStorageKey, removeStudentInkFile } = await import(
      "@/lib/studentInk.server"
    );
    await removeStudentInkFile({
      assignmentId: data.assignmentId,
      studentKey: studentInkStorageKey({ userId: identity.userId, label: identity.label }),
      questionId: data.questionId,
    });
    return { ok: true as const };
  });

/** 学生端：进行中草稿自动保存（不阅卷、不提交） */
export const saveAssignmentDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SaveDraftSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);
    const { assignment } = await resolveAssignmentExamId(data.assignmentId);
    const identity = studentIdentityOf(auth, data.studentLabel);
    await assertAssignmentVisibleToStudentAsync(assignment, auth.userId, identity);

    const existing = await findStudentSubmissionRecord(data.assignmentId, identity);
    if (existing && isSubmittedRecord(existing)) {
      throw new Error("作业已提交，无法保存草稿");
    }

    const parsed =
      parseStudentAnswerPayload(data.answerPayload) ??
      ({
        version: 1 as const,
        answers: data.answerPayload.answers,
        notes: data.answerPayload.notes,
      } satisfies StudentAnswerPayload);
    const payload = await materializeInkPayload(data.assignmentId, identity, parsed);
    const startedAt = existing?.started_at ?? new Date().toISOString();
    const label = identity.label ?? auth.displayName ?? data.studentLabel ?? "";

    const db = await loadSupabaseAdmin();
    if (!db) {
      await mutateLocalClassroomStore((store) => {
        if (existing) {
          const idx = store.submissions.findIndex((r) => String(r.id ?? "") === existing.id);
          if (idx >= 0) {
            store.submissions[idx] = {
              ...store.submissions[idx],
              answer_payload: payload,
              started_at: startedAt,
              submitted_at: null,
              student_user_id: auth.userId,
              student_label: label,
            };
            return;
          }
        }
        store.submissions.push({
          id: crypto.randomUUID(),
          assignment_id: data.assignmentId,
          student_label: label,
          answer_payload: payload,
          student_user_id: auth.userId,
          started_at: startedAt,
          submitted_at: null,
        });
      });
    } else if (existing) {
      const { error } = await db
        .from("classroom_submissions")
        .update({
          answer_payload: payload as unknown as Json,
          started_at: startedAt,
          student_label: label,
        } as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("classroom_submissions").insert({
        id: crypto.randomUUID(),
        assignment_id: data.assignmentId,
        student_label: label,
        answer_payload: payload as unknown as Json,
        student_user_id: auth.userId,
        started_at: startedAt,
        submitted_at: null,
      } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, savedAt: new Date().toISOString(), draft: payload };
  });

/** 教师端：查看某学生提交详情（含手写 URI） */
export const getTeacherSubmissionDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => TeacherSubmissionDetailSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertTeacherOwnsAssignment(auth, data.assignmentId, "只能查看自己发布的作业提交");
    if (!data.studentUserId && !data.studentLabel?.trim()) {
      throw new Error("请指定学生");
    }
    const records = await loadSubmissionRecordsForAssignment(data.assignmentId);
    const rec = records.find((r) => {
      if (!isSubmittedRecord(r)) return false;
      if (data.studentUserId && r.student_user_id === data.studentUserId) return true;
      if (data.studentLabel?.trim() && r.student_label === data.studentLabel.trim()) return true;
      return false;
    });
    if (!rec) throw new Error("未找到该学生的提交");
    const submission = toPublicSubmission(rec);
    return {
      submission: {
        ...submission,
        answer_payload: stripInkDataUrls(
          parseStudentAnswerPayload(submission.answer_payload) ?? submission.answer_payload,
        ),
      },
    };
  });

/** 教师端：查看某作业的学生提交（仅作业发布者；不含进行中占位行） */
export const listClassroomSubmissions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListSubmissionsSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertTeacherOwnsAssignment(auth, data.assignmentId, "只能查看自己发布的作业提交");

    const records = await loadSubmissionRecordsForAssignment(data.assignmentId);
    const submissions = records
      .filter(isSubmittedRecord)
      .map(toPublicSubmission)
      .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
    return { submissions };
  });

/** 学生端：批量查看可见作业的进度（未开始 / 进行中 / 已提交 + 分数与用时） */
export const listMyAssignmentStatuses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MyStatusesSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertStudentAccess(auth);

    const identity = studentIdentityOf(auth, data.studentLabel);
    const visible = await loadAssignmentsVisibleToStudent(auth);

    const { listExamsForLibrary } = await import("@/lib/examStorage/libraryList.server");
    const { exams } = await listExamsForLibrary();
    const subjectsByExamId = new Map<string, string[]>();
    for (const exam of exams) {
      subjectsByExamId.set(exam.id, exam.subjects ?? []);
    }

    const statuses: StudentAssignmentStatus[] = [];
    for (const assignment of visible) {
      const rec = await findStudentSubmissionRecord(assignment.id, identity);
      const status = submissionAttemptStatus(rec);
      const submittedAt = status === "submitted" ? (rec?.submitted_at ?? null) : null;
      const subjects = subjectsByExamId.get(assignment.exam_id) ?? [];
      statuses.push({
        assignmentId: assignment.id,
        examId: assignment.exam_id,
        title: assignment.title,
        gradeId: assignment.grade_id,
        dueAt: assignment.due_at,
        createdAt: assignment.created_at,
        status,
        score: rec?.grade_result?.score ?? null,
        maxScore: rec?.grade_result?.maxScore ?? null,
        startedAt: rec?.started_at ?? null,
        submittedAt,
        durationSec: computeDurationSec(rec?.started_at, submittedAt),
        subjects,
        subjectIds: curriculumSubjectIdsFromExamSubjects(subjects),
      });
    }
    // 未完成在前且最新优先；已提交沉底（组内同样规则由前端复用）
    statuses.sort((a, b) => {
      const aDone = a.status === "submitted" ? 1 : 0;
      const bDone = b.status === "submitted" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return { statuses };
  });

/** 教师端：某作业的发布对象名册（含未提交学生、分数、用时与错题题型摘要） */
export const listAssignmentRoster = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RosterSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const assignment = await assertTeacherOwnsAssignment(
      auth,
      data.assignmentId,
      "只能查看自己发布的作业名册",
    );

    const records = await loadSubmissionRecordsForAssignment(data.assignmentId);
    let targetIds = normalizeStudentIdList(assignment.target_student_ids);
    /** 班内全体可见：名册以班级成员为底，避免「有班无人表」 */
    if (assignment.class_id && targetIds.length === 0) {
      const { listMemberIdsForClass } = await import("@/lib/class.helpers.server");
      targetIds = await listMemberIdsForClass(assignment.class_id);
    }
    const targetSet = new Set(targetIds);
    const labelByUserId = await displayNamesForUserIds(targetIds);

    const entries: AssignmentRosterEntry[] = [];
    const coveredUserIds = new Set<string>();

    for (const rec of records) {
      const status = submissionAttemptStatus(rec);
      const submittedAt = status === "submitted" ? (rec.submitted_at ?? null) : null;
      if (rec.student_user_id) coveredUserIds.add(rec.student_user_id);
      const wrongTypeCounts = wrongTypeCountsFromGrade(rec.grade_result);
      entries.push({
        studentUserId: rec.student_user_id ?? null,
        studentLabel:
          rec.student_label ||
          (rec.student_user_id ? (labelByUserId.get(rec.student_user_id) ?? "") : ""),
        targeted:
          targetSet.size === 0 ||
          Boolean(rec.student_user_id && targetSet.has(rec.student_user_id)),
        status,
        score: rec.grade_result?.score ?? null,
        maxScore: rec.grade_result?.maxScore ?? null,
        ungradedCount: rec.grade_result?.ungradedCount ?? null,
        wrongCount: rec.grade_result ? (rec.grade_result.wrongQuestionIds?.length ?? 0) : null,
        wrongTypeCounts,
        startedAt: rec.started_at ?? null,
        submittedAt,
        durationSec: computeDurationSec(rec.started_at, submittedAt),
      });
    }

    for (const sid of targetIds) {
      if (coveredUserIds.has(sid)) continue;
      entries.push({
        studentUserId: sid,
        studentLabel: labelByUserId.get(sid) ?? "",
        targeted: true,
        status: "pending",
        score: null,
        maxScore: null,
        ungradedCount: null,
        wrongCount: null,
        wrongTypeCounts: {},
        startedAt: null,
        submittedAt: null,
        durationSec: null,
      });
    }

    const summary = {
      targetCount: targetIds.length,
      rosterCount: entries.length,
      submittedCount: entries.filter((e) => e.status === "submitted").length,
      inProgressCount: entries.filter((e) => e.status === "in_progress").length,
      pendingCount: entries.filter((e) => e.status === "pending").length,
    };

    return {
      assignmentId: assignment.id,
      title: assignment.title,
      gradeId: assignment.grade_id,
      gradeLabel: assignment.grade_id ? gradeLevelLabel(assignment.grade_id) : "",
      targetMode: assignment.target_mode ?? assignmentTargetMode(assignment.target_student_ids),
      entries,
      summary,
    };
  });

/** 教师端：按年级列出试卷及其发布状态（是否已布置、布置给谁） */
export const listExamsPublishStatusForGrade = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ExamsForGradeSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertTeacherAccess(auth);

    const gradeId = normalizeGradeIdOrThrow(data.gradeId);
    if (!gradeId) throw new Error("请选择年级");

    const teacherUserId = auth.userId && profileHasRole(auth, "teacher") ? auth.userId : null;
    const { listExamsForLibrary } = await import("@/lib/examStorage/libraryList.server");
    const [{ exams }, assignments] = await Promise.all([
      listExamsForLibrary(),
      loadAssignments({ teacherUserId }),
    ]);

    const classId = data.classId?.trim() || null;
    const byExamId = new Map<string, ClassroomAssignment[]>();
    for (const a of assignments) {
      if (classId && String(a.class_id ?? "").trim() !== classId) continue;
      const list = byExamId.get(a.exam_id) ?? [];
      list.push(a);
      byExamId.set(a.exam_id, list);
    }

    let classMemberIds: string[] = [];
    if (classId) {
      const { listMemberIdsForClass } = await import("@/lib/class.helpers.server");
      classMemberIds = await listMemberIdsForClass(classId);
    }

    const { examIsAssignableByQuality } = await import("@/lib/examQualityReport.shared");
    const rows: ExamPublishStatus[] = exams
      .filter((exam) => examMatchesGradeFilter(exam.subjects, gradeId))
      .filter((exam) => examIsAssignableByQuality(exam))
      .map((exam) => {
        const related = byExamId.get(exam.id) ?? [];
        const covered = classId
          ? studentIdsAlreadyCoveredByExamInClass({
              examId: exam.id,
              classId,
              classMemberIds,
              existing: related,
            })
          : new Set<string>();
        const allMembersCovered =
          classId != null &&
          classMemberIds.length > 0 &&
          classMemberIds.every((id) => covered.has(id));
        return {
          examId: exam.id,
          title: exam.title,
          subjects: exam.subjects ?? [],
          difficulty: exam.difficulty,
          totalScore: exam.total_score,
          createdAt: exam.created_at,
          published: classId ? allMembersCovered : related.length > 0,
          coveredStudentCount: classId ? covered.size : undefined,
          coveredStudentIds: classId ? [...covered] : undefined,
          classMemberCount: classId ? classMemberIds.length : undefined,
          assignments: related.map((a) => ({
            assignmentId: a.id,
            title: a.title,
            gradeId: a.grade_id,
            createdAt: a.created_at,
            dueAt: a.due_at,
            targetMode: a.target_mode ?? assignmentTargetMode(a.target_student_ids),
            targetCount: a.target_student_ids?.length ?? 0,
          })),
        };
      })
      // 未布置在前（最新优先）；已对本班全部布置的沉底
      .sort((a, b) => {
        const ap = a.published ? 1 : 0;
        const bp = b.published ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      });

    /** 试卷库中实际有卷的年级（用于空列表提示，避免误以为接口失败） */
    const gradesWithExams: string[] = [];
    let suggestedGradeId: string | null = null;
    let suggestedCount = 0;
    for (const opt of GRADE_LEVEL_OPTIONS) {
      const n = exams.filter((exam) => examMatchesGradeFilter(exam.subjects, opt.id)).length;
      if (n > 0) {
        gradesWithExams.push(opt.id);
        if (n > suggestedCount) {
          suggestedCount = n;
          suggestedGradeId = opt.id;
        }
      }
    }

    return {
      gradeId,
      gradeLabel: gradeLevelLabel(gradeId),
      exams: rows,
      publishedCount: rows.filter((r) => r.published).length,
      libraryExamCount: exams.length,
      gradesWithExams,
      gradesWithExamsLabels: gradesWithExams.map((id) => gradeLevelLabel(id)),
      /** 有卷最多的年级；当前年级为空时可引导切换 */
      suggestedGradeId,
      suggestedGradeLabel: suggestedGradeId ? gradeLevelLabel(suggestedGradeId) : null,
    };
  });

async function assertTeacherOwnsAssignment(
  auth: AuthContext,
  assignmentId: string,
  denyMessage = "只能操作自己发布的作业",
): Promise<ClassroomAssignment> {
  (await loadAuthHelpers()).assertTeacherAccess(auth);
  const { assignment } = await resolveAssignmentExamId(assignmentId);
  if (auth.userId && assignment.teacher_user_id && assignment.teacher_user_id !== auth.userId) {
    throw new Error(denyMessage);
  }
  return assignment;
}

/** 定向名单展示名：云端 user_profiles；本机 MySQL local_accounts */
async function displayNamesForUserIds(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = normalizeStudentIdList(userIds);
  if (!ids.length) return out;
  const db = await loadSupabaseAdmin();
  if (!db) {
    try {
      const { loadLocalProfile } = await import("@/lib/mysqlAccountStore.server");
      await Promise.all(
        ids.map(async (id) => {
          const profile = await loadLocalProfile(id);
          const name = profile?.display_name?.trim();
          if (name) out.set(id, name);
        }),
      );
    } catch {
      /* ignore */
    }
    return out;
  }
  const { data: rows, error } = await db
    .from("user_profiles")
    .select("id, display_name")
    .in("id", ids);
  if (error) return out;
  for (const row of rows ?? []) {
    const id = String((row as { id?: unknown }).id ?? "");
    const name = textOrNull((row as { display_name?: unknown }).display_name);
    if (id && name) out.set(id, name);
  }
  return out;
}

async function loadAssignmentGrades(assignmentId: string): Promise<SubmissionGradeResult[]> {
  await assertAccountSchemaReady();
  const records = await loadSubmissionRecordsForAssignment(assignmentId);
  return records.map((r) => r.grade_result).filter((g): g is SubmissionGradeResult => Boolean(g));
}

/** 教师：预览错题巩固卷（按卷内知识点 + composition） */
export const previewWrongDrillComposition = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WrongDrillSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const assignment = await assertTeacherOwnsAssignment(auth, data.assignmentId);
    const { loadExamBundleForClassroom } = await import("@/lib/classroomExamLoad.server");
    const { summarizeWrongDrill } = await import("@/lib/classroomWrongDrill.server");
    const { exam, questions } = await loadExamBundleForClassroom(assignment.exam_id);
    const grades = await loadAssignmentGrades(data.assignmentId);
    const selectedKnowledgeTags =
      data.selectedKnowledgeTags ?? data.selectedTypeIds ?? undefined;
    const summary = summarizeWrongDrill({
      grades,
      questions,
      selectedKnowledgeTags,
    });

    const locked = resolveWrongDrillGradeSubject({
      assignmentGradeId: assignment.grade_id,
      examSubjects: exam.subjects,
      requestedSubjectId: data.subjectId,
    });

    return {
      ok: summary.ok,
      reason: summary.reason,
      assignmentId: assignment.id,
      examId: exam.id,
      examTitle: exam.title,
      studentSubmitCount: summary.knowledgeAggregate.studentSubmitCount,
      wrongHitCount: summary.knowledgeAggregate.wrongHitCount,
      wrongCountByKnowledge: summary.knowledgeAggregate.wrongCountByKnowledge,
      compositionCounts: summary.compositionCounts,
      compositionPayload: summary.compositionPayload,
      typeRows: summary.typeRows,
      seedQuestionIds: summary.seedQuestionIds,
      suggestedSubjectId: locked.subjectId,
      suggestedGradeId: locked.gradeId,
      subjectIds: locked.subjectIds,
      subjectOptions: locked.subjectOptions,
      subjectLabel: locked.subjectId
        ? curriculumSubjectLabel(locked.subjectId)
        : locked.subjectOptions.map((o) => o.label).join(" · "),
      gradeLabel: locked.gradeId ? gradeLevelLabel(locked.gradeId) : "",
      gradeLocked: locked.gradeLocked,
      subjectLocked: locked.subjectLocked,
      gradeFromExam: locked.gradeFromExam,
      needsSubjectChoice: locked.needsSubjectChoice,
      needsSubjectOrGrade:
        !locked.gradeId || locked.subjectIds.length === 0 || locked.needsSubjectChoice,
      untaggedKey: WRONG_DRILL_UNTAGGED,
    };
  });

/** 教师：按错题知识点 → 同结构新题，返回命题队列预填载荷 */
export const enqueueWrongDrillFreshByType = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WrongDrillSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const assignment = await assertTeacherOwnsAssignment(auth, data.assignmentId);
    const { loadExamBundleForClassroom } = await import("@/lib/classroomExamLoad.server");
    const { summarizeWrongDrill, buildWrongDrillPaperPrefill } =
      await import("@/lib/classroomWrongDrill.server");
    const { exam, questions } = await loadExamBundleForClassroom(assignment.exam_id);
    const grades = await loadAssignmentGrades(data.assignmentId);
    const selectedKnowledgeTags =
      data.selectedKnowledgeTags ?? data.selectedTypeIds ?? undefined;
    const summary = summarizeWrongDrill({
      grades,
      questions,
      selectedKnowledgeTags,
    });
    if (!summary.ok) throw new Error(summary.reason ?? "无法生成巩固卷");

    const locked = resolveWrongDrillGradeSubject({
      assignmentGradeId: assignment.grade_id,
      examSubjects: exam.subjects,
      requestedSubjectId: data.subjectId,
    });
    if (!locked.gradeId) {
      throw new Error("试卷/班级未带入年级，无法生成巩固卷（禁止猜测）");
    }
    if (locked.subjectIds.length === 0) {
      throw new Error("试卷未标注可识别学科，无法生成巩固卷（禁止猜测）");
    }
    if (!locked.subjectId) {
      throw new Error("本卷含多个学科，请先选择本次巩固使用的学科");
    }

    const rawPaperKind = (exam as Exam & { paper_kind?: string }).paper_kind;
    const paperKind =
      typeof rawPaperKind === "string" && isPaperKindId(rawPaperKind)
        ? rawPaperKind
        : "regular_daily";

    const typeLabelByType = new Map(
      questions.map((q) => [String(q.type ?? "").trim(), q.type_label ?? null] as const),
    );

    const payload = buildWrongDrillPaperPrefill({
      title: (data.title?.trim() || `${assignment.title} · 错题巩固`).slice(0, 200),
      gradeId: locked.gradeId,
      subjectId: locked.subjectId,
      difficulty: (data.difficulty ?? exam.difficulty ?? "intermediate") as Difficulty,
      durationMin: exam.duration_min ?? 90,
      totalScore: exam.total_score,
      paperKind,
      compositionCounts: summary.compositionCounts,
      typeLabelByType,
      knowledgeTags: summary.selectedKnowledgeTags,
      notes: data.notes?.trim() || undefined,
    });

    return {
      ok: true as const,
      mode: "fresh_by_type" as const,
      paperPrefill: payload,
      gradeLabel: gradeLevelLabel(locked.gradeId),
      subjectLabel: curriculumSubjectLabel(locked.subjectId),
      selectedKnowledgeTags: summary.selectedKnowledgeTags,
    };
  });

/** 教师：错题变式卷 → 服务端生成并写入本地题库 */
export const enqueueWrongDrillVariantExam = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => WrongDrillSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const assignment = await assertTeacherOwnsAssignment(auth, data.assignmentId);
    const { loadExamBundleForClassroom } = await import("@/lib/classroomExamLoad.server");
    const { summarizeWrongDrill, persistWrongVariantExam } =
      await import("@/lib/classroomWrongDrill.server");
    const { exam, questions } = await loadExamBundleForClassroom(assignment.exam_id);
    const grades = await loadAssignmentGrades(data.assignmentId);
    const selectedKnowledgeTags =
      data.selectedKnowledgeTags ?? data.selectedTypeIds ?? undefined;
    const summary = summarizeWrongDrill({
      grades,
      questions,
      selectedKnowledgeTags,
    });
    if (!summary.ok) throw new Error(summary.reason ?? "无法生成变式卷");

    const byId = new Map(questions.map((q) => [q.id, q]));
    const seeds = summary.seedQuestionIds
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
    if (!seeds.length) throw new Error("没有可用的错题种子");

    const result = await persistWrongVariantExam({
      sourceExam: exam,
      seedQuestions: seeds,
      title: (data.title?.trim() || `${assignment.title} · 错题变式`).slice(0, 200),
      ai: data.ai as AiRuntimePayload | undefined,
    });

    return {
      ok: true as const,
      mode: "variant_from_wrong" as const,
      examId: result.examId,
      questionCount: result.questionCount,
      seedQuestionIds: result.seedQuestionIds,
      selectedKnowledgeTags: summary.selectedKnowledgeTags,
    };
  });
