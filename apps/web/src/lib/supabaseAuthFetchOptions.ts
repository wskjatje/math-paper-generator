import {
  LOCAL_EDU_USER_HEADER,
  isValidLocalEducationUserId,
} from "@/lib/educationOs/localEducationUser.shared";

/** 将 Supabase `session.access_token` 传给 Server Fn 的 `headers`（无 token 时不附加）。 */
export function supabaseAuthFetchOptions(accessToken: string | null | undefined): {
  headers?: HeadersInit;
} {
  const t = accessToken?.trim();
  if (!t) return {};
  return { headers: { Authorization: `Bearer ${t}` } };
}

/** 将本地一体模式下的 edu 用户 UUID 传给 Server Fn（请求头 `x-mpg-local-edu-user`）。 */
export function localEducationUserFetchOptions(userId: string | null | undefined): {
  headers?: HeadersInit;
} {
  const id = userId?.trim();
  if (!isValidLocalEducationUserId(id)) return {};
  return { headers: { [LOCAL_EDU_USER_HEADER]: id } };
}
