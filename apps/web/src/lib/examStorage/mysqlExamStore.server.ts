/**
 * 本地 MySQL 试卷存储（与 sql/mysql/zhixue_schema.sql 对齐）。
 * 与 Supabase 并行：试卷落 MySQL 时仍可用 Supabase 做 Auth / 教育 OS。
 */
import { createPool } from "mysql2/promise";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Exam, Example, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { parseQuestionRasterFiguresV1 } from "@/lib/importRasterFigures.shared";
import { parseQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import { loadMysqlConnection, type MysqlConnectionForm } from "@/lib/mysqlConnection.server";
import { isSafeLocalExamId } from "@/lib/localExamStore.server";
import { toMysqlDatetime3 } from "@/lib/examStorage/mysqlDatetime.shared";
import { parseVisualGeometryEvidenceV1 } from "@/lib/visualGeometryEvidence.shared";
import { parseFigureRefsV1, parseFigureRegistryV1 } from "@/lib/figureOwnership.shared";

/** mysql2 禁止绑定 `undefined`；可空列须显式传 JS `null` 才是 SQL NULL。 */
function sqlNullable<T>(v: T | undefined | null): T | null {
  return v === undefined ? null : v;
}

let poolCache: { key: string; pool: Pool } | null = null;

/** 与 poolCache.key 对齐：已有库未跑迁移时首轮 INSERT 前自动 ADD COLUMN */
let ensuredExamsOfflineImportMediaColumnForPool: string | null = null;
let ensuredExamsImportParseQualityColumnForPool: string | null = null;
let ensuredQuestionsDiagramSchemaColumnForPool: string | null = null;
let ensuredQuestionsRasterFiguresColumnForPool: string | null = null;
let ensuredQuestionsFigureDependencyColumnForPool: string | null = null;
let ensuredQuestionsVisualGeometryEvidenceColumnForPool: string | null = null;
let ensuredExamsFigureRegistryColumnForPool: string | null = null;
let ensuredQuestionsFigureRefsColumnForPool: string | null = null;

/** 修改 mysql-connection 或 Supabase 内 mysql 凭证后调用，避免连接池沿用旧密码 */
export function invalidateMysqlPoolCache(): void {
  ensuredExamsOfflineImportMediaColumnForPool = null;
  ensuredExamsImportParseQualityColumnForPool = null;
  ensuredQuestionsDiagramSchemaColumnForPool = null;
  ensuredQuestionsRasterFiguresColumnForPool = null;
  ensuredQuestionsFigureDependencyColumnForPool = null;
  ensuredQuestionsVisualGeometryEvidenceColumnForPool = null;
  ensuredExamsFigureRegistryColumnForPool = null;
  ensuredQuestionsFigureRefsColumnForPool = null;
  try {
    void poolCache?.pool.end();
  } catch {
    /* ignore */
  }
  poolCache = null;
}

async function ensureExamsOfflineImportMediaColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredExamsOfflineImportMediaColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'offline_import_media'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredExamsOfflineImportMediaColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE exams ADD COLUMN offline_import_media JSON NULL DEFAULT NULL
       COMMENT '线下导入原图URL与对照标注' AFTER import_review_status`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredExamsOfflineImportMediaColumnForPool = k;
}

async function ensureExamsImportParseQualityColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredExamsImportParseQualityColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'import_parse_quality'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredExamsImportParseQualityColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE exams ADD COLUMN import_parse_quality JSON NULL DEFAULT NULL
       COMMENT '导入解析质检v1 JSON' AFTER offline_import_media`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredExamsImportParseQualityColumnForPool = k;
}

async function ensureQuestionsDiagramSchemaColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredQuestionsDiagramSchemaColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'diagram_schema'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredQuestionsDiagramSchemaColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE questions ADD COLUMN diagram_schema JSON NULL DEFAULT NULL
       COMMENT '平面几何矢量示意图 v1 JSON' AFTER points`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredQuestionsDiagramSchemaColumnForPool = k;
}

async function ensureQuestionsRasterFiguresColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredQuestionsRasterFiguresColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'raster_figures'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredQuestionsRasterFiguresColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE questions ADD COLUMN raster_figures JSON NULL DEFAULT NULL
       COMMENT '卷面裁剪位图 URL v1' AFTER diagram_schema`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredQuestionsRasterFiguresColumnForPool = k;
}

async function ensureQuestionsFigureDependencyColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredQuestionsFigureDependencyColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'figure_dependency'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredQuestionsFigureDependencyColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE questions ADD COLUMN figure_dependency JSON NULL DEFAULT NULL
       COMMENT '卷面位图依赖 v1' AFTER raster_figures`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredQuestionsFigureDependencyColumnForPool = k;
}

async function ensureQuestionsVisualGeometryEvidenceColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredQuestionsVisualGeometryEvidenceColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'visual_geometry_evidence'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredQuestionsVisualGeometryEvidenceColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE questions ADD COLUMN visual_geometry_evidence JSON NULL DEFAULT NULL
       COMMENT '视觉几何证据 v1（OCR/diagram_links 等标记）' AFTER figure_dependency`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredQuestionsVisualGeometryEvidenceColumnForPool = k;
}

async function ensureExamsFigureRegistryColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredExamsFigureRegistryColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'figure_registry'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredExamsFigureRegistryColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE exams ADD COLUMN figure_registry JSON NULL DEFAULT NULL
       COMMENT 'P7-1A 卷面图 registry' AFTER import_parse_quality`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredExamsFigureRegistryColumnForPool = k;
}

async function ensureQuestionsFigureRefsColumn(pool: Pool): Promise<void> {
  const k = poolCache?.key ?? "";
  if (k && ensuredQuestionsFigureRefsColumnForPool === k) return;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'figure_refs'`,
  );
  const c = Number((rows[0] as { c?: number })?.c ?? 0);
  if (c > 0) {
    if (k) ensuredQuestionsFigureRefsColumnForPool = k;
    return;
  }

  try {
    await pool.query(
      `ALTER TABLE questions ADD COLUMN figure_refs JSON NULL DEFAULT NULL
       COMMENT 'P7-1A 题目图引用' AFTER visual_geometry_evidence`,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
  }
  if (k) ensuredQuestionsFigureRefsColumnForPool = k;
}

function poolKey(c: MysqlConnectionForm): string {
  return `${c.host}:${c.port}:${c.user}:${c.database}:${c.password ? String(c.password.length) : "0"}`;
}

export async function getMysqlPool(): Promise<Pool | null> {
  const c = await loadMysqlConnection();
  if (!c) return null;
  const k = poolKey(c);
  if (poolCache?.key !== k) {
    invalidateMysqlPoolCache();
    poolCache = {
      key: k,
      pool: createPool({
        host: c.host,
        port: c.port,
        user: c.user,
        password: c.password,
        database: c.database,
        waitForConnections: true,
        connectionLimit: 8,
      }),
    };
  }
  return poolCache.pool;
}

export async function isMysqlExamPersistenceAvailable(): Promise<boolean> {
  try {
    const pool = await getMysqlPool();
    if (!pool) return false;
    await pool.query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return String(v ?? "");
}

function parseImportParseQualityFromExamRow(row: RowDataPacket): Record<string, unknown> | null {
  const raw = row.import_parse_quality;
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function examRowToExam(row: RowDataPacket, question_types?: string[]): Exam {
  const subjects = parseJson<string[]>(row.subjects, []);
  let figure_registry: Exam["figure_registry"] | undefined;
  if (row.figure_registry != null) {
    const rawFr =
      typeof row.figure_registry === "string"
        ? (JSON.parse(row.figure_registry) as unknown)
        : row.figure_registry;
    figure_registry = parseFigureRegistryV1(rawFr);
  }
  return {
    id: String(row.id),
    title: String(row.title),
    subtitle: row.subtitle != null ? String(row.subtitle) : null,
    subjects,
    difficulty: row.difficulty as Exam["difficulty"],
    duration_min: Number(row.duration_min) || 120,
    total_score: Number(row.total_score) || 100,
    source: row.source as Exam["source"],
    is_featured: Boolean(row.is_featured),
    description: row.description != null ? String(row.description) : null,
    created_at: toIso(row.created_at),
    generation_duration_sec:
      row.generation_duration_sec != null ? Number(row.generation_duration_sec) : null,
    question_types,
    storage_source: "mysql",
    deleted_at: row.deleted_at != null ? toIso(row.deleted_at) : null,
    import_review_status:
      row.import_review_status === "staging" || row.import_review_status === "confirmed"
        ? row.import_review_status
        : null,
    import_parse_quality: parseImportParseQualityFromExamRow(row),
    ...(figure_registry != null && figure_registry.length > 0 ? { figure_registry } : {}),
  };
}

function questionRowToQuestion(row: RowDataPacket): Question {
  const options = parseJson<string[] | null>(row.options, null);
  const solution_steps = parseJson<Question["solution_steps"]>(row.solution_steps, []);
  const knowledge_tags = parseJson<string[]>(row.knowledge_tags, []);
  let diagram_schema: Question["diagram_schema"] | undefined;
  if (row.diagram_schema != null) {
    const raw =
      typeof row.diagram_schema === "string"
        ? (JSON.parse(row.diagram_schema) as unknown)
        : row.diagram_schema;
    const parsed = safeParseGeometryDiagramSchema(raw);
    if (parsed) diagram_schema = parsed;
  }
  let raster_figures: Question["raster_figures"] | undefined;
  if (row.raster_figures != null) {
    const rawRf =
      typeof row.raster_figures === "string"
        ? (JSON.parse(row.raster_figures) as unknown)
        : row.raster_figures;
    const pr = parseQuestionRasterFiguresV1(rawRf);
    if (pr) raster_figures = pr;
  }
  let figure_dependency: Question["figure_dependency"] | undefined;
  if (row.figure_dependency != null) {
    const rawFd =
      typeof row.figure_dependency === "string"
        ? (JSON.parse(row.figure_dependency) as unknown)
        : row.figure_dependency;
    const pfd = parseQuestionFigureDependencyV1(rawFd);
    if (pfd) figure_dependency = pfd;
  }
  let visual_geometry_evidence: Question["visual_geometry_evidence"] | undefined;
  const rawVge = row.visual_geometry_evidence;
  let vgeObj: unknown = rawVge;
  if (typeof rawVge === "string") {
    try {
      vgeObj = JSON.parse(rawVge);
    } catch {
      vgeObj = null;
    }
  }
  const vgeParsed = parseVisualGeometryEvidenceV1(vgeObj);
  if (vgeParsed) visual_geometry_evidence = vgeParsed;

  let figure_refs: Question["figure_refs"] | undefined;
  if (row.figure_refs != null) {
    const rawFr =
      typeof row.figure_refs === "string"
        ? (JSON.parse(row.figure_refs) as unknown)
        : row.figure_refs;
    figure_refs = parseFigureRefsV1(rawFr);
  }

  return {
    id: String(row.id),
    exam_id: String(row.exam_id),
    order_index: Number(row.order_index) || 0,
    type: row.type as Question["type"],
    type_label: row.type_label != null ? String(row.type_label) : null,
    subject: String(row.subject),
    content: String(row.content),
    options,
    answer: String(row.answer),
    solution_steps,
    knowledge_tags,
    points: Number(row.points) || 10,
    ...(diagram_schema ? { diagram_schema } : {}),
    ...(raster_figures !== undefined ? { raster_figures } : {}),
    ...(visual_geometry_evidence != null ? { visual_geometry_evidence } : {}),
    ...(figure_dependency != null ? { figure_dependency } : {}),
    ...(figure_refs != null && figure_refs.length > 0 ? { figure_refs } : {}),
  };
}

function exampleRowToExample(row: RowDataPacket): Example {
  const solution_steps = parseJson<Example["solution_steps"]>(row.solution_steps, []);
  return {
    id: String(row.id),
    exam_id: String(row.exam_id),
    question_id: row.question_id != null ? String(row.question_id) : null,
    type: String(row.type),
    subject: String(row.subject),
    content: String(row.content),
    answer: String(row.answer),
    solution_steps,
    difficulty: String(row.difficulty ?? "intermediate"),
  };
}

function stepsJson(steps: unknown): string {
  try {
    return JSON.stringify(steps ?? []);
  } catch {
    return "[]";
  }
}

/** 写入完整快照（导入 / 本地命题）；返回库里试卷 id（与快照 id 一致）。 */
export async function insertExamSnapshotToMysql(
  bundle: SessionExamSnapshot,
): Promise<{ examId: string }> {
  if (!isSafeLocalExamId(bundle.exam.id)) {
    throw new Error("MySQL 题库仅支持标准 UUID 试卷 id");
  }
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置 MySQL 连接（请在设置页保存「本机与 MySQL」）");

  await ensureExamsOfflineImportMediaColumn(pool);
  await ensureExamsImportParseQualityColumn(pool);
  await ensureQuestionsDiagramSchemaColumn(pool);
  await ensureQuestionsRasterFiguresColumn(pool);
  await ensureQuestionsFigureDependencyColumn(pool);
  await ensureQuestionsVisualGeometryEvidenceColumn(pool);
  await ensureExamsFigureRegistryColumn(pool);
  await ensureQuestionsFigureRefsColumn(pool);

  const status = bundle.exam.import_review_status;
  const importReview = status === "staging" || status === "confirmed" ? status : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const offlineMediaJson =
      bundle.offline_import_media != null ? JSON.stringify(bundle.offline_import_media) : null;
    const importParseQualityJson =
      bundle.exam.import_parse_quality != null
        ? JSON.stringify(bundle.exam.import_parse_quality)
        : null;
    const figureRegistryJson =
      bundle.exam.figure_registry != null && bundle.exam.figure_registry.length > 0
        ? JSON.stringify(bundle.exam.figure_registry)
        : null;

    await conn.execute(
      `INSERT INTO exams (
        id, title, subtitle, subjects, difficulty, duration_min, total_score,
        source, is_featured, description, created_at, generation_duration_sec, deleted_at,
        import_review_status, offline_import_media, import_parse_quality, figure_registry
      ) VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`,
      [
        bundle.exam.id,
        String(bundle.exam.title ?? ""),
        sqlNullable(bundle.exam.subtitle),
        JSON.stringify(bundle.exam.subjects ?? []),
        String(bundle.exam.difficulty ?? "intermediate"),
        Number(bundle.exam.duration_min ?? 120) || 120,
        Number(bundle.exam.total_score ?? 100) || 100,
        String(bundle.exam.source ?? "imported"),
        bundle.exam.is_featured ? 1 : 0,
        sqlNullable(bundle.exam.description),
        toMysqlDatetime3(bundle.exam.created_at ?? new Date().toISOString()),
        sqlNullable(bundle.exam.generation_duration_sec),
        importReview,
        offlineMediaJson,
        importParseQualityJson,
        figureRegistryJson,
      ],
    );

    for (const q of bundle.questions) {
      const head = [
        q.id,
        bundle.exam.id,
        Number(q.order_index ?? 0) || 0,
        String(q.type ?? "short_answer"),
        sqlNullable(q.type_label),
        String(q.subject ?? ""),
        String(q.content ?? ""),
      ];
      const diagramJson = q.diagram_schema != null ? JSON.stringify(q.diagram_schema) : null;
      const rasterJson = q.raster_figures != null ? JSON.stringify(q.raster_figures) : null;
      const figureDepJson =
        q.figure_dependency != null ? JSON.stringify(q.figure_dependency) : null;
      const visualGeoJson =
        q.visual_geometry_evidence != null ? JSON.stringify(q.visual_geometry_evidence) : null;
      const figureRefsJson =
        q.figure_refs != null && q.figure_refs.length > 0 ? JSON.stringify(q.figure_refs) : null;
      const tail = [
        String(q.answer ?? ""),
        stepsJson(q.solution_steps),
        JSON.stringify(q.knowledge_tags ?? []),
        Number(q.points ?? 10) || 10,
        diagramJson,
        rasterJson,
        figureDepJson,
        visualGeoJson,
        figureRefsJson,
      ];
      if (q.options == null) {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, diagram_schema, raster_figures, figure_dependency, visual_geometry_evidence, figure_refs, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), NOW(3))`,
          [...head, ...tail],
        );
      } else {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, diagram_schema, raster_figures, figure_dependency, visual_geometry_evidence, figure_refs, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), NOW(3))`,
          [...head, JSON.stringify(q.options), ...tail],
        );
      }
    }

    for (const ex of bundle.examples) {
      await conn.execute(
        `INSERT INTO examples (
          id, exam_id, question_id, type, subject, content, answer, solution_steps, difficulty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(3))`,
        [
          ex.id,
          bundle.exam.id,
          sqlNullable(ex.question_id),
          String(ex.type ?? "short_answer"),
          String(ex.subject ?? ""),
          String(ex.content ?? ""),
          String(ex.answer ?? ""),
          stepsJson(ex.solution_steps),
          String(ex.difficulty ?? "intermediate"),
        ],
      );
    }

    await conn.commit();
    return { examId: bundle.exam.id };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 覆盖写入已存在的 MySQL 试卷快照（替换全部题目/例题行，更新 exams 元数据）。 */
export async function replaceExamSnapshotInMysql(
  bundle: SessionExamSnapshot,
): Promise<{ examId: string }> {
  if (!isSafeLocalExamId(bundle.exam.id)) {
    throw new Error("MySQL 题库仅支持标准 UUID 试卷 id");
  }
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置 MySQL 连接（请在设置页保存「本机与 MySQL」）");

  await ensureExamsOfflineImportMediaColumn(pool);
  await ensureExamsImportParseQualityColumn(pool);
  await ensureQuestionsDiagramSchemaColumn(pool);
  await ensureQuestionsRasterFiguresColumn(pool);
  await ensureQuestionsFigureDependencyColumn(pool);
  await ensureQuestionsVisualGeometryEvidenceColumn(pool);
  await ensureExamsFigureRegistryColumn(pool);
  await ensureQuestionsFigureRefsColumn(pool);

  const status = bundle.exam.import_review_status;
  const importReview = status === "staging" || status === "confirmed" ? status : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [examRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM exams WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [bundle.exam.id],
    );
    if (!examRows.length) {
      throw new Error(`MySQL 中未找到试卷 ${bundle.exam.id}`);
    }

    await conn.execute(`DELETE FROM examples WHERE exam_id = ?`, [bundle.exam.id]);
    await conn.execute(`DELETE FROM questions WHERE exam_id = ?`, [bundle.exam.id]);

    const offlineMediaJson =
      bundle.offline_import_media != null ? JSON.stringify(bundle.offline_import_media) : null;
    const importParseQualityJson =
      bundle.exam.import_parse_quality != null
        ? JSON.stringify(bundle.exam.import_parse_quality)
        : null;
    const figureRegistryJson =
      bundle.exam.figure_registry != null && bundle.exam.figure_registry.length > 0
        ? JSON.stringify(bundle.exam.figure_registry)
        : null;

    await conn.execute(
      `UPDATE exams SET
        title = ?, subtitle = ?, subjects = CAST(? AS JSON), difficulty = ?, duration_min = ?,
        total_score = ?, source = ?, is_featured = ?, description = ?,
        import_review_status = ?, offline_import_media = CAST(? AS JSON),
        import_parse_quality = CAST(? AS JSON), figure_registry = CAST(? AS JSON)
      WHERE id = ?`,
      [
        String(bundle.exam.title ?? ""),
        sqlNullable(bundle.exam.subtitle),
        JSON.stringify(bundle.exam.subjects ?? []),
        String(bundle.exam.difficulty ?? "intermediate"),
        Number(bundle.exam.duration_min ?? 120) || 120,
        Number(bundle.exam.total_score ?? 100) || 100,
        String(bundle.exam.source ?? "imported"),
        bundle.exam.is_featured ? 1 : 0,
        sqlNullable(bundle.exam.description),
        importReview,
        offlineMediaJson,
        importParseQualityJson,
        figureRegistryJson,
        bundle.exam.id,
      ],
    );

    for (const q of bundle.questions) {
      const head = [
        q.id,
        bundle.exam.id,
        Number(q.order_index ?? 0) || 0,
        String(q.type ?? "short_answer"),
        sqlNullable(q.type_label),
        String(q.subject ?? ""),
        String(q.content ?? ""),
      ];
      const diagramJson = q.diagram_schema != null ? JSON.stringify(q.diagram_schema) : null;
      const rasterJson = q.raster_figures != null ? JSON.stringify(q.raster_figures) : null;
      const figureDepJson =
        q.figure_dependency != null ? JSON.stringify(q.figure_dependency) : null;
      const visualGeoJson =
        q.visual_geometry_evidence != null ? JSON.stringify(q.visual_geometry_evidence) : null;
      const figureRefsJson =
        q.figure_refs != null && q.figure_refs.length > 0 ? JSON.stringify(q.figure_refs) : null;
      const tail = [
        String(q.answer ?? ""),
        stepsJson(q.solution_steps),
        JSON.stringify(q.knowledge_tags ?? []),
        Number(q.points ?? 10) || 10,
        diagramJson,
        rasterJson,
        figureDepJson,
        visualGeoJson,
        figureRefsJson,
      ];
      if (q.options == null) {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, diagram_schema, raster_figures, figure_dependency, visual_geometry_evidence, figure_refs, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), NOW(3))`,
          [...head, ...tail],
        );
      } else {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, diagram_schema, raster_figures, figure_dependency, visual_geometry_evidence, figure_refs, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), NOW(3))`,
          [...head, JSON.stringify(q.options), ...tail],
        );
      }
    }

    for (const ex of bundle.examples) {
      await conn.execute(
        `INSERT INTO examples (
          id, exam_id, question_id, type, subject, content, answer, solution_steps, difficulty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(3))`,
        [
          ex.id,
          bundle.exam.id,
          sqlNullable(ex.question_id),
          String(ex.type ?? "short_answer"),
          String(ex.subject ?? ""),
          String(ex.content ?? ""),
          String(ex.answer ?? ""),
          stepsJson(ex.solution_steps),
          String(ex.difficulty ?? "intermediate"),
        ],
      );
    }

    await conn.commit();
    return { examId: bundle.exam.id };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function loadMysqlExamSnapshot(id: string): Promise<SessionExamSnapshot | null> {
  if (!isSafeLocalExamId(id)) return null;
  const pool = await getMysqlPool();
  if (!pool) return null;

  const [examRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM exams WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id],
  );
  if (!examRows.length) return null;

  const [qRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC`,
    [id],
  );
  const [exRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM examples WHERE exam_id = ?`, [
    id,
  ]);

  const er = examRows[0]!;
  const exam = examRowToExam(er);
  const questions = qRows.map(questionRowToQuestion);
  const examples = exRows.map(exampleRowToExample);
  const offline_import_media = parseOfflineImportPersistedMedia(er.offline_import_media);

  return {
    exam,
    questions,
    examples,
    ...(offline_import_media ? { offline_import_media } : {}),
  };
}

export async function listMysqlExamRows(options?: {
  /**
   * `true` 时保留 `import_review_status=staging`（导入页「待确认」列表）。
   * 默认 `false`：与试卷库一致，不列出尚未确认的临时导入。
   */
  includeStaging?: boolean;
}): Promise<Exam[]> {
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [examRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM exams WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
  );
  if (!examRows.length) return [];

  const ids = examRows.map((r) => String(r.id));
  const placeholders = ids.map(() => "?").join(",");
  const [qRows] = await pool.query<RowDataPacket[]>(
    `SELECT exam_id, type, order_index FROM questions WHERE exam_id IN (${placeholders})`,
    ids,
  );

  const grouped = new Map<string, Array<{ type: string; order_index: number }>>();
  for (const row of qRows) {
    const eid = String(row.exam_id);
    if (!grouped.has(eid)) grouped.set(eid, []);
    grouped.get(eid)!.push({
      type: String(row.type),
      order_index: Number(row.order_index) || 0,
    });
  }

  const aggregateTypes = (rows: Array<{ type: string; order_index: number }>): string[] => {
    const seen = new Set<string>();
    const order: string[] = [];
    const sorted = [...rows].sort((a, b) => a.order_index - b.order_index);
    for (const row of sorted) {
      if (seen.has(row.type)) continue;
      seen.add(row.type);
      order.push(row.type);
    }
    return order;
  };

  const includeStaging = options?.includeStaging === true;

  return examRows
    .filter((r) => {
      if (includeStaging) return true;
      const st = r.import_review_status as string | null | undefined;
      return st !== "staging";
    })
    .map((r) => examRowToExam(r, aggregateTypes(grouped.get(String(r.id)) ?? [])));
}

export async function softDeleteMysqlExam(id: string): Promise<boolean> {
  const pool = await getMysqlPool();
  if (!pool) return false;
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE exams SET deleted_at = NOW(3) WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return res.affectedRows > 0;
}

export async function appendExamplesToMysqlExam(
  examId: string,
  newExamples: Example[],
): Promise<void> {
  if (!newExamples.length) return;
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置 MySQL");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const ex of newExamples) {
      await conn.execute(
        `INSERT INTO examples (
          id, exam_id, question_id, type, subject, content, answer, solution_steps, difficulty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(3))`,
        [
          ex.id,
          examId,
          ex.question_id,
          ex.type,
          ex.subject,
          ex.content,
          ex.answer,
          stepsJson(ex.solution_steps),
          ex.difficulty,
        ],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 命题成功后更新试卷元数据（耗时等）。 */
/**
 * 线下导入「待确认」→ 试卷库可见（与 Supabase `import_review_status` 语义一致）。
 * @returns 是否更新到行（exam 不存在或非 staging 时为 false）
 */
export async function confirmMysqlStagingImportedExam(examId: string): Promise<boolean> {
  if (!isSafeLocalExamId(examId)) return false;
  const pool = await getMysqlPool();
  if (!pool) return false;
  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE exams SET import_review_status = 'confirmed'
       WHERE id = ? AND source = 'imported'
         AND IFNULL(import_review_status, '') = 'staging'`,
      [examId],
    );
    return res.affectedRows > 0;
  } catch {
    return false;
  }
}

/** 批量更新题目几何示意图字段（修复管线重跑等）；幂等按题写入 */
export async function updateMysqlExamQuestionsDiagramSchemas(
  examId: string,
  questions: Question[],
): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置 MySQL");
  await ensureQuestionsDiagramSchemaColumn(pool);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const q of questions) {
      if (q.diagram_schema != null) {
        await conn.execute(
          `UPDATE questions SET diagram_schema = CAST(? AS JSON) WHERE exam_id = ? AND id = ?`,
          [JSON.stringify(q.diagram_schema), examId, q.id],
        );
      } else {
        await conn.execute(
          `UPDATE questions SET diagram_schema = NULL WHERE exam_id = ? AND id = ?`,
          [examId, q.id],
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateMysqlExamGenerationMeta(
  examId: string,
  patch: { created_at?: string; generation_duration_sec?: number },
): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) return;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.created_at !== undefined) {
    sets.push("created_at = ?");
    vals.push(toMysqlDatetime3(patch.created_at));
  }
  if (patch.generation_duration_sec !== undefined) {
    sets.push("generation_duration_sec = ?");
    vals.push(patch.generation_duration_sec);
  }
  if (!sets.length) return;
  vals.push(examId);
  await pool.execute(`UPDATE exams SET ${sets.join(", ")} WHERE id = ?`, vals);
}
