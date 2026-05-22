/**
 * OCR 修复词典：合并 Supabase、本地 MySQL、仓库 data/ocr-repair-lexicon.json；
 * 同 id 以 **MySQL 为准**；无任一数据库时才写回 data 文件（减少拷盘换机依赖）。
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";

import type { Tables } from "@/integrations/supabase/types";
import type { OcrRepairLexiconRule } from "@/lib/ocrRepairLexicon.shared";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";

type OcrRepairLexiconRow = Tables<"ocr_repair_lexicon">;

const CACHE_TTL_MS = 45_000;
let cache: { rules: OcrRepairLexiconRule[]; loadedAt: number } | null = null;

function rowToRule(r: RowDataPacket): OcrRepairLexiconRule | null {
  const id = String(r.id ?? "");
  const mk = String(r.match_kind ?? "literal");
  const pattern = String(r.pattern ?? "");
  const replacement = String(r.replacement ?? "");
  if (!id || !pattern) return null;
  return {
    id,
    match_kind: mk === "regex" ? "regex" : "literal",
    pattern,
    replacement,
    priority: Number(r.priority ?? 0),
  };
}

async function loadFromSupabase(): Promise<OcrRepairLexiconRule[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("ocr_repair_lexicon")
    .select("id, match_kind, pattern, replacement, priority")
    .eq("enabled", true)
    .order("priority", { ascending: false });
  if (error || !data?.length) return [];
  const rules: OcrRepairLexiconRule[] = [];
  const rows = data as OcrRepairLexiconRow[];
  for (const raw of rows) {
    const id = String(raw.id ?? "");
    const pattern = String(raw.pattern ?? "");
    if (!id || !pattern) continue;
    rules.push({
      id,
      match_kind: raw.match_kind === "regex" ? "regex" : "literal",
      pattern,
      replacement: String(raw.replacement ?? ""),
      priority: Number(raw.priority ?? 0),
    });
  }
  return rules;
}

async function loadFromMysql(): Promise<OcrRepairLexiconRule[]> {
  const pool = await getMysqlPool();
  if (!pool) return [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, match_kind, pattern, replacement, priority FROM ocr_repair_lexicon WHERE enabled = 1 ORDER BY priority DESC, id ASC",
    );
    const rules: OcrRepairLexiconRule[] = [];
    for (const row of rows) {
      const r = rowToRule(row);
      if (r) rules.push(r);
    }
    return rules;
  } catch {
    return [];
  }
}

function mergeOcrRulesById(layers: OcrRepairLexiconRule[][]): OcrRepairLexiconRule[] {
  const map = new Map<string, OcrRepairLexiconRule>();
  for (const layer of layers) {
    for (const r of layer) {
      if (r?.id) map.set(r.id, r);
    }
  }
  return Array.from(map.values());
}

async function loadFromJsonFile(): Promise<OcrRepairLexiconRule[]> {
  try {
    const p = path.join(resolveProjectRoot(), "data", "ocr-repair-lexicon.json");
    const raw = await readFile(p, "utf8");
    const j = JSON.parse(raw) as {
      rules?: Array<{
        id?: string;
        match_kind?: string;
        pattern?: string;
        replacement?: string;
        priority?: number;
        enabled?: boolean;
      }>;
    };
    const rules: OcrRepairLexiconRule[] = [];
    for (const x of j.rules ?? []) {
      if (x.enabled === false) continue;
      const id = String(x.id ?? "").trim() || randomUUID();
      const pattern = String(x.pattern ?? "");
      if (!pattern) continue;
      rules.push({
        id,
        match_kind: x.match_kind === "regex" ? "regex" : "literal",
        pattern,
        replacement: String(x.replacement ?? ""),
        priority: Number(x.priority ?? 0),
      });
    }
    return rules;
  } catch {
    return [];
  }
}

/** 加载全部启用规则（带短缓存）；三层合并，同 id **MySQL 覆盖云端与文件** */
export async function loadOcrRepairLexiconRules(): Promise<OcrRepairLexiconRule[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.rules;

  const [fromFile, fromCloud, fromMysql] = await Promise.all([
    loadFromJsonFile(),
    loadFromSupabase(),
    loadFromMysql(),
  ]);
  const merged = mergeOcrRulesById([fromFile, fromCloud, fromMysql]);
  cache = { rules: merged, loadedAt: now };
  return merged;
}

export function invalidateOcrRepairLexiconCache(): void {
  cache = null;
}

export async function persistLiteralRulesToStores(
  pairs: Array<{ pattern: string; replacement: string; note?: string }>,
): Promise<{ upserted: number }> {
  if (!pairs.length) return { upserted: 0 };
  let upserted = 0;

  const db = getSupabaseAdmin();
  const pool = await getMysqlPool();

  for (const p of pairs) {
    let ruleId: string | undefined;

    if (pool) {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM ocr_repair_lexicon WHERE match_kind = 'literal' AND pattern = ? LIMIT 1",
        [p.pattern],
      );
      if (rows.length > 0 && rows[0]?.id) ruleId = String(rows[0].id);
    }
    if (!ruleId && db) {
      const { data: existing } = await db
        .from("ocr_repair_lexicon")
        .select("id")
        .eq("match_kind", "literal")
        .eq("pattern", p.pattern)
        .maybeSingle();
      const row = existing as Pick<OcrRepairLexiconRow, "id"> | null;
      if (row?.id) ruleId = String(row.id);
    }

    const id = ruleId ?? randomUUID();
    const note = p.note ?? "import-diff";
    const nowIso = new Date().toISOString();

    if (db) {
      const { error } = await db.from("ocr_repair_lexicon").upsert(
        {
          id,
          match_kind: "literal",
          pattern: p.pattern,
          replacement: p.replacement,
          priority: 0,
          enabled: true,
          note,
          updated_at: nowIso,
        },
        { onConflict: "id" },
      );
      if (error) console.warn("[ocr-repair-lexicon] supabase upsert failed", error.message);
    }

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO ocr_repair_lexicon (id, match_kind, pattern, replacement, priority, enabled, note, updated_at)
           VALUES (?, 'literal', ?, ?, 0, 1, ?, CURRENT_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE pattern = VALUES(pattern), replacement = VALUES(replacement), note = VALUES(note), updated_at = CURRENT_TIMESTAMP(3)`,
          [id, p.pattern, p.replacement, note],
        );
      } catch (e) {
        console.warn("[ocr-repair-lexicon] mysql upsert failed", e);
      }
    }

    if (db || pool) upserted++;
  }

  if (db || pool) {
    invalidateOcrRepairLexiconCache();
    return { upserted };
  }

  const fs = await import("node:fs/promises");
  const fp = path.join(resolveProjectRoot(), "data", "ocr-repair-lexicon.json");
  let cur: { version?: number; rules: unknown[] } = { version: 1, rules: [] };
  try {
    cur = JSON.parse(await fs.readFile(fp, "utf8")) as typeof cur;
  } catch {
    /* */
  }
  const rules = Array.isArray(cur.rules) ? [...cur.rules] : [];
  for (const pair of pairs) {
    const idx = rules.findIndex(
      (r: unknown) =>
        typeof r === "object" &&
        r !== null &&
        "pattern" in r &&
        String((r as { pattern: string }).pattern) === pair.pattern,
    );
    const entry = {
      id: randomUUID(),
      match_kind: "literal",
      pattern: pair.pattern,
      replacement: pair.replacement,
      priority: 0,
      enabled: true,
      note: pair.note ?? "import-diff",
    };
    if (idx >= 0) rules[idx] = { ...(rules[idx] as object), ...entry };
    else rules.push(entry);
    upserted++;
  }
  await fs.writeFile(fp, JSON.stringify({ version: 1, rules }, null, 2), "utf8");
  invalidateOcrRepairLexiconCache();
  return { upserted };
}
