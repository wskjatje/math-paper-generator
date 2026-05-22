/**
 * 工作区集成配置：网关、外网检索等。
 * 加载顺序：Supabase → 本机 MySQL.workspace_settings（Supabase 字段优先合并）。
 */
import type { RowDataPacket } from "mysql2/promise";

import type { WorkspaceIntegrationSettings } from "@/lib/workspaceSettings.shared";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

const WS_KEY = "default";

function mergeWs(
  base: WorkspaceIntegrationSettings,
  patch: WorkspaceIntegrationSettings,
): WorkspaceIntegrationSettings {
  return {
    gateway: patch.gateway != null ? { ...base.gateway, ...patch.gateway } : base.gateway,
    webSearch: patch.webSearch != null ? { ...base.webSearch, ...patch.webSearch } : base.webSearch,
  };
}

function parseSettings(raw: unknown): WorkspaceIntegrationSettings {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const gateway =
    o.gateway && typeof o.gateway === "object"
      ? (o.gateway as WorkspaceIntegrationSettings["gateway"])
      : undefined;
  const webSearch =
    o.webSearch && typeof o.webSearch === "object"
      ? (o.webSearch as WorkspaceIntegrationSettings["webSearch"])
      : undefined;
  return { gateway, webSearch };
}

async function loadRawSettingsFromSupabase(): Promise<Record<string, unknown> | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_key", WS_KEY)
    .maybeSingle();
  if (error || data?.settings == null || typeof data.settings !== "object") return null;
  return { ...(data.settings as Record<string, unknown>) };
}

async function loadFromSupabase(): Promise<WorkspaceIntegrationSettings | null> {
  const raw = await loadRawSettingsFromSupabase();
  return raw ? parseSettings(raw) : null;
}

async function loadRawWorkspaceSettingsFromMysqlTable(): Promise<Record<string, unknown> | null> {
  const { getMysqlPool } = await import("@/lib/examStorage/mysqlExamStore.server");
  const pool = await getMysqlPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT settings FROM workspace_settings WHERE workspace_key = ? LIMIT 1",
      [WS_KEY],
    );
    if (!rows.length) return null;
    const raw = rows[0]?.settings;
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return obj && typeof obj === "object" ? { ...(obj as Record<string, unknown>) } : null;
  } catch {
    return null;
  }
}

async function loadFromMysqlTable(): Promise<WorkspaceIntegrationSettings | null> {
  const raw = await loadRawWorkspaceSettingsFromMysqlTable();
  return raw ? parseSettings(raw) : null;
}

/** 将 MySQL 连接块写入本机 MySQL `workspace_settings`（需先有可用连接池，例如已写入本地 bootstrap 文件）。 */
export async function persistMysqlCredentialsToMysqlWorkspaceSettings(mysql: {
  host: string;
  port: number;
  user: string;
  database: string;
  passwordEnc?: string;
}): Promise<void> {
  const { getMysqlPool } = await import("@/lib/examStorage/mysqlExamStore.server");
  const pool = await getMysqlPool();
  if (!pool) return;

  const existing = (await loadRawWorkspaceSettingsFromMysqlTable()) ?? {};
  const base = { ...existing };
  base.mysql = mysql;

  await pool.query(
    `INSERT INTO workspace_settings (workspace_key, settings, updated_at)
     VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_at = CURRENT_TIMESTAMP(3)`,
    [WS_KEY, JSON.stringify(base)],
  );
}

/** 云端与本机 MySQL 中的网关/检索配置合并（Supabase 覆盖同名键） */
export async function loadMergedWorkspaceIntegrationSettings(): Promise<WorkspaceIntegrationSettings> {
  const fromMysql = await loadFromMysqlTable();
  const fromCloud = await loadFromSupabase();
  if (!fromMysql || Object.keys(fromMysql).length === 0) return fromCloud ?? {};
  if (!fromCloud || Object.keys(fromCloud).length === 0) return fromMysql;
  return mergeWs(fromMysql, fromCloud);
}

/** 写入网关、检索等；写入本机 MySQL 行时保留已有 settings.mysql（或由云端合并带来的 mysql） */
export async function mergePersistWorkspaceIntegrationSettings(
  patch: WorkspaceIntegrationSettings,
): Promise<void> {
  const db = getSupabaseAdmin();
  const baseRaw = (await loadRawSettingsFromSupabase()) ?? {};

  if (Object.keys(baseRaw).length === 0) {
    const my = await loadFromMysqlTable();
    if (my?.gateway) baseRaw.gateway = my.gateway as Record<string, unknown>;
    if (my?.webSearch) baseRaw.webSearch = my.webSearch as Record<string, unknown>;
  }

  if (patch.gateway) {
    baseRaw.gateway = {
      ...(typeof baseRaw.gateway === "object" && baseRaw.gateway ? baseRaw.gateway : {}),
      ...patch.gateway,
    };
  }
  if (patch.webSearch) {
    baseRaw.webSearch = {
      ...(typeof baseRaw.webSearch === "object" && baseRaw.webSearch ? baseRaw.webSearch : {}),
      ...patch.webSearch,
    };
  }

  const fromMysqlRaw = await loadRawWorkspaceSettingsFromMysqlTable();
  const forMysqlRowObj: Record<string, unknown> = {
    gateway: baseRaw.gateway ?? {},
    webSearch: baseRaw.webSearch ?? {},
  };
  const mysqlBlock =
    baseRaw.mysql != null && typeof baseRaw.mysql === "object"
      ? (baseRaw.mysql as Record<string, unknown>)
      : fromMysqlRaw?.mysql != null && typeof fromMysqlRaw.mysql === "object"
        ? (fromMysqlRaw.mysql as Record<string, unknown>)
        : undefined;
  if (mysqlBlock) {
    forMysqlRowObj.mysql = mysqlBlock;
  }

  const forMysqlRow = JSON.stringify(forMysqlRowObj);

  if (db) {
    const { error } = await db.from("workspace_settings").upsert(
      {
        workspace_key: WS_KEY,
        settings: baseRaw,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_key" },
    );
    if (error) throw new Error(error.message);
  }

  const { getMysqlPool } = await import("@/lib/examStorage/mysqlExamStore.server");
  const pool = await getMysqlPool();
  if (pool) {
    await pool.query(
      `INSERT INTO workspace_settings (workspace_key, settings, updated_at)
       VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_at = CURRENT_TIMESTAMP(3)`,
      [WS_KEY, forMysqlRow],
    );
  }

  if (!db && !pool) {
    throw new Error("未配置 Supabase 且无可用 MySQL 连接，无法将集成配置写入数据库。");
  }
}

/** 合并云端与本机 workspace_settings.settings（浅合并，同名键以云端为准） */
export async function loadWorkspaceSettingsRawMerged(): Promise<Record<string, unknown>> {
  const my = await loadRawWorkspaceSettingsFromMysqlTable();
  const cloud = await loadRawSettingsFromSupabase();
  return { ...(my ?? {}), ...(cloud ?? {}) };
}

/** 将完整 settings JSON 写入 Supabase 与/或 MySQL（保留 importLearning 等扩展键） */
export async function persistWorkspaceSettingsRawMerged(
  raw: Record<string, unknown>,
): Promise<void> {
  const db = getSupabaseAdmin();
  const payload = JSON.stringify(raw);
  if (db) {
    const { error } = await db.from("workspace_settings").upsert(
      {
        workspace_key: WS_KEY,
        settings: raw as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_key" },
    );
    if (error) throw new Error(error.message);
  }
  const { getMysqlPool } = await import("@/lib/examStorage/mysqlExamStore.server");
  const pool = await getMysqlPool();
  if (pool) {
    await pool.query(
      `INSERT INTO workspace_settings (workspace_key, settings, updated_at)
       VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE settings = VALUES(settings), updated_at = CURRENT_TIMESTAMP(3)`,
      [WS_KEY, payload],
    );
  }
  if (!db && !pool) {
    throw new Error("未配置数据库连接，无法写入 workspace_settings。");
  }
}
