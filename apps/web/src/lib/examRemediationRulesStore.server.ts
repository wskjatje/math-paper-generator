/**
 * 从 MySQL 加载 `exam_remediation_rules`；无连接或表不存在时返回空（不打断导入）。
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";
import {
  parseRemediationAction,
  parseRemediationMatch,
  type ExamRemediationAction,
  type ExamRemediationMatch,
} from "@/lib/examRemediationRules.shared";

async function ensureExamRemediationRulesTable(): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(`
CREATE TABLE IF NOT EXISTS exam_remediation_rules (
  id VARCHAR(128) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  priority INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  name VARCHAR(255) NULL,
  match_json JSON NOT NULL,
  action_json JSON NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_exam_remediation_lookup (workspace_key, enabled, priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
  } catch {
    /* 无建表权限时由全量 schema 迁移补 */
  }
}

export type LoadedExamRemediationRule = {
  id: string;
  priority: number;
  name: string | null;
  match: ExamRemediationMatch;
  action: ExamRemediationAction;
  note: string | null;
};

export async function loadExamRemediationRules(
  workspaceKey = "default",
): Promise<LoadedExamRemediationRule[]> {
  await ensureExamRemediationRulesTable();
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, priority, name, match_json, action_json, note
     FROM exam_remediation_rules
     WHERE enabled = 1 AND workspace_key = ?
     ORDER BY priority DESC, id ASC`,
    [workspaceKey],
  );

  const out: LoadedExamRemediationRule[] = [];
  for (const r of rows) {
    const id = String((r as { id?: string }).id ?? "");
    if (!id) continue;
    const m = parseRemediationMatch((r as { match_json?: unknown }).match_json);
    const a = parseRemediationAction((r as { action_json?: unknown }).action_json);
    if (!m || !a) continue;
    out.push({
      id,
      priority: Number((r as { priority?: number }).priority ?? 0),
      name: (r as { name?: string | null }).name ?? null,
      match: m,
      action: a,
      note: (r as { note?: string | null }).note ?? null,
    });
  }
  return out;
}

export async function upsertExamRemediationRule(input: {
  id: string;
  workspace_key?: string;
  priority?: number;
  enabled?: boolean;
  name?: string | null;
  match_json: unknown;
  action_json: unknown;
  note?: string | null;
}): Promise<void> {
  await ensureExamRemediationRulesTable();
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置本地 MySQL，无法写入 exam_remediation_rules");

  const m = parseRemediationMatch(input.match_json);
  const a = parseRemediationAction(input.action_json);
  if (!m) throw new Error("match_json 不符合约定（参见 ExamRemediationMatchSchema）");
  if (!a)
    throw new Error("action_json 不符合约定（infer_geometry_diagram | clear_geometry_diagram）");

  const ws = input.workspace_key ?? "default";
  await pool.execute(
    `INSERT INTO exam_remediation_rules
      (id, workspace_key, priority, enabled, name, match_json, action_json, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       workspace_key = VALUES(workspace_key),
       priority = VALUES(priority),
       enabled = VALUES(enabled),
       name = VALUES(name),
       match_json = VALUES(match_json),
       action_json = VALUES(action_json),
       note = VALUES(note),
       updated_at = NOW(3)`,
    [
      input.id,
      ws,
      input.priority ?? 0,
      input.enabled === false ? 0 : 1,
      input.name ?? null,
      JSON.stringify(m),
      JSON.stringify(a),
      input.note ?? null,
    ],
  );
}

export async function listExamRemediationRuleRows(
  workspaceKey = "default",
): Promise<RowDataPacket[]> {
  await ensureExamRemediationRulesTable();
  const pool = await getMysqlPool();
  if (!pool) return [];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, workspace_key, priority, enabled, name, match_json, action_json, note, updated_at
     FROM exam_remediation_rules
     WHERE workspace_key = ?
     ORDER BY priority DESC, id ASC`,
    [workspaceKey],
  );
  return [...rows];
}

export async function deleteExamRemediationRule(
  id: string,
  workspaceKey = "default",
): Promise<boolean> {
  await ensureExamRemediationRulesTable();
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置本地 MySQL");
  const [res] = await pool.execute<ResultSetHeader>(
    `DELETE FROM exam_remediation_rules WHERE id = ? AND workspace_key = ?`,
    [id, workspaceKey],
  );
  return res.affectedRows > 0;
}
