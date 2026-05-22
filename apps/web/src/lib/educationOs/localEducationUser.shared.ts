/** 本地一体模式（未配 Supabase 且 MySQL 可用）下教育 OS 的用户标识：浏览器 localStorage + 请求头传给服务端 */
export const LOCAL_EDU_USER_HEADER = "x-mpg-local-edu-user";
export const LOCAL_EDU_USER_LS_KEY = "mpg_local_edu_user_id_v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidLocalEducationUserId(id: string | null | undefined): id is string {
  const t = id?.trim();
  return !!t && UUID_RE.test(t);
}
