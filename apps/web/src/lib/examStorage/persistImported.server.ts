/**
 * 线下导入快照的持久化：策略集中在此，与命题生成共用 policy 文档但分支不同（见 persistImportedBundle）。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import { getExamStoragePreferenceFromRequest } from "@/lib/examStoragePreference.server";
import {
  isLocalExamPersistenceAvailable,
  saveLocalExamSnapshot,
} from "@/lib/localExamStore.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { insertImportedExamSnapshotToSupabase } from "@/lib/examStorage/supabaseImportedInsert.server";

export async function persistImportedBundle(bundle: SessionExamSnapshot): Promise<{
  examId: string;
  persisted: "supabase" | "local";
}> {
  const pref = getExamStoragePreferenceFromRequest();

  if (pref === "local") {
    if (await isLocalExamPersistenceAvailable()) {
      await saveLocalExamSnapshot(bundle);
      return { examId: bundle.exam.id, persisted: "local" };
    }
    throw new Error(
      "当前在设置中选择「本地」为写入位置，但目录 data/local-exams 不可写。请检查权限或改为自动 / 云端模式。",
    );
  }

  if (pref === "builtin" && (await isLocalExamPersistenceAvailable())) {
    await saveLocalExamSnapshot(bundle);
    return { examId: bundle.exam.id, persisted: "local" };
  }

  const db = getSupabaseAdmin();
  if (db) {
    const { examId } = await insertImportedExamSnapshotToSupabase(bundle);
    return { examId, persisted: "supabase" };
  }

  if (await isLocalExamPersistenceAvailable()) {
    await saveLocalExamSnapshot(bundle);
    return { examId: bundle.exam.id, persisted: "local" };
  }

  throw new Error(
    "当前无法持久化：未配置 Supabase，且目录 data/local-exams 不可写。请配置其一后再导入。",
  );
}
