/**
 * 网上导入队列：Supabase → MySQL → data/remote-import-jobs.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";

import type { RemoteImportJob } from "@/lib/remoteImportJobs.types";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

export const REMOTE_IMPORT_JOBS_MAX = 40;
const WS_KEY = "default";

function jobsPath() {
  return path.join(resolveProjectRoot(), "data", "remote-import-jobs.json");
}

function rowToJob(row: RowDataPacket): RemoteImportJob | null {
  try {
    const raw = row.job;
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!j || typeof j !== "object") return null;
    return j as RemoteImportJob;
  } catch {
    return null;
  }
}

async function loadFromSupabase(): Promise<RemoteImportJob[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("remote_import_jobs")
    .select("id, job, updated_at")
    .eq("workspace_key", WS_KEY)
    .order("updated_at", { ascending: false })
    .limit(REMOTE_IMPORT_JOBS_MAX);
  if (error || !data?.length) return [];
  const out: RemoteImportJob[] = [];
  for (const r of data as { job?: unknown }[]) {
    const j = r.job;
    if (!j || typeof j !== "object") continue;
    out.push(j as RemoteImportJob);
  }
  return out;
}

async function loadFromMysql(): Promise<RemoteImportJob[]> {
  const pool = await getMysqlPool();
  if (!pool) return [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT job FROM remote_import_jobs WHERE workspace_key = ? ORDER BY updated_at DESC LIMIT ${REMOTE_IMPORT_JOBS_MAX}`,
      [WS_KEY],
    );
    const out: RemoteImportJob[] = [];
    for (const row of rows) {
      const j = rowToJob(row);
      if (j) out.push(j);
    }
    return out;
  } catch {
    return [];
  }
}

async function loadFromFile(): Promise<RemoteImportJob[]> {
  try {
    const raw = await readFile(jobsPath(), "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j as RemoteImportJob[];
  } catch {
    return [];
  }
}

export async function listRemoteImportJobsMerged(): Promise<RemoteImportJob[]> {
  const fromCloud = await loadFromSupabase();
  if (fromCloud.length > 0) return fromCloud.slice(0, REMOTE_IMPORT_JOBS_MAX);
  const fromMysql = await loadFromMysql();
  if (fromMysql.length > 0) return fromMysql.slice(0, REMOTE_IMPORT_JOBS_MAX);
  const fromFile = await loadFromFile();
  return fromFile.slice(0, REMOTE_IMPORT_JOBS_MAX);
}

async function persistToFile(jobs: RemoteImportJob[]): Promise<void> {
  await writeFile(jobsPath(), `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
}

export async function persistRemoteImportJobsAll(jobs: RemoteImportJob[]): Promise<void> {
  const trimmed = jobs.slice(0, REMOTE_IMPORT_JOBS_MAX);
  const now = new Date().toISOString();
  const db = getSupabaseAdmin();

  if (db) {
    await db.from("remote_import_jobs").delete().eq("workspace_key", WS_KEY);
    for (const j of trimmed) {
      const updatedAt = j.updatedAt ?? now;
      const { error } = await db.from("remote_import_jobs").insert({
        id: j.id,
        workspace_key: WS_KEY,
        job: j as unknown as Record<string, unknown>,
        updated_at: updatedAt,
      });
      if (error) console.warn("[remote-import-jobs] supabase insert failed", j.id, error.message);
    }
    await persistToFile(trimmed);
    return;
  }

  const pool = await getMysqlPool();
  if (pool) {
    await pool.query("DELETE FROM remote_import_jobs WHERE workspace_key = ?", [WS_KEY]);
    for (const j of trimmed) {
      const updatedAt = j.updatedAt ?? now;
      await pool.query(
        `INSERT INTO remote_import_jobs (id, workspace_key, job, updated_at)
         VALUES (?, ?, CAST(? AS JSON), ?)`,
        [j.id, WS_KEY, JSON.stringify(j), updatedAt],
      );
    }
    await persistToFile(trimmed);
    return;
  }

  await persistToFile(trimmed);
}
