/**
 * 本机 MySQL 班级表读写（仅服务端）。连接来自已保存的 mysql-connection。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { withMysqlPool } from "@/lib/mysqlPool.server";
import type { ClassroomClass, ClassroomClassMember } from "@/lib/classroomClass.shared";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

async function withConn<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  return withMysqlPool(fn);
}

export async function ensureLocalClassTables(db: Pool): Promise<void> {
  await db.query(`
CREATE TABLE IF NOT EXISTS local_classes (
  id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  grade_id VARCHAR(40) NOT NULL,
  owner_teacher_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_local_classes_owner (owner_teacher_id),
  KEY idx_local_classes_grade (grade_id),
  CONSTRAINT fk_local_classes_owner FOREIGN KEY (owner_teacher_id) REFERENCES local_accounts (id) ON DELETE CASCADE,
  CONSTRAINT local_classes_status_chk CHECK (status IN ('active', 'archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
  await db.query(`
CREATE TABLE IF NOT EXISTS local_class_members (
  id CHAR(36) NOT NULL,
  class_id CHAR(36) NOT NULL,
  student_user_id CHAR(36) NOT NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_local_class_student (class_id, student_user_id),
  KEY idx_local_class_members_student (student_user_id),
  CONSTRAINT fk_local_cm_class FOREIGN KEY (class_id) REFERENCES local_classes (id) ON DELETE CASCADE,
  CONSTRAINT fk_local_cm_student FOREIGN KEY (student_user_id) REFERENCES local_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
}

function rowToClass(r: RowDataPacket): ClassroomClass {
  return {
    id: String(r.id),
    name: String(r.name),
    grade_id: String(r.grade_id),
    owner_teacher_id: String(r.owner_teacher_id),
    status: r.status === "archived" ? "archived" : "active",
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at ?? new Date().toISOString()),
    updated_at:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : r.updated_at
          ? String(r.updated_at)
          : undefined,
  };
}

function rowToMember(r: RowDataPacket): ClassroomClassMember {
  return {
    id: String(r.id),
    class_id: String(r.class_id),
    student_user_id: String(r.student_user_id),
    joined_at:
      r.joined_at instanceof Date
        ? r.joined_at.toISOString()
        : String(r.joined_at ?? new Date().toISOString()),
  };
}

export async function mysqlListClassesForTeacher(teacherUserId: string): Promise<ClassroomClass[]> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, grade_id, owner_teacher_id, status, created_at, updated_at
       FROM local_classes
       WHERE owner_teacher_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
      [teacherUserId],
    );
    return rows.map(rowToClass);
  });
}

export async function mysqlGetClass(classId: string): Promise<ClassroomClass | null> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, grade_id, owner_teacher_id, status, created_at, updated_at
       FROM local_classes WHERE id = ? LIMIT 1`,
      [classId],
    );
    const row = rows[0];
    return row ? rowToClass(row) : null;
  });
}

export async function mysqlCreateClass(input: {
  name: string;
  gradeId: string;
  ownerTeacherId: string;
}): Promise<ClassroomClass> {
  const id = newId();
  const now = new Date().toISOString();
  await withConn(async (db) => {
    await ensureLocalClassTables(db);
    await db.query(
      `INSERT INTO local_classes (id, name, grade_id, owner_teacher_id, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [id, input.name, input.gradeId, input.ownerTeacherId],
    );
  });
  return {
    id,
    name: input.name,
    grade_id: input.gradeId,
    owner_teacher_id: input.ownerTeacherId,
    status: "active",
    created_at: now,
    updated_at: now,
  };
}

export async function mysqlListClassMembers(classId: string): Promise<ClassroomClassMember[]> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, class_id, student_user_id, joined_at
       FROM local_class_members WHERE class_id = ? ORDER BY joined_at ASC`,
      [classId],
    );
    return rows.map(rowToMember);
  });
}

export async function mysqlAddClassMembers(
  classId: string,
  studentUserIds: string[],
): Promise<void> {
  if (!studentUserIds.length) return;
  await withConn(async (db) => {
    await ensureLocalClassTables(db);
    for (const sid of studentUserIds) {
      await db.query(
        `INSERT INTO local_class_members (id, class_id, student_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE student_user_id = VALUES(student_user_id)`,
        [newId(), classId, sid],
      );
    }
  });
}

export async function mysqlRemoveClassMember(
  classId: string,
  studentUserId: string,
): Promise<void> {
  await withConn(async (db) => {
    await ensureLocalClassTables(db);
    await db.query(`DELETE FROM local_class_members WHERE class_id = ? AND student_user_id = ?`, [
      classId,
      studentUserId,
    ]);
  });
}

export async function mysqlListClassIdsForStudent(studentUserId: string): Promise<string[]> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT class_id FROM local_class_members WHERE student_user_id = ?`,
      [studentUserId],
    );
    return rows.map((r) => String(r.class_id));
  });
}

export async function mysqlUpdateClassGrade(
  classId: string,
  gradeId: string,
): Promise<ClassroomClass | null> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    await db.query(`UPDATE local_classes SET grade_id = ? WHERE id = ? AND status = 'active'`, [
      gradeId,
      classId,
    ]);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, grade_id, owner_teacher_id, status, created_at, updated_at
       FROM local_classes WHERE id = ? LIMIT 1`,
      [classId],
    );
    const row = rows[0];
    return row ? rowToClass(row) : null;
  });
}

export async function mysqlArchiveClass(classId: string): Promise<ClassroomClass | null> {
  return withConn(async (db) => {
    await ensureLocalClassTables(db);
    await db.query(`UPDATE local_classes SET status = 'archived' WHERE id = ? AND status = 'active'`, [
      classId,
    ]);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, grade_id, owner_teacher_id, status, created_at, updated_at
       FROM local_classes WHERE id = ? LIMIT 1`,
      [classId],
    );
    const row = rows[0];
    return row ? rowToClass(row) : null;
  });
}
