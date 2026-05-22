import { usesUnifiedMysqlDataPlane } from "@/lib/applicationDataPlane.server";

/** 与 `applicationDataPlane.server` 一致：仅在未配 Supabase 且 MySQL 可用时为 true */
export async function isEducationOsMysqlUnifiedPlane(): Promise<boolean> {
  return usesUnifiedMysqlDataPlane();
}
