/**
 * 应用级数据面：避免「试卷一套存储、教育 OS 另一套」的配置分裂。
 * - 已配置服务端 Supabase（试卷可走云端）→ 统一走云端能力（含教育 OS 的 Supabase）。
 * - 未配 Supabase 且 MySQL 可连 → 统一走本地 MySQL（试卷 + 教育 OS），无需在设置里单独选「MySQL」。
 */
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { isMysqlExamPersistenceAvailable } from "@/lib/examStorage/mysqlExamStore.server";

export function isSupabaseExamPersistenceConfigured(): boolean {
  return !!getSupabaseAdmin();
}

/** 未配云端且 MySQL 可用：试卷默认与教育 OS 均使用 zhixue MySQL */
export async function usesUnifiedMysqlDataPlane(): Promise<boolean> {
  if (isSupabaseExamPersistenceConfigured()) return false;
  return isMysqlExamPersistenceAvailable();
}
