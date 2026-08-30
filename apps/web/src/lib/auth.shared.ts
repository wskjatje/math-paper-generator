import { z } from "zod";
import type { UserRole } from "@/lib/types";

export type AccountStatus = "active" | "disabled";

export type AuthContext = {
  mode: "supabase" | "mysql";
  userId: string | null;
  /** 默认身份（档案 role 列）；客户端展示以 activeRole 为准 */
  role: UserRole | null;
  /** 账号可用身份（来自档案 roles，无硬编码） */
  roles: UserRole[];
  email: string | null;
  displayName: string | null;
  status?: AccountStatus | null;
  gradeId?: string | null;
  /** 学生讲解能力档（local_accounts.explain_ability_band_id） */
  explainAbilityBandId?: string | null;
};

export type ProfileSnapshot = {
  role: UserRole | null;
  roles: UserRole[];
  display_name: string | null;
  status: AccountStatus;
  grade_id: string | null;
  explain_ability_band_id: string | null;
};

export function profileHasRole(
  ctx: Pick<AuthContext, "roles" | "role">,
  want: UserRole,
): boolean {
  if (ctx.roles.includes(want)) return true;
  return ctx.role === want;
}

export const ResolveAuthSchema = z.object({
  accessToken: z.string().min(10).optional(),
});

export type ResolveAuthInput = z.infer<typeof ResolveAuthSchema>;

/** 自助注册已取消；保留环境变量仅作显式兼容开关（默认关闭） */
export function isSelfRegistrationEnabled(): boolean {
  return process.env.MPG_ALLOW_SELF_REGISTRATION?.trim() === "1";
}

/** 首个 admin 的引导邮箱（登录后自动提权），未配置返回 null */
export function bootstrapAdminEmail(): string | null {
  return process.env.MPG_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null;
}
