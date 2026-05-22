/**
 * 对本地 MySQL 执行 sql/mysql/zhixue_schema.sql
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection, type Connection } from "mysql2/promise";
import { mergePartialAiSettings } from "@/lib/aiSettingsStorage";
import { DEFAULT_GATEWAY_SETTINGS } from "@/lib/gatewaySettingsStorage";
import type { MysqlConnectionForm } from "@/lib/mysqlConnection.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { DEFAULT_WEB_SEARCH_SETTINGS } from "@/lib/webSearchSettingsStorage";

const SCHEMA_REL = path.join("sql", "mysql", "zhixue_schema.sql");

export async function readBundledMysqlSchemaSql(): Promise<string> {
  const p = path.join(resolveProjectRoot(), SCHEMA_REL);
  return readFile(p, "utf8");
}

function createOpts(c: MysqlConnectionForm) {
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    multipleStatements: true,
  } as const;
}

/** 仅测连到指定库 */
export async function testMysqlWithDatabase(c: MysqlConnectionForm): Promise<void> {
  const conn: Connection = await createConnection(createOpts(c));
  try {
    await conn.query("SELECT 1 AS ok");
  } finally {
    await conn.end();
  }
}

/**
 * 不指定 database，用于「创建库」前探测账号是否可用
 */
export async function testMysqlServerLogin(
  c: Pick<MysqlConnectionForm, "host" | "port" | "user" | "password">,
): Promise<void> {
  const conn: Connection = await createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });
  try {
    await conn.query("SELECT 1 AS ok");
  } finally {
    await conn.end();
  }
}

function escapeMysqlIdentifier(id: string): string {
  return "`" + id.replace(/`/g, "``") + "`";
}

/**
 * 在已连接服务器上创建库（若不存在）
 */
export async function ensureMysqlDatabase(
  c: Pick<MysqlConnectionForm, "host" | "port" | "user" | "password" | "database">,
): Promise<void> {
  const dbId = escapeMysqlIdentifier(c.database);
  const conn: Connection = await createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${dbId} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

async function ensureMysqlExamParityColumns(conn: Connection): Promise<void> {
  const alters = [
    "ALTER TABLE exams ADD COLUMN import_review_status VARCHAR(32) NULL",
    "ALTER TABLE questions ADD COLUMN type_label VARCHAR(500) NULL",
    "ALTER TABLE exams ADD COLUMN figure_registry JSON NULL DEFAULT NULL COMMENT 'P7-1A 卷面图 registry'",
    "ALTER TABLE questions ADD COLUMN figure_refs JSON NULL DEFAULT NULL COMMENT 'P7-1A 题目图引用'",
  ];
  for (const q of alters) {
    try {
      await conn.query(q);
    } catch (e: unknown) {
      const errno =
        e && typeof e === "object" && "errno" in e ? Number((e as { errno: number }).errno) : 0;
      if (errno !== 1060) throw e;
    }
  }
}

/** 旧库仅跑过增量 ALTER、未重跑全量 schema 时补建 OCR 修复词典表 */
async function ensureWorkspaceSettingsTable(conn: Connection): Promise<void> {
  await conn.query(`
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  settings JSON NOT NULL DEFAULT (CAST('{}' AS JSON)),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

async function ensureRemoteImportJobsTable(conn: Connection): Promise<void> {
  await conn.query(`
CREATE TABLE IF NOT EXISTS remote_import_jobs (
  id VARCHAR(64) NOT NULL,
  workspace_key VARCHAR(64) NOT NULL DEFAULT 'default',
  job JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_remote_import_ws_updated (workspace_key, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

/** 旧库补建：教材章节目录（与 sql/mysql/zhixue_schema.sql 一致） */
async function ensureCurriculumCatalogTables(conn: Connection): Promise<void> {
  await conn.query(`
CREATE TABLE IF NOT EXISTS curriculum_catalog_series (
  id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(32) NOT NULL,
  grade_band VARCHAR(16) NOT NULL COMMENT 'primary | junior | senior',
  publisher_code VARCHAR(32) NOT NULL DEFAULT '',
  edition_name VARCHAR(255) NOT NULL,
  volume_name VARCHAR(255) NULL,
  textbook_edition_hint_match VARCHAR(255) NULL COMMENT '与命题页教材版本文案对齐，可选',
  revision VARCHAR(32) NULL,
  catalog_version VARCHAR(32) NULL COMMENT '数据集版本，如 2025.1',
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(32) NOT NULL DEFAULT 'import',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_curriculum_series_lookup (subject_id, grade_band, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
  await conn.query(`
CREATE TABLE IF NOT EXISTS curriculum_catalog_node (
  id VARCHAR(128) NOT NULL,
  series_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(128) NULL,
  label VARCHAR(500) NOT NULL,
  node_kind VARCHAR(24) NOT NULL DEFAULT 'topic',
  sort_order INT NOT NULL DEFAULT 0,
  external_ref VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_curriculum_node_series (series_id, parent_id, sort_order),
  CONSTRAINT fk_curriculum_node_series FOREIGN KEY (series_id) REFERENCES curriculum_catalog_series (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

async function ensureExamMathRepairRulesTable(conn: Connection): Promise<void> {
  await conn.query(`
CREATE TABLE IF NOT EXISTS exam_math_repair_rules (
  id VARCHAR(128) NOT NULL,
  find MEDIUMTEXT NOT NULL,
  replacement MEDIUMTEXT NOT NULL,
  flags VARCHAR(32) NOT NULL DEFAULT 'g',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_exam_math_repair_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

async function ensureExamRemediationRulesTable(conn: Connection): Promise<void> {
  await conn.query(`
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
}

/** 建表后写入仓库默认配置与 data/*.json（已有非空行则不覆盖） */
async function seedBundledProjectConfigToMysql(conn: Connection): Promise<void> {
  const defaultAi = mergePartialAiSettings({});
  await conn.execute(
    `INSERT INTO ai_settings (workspace_key, settings, updated_at)
     VALUES ('default', CAST(? AS JSON), NOW(3))
     ON DUPLICATE KEY UPDATE
       settings = IF(JSON_LENGTH(settings) = 0, CAST(? AS JSON), settings),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [JSON.stringify(defaultAi), JSON.stringify(defaultAi)],
  );

  await conn.execute(`
    INSERT INTO generation_habits (workspace_key, habits, updated_at)
    VALUES ('default', CAST('{}' AS JSON), NOW(3))
    ON DUPLICATE KEY UPDATE
      habits = IF(JSON_LENGTH(habits) = 0, CAST('{}' AS JSON), habits),
      updated_at = CURRENT_TIMESTAMP(3)
  `);

  const wsDefaults = {
    gateway: { ...DEFAULT_GATEWAY_SETTINGS },
    webSearch: { ...DEFAULT_WEB_SEARCH_SETTINGS },
  };
  await conn.execute(
    `INSERT INTO workspace_settings (workspace_key, settings, updated_at)
     VALUES ('default', CAST(? AS JSON), NOW(3))
     ON DUPLICATE KEY UPDATE
       settings = IF(JSON_LENGTH(settings) = 0, CAST(? AS JSON), settings),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [JSON.stringify(wsDefaults), JSON.stringify(wsDefaults)],
  );

  const root = resolveProjectRoot();
  try {
    const raw = await readFile(path.join(root, "data", "ocr-repair-lexicon.json"), "utf8");
    const j = JSON.parse(raw) as {
      rules?: Array<{
        id?: string;
        match_kind?: string;
        pattern?: string;
        replacement?: string;
        priority?: number;
        enabled?: boolean;
        note?: string;
      }>;
    };
    for (const r of j.rules ?? []) {
      const pattern = String(r?.pattern ?? "").trim();
      if (!pattern) continue;
      const id = String(r.id ?? "").trim() || randomUUID();
      await conn.execute(
        `INSERT IGNORE INTO ocr_repair_lexicon
         (id, match_kind, pattern, replacement, priority, enabled, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          id,
          r.match_kind === "regex" ? "regex" : "literal",
          pattern,
          String(r.replacement ?? ""),
          Number(r.priority ?? 0),
          r.enabled === false ? 0 : 1,
          r.note != null ? String(r.note).slice(0, 500) : null,
        ],
      );
    }
  } catch {
    /* 无文件或解析失败则跳过 */
  }

  try {
    const raw = await readFile(path.join(root, "data", "exam-math-repair-overrides.json"), "utf8");
    const j = JSON.parse(raw) as {
      rules?: Array<{ id?: string; find?: string; replace?: string; flags?: string }>;
    };
    for (const r of j.rules ?? []) {
      const find = String(r?.find ?? "").trim();
      const id = String(r?.id ?? "").trim();
      if (!find || !id) continue;
      await conn.execute(
        `INSERT IGNORE INTO exam_math_repair_rules
         (id, find, replacement, flags, enabled, updated_at)
         VALUES (?, ?, ?, ?, 1, NOW(3))`,
        [id, find, String(r.replace ?? ""), String(r.flags ?? "g").slice(0, 32)],
      );
    }
  } catch {
    /* 无文件则跳过 */
  }
}

async function ensureOcrRepairLexiconTable(conn: Connection): Promise<void> {
  await conn.query(`
CREATE TABLE IF NOT EXISTS ocr_repair_lexicon (
  id CHAR(36) NOT NULL,
  match_kind VARCHAR(16) NOT NULL DEFAULT 'literal',
  pattern MEDIUMTEXT NOT NULL,
  replacement MEDIUMTEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ocr_lex_enabled_prio (enabled, priority DESC),
  CONSTRAINT ocr_lex_match_chk CHECK (match_kind IN ('literal', 'regex'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);
}

export async function applyZhixueMysqlSchema(c: MysqlConnectionForm): Promise<void> {
  const sql = await readBundledMysqlSchemaSql();
  const conn: Connection = await createConnection(createOpts(c));
  try {
    await conn.query(sql);
    await ensureMysqlExamParityColumns(conn);
    await ensureOcrRepairLexiconTable(conn);
    await ensureExamMathRepairRulesTable(conn);
    await ensureExamRemediationRulesTable(conn);
    await ensureWorkspaceSettingsTable(conn);
    await ensureRemoteImportJobsTable(conn);
    await ensureCurriculumCatalogTables(conn);
    await seedBundledProjectConfigToMysql(conn);
  } finally {
    await conn.end();
  }
}
