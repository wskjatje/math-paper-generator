/**
 * 工作区级 AI 设置：MySQL ai_settings 表 + data/ai-settings.json 镜像。
 * 浏览器 / Electron 的 localStorage 仅作缓存，不以分区为权威。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { mergePartialAiSettings, type AiSettingsForm } from "@/lib/aiSettingsStorage";
import { getMysqlPool } from "@/lib/mysqlPool.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export const AI_SETTINGS_WORKSPACE_KEY = "default";

type AiSettingsFileShape = {
  workspace_key?: string;
  settings?: unknown;
  updated_at?: string;
};

function aiSettingsFilePath(): string {
  return path.join(resolveProjectRoot(), "data", "ai-settings.json");
}

export async function loadAiSettingsFromProjectFile(): Promise<AiSettingsForm | null> {
  try {
    const raw = await readFile(aiSettingsFilePath(), "utf8");
    const j = JSON.parse(raw) as AiSettingsFileShape;
    if (!j || typeof j !== "object" || j.settings == null) return null;
    return mergePartialAiSettings(j.settings);
  } catch {
    return null;
  }
}

export async function saveAiSettingsToProjectFile(settings: AiSettingsForm): Promise<void> {
  const file = aiSettingsFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  const body: AiSettingsFileShape = {
    workspace_key: AI_SETTINGS_WORKSPACE_KEY,
    settings,
    updated_at: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(body, null, 2), "utf8");
}

function entryCount(s: AiSettingsForm | null | undefined): number {
  return s?.modelEntries?.length ?? 0;
}

/** 本机 MySQL ai_settings（需已建表且已保存连接） */
export async function loadAiSettingsFromMysql(): Promise<AiSettingsForm | null> {
  const pool = await getMysqlPool();
  if (!pool) return null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT settings FROM ai_settings WHERE workspace_key = ? LIMIT 1`,
      [AI_SETTINGS_WORKSPACE_KEY],
    );
    const raw = rows[0]?.settings;
    if (raw == null) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return mergePartialAiSettings(parsed);
  } catch {
    return null;
  }
}

export async function saveAiSettingsToMysql(settings: AiSettingsForm): Promise<boolean> {
  const pool = await getMysqlPool();
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO ai_settings (workspace_key, settings, updated_at)
       VALUES (?, CAST(? AS JSON), CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE
         settings = VALUES(settings),
         updated_at = CURRENT_TIMESTAMP(3)`,
      [AI_SETTINGS_WORKSPACE_KEY, JSON.stringify(settings)],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取工作区权威目录：优先条目更多的一侧（MySQL ↔ 文件），并双向补齐镜像。
 */
export async function loadWorkspaceAiSettings(): Promise<AiSettingsForm | null> {
  const [fromMysql, fromFile] = await Promise.all([
    loadAiSettingsFromMysql(),
    loadAiSettingsFromProjectFile(),
  ]);
  if (!fromMysql && !fromFile) return null;
  if (!fromMysql) return fromFile;
  if (!fromFile) {
    try {
      await saveAiSettingsToProjectFile(fromMysql);
    } catch {
      /* ignore */
    }
    return fromMysql;
  }
  const preferMysql = entryCount(fromMysql) >= entryCount(fromFile);
  const chosen = preferMysql ? fromMysql : fromFile;
  const other = preferMysql ? fromFile : fromMysql;
  if (entryCount(chosen) > entryCount(other)) {
    if (preferMysql) {
      try {
        await saveAiSettingsToProjectFile(chosen);
      } catch {
        /* ignore */
      }
    } else {
      await saveAiSettingsToMysql(chosen);
    }
  }
  return chosen;
}

/** 写入工作区：文件必写；MySQL 已配库则双写 */
export async function saveWorkspaceAiSettings(settings: AiSettingsForm): Promise<{
  file: boolean;
  mysql: boolean;
}> {
  await saveAiSettingsToProjectFile(settings);
  const mysql = await saveAiSettingsToMysql(settings);
  return { file: true, mysql };
}
