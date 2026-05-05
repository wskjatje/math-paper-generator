/**
 * 将完整快照作为「导入」写入 Supabase（exams / questions / examples）。
 * 供导入管线专用；AI 命题仍走 generateAndPersistExam。
 */
import type { Json } from "@/integrations/supabase/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

function stepsToJson(steps: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(steps ?? [])) as Json;
  } catch {
    return [] as unknown as Json;
  }
}

function describeDb(prefix: string, err: { message: string }): string {
  return `${prefix}: ${err.message}`;
}

/** 插入成功后返回云端试卷 id（可能与快照内 exam.id 不同，以数据库为准） */
export async function insertImportedExamSnapshotToSupabase(
  bundle: SessionExamSnapshot,
): Promise<{ examId: string }> {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error("Supabase 未配置");
  }

  const { data: examRow, error: examErr } = await db
    .from("exams")
    .insert({
      title: bundle.exam.title,
      subtitle: bundle.exam.subtitle,
      description: bundle.exam.description,
      subjects: bundle.exam.subjects,
      difficulty: bundle.exam.difficulty,
      duration_min: bundle.exam.duration_min,
      total_score: bundle.exam.total_score,
      source: "imported",
      is_featured: false,
      created_at: bundle.exam.created_at,
      generation_duration_sec: null,
    })
    .select()
    .single();

  if (examErr || !examRow) {
    throw new Error(
      describeDb("写入试卷失败", examErr ?? { message: !examRow ? "未返回试卷行" : "未知错误" }),
    );
  }

  const examId = examRow.id as string;

  const questionRows = bundle.questions.map((q) => ({
    id: q.id,
    exam_id: examId,
    order_index: q.order_index,
    type: q.type,
    subject: q.subject,
    content: q.content,
    options: q.options,
    answer: q.answer,
    solution_steps: stepsToJson(q.solution_steps),
    knowledge_tags: q.knowledge_tags,
    points: q.points,
  }));

  const { error: qErr } = await db.from("questions").insert(questionRows);
  if (qErr) {
    const { error: delErr } = await db.from("exams").delete().eq("id", examId);
    if (delErr) console.error("[import exam] rollback delete exam failed:", delErr.message);
    throw new Error(describeDb("写入题目失败", qErr));
  }

  if (bundle.examples.length > 0) {
    const exRows = bundle.examples.map((ex) => ({
      id: ex.id,
      exam_id: examId,
      question_id: ex.question_id,
      type: ex.type,
      subject: ex.subject,
      content: ex.content,
      answer: ex.answer,
      solution_steps: stepsToJson(ex.solution_steps),
      difficulty: ex.difficulty,
    }));
    const { error: exErr } = await db.from("examples").insert(exRows);
    if (exErr) {
      const { error: delQ } = await db.from("questions").delete().eq("exam_id", examId);
      if (delQ) console.error("[import exam] rollback delete questions failed:", delQ.message);
      const { error: delE } = await db.from("exams").delete().eq("id", examId);
      if (delE) console.error("[import exam] rollback delete exam failed:", delE.message);
      throw new Error(describeDb("写入例题失败", exErr));
    }
  }

  return { examId };
}
