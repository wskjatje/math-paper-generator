/**
 * 本机 MySQL 师生关系表读写（仅服务端）。
 * 连接来自已保存的 mysql-connection（无硬编码主机）。
 */
import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { withMysqlPool } from "@/lib/mysqlPool.server";
import { loadLocalProfile } from "@/lib/mysqlAccountStore.server";
import type { UserRole } from "@/lib/types";

async function withConn<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  return withMysqlPool(fn);
}

/** 与 zhixue_schema.sql 中 local_teacher_students 一致；已建库可自动补齐 */
export async function ensureLocalTeacherStudentsTable(db: Pool): Promise<void> {
  await db.query(`
CREATE TABLE IF NOT EXISTS local_teacher_students (
  id CHAR(36) NOT NULL,
  teacher_user_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  created_by CHAR(36) NULL DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_local_teacher_students_triple (teacher_user_id, student_user_id, subject_id),
  KEY idx_local_teacher_students_teacher (teacher_user_id),
  KEY idx_local_teacher_students_student (student_user_id),
  CONSTRAINT fk_local_ts_teacher FOREIGN KEY (teacher_user_id) REFERENCES local_accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_local_ts_student FOREIGN KEY (student_user_id) REFERENCES local_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
}

export type LocalTeacherLinkInput = {
  teacherUserId: string;
  studentUserId: string;
  subjectId: string;
  createdBy: string | null;
};

/** upsert：同一教师—学生—学科已存在则保留原行（更新 created_by 可选） */
export async function insertLocalTeacherLinks(rows: LocalTeacherLinkInput[]): Promise<void> {
  if (!rows.length) return;
  await withConn(async (db) => {
    await ensureLocalTeacherStudentsTable(db);
    for (const r of rows) {
      const id = randomUUID();
      await db.query(
        `INSERT INTO local_teacher_students
          (id, teacher_user_id, student_user_id, subject_id, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           created_by = COALESCE(VALUES(created_by), created_by)`,
        [id, r.teacherUserId, r.studentUserId, r.subjectId, r.createdBy],
      );
    }
  });
}

export async function deleteLocalTeacherLinks(opts: {
  teacherUserId: string;
  studentUserId: string;
  subjectId?: string;
}): Promise<void> {
  await withConn(async (db) => {
    await ensureLocalTeacherStudentsTable(db);
    if (opts.subjectId) {
      await db.query(
        `DELETE FROM local_teacher_students
         WHERE teacher_user_id = ? AND student_user_id = ? AND subject_id = ?`,
        [opts.teacherUserId, opts.studentUserId, opts.subjectId],
      );
      return;
    }
    await db.query(
      `DELETE FROM local_teacher_students
       WHERE teacher_user_id = ? AND student_user_id = ?`,
      [opts.teacherUserId, opts.studentUserId],
    );
  });
}

export type LocalTeacherStudentRow = {
  id: string;
  teacherUserId: string;
  studentUserId: string;
  subjectId: string;
  createdAt: string;
  student: {
    displayName: string | null;
    gradeId: string | null;
    status: string;
    email: string | null;
  } | null;
};

export async function listLocalTeacherLinks(opts: {
  teacherUserId?: string;
  studentUserId?: string;
  subjectId?: string;
  limit?: number;
}): Promise<LocalTeacherStudentRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 1000);
  return withConn(async (db) => {
    await ensureLocalTeacherStudentsTable(db);
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.teacherUserId) {
      where.push(`ts.teacher_user_id = ?`);
      params.push(opts.teacherUserId);
    }
    if (opts.studentUserId) {
      where.push(`ts.student_user_id = ?`);
      params.push(opts.studentUserId);
    }
    if (opts.subjectId) {
      where.push(`ts.subject_id = ?`);
      params.push(opts.subjectId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ts.id, ts.teacher_user_id, ts.student_user_id, ts.subject_id, ts.created_at,
              a.display_name AS student_display_name,
              a.grade_id AS student_grade_id,
              a.status AS student_status,
              a.email AS student_email
       FROM local_teacher_students ts
       LEFT JOIN local_accounts a ON a.id = ts.student_user_id
       ${whereSql}
       ORDER BY ts.created_at DESC
       LIMIT ?`,
      [...params, limit],
    );
    return rows.map((r) => {
      const hasStudent = r.student_email != null || r.student_display_name != null || r.student_status != null;
      return {
        id: String(r.id),
        teacherUserId: String(r.teacher_user_id),
        studentUserId: String(r.student_user_id),
        subjectId: String(r.subject_id),
        createdAt: r.created_at ? new Date(r.created_at as string | Date).toISOString() : "",
        student: hasStudent
          ? {
              displayName: (r.student_display_name as string | null) ?? null,
              gradeId: (r.student_grade_id as string | null) ?? null,
              status: r.student_status === "disabled" ? "disabled" : "active",
              email: (r.student_email as string | null) ?? null,
            }
          : null,
      };
    });
  });
}

export async function localTeacherOwnsStudent(
  teacherUserId: string,
  studentUserId: string,
): Promise<boolean> {
  return withConn(async (db) => {
    await ensureLocalTeacherStudentsTable(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM local_teacher_students
       WHERE teacher_user_id = ? AND student_user_id = ?
       LIMIT 1`,
      [teacherUserId, studentUserId],
    );
    return rows.length > 0;
  });
}

/** 按本机账号 id 取 roles；不存在返回 null */
export async function getLocalAccountRoles(accountId: string): Promise<UserRole[] | null> {
  const profile = await loadLocalProfile(accountId);
  if (!profile) return null;
  return profile.roles;
}
