/**
 * 读取 supabase/migrations 下 SQL，供展示、复制或在具备 DATABASE_URL 时执行建表。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "@/lib/projectRoot.server";

export type MigrationFile = { name: string; sql: string };

function migrationsDir(): string {
  return path.join(resolveProjectRoot(), "supabase", "migrations");
}

export async function readSortedMigrations(): Promise<MigrationFile[]> {
  let names: string[] = [];
  try {
    names = await readdir(migrationsDir());
  } catch {
    return [];
  }
  const sqlFiles = names.filter((f) => f.endsWith(".sql")).sort();
  const out: MigrationFile[] = [];
  for (const name of sqlFiles) {
    try {
      const sql = await readFile(path.join(migrationsDir(), name), "utf8");
      out.push({ name, sql });
    } catch (e) {
      console.warn(`[migrations] 跳过无法读取的文件: ${name}`, e);
    }
  }
  return out;
}

export function bundleMigrationsForSqlEditor(files: MigrationFile[]): string {
  if (!files.length) return "-- （未找到 supabase/migrations 下的 .sql 文件）\n";
  return files
    .map(
      (f) =>
        `-- ---------------------------------------------------------------------------\n-- 文件: ${f.name}\n-- ---------------------------------------------------------------------------\n\n${f.sql.trim()}\n`,
    )
    .join("\n");
}

export async function executeMigrationsWithDatabaseUrl(
  databaseUrl: string,
): Promise<{ applied: string[] }> {
  const { Client } = await import("pg");
  const files = await readSortedMigrations();
  if (!files.length) {
    throw new Error("未找到可执行的迁移文件（supabase/migrations/*.sql）");
  }

  const useSsl =
    /supabase\.co|sslmode=require|sslmode=verify/i.test(databaseUrl) ||
    process.env.DATABASE_SSL_NO_VERIFY === "true";

  const client = new Client({
    connectionString: databaseUrl.trim(),
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();
  const applied: string[] = [];
  try {
    for (const f of files) {
      await client.query(f.sql);
      applied.push(f.name);
    }
  } finally {
    await client.end();
  }
  return { applied };
}
