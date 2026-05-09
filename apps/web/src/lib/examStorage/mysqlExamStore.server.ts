/**
 * 本地 MySQL 试卷存储（与 sql/mysql/zhixue_schema.sql 对齐）。
 * 与 Supabase 并行：试卷落 MySQL 时仍可用 Supabase 做 Auth / 教育 OS。
 */
import { createPool } from "mysql2/promise";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Exam, Example, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { loadMysqlConnection, type MysqlConnectionForm } from "@/lib/mysqlConnection.server";
import { isSafeLocalExamId } from "@/lib/localExamStore.server";
import { toMysqlDatetime3 } from "@/lib/examStorage/mysqlDatetime.shared";

let poolCache: { key: string; pool: Pool } | null = null;

function poolKey(c: MysqlConnectionForm): string {
  return `${c.host}:${c.port}:${c.user}:${c.database}`;
}

export async function getMysqlPool(): Promise<Pool | null> {
  const c = await loadMysqlConnection();
  if (!c) return null;
  const k = poolKey(c);
  if (poolCache?.key !== k) {
    try {
      await poolCache?.pool.end();
    } catch {
      /* ignore */
    }
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

function examRowToExam(row: RowDataPacket, question_types?: string[]): Exam {
  const subjects = parseJson<string[]>(row.subjects, []);
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
  };
}

function questionRowToQuestion(row: RowDataPacket): Question {
  const options = parseJson<string[] | null>(row.options, null);
  const solution_steps = parseJson<Question["solution_steps"]>(row.solution_steps, []);
  const knowledge_tags = parseJson<string[]>(row.knowledge_tags, []);
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
export async function insertExamSnapshotToMysql(bundle: SessionExamSnapshot): Promise<{ examId: string }> {
  if (!isSafeLocalExamId(bundle.exam.id)) {
    throw new Error("MySQL 题库仅支持标准 UUID 试卷 id");
  }
  const pool = await getMysqlPool();
  if (!pool) throw new Error("未配置 MySQL 连接（请在设置页保存「本机与 MySQL」）");

  const status = bundle.exam.import_review_status;
  const importReview =
    status === "staging" || status === "confirmed" ? status : null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO exams (
        id, title, subtitle, subjects, difficulty, duration_min, total_score,
        source, is_featured, description, created_at, generation_duration_sec, deleted_at,
        import_review_status
      ) VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        bundle.exam.id,
        bundle.exam.title,
        bundle.exam.subtitle,
        JSON.stringify(bundle.exam.subjects ?? []),
        bundle.exam.difficulty,
        bundle.exam.duration_min,
        bundle.exam.total_score,
        bundle.exam.source,
        bundle.exam.is_featured ? 1 : 0,
        bundle.exam.description,
        toMysqlDatetime3(bundle.exam.created_at),
        bundle.exam.generation_duration_sec ?? null,
        importReview,
      ],
    );

    for (const q of bundle.questions) {
      const head = [
        q.id,
        bundle.exam.id,
        q.order_index,
        q.type,
        q.type_label ?? null,
        q.subject,
        q.content,
      ];
      const tail = [
        q.answer,
        stepsJson(q.solution_steps),
        JSON.stringify(q.knowledge_tags ?? []),
        q.points,
      ];
      if (q.options == null) {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, CAST(? AS JSON), CAST(? AS JSON), ?, NOW(3))`,
          [...head, ...tail],
        );
      } else {
        await conn.execute(
          `INSERT INTO questions (
          id, exam_id, order_index, type, type_label, subject, content, options, answer,
          solution_steps, knowledge_tags, points, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), ?, NOW(3))`,
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
  const [exRows] = await pool.query<RowDataPacket[]>(`SELECT * FROM examples WHERE exam_id = ?`, [id]);

  const exam = examRowToExam(examRows[0]!);
  const questions = qRows.map(questionRowToQuestion);
  const examples = exRows.map(exampleRowToExample);

  return { exam, questions, examples };
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

export async function appendExamplesToMysqlExam(examId: string, newExamples: Example[]): Promise<void> {
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
