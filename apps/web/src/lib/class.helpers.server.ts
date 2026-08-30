/**
 * 班级读写辅助（仅服务端）。createServerFn 见 class.functions.server.ts。
 */
import type { ClassroomClass, ClassroomClassMember } from "@/lib/classroomClass.shared";

async function loadSupabaseAdmin() {
  const { getSupabaseAdmin } = await import("@/lib/supabaseOptional.server");
  return getSupabaseAdmin();
}

type ClassBackend = "supabase" | "mysql" | "json";

function sbClass(db: NonNullable<Awaited<ReturnType<typeof loadSupabaseAdmin>>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 待同步 supabase gen types 后删除
  return db as any;
}

async function resolveClassBackend(): Promise<ClassBackend> {
  if (await loadSupabaseAdmin()) return "supabase";
  const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
  const mysql = await probeMysqlAccountSchemaReady();
  if (mysql.accountSchemaReady) return "mysql";
  return "json";
}

async function readLocalClassStore() {
  const m = await import("@/lib/classLocalStore.server");
  return m.readLocalClassStore();
}

export async function getClassById(classId: string): Promise<ClassroomClass | null> {
  const backend = await resolveClassBackend();
  if (backend === "supabase") {
    const db = sbClass((await loadSupabaseAdmin())!);
    const { data, error } = await db.from("classes").select("*").eq("id", classId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      name: String(data.name),
      grade_id: String(data.grade_id),
      owner_teacher_id: String(data.owner_teacher_id),
      status: data.status === "archived" ? "archived" : "active",
      created_at: String(data.created_at),
      updated_at: data.updated_at ? String(data.updated_at) : undefined,
    };
  }
  if (backend === "mysql") {
    const { mysqlGetClass } = await import("@/lib/mysqlClassStore.server");
    return mysqlGetClass(classId);
  }
  const store = await readLocalClassStore();
  return store.classes.find((c) => c.id === classId) ?? null;
}

async function listMembersRaw(classId: string): Promise<ClassroomClassMember[]> {
  const backend = await resolveClassBackend();
  if (backend === "supabase") {
    const db = sbClass((await loadSupabaseAdmin())!);
    const { data, error } = await db
      .from("class_memberships")
      .select("*")
      .eq("class_id", classId)
      .order("joined_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      class_id: String(row.class_id),
      student_user_id: String(row.student_user_id),
      joined_at: String(row.joined_at),
    }));
  }
  if (backend === "mysql") {
    const { mysqlListClassMembers } = await import("@/lib/mysqlClassStore.server");
    return mysqlListClassMembers(classId);
  }
  const store = await readLocalClassStore();
  return store.members.filter((m) => m.class_id === classId);
}

export async function listMemberIdsForClass(classId: string): Promise<string[]> {
  const members = await listMembersRaw(classId);
  return members.map((m) => m.student_user_id);
}

/**
 * 教师管理本班学生：须为本班 owner，且学生在班内名册。
 * 布置/改档均只认名册，不认运维师生链接 alone。
 */
export async function assertTeacherManagesClassStudent(input: {
  teacherUserId: string;
  classId: string;
  studentUserId: string;
}): Promise<void> {
  const cls = await getClassById(input.classId);
  if (!cls || cls.status === "archived") {
    throw new Error("班级不存在或已归档");
  }
  if (cls.owner_teacher_id !== input.teacherUserId) {
    throw new Error("只能管理自己班级的学生");
  }
  const memberIds = await listMemberIdsForClass(input.classId);
  if (!memberIds.includes(input.studentUserId)) {
    throw new Error("只能修改本班名册内的学生");
  }
}

export async function listClassIdsForStudent(studentUserId: string): Promise<string[]> {
  const backend = await resolveClassBackend();
  if (backend === "supabase") {
    const db = sbClass((await loadSupabaseAdmin())!);
    const { data, error } = await db
      .from("class_memberships")
      .select("class_id")
      .eq("student_user_id", studentUserId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => String(r.class_id));
  }
  if (backend === "mysql") {
    const { mysqlListClassIdsForStudent } = await import("@/lib/mysqlClassStore.server");
    return mysqlListClassIdsForStudent(studentUserId);
  }
  const store = await readLocalClassStore();
  return store.members.filter((m) => m.student_user_id === studentUserId).map((m) => m.class_id);
}
