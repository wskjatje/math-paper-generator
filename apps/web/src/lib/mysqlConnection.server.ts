/**
 * MySQL 连接：优先读取 Supabase workspace_settings.settings.mysql（passwordEnc），其次 data/mysql-connection.json。
 * 密码以 AES-256-GCM 密文保存；密钥来自 MYSQL_PASSWORD_ENC_KEY 或 data/mysql-password-master.key。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  decryptMysqlPassword,
  encryptMysqlPassword,
  getMysqlEncryptionKeySource,
} from "@/lib/mysqlPasswordCrypto.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { persistMysqlCredentialsToMysqlWorkspaceSettings } from "@/lib/workspaceSettingsStore.server";

const WS_KEY = "default";

export type MysqlConnectionForm = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function mysqlConfigPath(): string {
  return path.join(resolveProjectRoot(), "data", "mysql-connection.json");
}

async function readConfigRaw(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(mysqlConfigPath(), "utf8");
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return null;
    if (e instanceof SyntaxError) {
      console.warn("[mysql] mysql-connection.json 非合法 JSON，已忽略");
      return null;
    }
    throw e;
  }
}

async function loadMysqlConnectionFromSupabase(): Promise<MysqlConnectionForm | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_key", WS_KEY)
    .maybeSingle();
  const raw = data?.settings as Record<string, unknown> | undefined;
  const m = raw?.mysql;
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const host = typeof o.host === "string" ? o.host : "";
  const user = typeof o.user === "string" ? o.user : "";
  const database = typeof o.database === "string" ? o.database : "";
  const port = typeof o.port === "number" && Number.isFinite(o.port) ? o.port : 3306;
  let password = "";
  try {
    if (typeof o.passwordEnc === "string" && o.passwordEnc.length > 0) {
      password = decryptMysqlPassword(o.passwordEnc);
    }
  } catch (e) {
    console.warn(
      "[mysql] workspace_settings 中 MySQL 密码密文无法解密，已忽略该块",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
  if (!host || !user || !database) return null;
  return { host, port, user, password, database };
}

async function loadMysqlConnectionFromFile(): Promise<MysqlConnectionForm | null> {
  const o = await readConfigRaw();
  if (!o) return null;
  const host = typeof o.host === "string" ? o.host : "";
  const user = typeof o.user === "string" ? o.user : "";
  const database = typeof o.database === "string" ? o.database : "";
  const port = typeof o.port === "number" && Number.isFinite(o.port) ? o.port : 3306;

  let password = "";
  try {
    if (typeof o.passwordEnc === "string" && o.passwordEnc.length > 0) {
      password = decryptMysqlPassword(o.passwordEnc);
    } else if (typeof o.password === "string") {
      password = o.password;
    }
  } catch (e) {
    console.warn(
      "[mysql] 无法解密已保存的密码（密钥变更或密文损坏）。请在设置页重新输入密码并保存。",
      e instanceof Error ? e.message : e,
    );
    return null;
  }

  if (!host || !user || !database) return null;
  return { host, port, user, password, database };
}

export async function loadMysqlConnection(): Promise<MysqlConnectionForm | null> {
  const fromDb = await loadMysqlConnectionFromSupabase();
  if (fromDb) return fromDb;
  return loadMysqlConnectionFromFile();
}

async function upsertMysqlCredentialsIntoSupabaseWorkspace(
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;
  const { data } = await db
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_key", WS_KEY)
    .maybeSingle();
  const raw =
    data?.settings && typeof data.settings === "object"
      ? { ...(data.settings as Record<string, unknown>) }
      : {};
  raw.mysql = {
    host: payload.host,
    port: payload.port,
    user: payload.user,
    database: payload.database,
    ...(typeof payload.passwordEnc === "string" && payload.passwordEnc.length > 0
      ? { passwordEnc: payload.passwordEnc }
      : {}),
  };
  const { error } = await db.from("workspace_settings").upsert(
    {
      workspace_key: WS_KEY,
      settings: raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_key" },
  );
  if (error) console.warn("[mysql] Supabase workspace_settings upsert failed:", error.message);
}

export async function saveMysqlConnection(c: MysqlConnectionForm): Promise<void> {
  await mkdir(path.dirname(mysqlConfigPath()), { recursive: true });

  const payload: Record<string, unknown> = {
    host: c.host.trim(),
    port: c.port,
    user: c.user.trim(),
    database: c.database.trim(),
  };

  if (c.password) {
    payload.passwordEnc = encryptMysqlPassword(c.password);
  } else {
    const prev = await readConfigRaw();
    if (prev && typeof prev.passwordEnc === "string" && prev.passwordEnc.length > 0) {
      payload.passwordEnc = prev.passwordEnc;
    } else if (prev && typeof prev.password === "string" && prev.password.length > 0) {
      payload.passwordEnc = encryptMysqlPassword(prev.password);
    }
  }

  await writeFile(mysqlConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await upsertMysqlCredentialsIntoSupabaseWorkspace(payload);
  const { invalidateMysqlPoolCache } = await import("@/lib/examStorage/mysqlExamStore.server");
  invalidateMysqlPoolCache();

  await persistMysqlCredentialsToMysqlWorkspaceSettings({
    host: payload.host as string,
    port: typeof payload.port === "number" ? payload.port : Number(payload.port),
    user: payload.user as string,
    database: payload.database as string,
    ...(typeof payload.passwordEnc === "string" ? { passwordEnc: payload.passwordEnc } : {}),
  });
}

export type MysqlUiState = {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  database: string | null;
  passwordSaved: boolean;
  passwordStoredEncrypted: boolean;
  encryptionKeySource: "env" | "local-file" | "will-create";
  /** 当前生效连接是否来自 Supabase workspace_settings（否则来自本地文件） */
  source: "supabase" | "file";
};

async function supabaseMysqlBlock(): Promise<Record<string, unknown> | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_key", WS_KEY)
    .maybeSingle();
  const raw = data?.settings as Record<string, unknown> | undefined;
  const m = raw?.mysql;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
}

export async function getMysqlUiState(): Promise<MysqlUiState> {
  let keySource: MysqlUiState["encryptionKeySource"] = "will-create";
  try {
    keySource = getMysqlEncryptionKeySource();
  } catch (e) {
    console.warn("[getMysqlUiState] encryption key source", e);
  }

  try {
    const fromSupa = await loadMysqlConnectionFromSupabase();
    const active = fromSupa ?? (await loadMysqlConnectionFromFile());
    const fromSupaBlock = await supabaseMysqlBlock();
    const rawFile = await readConfigRaw();

    const supaHasEnc =
      typeof fromSupaBlock?.passwordEnc === "string" &&
      (fromSupaBlock.passwordEnc as string).length > 0;
    const fileHasEnc =
      typeof rawFile?.passwordEnc === "string" && (rawFile.passwordEnc as string).length > 0;
    const fileHasPlain =
      typeof rawFile?.password === "string" && (rawFile.password as string).length > 0;

    const source: "supabase" | "file" = fromSupa ? "supabase" : "file";
    const configured = !!active;

    return {
      configured,
      host: active?.host ?? null,
      port: active?.port ?? null,
      user: active?.user ?? null,
      database: active?.database ?? null,
      passwordSaved: supaHasEnc || fileHasEnc || fileHasPlain,
      passwordStoredEncrypted: supaHasEnc || fileHasEnc,
      encryptionKeySource: keySource,
      source,
    };
  } catch (e) {
    console.warn("[getMysqlUiState] 读取 MySQL 配置失败，已降级为未配置状态", e);
    return {
      configured: false,
      host: null,
      port: null,
      user: null,
      database: null,
      passwordSaved: false,
      passwordStoredEncrypted: false,
      encryptionKeySource: keySource,
      source: "file",
    };
  }
}
