/**
 * 课堂阅卷/巩固卷：加载试卷题目（含标答）。仅服务端。
 * 解析顺序与试卷详情/修复一致：Supabase → MySQL → 本地 JSON（禁止按卷号硬编码）。
 */
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam } from "@/lib/localExamStore.server";
import type { Exam, Question } from "@/lib/types";

export async function loadExamBundleForClassroom(examId: string): Promise<{
  exam: Exam;
  questions: Question[];
}> {
  const id = examId.trim();
  if (!id) throw new Error("试卷 id 无效");

  const db = getSupabaseAdmin();
  if (db) {
    const { data: examRow, error: exErr } = await db
      .from("exams")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (examRow && !(examRow as { deleted_at?: string | null }).deleted_at) {
      const { data: qRows, error: qErr } = await db
        .from("questions")
        .select("*")
        .eq("exam_id", id)
        .order("order_index");
      if (qErr) throw new Error(qErr.message);
      return {
        exam: examRow as unknown as Exam,
        questions: (qRows ?? []) as unknown as Question[],
      };
    }
  }

  const { loadMysqlExamSnapshot } = await import("@/lib/examStorage/mysqlExamStore.server");
  const mysql = await loadMysqlExamSnapshot(id);
  if (mysql && !mysql.exam.deleted_at) {
    return { exam: mysql.exam, questions: mysql.questions };
  }

  const local = await loadLocalExam(id);
  if (!local || local.exam.deleted_at) {
    throw new Error("作业关联的试卷不存在或已删除");
  }
  return { exam: local.exam, questions: local.questions };
}
