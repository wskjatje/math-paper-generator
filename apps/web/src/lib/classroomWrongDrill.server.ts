// @ts-nocheck
/**
 * 课堂错题巩固卷：按卷内知识点聚合 + 同题型 composition 预填 + 变式卷入库。
 */
import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { generateExamplesForQuestionSet } from "@/lib/exam-generation.server";
import { saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import type { Exam, Question, QuestionType, SolutionStep } from "@/lib/types";
import { emptyQuestionComposition } from "@/lib/generateCatalog";
import type { PaperGenPayloadSnapshot } from "@/lib/generationJobs.types";
import type { PaperKindId } from "@/lib/generateCatalog";
import {
  WRONG_DRILL_UNTAGGED,
  aggregateWrongByKnowledgeTags,
  buildWrongDrillKnowledgeRows,
  compositionCountsFromTypeHits,
  compositionPayloadFromCounts,
  pickVariantSeedQuestions,
  questionTypeHitsFromWrongIds,
  wrongQuestionIdsForKnowledgeTags,
  type WrongDrillTypeRow,
} from "@/lib/wrongDrillComposition.shared";
import type { SubmissionGradeResult } from "@/lib/classroomGrade.shared";
import { normalizeAnswerText } from "@/lib/classroomGrade.shared";

async function generateVariantExamplesFromSeedQuestions(
  examId: string,
  seeds: Question[],
  ai?: AiRuntimePayload,
) {
  return generateExamplesForQuestionSet(examId, seeds, ai);
}

function normalizeStem(s: string): string {
  return normalizeAnswerText(s).replace(/\s+/g, "");
}

function typeLabelMapFromQuestions(questions: Question[]): Map<string, string | null | undefined> {
  const m = new Map<string, string | null | undefined>();
  for (const q of questions) {
    const t = String(q.type ?? "").trim();
    if (!t || m.has(t)) continue;
    m.set(t, q.type_label ?? null);
  }
  return m;
}

export function buildWrongDrillPaperPrefill(opts: {
  title: string;
  gradeId: string;
  subjectId: string;
  difficulty?: PaperGenPayloadSnapshot["difficulty"];
  durationMin?: number;
  totalScore?: number;
  paperKind?: PaperKindId;
  compositionCounts: Record<string, number>;
  typeLabelByType?: Map<string, string | null | undefined>;
  /** 卷内错题知识点（原文），写入 notes 约束命题，禁止客户端臆造 */
  knowledgeTags?: string[];
  notes?: string;
}): PaperGenPayloadSnapshot {
  const compositionPayload = compositionPayloadFromCounts(
    opts.compositionCounts,
    opts.typeLabelByType,
  );
  const composition = emptyQuestionComposition() as Record<string, number>;
  for (const row of compositionPayload) {
    composition[row.type] = (composition[row.type] ?? 0) + row.count;
  }
  const knowledgeTags = (opts.knowledgeTags ?? [])
    .map((t) => t.trim())
    .filter((t) => t && t !== WRONG_DRILL_UNTAGGED);
  const knowledgeNote =
    knowledgeTags.length > 0
      ? `【错题知识点】须围绕试卷已标注知识点命题：${knowledgeTags.join("、")}。`
      : "";
  const teacherNote = String(opts.notes ?? "").trim();
  const notes = [
    `【课堂错题巩固】${knowledgeNote}题型组成须与错题结构一致；题面不得抄袭错题原文。`,
    teacherNote ? `【教师补充】${teacherNote}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  const total =
    opts.totalScore ??
    Math.min(
      1000,
      Math.max(
        10,
        compositionPayload.reduce((s, r) => s + r.count * 10, 0),
      ),
    );
  return {
    title: opts.title.slice(0, 200),
    grade: opts.gradeId,
    subject: opts.subjectId,
    scopes: [],
    competition_focus: [],
    paper_kind: opts.paperKind ?? "regular_daily",
    difficulty: opts.difficulty ?? "intermediate",
    duration_min: opts.durationMin ?? 90,
    total_score: total,
    compositionPayload,
    composition,
    customCompositionSlots: [],
    compositionRowOrder: compositionPayload.map((r) => r.type),
    notes,
    // 巩固卷必然复用原卷结构题型；重叠闸门仅适用于「全新命题避重」，此处须放开
    allow_overlap_with_library_question_types: true,
  };
}

export function summarizeWrongDrill(opts: {
  grades: Array<SubmissionGradeResult | null | undefined>;
  questions: Question[];
  /** 勾选的卷内知识点；空/未传 = 全部可生成知识点 */
  selectedKnowledgeTags?: string[] | null;
}): {
  ok: boolean;
  reason?: string;
  knowledgeAggregate: ReturnType<typeof aggregateWrongByKnowledgeTags>;
  compositionCounts: Record<string, number>;
  compositionPayload: ReturnType<typeof compositionPayloadFromCounts>;
  typeRows: WrongDrillTypeRow[];
  selectedKnowledgeTags: string[];
  seedQuestionIds: string[];
  focusedQuestionIds: string[];
} {
  const byId = new Map(opts.questions.map((q) => [q.id, q]));
  const knowledgeAggregate = aggregateWrongByKnowledgeTags(opts.grades, byId);
  const typeRows = buildWrongDrillKnowledgeRows(knowledgeAggregate);
  const labelMap = typeLabelMapFromQuestions(opts.questions);

  if (knowledgeAggregate.studentSubmitCount <= 0) {
    return {
      ok: false,
      reason: "尚无学生提交，无法生成巩固卷",
      knowledgeAggregate,
      compositionCounts: {},
      compositionPayload: [],
      typeRows: [],
      selectedKnowledgeTags: [],
      seedQuestionIds: [],
      focusedQuestionIds: [],
    };
  }
  if (knowledgeAggregate.wrongHitCount <= 0) {
    return {
      ok: false,
      reason: "暂无错题，无需生成巩固卷",
      knowledgeAggregate,
      compositionCounts: {},
      compositionPayload: [],
      typeRows,
      selectedKnowledgeTags: [],
      seedQuestionIds: [],
      focusedQuestionIds: [],
    };
  }

  const generatableTags = typeRows.filter((r) => r.generatable).map((r) => r.type);
  const selected =
    opts.selectedKnowledgeTags?.length ?
      opts.selectedKnowledgeTags
        .map((t) => t.trim())
        .filter((t) => generatableTags.includes(t))
    : generatableTags;

  if (!generatableTags.length) {
    return {
      ok: false,
      reason: "错题未标注知识点（knowledge_tags），无法按试卷知识点生成巩固卷",
      knowledgeAggregate,
      compositionCounts: {},
      compositionPayload: [],
      typeRows,
      selectedKnowledgeTags: [],
      seedQuestionIds: [],
      focusedQuestionIds: [],
    };
  }

  if (!selected.length) {
    return {
      ok: false,
      reason: "请勾选至少一项卷内错题知识点",
      knowledgeAggregate,
      compositionCounts: {},
      compositionPayload: [],
      typeRows,
      selectedKnowledgeTags: [],
      seedQuestionIds: [],
      focusedQuestionIds: [],
    };
  }

  const focusedQuestionIds = wrongQuestionIdsForKnowledgeTags(knowledgeAggregate, selected);
  const typeHits = questionTypeHitsFromWrongIds(
    focusedQuestionIds,
    opts.grades,
    byId,
    knowledgeAggregate.studentSubmitCount,
  );
  const compositionCounts = compositionCountsFromTypeHits(
    typeHits.wrongCountByType,
    knowledgeAggregate.studentSubmitCount,
  );
  const compositionPayload = compositionPayloadFromCounts(compositionCounts, labelMap);
  if (!compositionPayload.length) {
    return {
      ok: false,
      reason: "所选知识点对应错题缺少可识别的题目结构类型，无法入命题队列",
      knowledgeAggregate,
      compositionCounts,
      compositionPayload: [],
      typeRows,
      selectedKnowledgeTags: selected,
      seedQuestionIds: [],
      focusedQuestionIds,
    };
  }

  const seeds = pickVariantSeedQuestions(focusedQuestionIds, byId);
  return {
    ok: true,
    knowledgeAggregate,
    compositionCounts,
    compositionPayload,
    typeRows,
    selectedKnowledgeTags: selected,
    seedQuestionIds: seeds.map((s) => s.id),
    focusedQuestionIds,
  };
}

/** 以错题为种子生成变式卷并写入本地题库 */
export async function persistWrongVariantExam(opts: {
  sourceExam: Exam;
  seedQuestions: Question[];
  title: string;
  ai?: AiRuntimePayload;
}): Promise<{ examId: string; questionCount: number; seedQuestionIds: string[] }> {
  if (!opts.seedQuestions.length) throw new Error("没有可用的错题种子");

  const examples = await generateVariantExamplesFromSeedQuestions(
    opts.sourceExam.id,
    opts.seedQuestions,
    opts.ai,
  );
  if (!examples.length) {
    throw new Error("变式生成未返回可用题目，请检查模型设置后重试");
  }

  const seedNorms = new Set(opts.seedQuestions.map((q) => normalizeStem(q.content)));
  const usable = examples.filter((ex) => {
    const n = normalizeStem(ex.content);
    return n.length > 0 && !seedNorms.has(n);
  });
  if (!usable.length) {
    throw new Error("变式题与错题原文过于相同或为空，已拒绝入库；请更换模型后重试");
  }

  const examId = crypto.randomUUID();
  const questions: Question[] = usable.map((ex, i) => ({
    id: crypto.randomUUID(),
    exam_id: examId,
    order_index: i,
    type: ex.type as QuestionType,
    subject: ex.subject,
    content: ex.content,
    options: null,
    answer: ex.answer,
    solution_steps: (Array.isArray(ex.solution_steps) ? ex.solution_steps : []) as SolutionStep[],
    knowledge_tags: Array.isArray(ex.knowledge_tags)
      ? ex.knowledge_tags.map((t) => String(t)).filter(Boolean)
      : [],
    points: 10,
    ...(ex.attachments?.length ? { attachments: ex.attachments } : {}),
  }));

  const totalScore = questions.reduce((s, q) => s + q.points, 0);
  const exam: Exam = {
    id: examId,
    title: opts.title.slice(0, 500),
    subtitle: "课堂错题变式巩固卷",
    description: `由作业「${opts.sourceExam.title}」错题种子生成，种子题 id：${opts.seedQuestions.map((q) => q.id).join(",")}`,
    subjects: opts.sourceExam.subjects?.length
      ? opts.sourceExam.subjects
      : [opts.seedQuestions[0]?.subject ?? ""].filter(Boolean),
    difficulty: opts.sourceExam.difficulty ?? "intermediate",
    duration_min: opts.sourceExam.duration_min ?? 90,
    total_score: totalScore,
    source: "generated",
    is_featured: false,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
  };

  await saveLocalExamSnapshot({ exam, questions, examples: [] });
  return {
    examId,
    questionCount: questions.length,
    seedQuestionIds: opts.seedQuestions.map((q) => q.id),
  };
}
