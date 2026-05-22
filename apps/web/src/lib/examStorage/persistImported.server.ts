/**
 * 线下导入快照的持久化：策略集中在此，与命题生成共用 policy 文档但分支不同（见 persistImportedBundle）。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import { getExamStoragePreferenceFromRequest } from "@/lib/examStoragePreference.server";
import { insertExamSnapshotToMysql } from "@/lib/examStorage/mysqlExamStore.server";
import {
  isLocalExamPersistenceAvailable,
  saveLocalExamSnapshot,
} from "@/lib/localExamStore.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { usesUnifiedMysqlDataPlane } from "@/lib/applicationDataPlane.server";
import { insertImportedExamSnapshotToSupabase } from "@/lib/examStorage/supabaseImportedInsert.server";
import { scrubMissingLocalImportFiguresBeforePersist } from "@/lib/importPersistedFigureScrub.server";

export async function persistImportedBundle(bundle: SessionExamSnapshot): Promise<{
  examId: string;
  persisted: "supabase" | "local" | "mysql";
}> {
  const scrub = scrubMissingLocalImportFiguresBeforePersist(bundle);
  const prepared = scrub.bundle;
  if (
    scrub.scrubbedImportFigureUrlCount > 0 ||
    String(process.env.MPG_DEBUG_VISUAL_INGEST ?? "").trim() === "1"
  ) {
    console.info("[visual-ingest-scrub]", {
      phase: "server_scrub_before_persist",
      scrubbedImportFigureUrlCount: scrub.scrubbedImportFigureUrlCount,
      examId: prepared.exam.id,
    });
  }
  const pref = getExamStoragePreferenceFromRequest();

  if (pref === "local") {
    if (await isLocalExamPersistenceAvailable()) {
      await saveLocalExamSnapshot(prepared);
      return { examId: prepared.exam.id, persisted: "local" };
    }
    throw new Error(
      "当前在设置中选择「本地」为写入位置，但目录 data/local-exams 不可写。请检查权限或改为自动 / 云端模式。",
    );
  }

  if (pref === "builtin" && (await isLocalExamPersistenceAvailable())) {
    await saveLocalExamSnapshot(prepared);
    return { examId: prepared.exam.id, persisted: "local" };
  }

  const db = getSupabaseAdmin();
  if (db) {
    const { examId } = await insertImportedExamSnapshotToSupabase(prepared);
    return { examId, persisted: "supabase" };
  }

  if (await usesUnifiedMysqlDataPlane()) {
    const { examId } = await insertExamSnapshotToMysql(prepared);
    return { examId, persisted: "mysql" };
  }

  if (await isLocalExamPersistenceAvailable()) {
    await saveLocalExamSnapshot(prepared);
    return { examId: prepared.exam.id, persisted: "local" };
  }

  throw new Error(
    "当前无法持久化：未配置 Supabase，MySQL 不可用或未连通，且目录 data/local-exams 不可写。请配置其一后再导入。",
  );
}
