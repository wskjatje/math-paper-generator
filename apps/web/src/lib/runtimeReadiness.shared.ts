/** 建表状态类型（可安全出现在客户端 props；探测逻辑仍在 .server） */
export type SchemaReadiness = {
  /** 账号库 Service Role 可用 */
  serviceRoleReady: boolean;
  /** user_profiles 可查询（迁移已落到账号库） */
  accountSchemaReady: boolean;
  detail: string | null;
};

export type AccountSetupStatus = SchemaReadiness & {
  /** 是否已配置登录用 Publishable */
  supabaseAuthEnabled: boolean;
  /** 是否已配置 DATABASE_URL（设置页/CLI 建表用） */
  databaseUrlConfigured: boolean;
  /** 是否允许在设置页一键执行迁移 */
  uiMigrateAllowed: boolean;
  /** 给人看的建表步骤（无密钥） */
  setupSteps: string[];
};
