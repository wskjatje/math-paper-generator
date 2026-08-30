import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import {
  loadMysqlExamSnapshot,
  updateMysqlExampleAttachments,
  updateMysqlQuestionAttachments,
} from "@/lib/examStorage/mysqlExamStore.server";
import type { Example, Question } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";

/** 将题目 attachments 写回本地快照、Supabase 或 MySQL */
export async function persistQuestionAttachmentsForExam(
  examId: string,
  questions: Question[],
): Promise<"local" | "supabase" | "mysql" | "none"> {
  const local = await loadLocalExam(examId);
  if (local) {
    await saveLocalExamSnapshot({ ...local, questions });
    return "local";
  }

  const db = getSupabaseAdmin();
  if (db) {
    for (const q of questions) {
      const { error } = await db
        .from("questions")
        .update({
          attachments: (q.attachments ?? []) as unknown as Json,
          content: String(q.content ?? ""),
        })
        .eq("id", q.id)
        .eq("exam_id", examId);
      if (error) throw new Error(`更新题目附件失败：${error.message}`);
    }
    return "supabase";
  }

  const ms = await loadMysqlExamSnapshot(examId);
  if (ms && !ms.exam.deleted_at) {
    await updateMysqlQuestionAttachments(examId, questions);
    return "mysql";
  }

  return "none";
}

/**
 * 将例题 attachments 写回本地快照、Supabase 或 MySQL（examples.attachments，与题目同契约）。
 * 本地：按 id 合并 attachments，不整表覆盖（可只传入本次更新的例题子集）。
 */
export async function persistExampleAttachmentsForExam(
  examId: string,
  examples: Example[],
): Promise<"local" | "supabase" | "mysql" | "none"> {
  const local = await loadLocalExam(examId);
  if (local) {
    const byId = new Map(examples.map((e) => [e.id, e]));
    const merged = local.examples.map((e) => {
      const next = byId.get(e.id);
      return next ? { ...e, attachments: next.attachments } : e;
    });
    // 若传入的是尚未写入本地的新例题，追加（正常流程应先 appendExamples 再 persist）
    for (const e of examples) {
      if (!local.examples.some((x) => x.id === e.id)) merged.push(e);
    }
    await saveLocalExamSnapshot({ ...local, examples: merged });
    return "local";
  }

  const db = getSupabaseAdmin();
  if (db) {
    for (const ex of examples) {
      const { error } = await db
        .from("examples")
        .update({ attachments: (ex.attachments ?? []) as unknown as Json })
        .eq("id", ex.id)
        .eq("exam_id", examId);
      if (error) throw new Error(`更新例题附件失败：${error.message}`);
    }
    return "supabase";
  }

  const ms = await loadMysqlExamSnapshot(examId);
  if (ms && !ms.exam.deleted_at) {
    await updateMysqlExampleAttachments(examId, examples);
    return "mysql";
  }

  return "none";
}
