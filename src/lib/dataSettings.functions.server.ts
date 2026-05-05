import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import {
  deleteLocalExamFile,
  isLocalExamPersistenceAvailable,
  listLocalExamFileInfos,
} from "@/lib/localExamStore.server";
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
    const localWritable = await isLocalExamPersistenceAvailable();
    const migrationFiles = (await readSortedMigrations()).map((f) => f.name);
    const databaseUrlConfigured = !!process.env.DATABASE_URL?.trim();
    const uiMigrateAllowed = process.env.ALLOW_UI_DB_MIGRATIONS === "true";

    return {
      supabaseConfigured: supabase,
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
