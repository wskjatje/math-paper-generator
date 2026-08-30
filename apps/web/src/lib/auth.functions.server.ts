/**
 * 仅导出 createServerFn（及可安全出现在客户端的类型再导出）。
 * 服务端辅助 → auth.helpers.server.ts；纯函数 → auth.shared.ts。
 * 禁止顶层 import 带 node:fs / MySQL 的模块：客户端（Web 与 Electron 渲染进程）会连带打包失败。
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { UserRole } from "@/lib/types";
import {
  ResolveAuthSchema,
  bootstrapAdminEmail,
  isSelfRegistrationEnabled,
  type AuthContext,
} from "@/lib/auth.shared";

export type { AccountStatus, AuthContext, ProfileSnapshot } from "@/lib/auth.shared";

async function loadAuthHelpers() {
  return import("@/lib/auth.helpers.server");
}

async function loadAccountSetupStatus() {
  const { loadAccountSetupStatus: load } = await import("@/lib/runtimeReadiness.server");
  return load();
}

/** 登录/首页：账号栈与建表就绪状态（公开；Publishable 可下发给浏览器，不含 Service Role） */
export const getAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabasePublishableEnv } = await loadAuthHelpers();
  const pub = supabasePublishableEnv();
  const setup = await loadAccountSetupStatus();
  return {
    /** 本机 MySQL 账号表就绪，或已配 Supabase Publishable，均可走登录 */
    supabaseAuthEnabled: setup.supabaseAuthEnabled,
    supabaseUrl: pub?.url ?? null,
    supabasePublishableKey: pub?.key ?? null,
    supabaseUrlHost: pub ? new URL(pub.url).hostname : null,
    selfRegistrationEnabled: isSelfRegistrationEnabled(),
    bootstrapAdminConfigured: !!bootstrapAdminEmail(),
    serviceRoleReady: setup.serviceRoleReady,
    accountSchemaReady: setup.accountSchemaReady,
    accountSchemaDetail: setup.detail,
    databaseUrlConfigured: setup.databaseUrlConfigured,
    uiMigrateAllowed: setup.uiMigrateAllowed,
    setupSteps: setup.setupSteps,
  };
});

/** 本机首个运维账号是否可创建（表就绪且无账号） */
export const getLocalMysqlBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { probeMysqlAccountSchemaReady, countLocalAccounts } = await import(
    "@/lib/mysqlAccountStore.server"
  );
  const mysql = await probeMysqlAccountSchemaReady();
  if (!mysql.accountSchemaReady) {
    return {
      accountSchemaReady: false,
      canBootstrap: false,
      accountCount: 0,
      detail: mysql.detail,
    };
  }
  const accountCount = await countLocalAccounts();
  return {
    accountSchemaReady: true,
    canBootstrap: accountCount === 0,
    accountCount,
    detail: null as string | null,
  };
});

/** 公开建表页：与 getAuthConfig 同源探测 */
export const getAccountSetupStatus = createServerFn({ method: "GET" }).handler(async () =>
  loadAccountSetupStatus(),
);

/** 解析当前请求的登录态 */
export const resolveAuthContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ResolveAuthSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<AuthContext> => {
    const { resolveAuthContextFromInput } = await loadAuthHelpers();
    return resolveAuthContextFromInput(data);
  });

const SignInAccountSchema = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

/**
 * 统一登录：账号可为邮箱 / 手机号 / 学生号 / 工号 + 密码。
 * MySQL 账号表就绪时优先本机；标识在本机不存在时再回落 Supabase。
 */
export const signInWithAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SignInAccountSchema.parse(data))
  .handler(async ({ data }) => {
    const { probeMysqlAccountSchemaReady, tryAuthenticateLocalAccount } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      // 表已建但空库时补种默认运维（幂等）；修复「只建表未写入种子」导致无法登录
      const { ensureDefaultLocalAdminSeed } = await import(
        "@/lib/mysqlDefaultAdminSeed.server"
      );
      await ensureDefaultLocalAdminSeed();

      const local = await tryAuthenticateLocalAccount(data.identifier, data.password);
      if (local === "bad_password") {
        throw new Error("账号或密码不正确");
      }
      if (local) {
        const { createLocalSession } = await import("@/lib/localSession.server");
        const session = await createLocalSession(local.accountId);
        return {
          accessToken: session.accessToken,
          refreshToken: session.accessToken,
          email: local.email,
          mode: "mysql" as const,
        };
      }
      // 本机无此标识 → 可回落云端
    }

    const { supabasePublishableEnv, resolveAuthEmailFromIdentifier } = await loadAuthHelpers();
    const pub = supabasePublishableEnv();
    if (!pub) {
      throw new Error(
        mysql.accountSchemaReady
          ? "账号或密码不正确"
          : mysql.mysqlConfigured
            ? (mysql.detail ?? "本机账号服务未就绪。请前往配库完成设置后再登录。")
            : "账号服务未就绪。请前往配库完成本机或云端设置后再登录。",
      );
    }
    const email = await resolveAuthEmailFromIdentifier(data.identifier);
    const client = createClient<Database>(pub.url, pub.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessionData, error } = await client.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error) throw new Error(error.message);
    const session = sessionData.session;
    if (!session?.access_token || !session.refresh_token) {
      throw new Error("登录失败：无 session");
    }
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      email: session.user.email ?? email,
      mode: "supabase" as const,
    };
  });

/** 本机首个运维账号（仅当 local_accounts 为空时可建） */
export const bootstrapLocalMysqlAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().email().max(255),
        password: z.string().min(5).max(200),
        displayName: z.string().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { probeMysqlAccountSchemaReady, countLocalAccounts, createLocalAccount } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (!mysql.accountSchemaReady) {
      throw new Error(mysql.detail ?? "请先执行本机 MySQL 建表脚本");
    }
    const n = await countLocalAccounts();
    if (n > 0) {
      throw new Error("本机已有账号，请使用登录；新建师生请登录后在运维端操作");
    }
    const created = await createLocalAccount({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      roles: ["admin", "teacher", "student"],
    });
    return { ok: true as const, id: created.id };
  });

/** 登出：作废本机 mpg_local 会话 */
export const revokeLocalSessionOnServer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ accessToken: z.string().min(10) }).parse(data),
  )
  .handler(async ({ data }) => {
    if (!data.accessToken.startsWith("mpg_local.")) return { ok: true as const };
    const { revokeLocalSession } = await import("@/lib/localSession.server");
    await revokeLocalSession(data.accessToken);
    return { ok: true as const };
  });

const UpsertProfileSchema = z.object({
  accessToken: z.string().min(10),
  role: z.enum(["teacher", "student"]),
  displayName: z.string().min(1).max(80).optional(),
});

/** 注册/登录后写入或更新 user_profiles */
export const upsertUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpsertProfileSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabasePublishableEnv, profileForUserId } = await loadAuthHelpers();
    const pub = supabasePublishableEnv();
    if (!pub) throw new Error("云端登录未配置。请前往配库完成账号服务设置。");

    const client = createClient<Database>(pub.url, pub.key, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error } = await client.auth.getClaims(data.accessToken);
    if (error || !claimsData?.claims?.sub) throw new Error("登录已失效，请重新登录");

    const userId = claimsData.claims.sub as string;
    const { getSupabaseAdmin } = await import("@/lib/supabaseOptional.server");
    const admin = getSupabaseAdmin() as any;
    if (!admin) throw new Error("账号档案写入不可用：请在配库页补全服务端密钥。");

    const existing = await profileForUserId(userId);
    if (!isSelfRegistrationEnabled()) {
      if (!existing.roles.length) {
        throw new Error("已关闭自助注册，请联系管理员或任课教师开通账号");
      }
      if (!existing.roles.includes(data.role)) {
        throw new Error("已关闭自助注册，无法自助变更角色，请联系管理员");
      }
    }
    if (existing.status === "disabled") throw new Error("账号已停用，请联系管理员");

    const role = existing.role ?? data.role;
    const roles = existing.roles.length ? existing.roles : [data.role];
    const row = {
      id: userId,
      role,
      roles,
      display_name: data.displayName?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await admin.from("user_profiles").upsert(row, { onConflict: "id" });
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, role: row.role as UserRole, roles: row.roles as UserRole[] };
  });
