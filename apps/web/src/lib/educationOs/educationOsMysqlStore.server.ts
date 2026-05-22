import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";

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

export async function ensureMysqlEduProfile(userId: string): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  await pool.execute(
    `INSERT INTO edu_profiles (id, role, display_name, metadata)
     VALUES (?, 'student', ?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE id = id`,
    [userId, `用户-${userId.slice(0, 8)}`, "{}"],
  );
}

export async function mysqlGetEducationOsProfile(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const pool = await getMysqlPool();
  if (!pool) return null;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, role, display_name, metadata, created_at, updated_at FROM edu_profiles WHERE id = ? LIMIT 1`,
    [userId],
  );
  if (!rows.length) return null;
  const r = rows[0]!;
  return {
    id: String(r.id),
    role: String(r.role),
    display_name: r.display_name != null ? String(r.display_name) : null,
    metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

export async function mysqlUpdateEducationOsProfile(
  userId: string,
  patch: { display_name?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.display_name !== undefined) {
    sets.push("display_name = ?");
    vals.push(patch.display_name);
  }
  if (patch.metadata !== undefined) {
    sets.push("metadata = CAST(? AS JSON)");
    vals.push(JSON.stringify(patch.metadata));
  }
  if (!sets.length) return;
  vals.push(userId);
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE edu_profiles SET ${sets.join(", ")} WHERE id = ?`,
    vals,
  );
  if (res.affectedRows === 0) throw new Error("档案不存在");
}

export async function mysqlSaveOsQuestionDocument(opts: {
  userId: string;
  schema_version: string;
  payload: unknown;
  source: string;
  visibility: string;
}): Promise<string> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const id = randomUUID();
  await pool.execute(
    `INSERT INTO os_question_documents (id, schema_version, payload, source, visibility, created_by, created_at)
     VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, NOW(3))`,
    [
      id,
      opts.schema_version,
      JSON.stringify(opts.payload),
      opts.source,
      opts.visibility,
      opts.userId,
    ],
  );
  return id;
}

export async function mysqlListOsQuestionDocuments(userId: string): Promise<
  Array<{
    id: string;
    schema_version: string;
    source: string;
    visibility: string;
    created_at: string;
    stem_preview: string;
    question_id: string | null;
  }>
> {
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, schema_version, source, visibility, created_at, payload
     FROM os_question_documents
     WHERE visibility = 'public' OR created_by = ?
     ORDER BY created_at DESC
     LIMIT 80`,
    [userId],
  );

  return rows.map((row) => {
    const payload = parseJson<{ stem?: string; id?: string }>(row.payload, {});
    const stem = typeof payload.stem === "string" ? payload.stem : "";
    return {
      id: String(row.id),
      schema_version: String(row.schema_version),
      source: String(row.source),
      visibility: String(row.visibility),
      created_at: toIso(row.created_at),
      stem_preview: stem.length > 120 ? `${stem.slice(0, 120)}…` : stem,
      question_id: typeof payload.id === "string" ? payload.id : null,
    };
  });
}

export async function mysqlRecordLearningEvent(
  userId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const id = randomUUID();
  await pool.execute(
    `INSERT INTO learning_events (id, user_id, kind, payload, created_at)
     VALUES (?, ?, ?, CAST(? AS JSON), NOW(3))`,
    [id, userId, kind, JSON.stringify(payload)],
  );
}

export async function mysqlListWrongBookEntries(userId: string): Promise<
  Array<{
    id: string;
    created_at: string;
    mistake_kind: string | null;
    knowledge_points: string[];
    question_document_id: string | null;
    exam_id: string | null;
    snapshot: unknown;
  }>
> {
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, created_at, mistake_kind, knowledge_points, question_document_id, exam_id, snapshot
     FROM wrong_book_entries
     WHERE student_id = ?
     ORDER BY created_at DESC
     LIMIT 80`,
    [userId],
  );

  return rows.map((row) => ({
    id: String(row.id),
    created_at: toIso(row.created_at),
    mistake_kind: row.mistake_kind != null ? String(row.mistake_kind) : null,
    knowledge_points: parseJson<string[]>(row.knowledge_points, []).filter(
      (x): x is string => typeof x === "string",
    ),
    question_document_id:
      row.question_document_id != null ? String(row.question_document_id) : null,
    exam_id: row.exam_id != null ? String(row.exam_id) : null,
    snapshot: row.snapshot != null ? parseJson(row.snapshot, row.snapshot) : null,
  }));
}

export async function mysqlListTutorSessions(userId: string): Promise<
  Array<{
    id: string;
    title: string | null;
    exam_id: string | null;
    created_at: string;
    updated_at: string;
  }>
> {
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, title, exam_id, created_at, updated_at
     FROM tutor_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT 40`,
    [userId],
  );

  return rows.map((r) => ({
    id: String(r.id),
    title: r.title != null ? String(r.title) : null,
    exam_id: r.exam_id != null ? String(r.exam_id) : null,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }));
}

export async function mysqlCreateTutorSession(
  userId: string,
  opts: { title?: string | null; exam_id?: string | null },
): Promise<string> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const id = randomUUID();
  await pool.execute(
    `INSERT INTO tutor_sessions (id, user_id, title, exam_id, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), NOW(3), NOW(3))`,
    [id, userId, opts.title ?? null, opts.exam_id ?? null, "[]"],
  );
  return id;
}

export async function mysqlListEducationAgents(
  userId: string,
): Promise<Array<{ id: string; agent_kind: string; label: string | null; created_at: string }>> {
  const pool = await getMysqlPool();
  if (!pool) return [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, agent_kind, label, created_at
     FROM education_agents
     WHERE owner_user_id = ?
     ORDER BY created_at DESC
     LIMIT 40`,
    [userId],
  );

  return rows.map((r) => ({
    id: String(r.id),
    agent_kind: String(r.agent_kind),
    label: r.label != null ? String(r.label) : null,
    created_at: toIso(r.created_at),
  }));
}

export async function mysqlCreateEducationAgent(
  userId: string,
  opts: { agent_kind: string; label?: string | null },
): Promise<string> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const id = randomUUID();
  await pool.execute(
    `INSERT INTO education_agents (id, owner_user_id, agent_kind, label, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), NOW(3), NOW(3))`,
    [id, userId, opts.agent_kind, opts.label ?? null, "{}"],
  );
  return id;
}

export async function mysqlAddWrongBookEntry(opts: {
  studentId: string;
  question_document_id?: string | null;
  exam_id?: string | null;
  mistake_kind?: string | null;
  knowledge_points: string[];
  snapshot?: Record<string, unknown> | null;
}): Promise<string> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("MySQL 未配置");

  const id = randomUUID();
  await pool.execute(
    `INSERT INTO wrong_book_entries (
       id, student_id, question_document_id, exam_id, mistake_kind, knowledge_points, snapshot, created_at
     ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, NOW(3))`,
    [
      id,
      opts.studentId,
      opts.question_document_id ?? null,
      opts.exam_id ?? null,
      opts.mistake_kind ?? null,
      JSON.stringify(opts.knowledge_points),
      opts.snapshot != null ? JSON.stringify(opts.snapshot) : null,
    ],
  );
  return id;
}
