#!/usr/bin/env node
/**
 * 仅执行一个 SQL 文件（用于已上线库按需补跑单条迁移，避免重复执行整套 supabase/migrations）。
 *
 * 用法（仓库根目录）：
 *   DATABASE_URL="postgresql://..." node scripts/apply-single-pg-migration.mjs supabase/migrations/20260508201500_exams_import_parse_quality.sql
 *
 * 或 npm run db:apply:import-parse-quality（需已 export DATABASE_URL）
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function main() {
  const rel = process.argv[2]?.trim();
  if (!rel) {
    console.error("用法: node scripts/apply-single-pg-migration.mjs <相对仓库根的路径.sql>");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("请设置 DATABASE_URL（Supabase 控制台 → Database → Connection string URI）");
    process.exit(1);
  }

  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  const sql = await readFile(abs, "utf8");

  const useSsl =
    /supabase\.co|sslmode=require|sslmode=verify/i.test(databaseUrl) ||
    process.env.DATABASE_SSL_NO_VERIFY === "true";

  const client = new Client({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();
  try {
    console.log("执行:", rel);
    await client.query(sql);
    console.log("完成。");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
