/**
 * 将「线下」试卷快照（与导出 / 本地目录 data/local-exams 同款结构）入库或写入本地，
 * 标记 source = imported，与 AI 命题 generated 区分。
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { normalizeKnowledgeTags, normalizeQuestionType } from "@/lib/exam-generation.server";
import type { Exam, Example, Question } from "@/lib/types";
import { persistImportedBundle } from "@/lib/examStorage/persistImported.server";
import {
  computeQuestionFigureDependencyV1,
  parseQuestionFigureDependencyV1,
} from "@/lib/questionFigureDependency.shared";
import { parseVisualGeometryEvidenceV1 } from "@/lib/visualGeometryEvidence.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";

const DifficultySchema = z.enum(["beginner", "intermediate", "competition", "advanced"]);

const ExamImportSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(500),
    subtitle: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    subjects: z.array(z.string()),
    difficulty: DifficultySchema,
    duration_min: z.number(),
    total_score: z.number(),
    source: z.enum(["curated", "generated", "imported"]).optional(),
    is_featured: z.boolean().optional(),
    created_at: z.string().optional(),
    generation_duration_sec: z.number().nullable().optional(),
  })
  .passthrough();

const QuestionImportSchema = z
  .object({
    id: z.string().min(1),
    exam_id: z.string().min(1),
    order_index: z.number(),
    type: z.string(),
    subject: z.string(),
    content: z.string(),
    options: z.array(z.string()).nullable().optional(),
    answer: z.string(),
    solution_steps: z.array(z.unknown()),
    knowledge_tags: z.array(z.string()),
    points: z.number(),
  })
  .passthrough();

const ExampleImportSchema = z
  .object({
    id: z.string().min(1),
    exam_id: z.string().min(1),
    question_id: z.union([z.string(), z.null()]).optional(),
    type: z.string(),
    subject: z.string(),
    content: z.string(),
    answer: z.string(),
    solution_steps: z.array(z.unknown()),
    difficulty: z.string(),
  })
  .passthrough();

const OfflineSnapshotWrapperSchema = z.object({
  version: z.number().optional(),
  exam: ExamImportSchema,
  questions: z.array(QuestionImportSchema).min(1),
  examples: z.array(ExampleImportSchema).optional(),
});

function assertImportedQuestionsUsable(questions: Question[]): void {
  const problems: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    if (!String(q.content ?? "").trim()) problems.push(`第 ${n} 题：题干为空`);
    if (!String(q.answer ?? "").trim()) problems.push(`第 ${n} 题：答案为空`);
  });
  if (problems.length > 0) {
    throw new Error(
      `导入失败：${problems.slice(0, 8).join("；")}${problems.length > 8 ? " …" : ""}`,
    );
  }
}

/** 解析并校验线下快照外壳（questions/exam 必填；examples 可选） */
export function parseOfflineExamSnapshotJson(
  raw: unknown,
): z.infer<typeof OfflineSnapshotWrapperSchema> {
  return OfflineSnapshotWrapperSchema.parse(raw);
}

/**
 * 重新分配 id、标记 imported；题目顺序保留 order_index。
 */
export function remapSnapshotToImported(
  snap: z.infer<typeof OfflineSnapshotWrapperSchema>,
): SessionExamSnapshot {
  const sortedQs = [...snap.questions].sort((a, b) => {
    const da = Number.isFinite(a.order_index) ? a.order_index : 0;
    const db = Number.isFinite(b.order_index) ? b.order_index : 0;
    return da - db;
  });

  const newExamId = randomUUID();
  const qIdMap = new Map<string, string>();
  for (const q of sortedQs) {
    qIdMap.set(q.id, randomUUID());
  }

  const questions: Question[] = sortedQs.map((q) => {
    const pts = Number.isFinite(Number(q.points)) ? Math.round(Number(q.points)) : 10;
    const rawRec = q as Record<string, unknown>;
    const parsedFd = parseQuestionFigureDependencyV1(rawRec.figure_dependency);
    const vge = parseVisualGeometryEvidenceV1(rawRec.visual_geometry_evidence);
    const base: Question = {
      id: qIdMap.get(q.id)!,
      exam_id: newExamId,
      order_index: Number.isFinite(q.order_index) ? Math.round(q.order_index) : 0,
      type: normalizeQuestionType(q.type),
      subject: String(q.subject ?? "数学").slice(0, 200),
      content: String(q.content ?? ""),
      options: Array.isArray(q.options) ? q.options.map((o) => String(o)) : null,
      answer: String(q.answer ?? ""),
      solution_steps: Array.isArray(q.solution_steps)
        ? (q.solution_steps as Question["solution_steps"])
        : [],
      knowledge_tags: normalizeKnowledgeTags(q.knowledge_tags),
      points: Math.min(1000, Math.max(1, pts)),
    };
    return {
      ...base,
      figure_dependency: parsedFd ?? computeQuestionFigureDependencyV1(base),
      ...(vge ? { visual_geometry_evidence: vge } : {}),
    };
  });

  assertImportedQuestionsUsable(questions);

  const rawEx = snap.examples ?? [];
  const examples: Example[] = rawEx.map((ex) => {
    const qid =
      ex.question_id != null && qIdMap.has(ex.question_id) ? qIdMap.get(ex.question_id)! : null;
    return {
      id: randomUUID(),
      exam_id: newExamId,
      question_id: qid,
      type: normalizeQuestionType(ex.type),
      subject: String(ex.subject ?? "数学").slice(0, 200),
      content: String(ex.content ?? ""),
      answer: String(ex.answer ?? ""),
      solution_steps: Array.isArray(ex.solution_steps)
        ? (ex.solution_steps as Example["solution_steps"])
        : [],
      difficulty: String(ex.difficulty ?? "intermediate").slice(0, 80) || "intermediate",
    };
  });

  const exam: Exam = {
    id: newExamId,
    title: String(snap.exam.title).slice(0, 500),
    subtitle: snap.exam.subtitle != null ? String(snap.exam.subtitle).slice(0, 500) : null,
    description:
      snap.exam.description != null ? String(snap.exam.description).slice(0, 2000) : null,
    subjects: Array.isArray(snap.exam.subjects) ? snap.exam.subjects.map((s) => String(s)) : [],
    difficulty: snap.exam.difficulty,
    duration_min: Math.min(360, Math.max(1, Math.round(Number(snap.exam.duration_min)))),
    total_score: Math.min(1000, Math.max(1, Math.round(Number(snap.exam.total_score)))),
    source: "imported",
    is_featured: false,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
  };

  return { exam, questions, examples };
}

export { persistImportedBundle };

export async function importExamSnapshotFromJsonString(jsonStr: string): Promise<{
  examId: string;
  persisted: "supabase" | "local" | "mysql";
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch {
    throw new Error("JSON 解析失败：内容不是合法 JSON");
  }

  let snap: z.infer<typeof OfflineSnapshotWrapperSchema>;
  try {
    snap = parseOfflineExamSnapshotJson(parsed);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const i = e.issues[0];
      const at = i.path.length ? i.path.join(".") : "根";
      throw new Error(`快照格式无效（${at}）：${i.message}`);
    }
    throw e;
  }
  const bundle = sanitizeImportedSnapshotForPersist(remapSnapshotToImported(snap));
  return persistImportedBundle(bundle);
}
