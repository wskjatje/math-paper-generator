/**
 * 将「待确认」中的 imported 试卷标记为已确认（仅在「导入线下卷」正式列表展示，不进试卷库）。
 */
import { confirmMysqlStagingImportedExam } from "@/lib/examStorage/mysqlExamStore.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";

export async function confirmStagingImportedExam(examId: string): Promise<void> {
  const snap = await loadLocalExam(examId);
  if (snap) {
    if (snap.exam.source !== "imported") {
      throw new Error("仅线下导入的试卷可在此确认入库");
    }
    if (snap.exam.import_review_status !== "staging") {
      throw new Error("该试卷不是待确认状态");
    }
    await saveLocalExamSnapshot({
      ...snap,
      exam: { ...snap.exam, import_review_status: "confirmed" },
    });
    return;
  }

  const db = getSupabaseAdmin();
  if (!db) {
    const okMysql = await confirmMysqlStagingImportedExam(examId);
    if (okMysql) return;
    throw new Error(
      "未找到可确认的试卷：本地文件中无该卷，且未配置 Supabase；若使用仅 MySQL 模式，请确认已在设置中初始化库表并成功写入该导入记录。",
    );
  }

  const { data: row, error: selErr } = await db
    .from("exams")
    .select("id, source, import_review_status")
    .eq("id", examId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!row) {
    const okMysql = await confirmMysqlStagingImportedExam(examId);
    if (okMysql) return;
    throw new Error("未找到该试卷");
  }
  if (row.source !== "imported") throw new Error("仅线下导入的试卷可在此确认入库");
  if (row.import_review_status !== "staging") throw new Error("该试卷不是待确认状态");

  const { error: upErr } = await db
    .from("exams")
    .update({ import_review_status: "confirmed" })
    .eq("id", examId);

  if (upErr) throw new Error(upErr.message);
}
