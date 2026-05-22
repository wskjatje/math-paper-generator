import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

/**
 * 从当前请求的 `Authorization: Bearer <jwt>` 解析 Supabase 用户 id（无 token 时返回 null）。
 */
export async function getSupabaseUserIdFromRequestBearer(): Promise<string | null> {
  try {
    const req = getRequest();
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return null;

    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key) return null;

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storage: undefined,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub;
  } catch {
    return null;
  }
}

/** 使用调用方 JWT 创建的 Supabase 客户端（RLS 按登录用户生效）；环境不齐则返回 null。 */
export async function createSupabaseClientForRequestUser(): Promise<ReturnType<
  typeof createClient<Database>
> | null> {
  try {
    const req = getRequest();
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return null;

    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key) return null;

    return createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storage: undefined,
      },
    });
  } catch {
    return null;
  }
}
