import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  deleteLocalExamFile,
  isLocalExamPersistenceAvailable,
  listLocalExamFileInfos,
} from "@/lib/localExamStore.server";
import { isMysqlExamPersistenceAvailable } from "@/lib/examStorage/mysqlExamStore.server";
import { getMysqlUiState } from "@/lib/mysqlConnection.server";
import {
  bundleMigrationsForSqlEditor,
  executeMigrationsWithDatabaseUrl,
  readSortedMigrations,
} from "@/lib/migrations.server";

function hostnameOnly(urlStr: string | undefined): string | null {
  const t = urlStr?.trim();
  if (!t) return null;
  try {
    return new URL(t).hostname || null;
  } catch {
    return null;
  }
}

export type DataSettingsOverview = {
  supabaseConfigured: boolean;
  /** 是否已保存本机 MySQL 连接（data/mysql-connection.json） */
  mysqlConnectionConfigured: boolean;
  /** 当前保存的连接能否 SELECT 1（教育 OS / 自动本地一体依赖） */
  mysqlReachable: boolean;
  /** Supabase REST/API 主机名（来自 SUPABASE_URL），仅供展示 */
  supabaseUrlHost: string | null;
  /** Postgres 直连主机名（来自 DATABASE_URL），仅供展示 */
  databaseUrlHost: string | null;
  localWritable: boolean;
  migrationFiles: string[];
  databaseUrlConfigured: boolean;
  uiMigrateAllowed: boolean;
  canRunUiMigration: boolean;
};

/** 设置页「本地与数据库」：存储与迁移能力概览 */
export const getDataSettingsOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<DataSettingsOverview> => {
    const supabase = !!getSupabaseAdmin();
    let mysqlUi = {
      configured: false,
      host: null as string | null,
      port: null as number | null,
      user: null as string | null,
      database: null as string | null,
      passwordSaved: false,
      passwordStoredEncrypted: false,
      encryptionKeySource: "will-create" as const,
      source: "file" as const,
    };
    try {
      mysqlUi = await getMysqlUiState();
    } catch (e) {
      console.warn("[getDataSettingsOverview] getMysqlUiState", e);
    }
    const mysqlReachable = await isMysqlExamPersistenceAvailable();
    const localWritable = await isLocalExamPersistenceAvailable();
    let migrationFiles: string[] = [];
    try {
      migrationFiles = (await readSortedMigrations()).map((f) => f.name);
    } catch (e) {
      console.warn("[getDataSettingsOverview] readSortedMigrations", e);
    }
    const databaseUrlConfigured = !!process.env.DATABASE_URL?.trim();
    const uiMigrateAllowed = process.env.ALLOW_UI_DB_MIGRATIONS === "true";

    return {
      supabaseConfigured: supabase,
      mysqlConnectionConfigured: mysqlUi.configured,
      mysqlReachable,
      supabaseUrlHost: hostnameOnly(process.env.SUPABASE_URL),
      databaseUrlHost: hostnameOnly(process.env.DATABASE_URL),
      localWritable,
      migrationFiles,
      databaseUrlConfigured,
      uiMigrateAllowed,
      canRunUiMigration: databaseUrlConfigured && uiMigrateAllowed,
    };
  },
);

export const listLocalExamFilesAdmin = createServerFn({ method: "GET" }).handler(async () => ({
  files: await listLocalExamFileInfos(),
}));

const DeleteLocalSchema = z.object({ id: z.string().uuid() });

export const deleteLocalExamAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteLocalSchema.parse(data))
  .handler(async ({ data }) => {
    return deleteLocalExamFile(data.id);
  });

/** 合并后的建表 SQL，可粘贴到 Supabase SQL Editor */
export const getBundledMigrationSql = createServerFn({ method: "GET" }).handler(async () => {
  const files = await readSortedMigrations();
  return { sql: bundleMigrationsForSqlEditor(files), fileNames: files.map((f) => f.name) };
});

/**
 * 使用服务端环境变量 DATABASE_URL（Postgres 直连串）按顺序执行迁移。
 * 需同时设置 ALLOW_UI_DB_MIGRATIONS=true，避免误触生产库。
 */
export const runBundledMigrationsOnServer = createServerFn({ method: "POST" }).handler(async () => {
  if (process.env.ALLOW_UI_DB_MIGRATIONS !== "true") {
    throw new Error(
      "未允许从页面执行：请在 .env 中设置 ALLOW_UI_DB_MIGRATIONS=true，并配置 Supabase 的 DATABASE_URL（直连 Postgres）。",
    );
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "缺少 DATABASE_URL。请在 Supabase 控制台 → Project Settings → Database 复制「Connection string」URI（不是 API URL）。",
    );
  }
  const { applied } = await executeMigrationsWithDatabaseUrl(url);
  return { ok: true as const, applied };
});

export type SystemUpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  checkedAtIso: string;
  source: string;
};

function normalizeVersionTag(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  return t.replace(/^v/i, "");
}

async function readCurrentAppVersion(): Promise<string> {
  const pkgPath = path.join(resolveProjectRoot(), "package.json");
  const raw = await readFile(pkgPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" && parsed.version.trim()
    ? parsed.version.trim()
    : "0.0.0";
}

/** 设置页「系统更新」：读取本地版本并检查 GitHub 最新 release。 */
export const checkSystemUpdate = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemUpdateCheckResult> => {
    const currentVersion = await readCurrentAppVersion();
    const repo = (process.env.MPG_UPDATE_REPO ?? "wskjatje/math-paper-generator").trim();
    const api = `https://api.github.com/repos/${repo}/releases/latest`;

    try {
      const res = await fetch(api, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "math-paper-generator-update-check",
        },
      });
      if (!res.ok) {
        throw new Error(`GitHub API ${res.status}`);
      }
      const j = (await res.json()) as {
        tag_name?: string;
        name?: string;
        html_url?: string;
      };
      const latestVersion = normalizeVersionTag(j.tag_name);
      const currentNorm = normalizeVersionTag(currentVersion);
      const hasUpdate = !!latestVersion && !!currentNorm && latestVersion !== currentNorm;

      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseUrl: j.html_url?.trim() || null,
        releaseName: j.name?.trim() || null,
        checkedAtIso: new Date().toISOString(),
        source: repo,
      };
    } catch {
      return {
        currentVersion,
        latestVersion: null,
        hasUpdate: false,
        releaseUrl: null,
        releaseName: null,
        checkedAtIso: new Date().toISOString(),
        source: repo,
      };
    }
  },
);
