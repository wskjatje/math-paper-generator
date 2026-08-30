import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { getRuntimeEnv, getRuntimeEnvFlagTrue } from "@/lib/runtimeEnvLocal.server";
import type { AccountSetupStatus, SchemaReadiness } from "@/lib/runtimeReadiness.shared";
import { probeMysqlAccountSchemaReady } from "@/lib/mysqlAccountStore.server";

export type { AccountSetupStatus, SchemaReadiness };

function supabasePublishableConfigured(): boolean {
  return !!(getRuntimeEnv("SUPABASE_URL") && getRuntimeEnv("SUPABASE_PUBLISHABLE_KEY"));
}

/**
 * 探测账号库是否就绪：本机 MySQL 账号表优先；否则探测 Supabase user_profiles。
 * 纯函数模块：勿在此文件声明 createServerFn。
 */
export async function probeAccountSchemaReadiness(): Promise<SchemaReadiness> {
  const mysql = await probeMysqlAccountSchemaReady();
  if (mysql.accountSchemaReady) {
    return {
      serviceRoleReady: true,
      accountSchemaReady: true,
      detail: null,
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      serviceRoleReady: false,
      accountSchemaReady: false,
      detail:
        mysql.mysqlConfigured && mysql.detail
          ? mysql.detail
          : "尚未完成配库。请打开配库页完成本机或云端设置。",
    };
  }
  const { error } = await admin.from("user_profiles").select("id").limit(1);
  if (error) {
    return {
      serviceRoleReady: true,
      accountSchemaReady: false,
      detail: "云端账号服务尚未就绪。也可改用本机：请在配库页完成建表。",
    };
  }
  return { serviceRoleReady: true, accountSchemaReady: true, detail: null };
}

export async function assertAccountSchemaReady(): Promise<void> {
  const r = await probeAccountSchemaReadiness();
  if (r.accountSchemaReady) return;
  throw new Error(r.detail ?? "账号服务未就绪，请先打开配库页完成设置");
}

export function buildSetupSteps(opts: {
  supabaseAuthEnabled: boolean;
  serviceRoleReady: boolean;
  accountSchemaReady: boolean;
  databaseUrlConfigured: boolean;
  uiMigrateAllowed: boolean;
  mysqlConfigured?: boolean;
  mysqlAccountReady?: boolean;
}): string[] {
  // 配库步骤由页面控件呈现；不再向客户端下发教程式步骤文案
  void opts;
  return [];
}

/** 供 getAuthConfig / getDataSettingsOverview 同步拼装（非 ServerFn） */
export async function loadAccountSetupStatus(): Promise<AccountSetupStatus> {
  const schema = await probeAccountSchemaReadiness();
  const mysql = await probeMysqlAccountSchemaReady();
  const supabaseAuthEnabled = supabasePublishableConfigured() || mysql.accountSchemaReady;
  const databaseUrlConfigured = !!getRuntimeEnv("DATABASE_URL");
  const uiMigrateAllowed = getRuntimeEnvFlagTrue("ALLOW_UI_DB_MIGRATIONS");
  return {
    ...schema,
    supabaseAuthEnabled,
    databaseUrlConfigured,
    uiMigrateAllowed,
    setupSteps: buildSetupSteps({
      supabaseAuthEnabled: supabasePublishableConfigured(),
      serviceRoleReady: schema.serviceRoleReady,
      accountSchemaReady: schema.accountSchemaReady,
      databaseUrlConfigured,
      uiMigrateAllowed,
      mysqlConfigured: mysql.mysqlConfigured,
      mysqlAccountReady: mysql.accountSchemaReady,
    }),
  };
}
