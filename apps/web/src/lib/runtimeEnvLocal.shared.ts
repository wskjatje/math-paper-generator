/** 换机配库可写入的本机运行时键（无密钥值；勿硬编码业务主机/库名） */
export const RUNTIME_ENV_LOCAL_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "ALLOW_UI_DB_MIGRATIONS",
] as const;

export type RuntimeEnvLocalKey = (typeof RUNTIME_ENV_LOCAL_KEYS)[number];

export const RUNTIME_ENV_LOCAL_LABELS: Record<RuntimeEnvLocalKey, string> = {
  SUPABASE_URL: "账号服务地址",
  SUPABASE_PUBLISHABLE_KEY: "浏览器登录密钥",
  SUPABASE_SERVICE_ROLE_KEY: "服务端密钥",
  DATABASE_URL: "云端数据库连接串",
  ALLOW_UI_DB_MIGRATIONS: "允许本页一键建表",
};

export function isRuntimeEnvLocalKey(k: string): k is RuntimeEnvLocalKey {
  return (RUNTIME_ENV_LOCAL_KEYS as readonly string[]).includes(k);
}

/** UI 状态（可安全出现在客户端组件 props，勿放密钥明文） */
export type RuntimeEnvLocalUiState = {
  path: string;
  fields: Array<{
    key: RuntimeEnvLocalKey;
    configured: boolean;
    display: string | null;
  }>;
};

/** 本机 MySQL UI 状态（可安全出现在客户端 props，勿放密码） */
export type MysqlUiState = {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  database: string | null;
  passwordSaved: boolean;
  passwordStoredEncrypted: boolean;
  encryptionKeySource: "env" | "local-file" | "will-create";
  /** 连接来源（与 mysqlConnection 对齐；配库页可选） */
  source?: "supabase" | "file";
};
