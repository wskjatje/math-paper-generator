/**
 * 对已入库试卷加载快照并按存储后端写回 diagram_schema（批量重跑修复管线用）。
 */
import type { Example, Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import { loadMysqlExamSnapshot } from "@/lib/examStorage/mysqlExamStore.server";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import { isProjectBundledRouteId } from "@/lib/projectExamStore.server";
import { parseQuestionRasterFiguresV1 } from "@/lib/importRasterFigures.shared";
import { parseQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";
import { parseVisualGeometryEvidenceV1 } from "@/lib/visualGeometryEvidence.shared";
import type { Json } from "@/integrations/supabase/types";

export type RemediationPersistBackend = "supabase" | "mysql" | "local";

function questionFromSupabaseRow(row: Record<string, unknown>): Question {
  let diagram_schema: Question["diagram_schema"] | undefined;
  const rawDs = row.diagram_schema;
  let parsedObj: unknown = rawDs;
  if (typeof rawDs === "string") {
    try {
      parsedObj = JSON.parse(rawDs);
    } catch {
      parsedObj = null;
    }
  }
  if (parsedObj != null && typeof parsedObj === "object") {
    const parsed = safeParseGeometryDiagramSchema(parsedObj);
    if (parsed) diagram_schema = parsed;
  }
  let raster_figures: Question["raster_figures"] | undefined;
  const rawRf = row.raster_figures;
  let rfObj: unknown = rawRf;
  if (typeof rawRf === "string") {
    try {
      rfObj = JSON.parse(rawRf);
    } catch {
      rfObj = null;
    }
  }
  const rfParsed = parseQuestionRasterFiguresV1(rfObj);
  if (rfParsed) raster_figures = rfParsed;

  let figure_dependency: Question["figure_dependency"] | undefined;
  const rawFd = row.figure_dependency;
  let fdObj: unknown = rawFd;
  if (typeof rawFd === "string") {
    try {
      fdObj = JSON.parse(rawFd);
    } catch {
      fdObj = null;
    }
  }
  const fdParsed = parseQuestionFigureDependencyV1(fdObj);
  if (fdParsed) figure_dependency = fdParsed;

  let visual_geometry_evidence: Question["visual_geometry_evidence"] | undefined;
  const rawVge = row.visual_geometry_evidence;
  let vgeObj: unknown = rawVge;
  if (typeof rawVge === "string") {
    try {
      vgeObj = JSON.parse(rawVge);
    } catch {
      vgeObj = null;
    }
  }
  const vgeParsed = parseVisualGeometryEvidenceV1(vgeObj);
  if (vgeParsed) visual_geometry_evidence = vgeParsed;

  return {
    id: String(row.id),
    exam_id: String(row.exam_id),
    order_index: Number(row.order_index) || 0,
    type: row.type as Question["type"],
    type_label: row.type_label != null ? String(row.type_label) : null,
    subject: String(row.subject ?? ""),
    content: String(row.content ?? ""),
    options: Array.isArray(row.options) ? (row.options as string[]) : null,
    answer: String(row.answer ?? ""),
    solution_steps: Array.isArray(row.solution_steps)
      ? (row.solution_steps as Question["solution_steps"])
      : [],
    knowledge_tags: Array.isArray(row.knowledge_tags) ? (row.knowledge_tags as string[]) : [],
    points: Number(row.points) || 10,
    ...(diagram_schema ? { diagram_schema } : {}),
    ...(raster_figures !== undefined ? { raster_figures } : {}),
    ...(visual_geometry_evidence != null ? { visual_geometry_evidence } : {}),
    ...(figure_dependency != null ? { figure_dependency } : {}),
  };
}

function exampleFromSupabaseRow(row: Record<string, unknown>): Example {
  return {
    id: String(row.id),
    exam_id: String(row.exam_id),
    question_id: row.question_id != null ? String(row.question_id) : null,
    type: String(row.type ?? ""),
    subject: String(row.subject ?? ""),
    content: String(row.content ?? ""),
    answer: String(row.answer ?? ""),
    solution_steps: Array.isArray(row.solution_steps)
      ? (row.solution_steps as Example["solution_steps"])
      : [],
    difficulty: String(row.difficulty ?? "intermediate"),
  };
}

/**
 * 按与试卷详情一致的优先级解析快照：Supabase → MySQL → 本地 JSON。
 */
export async function loadExamSnapshotForRemediation(
  examId: string,
): Promise<{ snapshot: SessionExamSnapshot; backend: RemediationPersistBackend } | null> {
  if (isProjectBundledRouteId(examId)) return null;

  const db = getSupabaseAdmin();
  if (db) {
    const { data: examRow, error: exErr } = await db
      .from("exams")
      .select("*")
      .eq("id", examId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (examRow && !(examRow as Exam).deleted_at) {
      const [{ data: qRows, error: qErr }, { data: exRows, error: exErr }] = await Promise.all([
        db.from("questions").select("*").eq("exam_id", examId).order("order_index"),
        db.from("examples").select("*").eq("exam_id", examId),
      ]);
      if (qErr) throw new Error(qErr.message);
      if (exErr) throw new Error(exErr.message);
      const exam = examRow as Exam;
      const offline_import_media = parseOfflineImportPersistedMedia(
        (examRow as Record<string, unknown>).offline_import_media,
      );
      const snapshot: SessionExamSnapshot = {
        exam,
        questions: (qRows ?? []).map((r) => questionFromSupabaseRow(r as Record<string, unknown>)),
        examples: (exRows ?? []).map((r) => exampleFromSupabaseRow(r as Record<string, unknown>)),
        ...(offline_import_media ? { offline_import_media } : {}),
      };
      return { snapshot, backend: "supabase" };
    }
  }

  const ms = await loadMysqlExamSnapshot(examId);
  if (ms && !ms.exam.deleted_at) {
    return { snapshot: ms, backend: "mysql" };
  }

  const local = await loadLocalExam(examId);
  if (local && !local.exam.deleted_at) {
    return { snapshot: local, backend: "local" };
  }

  return null;
}

function countDiagramChanges(before: Question[], after: Question[]): number {
  let n = 0;
  for (let i = 0; i < before.length; i++) {
    const a = before[i];
    const b = after[i];
    if (!a || !b || a.id !== b.id) continue;
    const ja = JSON.stringify(a.diagram_schema ?? null);
    const jb = JSON.stringify(b.diagram_schema ?? null);
    if (ja !== jb) n++;
  }
  return n;
}

export type PersistRemediationResult = {
  changedQuestionCount: number;
};

/** 仅同步 questions[].diagram_schema。 */
export async function persistRemediationDiagramUpdates(
  before: Question[],
  snapshot: SessionExamSnapshot,
  backend: RemediationPersistBackend,
): Promise<PersistRemediationResult> {
  const changedQuestionCount = countDiagramChanges(before, snapshot.questions);
  if (changedQuestionCount === 0) {
    return { changedQuestionCount: 0 };
  }

  if (backend === "supabase") {
    const db = getSupabaseAdmin();
    if (!db) throw new Error("Supabase 不可用");
    for (const q of snapshot.questions) {
      const diagram_schema =
        q.diagram_schema != null ? (JSON.parse(JSON.stringify(q.diagram_schema)) as Json) : null;
      const { error } = await db
        .from("questions")
        .update({ diagram_schema })
        .eq("id", q.id)
        .eq("exam_id", snapshot.exam.id);
      if (error) throw new Error(error.message);
    }
    return { changedQuestionCount };
  }

  if (backend === "mysql") {
    const { updateMysqlExamQuestionsDiagramSchemas } =
      await import("@/lib/examStorage/mysqlExamStore.server");
    await updateMysqlExamQuestionsDiagramSchemas(snapshot.exam.id, snapshot.questions);
    return { changedQuestionCount };
  }

  await saveLocalExamSnapshot(snapshot);
  return { changedQuestionCount };
}
