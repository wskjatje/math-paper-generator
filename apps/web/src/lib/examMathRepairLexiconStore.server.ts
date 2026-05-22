/**
 * 命题一类数学自学规则：合并 data/exam-math-repair-overrides.json 与 exam_math_repair_rules（Supabase / MySQL）。
 * 同 id 覆盖顺序：项目文件 → Supabase → **MySQL（本地库为准，覆盖同 id）**。
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";

import type { PersistedExamMathRepairRule } from "@/lib/examMathRepairLexicon.shared";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

function overridesPath() {
  return path.join(resolveProjectRoot(), "data", "exam-math-repair-overrides.json");
}

function ensureDataDir(): void {
  const dir = path.dirname(overridesPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readRulesFromDisk(): PersistedExamMathRepairRule[] {
  ensureDataDir();
  try {
    const raw = readFileSync(overridesPath(), "utf8");
    const j = JSON.parse(raw) as { rules?: PersistedExamMathRepairRule[] };
    if (!j || !Array.isArray(j.rules)) return [];
    return j.rules.filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.find === "string" &&
        typeof r.replace === "string",
    );
  } catch {
    return [];
  }
}

function rowToRule(r: RowDataPacket): PersistedExamMathRepairRule | null {
  const id = String(r.id ?? "");
  const find = String(r.find ?? "");
  const replacement = String(r.replacement ?? "");
  if (!id || !find) return null;
  return {
    id,
    find,
    replace: replacement,
    flags: r.flags != null ? String(r.flags) : "g",
  };
}

async function loadFromSupabase(): Promise<PersistedExamMathRepairRule[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("exam_math_repair_rules")
    .select("id, find, replacement, flags")
    .eq("enabled", true);
  if (error || !data?.length) return [];
  const rules: PersistedExamMathRepairRule[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const id = String(raw.id ?? "");
    const find = String(raw.find ?? "");
    const replacement = String(raw.replacement ?? "");
    if (!id || !find) continue;
    rules.push({
      id,
      find,
      replace: replacement,
      flags: raw.flags != null ? String(raw.flags) : "g",
    });
  }
  return rules;
}

async function loadFromMysql(): Promise<PersistedExamMathRepairRule[]> {
  const pool = await getMysqlPool();
  if (!pool) return [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, find, replacement, flags FROM exam_math_repair_rules WHERE enabled = 1 ORDER BY id ASC",
    );
    const rules: PersistedExamMathRepairRule[] = [];
    for (const row of rows) {
      const r = rowToRule(row);
      if (r) rules.push(r);
    }
    return rules;
  } catch {
    return [];
  }
}

function mergeById(layers: PersistedExamMathRepairRule[][]): PersistedExamMathRepairRule[] {
  const map = new Map<string, PersistedExamMathRepairRule>();
  for (const layer of layers) {
    for (const r of layer) {
      if (r?.id) map.set(r.id, r);
    }
  }
  return Array.from(map.values());
}

/** 合并磁盘与数据库中的自学规则（无缓存；调用方控制刷新频率） */
export async function loadMergedExamMathRepairRules(): Promise<PersistedExamMathRepairRule[]> {
  const fromFile = readRulesFromDisk();
  const fromCloud = await loadFromSupabase();
  const fromMysql = await loadFromMysql();
  return mergeById([fromFile, fromCloud, fromMysql]);
}

/** 同步写入 Supabase 与本地 MySQL（可同时具备）；皆无则仅依赖调用方写入 data JSON */
export async function upsertExamMathRepairRulesToStores(
  rules: PersistedExamMathRepairRule[],
): Promise<void> {
  if (!rules.length) return;
  const db = getSupabaseAdmin();
  const pool = await getMysqlPool();

  if (db) {
    const now = new Date().toISOString();
    for (const r of rules) {
      const { error } = await db.from("exam_math_repair_rules").upsert(
        {
          id: r.id,
          find: r.find,
          replacement: r.replace,
          flags: r.flags ?? "g",
          enabled: true,
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (error) console.warn("[exam-math-repair] supabase upsert failed", r.id, error.message);
    }
  }

  if (pool) {
    for (const r of rules) {
      try {
        await pool.query(
          `INSERT INTO exam_math_repair_rules (id, find, replacement, flags, enabled, updated_at)
           VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE find = VALUES(find), replacement = VALUES(replacement), flags = VALUES(flags), enabled = 1, updated_at = CURRENT_TIMESTAMP(3)`,
          [r.id, r.find, r.replace, r.flags ?? "g"],
        );
      } catch (e) {
        console.warn("[exam-math-repair] mysql upsert failed", r.id, e);
      }
    }
  }
}
