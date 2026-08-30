import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import type { UserRole } from "@/lib/types";
import { normalizeProfileRoles } from "@/lib/activeRoleStorage";
import { normalizeLoginIdentifier } from "@/lib/loginIdentifier.shared";
import { assertAccountSchemaReady } from "@/lib/runtimeReadiness.server";
import { getRuntimeEnv } from "@/lib/runtimeEnvLocal.server";
import {
  profileHasRole,
  ResolveAuthSchema,
  type AccountStatus,
  type AuthContext,
  type ProfileSnapshot,
  type ResolveAuthInput,
  bootstrapAdminEmail,
  isSelfRegistrationEnabled,
} from "@/lib/auth.shared";

export type { AccountStatus, AuthContext, ProfileSnapshot, ResolveAuthInput };
export { profileHasRole, ResolveAuthSchema, bootstrapAdminEmail, isSelfRegistrationEnabled };

/** 当前 Database 类型未含 user_profiles；账号主路径为 MySQL。 */
function supabaseAdminLoose(): any {
  return getSupabaseAdmin() as any;
}

export function supabasePublishableEnv(): { url: string; key: string } | null {
  const url = getRuntimeEnv("SUPABASE_URL");
  const key = getRuntimeEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;
  return { url, key };
}

function normalizeRole(raw: unknown): UserRole | null {
  return raw === "teacher" || raw === "student" || raw === "admin" ? raw : null;
}

function normalizeStatus(raw: unknown): AccountStatus {
  return raw === "disabled" ? "disabled" : "active";
}

export async function profileForUserId(userId: string): Promise<ProfileSnapshot> {
  const empty: ProfileSnapshot = {
    role: null,
    roles: [],
    display_name: null,
    status: "active",
    grade_id: null,
    explain_ability_band_id: null,
  };
  const admin = supabaseAdminLoose();
  if (!admin) return empty;
  const { data } = await admin
    .from("user_profiles")
    .select("role, roles, display_name, status, grade_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return empty;
  const roles = normalizeProfileRoles(data.role, data.roles);
  return {
    role: normalizeRole(data.role) ?? roles[0] ?? null,
    roles,
    display_name: data.display_name,
    status: normalizeStatus(data.status),
    grade_id: data.grade_id ?? null,
    explain_ability_band_id: null,
  };
}

/**
 * 引导首个运维账号：登录邮箱与 MPG_BOOTSTRAP_ADMIN_EMAIL 一致时把档案提升为 admin。
 */
export async function bootstrapAdminForUserIfNeeded(
  userId: string,
  email: string | null,
): Promise<boolean> {
  const target = bootstrapAdminEmail();
  if (!target || !email || email.trim().toLowerCase() !== target) return false;
  const admin = supabaseAdminLoose();
  if (!admin) return false;

  const { data: existing } = await admin
    .from("user_profiles")
    .select("role, roles")
    .eq("id", userId)
    .maybeSingle();
  const currentRoles = normalizeProfileRoles(existing?.role, existing?.roles);
  if (currentRoles.includes("admin")) return false;

  const nextRoles = [...currentRoles, "admin"];
  const defaultRole = normalizeRole(existing?.role) ?? "admin";

  const { error } = await admin.from("user_profiles").upsert(
    {
      id: userId,
      role: defaultRole,
      roles: nextRoles.length ? nextRoles : ["admin"],
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`引导管理员失败：${error.message}`);
  return true;
}

function emptyAuth(): AuthContext {
  return {
    mode: "supabase",
    userId: null,
    role: null,
    roles: [],
    email: null,
    displayName: null,
    status: null,
    gradeId: null,
  };
}

async function authEmailForUserId(userId: string): Promise<string | null> {
  const admin = supabaseAdminLoose();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

/**
 * 邮箱可直接用；手机号/学号/工号须查档案（需 Service Role + 已迁移标识列）。
 */
export async function resolveAuthEmailFromIdentifier(identifier: string): Promise<string> {
  const norm = normalizeLoginIdentifier(identifier);
  if (!norm) throw new Error("请填写账号（邮箱、手机号、学生号或工号）");

  if (norm.kind === "email") return norm.value;

  await assertAccountSchemaReady();
  const admin = supabaseAdminLoose();
  if (!admin) {
    throw new Error("手机号/学号/工号登录需先完成配库（服务端密钥），或改用邮箱登录");
  }

  const tryCol = async (col: "login_phone" | "student_no" | "employee_no", value: string) => {
    const { data, error } = await admin
      .from("user_profiles")
      .select("id")
      .eq(col, value)
      .maybeSingle();
    if (error) {
      if (/login_phone|student_no|employee_no/i.test(error.message)) {
        throw new Error(
          "账号标识列未建好，请在配库页完成建表后再用手机号/学号/工号登录",
        );
      }
      throw new Error(error.message);
    }
    return (data?.id as string | undefined) ?? null;
  };

  let userId: string | null = null;
  if (norm.kind === "phone") {
    userId = await tryCol("login_phone", norm.value);
  } else {
    userId = (await tryCol("student_no", norm.value)) ?? (await tryCol("employee_no", norm.value));
  }
  if (!userId) throw new Error("未找到该账号，请核对账号或联系运维开通");
  const email = await authEmailForUserId(userId);
  if (!email) throw new Error("该账号未绑定登录邮箱，请联系运维");
  return email;
}

/** 服务端共享：仅接受 accessToken；本机 mpg_local.* 优先于 Supabase */
export async function resolveAuthContextFromInput(data: ResolveAuthInput): Promise<AuthContext> {
  const token = data.accessToken?.trim() || null;
  if (token?.startsWith("mpg_local.")) {
    const { resolveAuthContextFromLocalToken } = await import("@/lib/localSession.server");
    const local = await resolveAuthContextFromLocalToken(token);
    if (local) return local;
    return emptyAuth();
  }

  const pub = supabasePublishableEnv();

  if (pub && token) {
    const client = createClient(pub.url, pub.key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error } = await client.auth.getClaims(token);
    if (error || !claimsData?.claims?.sub) {
      return emptyAuth();
    }
    const userId = claimsData.claims.sub as string;
    const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email : null;
    try {
      await bootstrapAdminForUserIfNeeded(userId, email);
    } catch (err) {
      console.warn("[auth] bootstrap admin skipped:", err instanceof Error ? err.message : err);
    }
    const profile = await profileForUserId(userId);
    return {
      mode: "supabase",
      userId,
      role: profile.role,
      roles: profile.roles,
      email,
      displayName: profile.display_name,
      status: profile.status,
      gradeId: profile.grade_id,
      explainAbilityBandId: profile.explain_ability_band_id,
    };
  }

  return emptyAuth();
}

function assertNotDisabled(ctx: AuthContext): void {
  if (ctx.status === "disabled") throw new Error("账号已停用，请联系管理员");
}

/** 教师能力：须真实登录且档案 roles 含 teacher */
export function assertTeacherAccess(ctx: AuthContext): void {
  if (!ctx.userId || !ctx.email) throw new Error("请先登录教师账号");
  assertNotDisabled(ctx);
  if (!profileHasRole(ctx, "teacher")) {
    throw new Error("当前账号不是教师角色，无法发布作业");
  }
}

/** 学生能力：须真实登录且档案 roles 含 student */
export function assertStudentAccess(ctx: AuthContext): void {
  if (!ctx.userId || !ctx.email) throw new Error("请先登录学生账号");
  assertNotDisabled(ctx);
  if (!profileHasRole(ctx, "student")) {
    throw new Error("当前账号不是学生角色");
  }
}
