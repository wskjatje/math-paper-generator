#!/usr/bin/env node
/**
 * 在项目根目录执行：DATABASE_URL="postgresql://..." node scripts/apply-supabase-migrations.mjs
 * 按文件名排序依次执行 supabase/migrations/*.sql（与设置页「执行迁移」逻辑一致）。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const migDir = path.join(root, "supabase", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("请设置环境变量 DATABASE_URL（Supabase → Database → Connection string URI）");
    process.exit(1);
  }

  let names = [];
  try {
    names = await readdir(migDir);
  } catch (e) {
    console.error("无法读取目录:", migDir, e);
    process.exit(1);
  }

  const files = names.filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) {
    console.error("未找到 supabase/migrations/*.sql");
    process.exit(1);
  }

  const useSsl =
    /supabase\.co|sslmode=require|sslmode=verify/i.test(databaseUrl) ||
    process.env.DATABASE_SSL_NO_VERIFY === "true";

  const client = new Client({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();
  try {
    for (const name of files) {
      const sql = await readFile(path.join(migDir, name), "utf8");
      console.log("执行:", name);
      await client.query(sql);
    }
    console.log("完成，共", files.length, "个文件。");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
