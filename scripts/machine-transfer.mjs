#!/usr/bin/env node
/**
 * 换机部署工具（禁止硬编码业务数据）：
 *   node scripts/machine-transfer.mjs bundle-sql
 *   node scripts/machine-transfer.mjs apply          # 等同 npm run db:apply
 *
 * 说明：
 * - bundle-sql：把 supabase/migrations/*.sql 按文件名排序合并为单文件，便于 SQL Editor 一键粘贴
 * - 云端「数据表」仍须在目标机配置 DATABASE_URL 后 apply，或粘贴 bundle-sql 产物
 */
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const migDir = path.join(root, "supabase", "migrations");
const defaultTransferDir = path.join(root, "transfer");

function parseArgs(argv) {
  const out = { cmd: argv[2] || "", flags: {}, positionals: [] };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      out.flags.out = argv[++i];
    } else if (a.startsWith("-")) {
      throw new Error(`未知参数: ${a}`);
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

async function listMigrationFiles() {
  let names = [];
  try {
    names = await readdir(migDir);
  } catch {
    throw new Error(`无法读取迁移目录: ${migDir}`);
  }
  const files = names.filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) throw new Error("未找到 supabase/migrations/*.sql");
  return files;
}

async function bundleSql(outPath) {
  const files = await listMigrationFiles();
  const parts = [];
  parts.push(
    `-- Zhixue bundled migrations\n-- generated: ${new Date().toISOString()}\n-- count: ${files.length}\n-- apply via: Supabase SQL Editor 粘贴本文件，或 DATABASE_URL=... npm run db:apply\n`,
  );
  for (const name of files) {
    const sql = await readFile(path.join(migDir, name), "utf8");
    parts.push(
      `-- ---------------------------------------------------------------------------\n-- 文件: ${name}\n-- ---------------------------------------------------------------------------\n\n${sql.trim()}\n`,
    );
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, parts.join("\n"), "utf8");
  return { outPath, count: files.length };
}

async function applyMigrations() {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "apply-supabase-migrations.mjs")], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`db:apply 退出码 ${code}`));
    });
  });
}

function usage() {
  console.log(`用法:
  node scripts/machine-transfer.mjs bundle-sql [--out path]
  node scripts/machine-transfer.mjs apply

默认输出目录: ${defaultTransferDir}
`);
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv);
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === "bundle-sql") {
    const outPath = flags.out || path.join(defaultTransferDir, "migrations-all.sql");
    const r = await bundleSql(outPath);
    console.log(`已合并 ${r.count} 个迁移 → ${r.outPath}`);
    return;
  }

  if (cmd === "apply") {
    await applyMigrations();
    return;
  }

  throw new Error(`未知命令: ${cmd}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
