/**
 * 将 data/local-exams 全部快照迁入 MySQL。
 *
 * 用法：
 *   npx tsx apps/web/scripts/migrate-local-exams-to-mysql.ts
 *   npx tsx apps/web/scripts/migrate-local-exams-to-mysql.ts --keep-local
 *
 * 默认：写入 MySQL 成功后把本地 JSON 移到 data/local-exams-migrated/（避免试卷库双显）。
 * --keep-local：保留 data/local-exams 原文件。
 */
import { mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/projectRoot.server.ts";
import {
  isSafeLocalExamId,
  listLocalExamRows,
  loadLocalExam,
} from "../src/lib/localExamStore.server.ts";
import {
  insertExamSnapshotToMysql,
  isMysqlExamPersistenceAvailable,
  loadMysqlExamSnapshot,
  replaceExamSnapshotInMysql,
} from "../src/lib/examStorage/mysqlExamStore.server.ts";

const keepLocal = process.argv.includes("--keep-local");

function localExamsDir(): string {
  return path.join(resolveProjectRoot(), "data", "local-exams");
}

function migratedDir(): string {
  return path.join(resolveProjectRoot(), "data", "local-exams-migrated");
}

async function archiveLocalFile(examId: string): Promise<void> {
  const src = path.join(localExamsDir(), `${examId}.json`);
  await mkdir(migratedDir(), { recursive: true });
  const dest = path.join(migratedDir(), `${examId}.json`);
  await rename(src, dest);
}

async function main(): Promise<void> {
  const ok = await isMysqlExamPersistenceAvailable();
  if (!ok) {
    console.error("MySQL 不可用：请先在设置页配置并保存本机 MySQL 连接。");
    process.exit(1);
  }

  const rows = await listLocalExamRows();
  console.info(`待迁移本地卷：${rows.length} 份`);
  if (rows.length === 0) {
    // 仍扫描目录，避免 list 过滤掉已删标记等
    const names = await readdir(localExamsDir()).catch(() => [] as string[]);
    const ids = names
      .filter((n) => n.endsWith(".json") && !n.startsWith("."))
      .map((n) => n.slice(0, -5))
      .filter(isSafeLocalExamId);
    if (ids.length === 0) {
      console.info("data/local-exams 无可用快照，退出。");
      return;
    }
  }

  let inserted = 0;
  let replaced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const id = row.id;
    const title = row.title ?? id;
    try {
      const snap = await loadLocalExam(id);
      if (!snap) {
        failed += 1;
        errors.push(`${id} (${title}): 本地文件无法读取`);
        continue;
      }

      const existing = await loadMysqlExamSnapshot(id);
      if (existing) {
        await replaceExamSnapshotInMysql(snap);
        replaced += 1;
        console.info(`✓ 覆盖 MySQL  ${id}  ${title}`);
      } else {
        await insertExamSnapshotToMysql(snap);
        inserted += 1;
        console.info(`✓ 新写入 MySQL  ${id}  ${title}`);
      }

      if (!keepLocal) {
        await archiveLocalFile(id);
        console.info(`  → 已归档至 data/local-exams-migrated/${id}.json`);
      }
    } catch (e: unknown) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${id} (${title}): ${msg}`);
      console.error(`✗ ${id}  ${title}: ${msg}`);
    }
  }

  console.info("\n—— 汇总 ——");
  console.info(`新写入: ${inserted}`);
  console.info(`覆盖更新: ${replaced}`);
  console.info(`失败: ${failed}`);
  if (errors.length) {
    console.info("失败明细:");
    for (const line of errors) console.info(`  - ${line}`);
  }
  if (failed > 0) process.exit(1);
}

await main();
