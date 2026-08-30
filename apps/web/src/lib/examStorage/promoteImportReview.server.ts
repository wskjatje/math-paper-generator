/**
 * 将「待确认」中的 imported 试卷标记为已确认（仅在「导入线下卷」正式列表展示，不进试卷库）。
 * 若关联 source_document_id 且仍有未解决的 blocker findings，拒绝确认。
 */
import { confirmMysqlStagingImportedExam } from "@/lib/examStorage/mysqlExamStore.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import { hasUnresolvedBlockers } from "@/lib/importFaithfulness.shared";

async function assertImportReviewClear(sourceId: string): Promise<void> {
  const { readImportReviewState, saveImportReviewState } = await import(
    "@/lib/offlineImportArtifactStore.server"
  );
  const review = await readImportReviewState(sourceId);
  if (review && hasUnresolvedBlockers(review.findings)) {
    throw new Error(
      `还有须核对的差异（数值、公式、题图等），请先在「核对差异」中处理或标记已解决后再入库。待处理：${review.findings
        .filter((f) => f.severity === "blocker" && !f.resolved)
        .slice(0, 3)
        .map((f) => f.summary)
        .join("；")}`,
    );
  }
  if (review) {
    await saveImportReviewState(sourceId, {
      ...review,
      status: "approved",
      updatedAt: new Date().toISOString(),
      auditLog: [
        ...(review.auditLog ?? []),
        {
          at: new Date().toISOString(),
          action: "set_status",
          note: "confirmed_into_library",
        },
      ],
    });
  }
}

export async function confirmStagingImportedExam(examId: string): Promise<void> {
  const snap = await loadLocalExam(examId);
  if (snap) {
    if (snap.exam.source !== "imported") {
      throw new Error("仅线下导入的试卷可在此确认入库");
    }
    if (snap.exam.import_review_status !== "staging") {
      throw new Error("该试卷不是待确认状态");
    }
    const sourceId = snap.exam.source_document_id?.trim();
    if (sourceId) await assertImportReviewClear(sourceId);
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
    .select("id, source, import_review_status, source_document_id")
    .eq("id", examId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!row) {
    const okMysql = await confirmMysqlStagingImportedExam(examId);
    if (okMysql) return;
    throw new Error("未找到该试卷");
  }
  const examRow = row as {
    source?: string;
    import_review_status?: string | null;
    source_document_id?: string | null;
  };
  if (examRow.source !== "imported") throw new Error("仅线下导入的试卷可在此确认入库");
  if (examRow.import_review_status !== "staging") throw new Error("该试卷不是待确认状态");

  const sourceId =
    typeof examRow.source_document_id === "string" ? examRow.source_document_id.trim() : "";
  if (sourceId) await assertImportReviewClear(sourceId);

  const { error: upErr } = await db
    .from("exams")
    .update({ import_review_status: "confirmed" })
    .eq("id", examId);

  if (upErr) throw new Error(upErr.message);
}
