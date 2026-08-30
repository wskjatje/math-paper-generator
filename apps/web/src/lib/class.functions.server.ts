/**
 * 班级工作台 ServerFn：列表/创建/名册。
 * 存储优先：Supabase → 本机 MySQL → JSON 回退。
 * 禁止顶层 import node:fs / classLocalStore：客户端 import 本文件的 createServerFn 会连带打包失败。
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { profileHasRole, type AuthContext } from "@/lib/auth.shared";
import {
  compareClassesByGradeAsc,
  isValidClassGradeId,
  nextClassGradeId,
  normalizeClassName,
  type ClassroomClass,
  type ClassroomClassMember,
} from "@/lib/classroomClass.shared";
import { gradeLevelLabel } from "@/lib/generateCatalog";

async function loadSupabaseAdmin() {
  const { getSupabaseAdmin } = await import("@/lib/supabaseOptional.server");
  return getSupabaseAdmin();
}

async function loadAuthHelpers() {
  return import("@/lib/auth.helpers.server");
}

async function assertAccountSchemaReady() {
  const m = await import("@/lib/runtimeReadiness.server");
  return m.assertAccountSchemaReady();
}

const AuthTokenField = z.object({
  accessToken: z.string().min(10).optional(),
});

type ClassBackend = "supabase" | "mysql" | "json";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** 班级表尚未写入生成的 Supabase types，云端路径用宽松客户端 */
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

async function mutateLocalClassStore(
  mutator: Parameters<
    Awaited<typeof import("@/lib/classLocalStore.server")>["mutateLocalClassStore"]
  >[0],
) {
  const m = await import("@/lib/classLocalStore.server");
  return m.mutateLocalClassStore(mutator);
}

async function listClassesForOwner(ownerTeacherId: string): Promise<ClassroomClass[]> {
  const backend = await resolveClassBackend();
  if (backend === "supabase") {
    const db = sbClass((await loadSupabaseAdmin())!);
    const { data, error } = await db
      .from("classes")
      .select("*")
      .eq("owner_teacher_id", ownerTeacherId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name),
      grade_id: String(row.grade_id),
      owner_teacher_id: String(row.owner_teacher_id),
      status: row.status === "archived" ? "archived" : "active",
      created_at: String(row.created_at),
      updated_at: row.updated_at ? String(row.updated_at) : undefined,
    }));
  }
  if (backend === "mysql") {
    const { mysqlListClassesForTeacher } = await import("@/lib/mysqlClassStore.server");
    return mysqlListClassesForTeacher(ownerTeacherId);
  }
  const store = await readLocalClassStore();
  return store.classes
    .filter((c) => c.owner_teacher_id === ownerTeacherId && c.status === "active")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

async function getClassById(classId: string): Promise<ClassroomClass | null> {
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

async function listMemberIdsForClass(classId: string): Promise<string[]> {
  const members = await listMembersRaw(classId);
  return members.map((m) => m.student_user_id);
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

async function listClassIdsForStudent(studentUserId: string): Promise<string[]> {
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

async function assertOwnsClass(
  auth: AuthContext,
  classId: string,
): Promise<ClassroomClass> {
  (await loadAuthHelpers()).assertTeacherAccess(auth);
  if (!auth.userId) throw new Error("需要登录教师账号");
  const cls = await getClassById(classId);
  if (!cls || cls.status !== "active") throw new Error("班级不存在");
  if (cls.owner_teacher_id !== auth.userId) throw new Error("只能操作自己的班级");
  return cls;
}

export const listMyClasses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AuthTokenField.parse(data ?? {}))
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    (await loadAuthHelpers()).assertTeacherAccess(auth);
    if (!auth.userId || !profileHasRole(auth, "teacher")) {
      throw new Error("需要教师权限");
    }
    const classes = await listClassesForOwner(auth.userId);
    return {
      classes: classes
        .map((c) => ({
          ...c,
          gradeLabel: gradeLevelLabel(c.grade_id),
          memberCount: 0 as number,
          nextGradeId: nextClassGradeId(c.grade_id),
          nextGradeLabel: (() => {
            const next = nextClassGradeId(c.grade_id);
            return next ? gradeLevelLabel(next) : null;
          })(),
        }))
        .sort(compareClassesByGradeAsc),
    };
  });

/** 带成员数的班级列表 */
export const listMyClassesWithCounts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AuthTokenField.parse(data ?? {}))
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    (await loadAuthHelpers()).assertTeacherAccess(auth);
    if (!auth.userId) throw new Error("需要登录教师账号");
    const classes = await listClassesForOwner(auth.userId);
    const withCounts = await Promise.all(
      classes.map(async (c) => {
        const members = await listMembersRaw(c.id);
        const nextGradeId = nextClassGradeId(c.grade_id);
        return {
          ...c,
          gradeLabel: gradeLevelLabel(c.grade_id),
          memberCount: members.length,
          nextGradeId,
          nextGradeLabel: nextGradeId ? gradeLevelLabel(nextGradeId) : null,
        };
      }),
    );
    withCounts.sort(compareClassesByGradeAsc);
    return { classes: withCounts };
  });

export const createClass = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({
      name: z.string().min(1).max(80),
      gradeId: z.string().min(1).max(80),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    (await loadAuthHelpers()).assertTeacherAccess(auth);
    if (!auth.userId) throw new Error("需要登录教师账号");
    const name = normalizeClassName(data.name);
    if (!name) throw new Error("请填写班级名称");
    if (!isValidClassGradeId(data.gradeId)) throw new Error("请选择有效年级");

    const backend = await resolveClassBackend();
    if (backend === "supabase") {
      const db = sbClass((await loadSupabaseAdmin())!);
      const { data: row, error } = await db
        .from("classes")
        .insert({
          name,
          grade_id: data.gradeId,
          owner_teacher_id: auth.userId,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        class: {
          id: String(row.id),
          name: String(row.name),
          grade_id: String(row.grade_id),
          owner_teacher_id: String(row.owner_teacher_id),
          status: "active" as const,
          created_at: String(row.created_at),
        },
      };
    }
    if (backend === "mysql") {
      const { mysqlCreateClass } = await import("@/lib/mysqlClassStore.server");
      const cls = await mysqlCreateClass({
        name,
        gradeId: data.gradeId,
        ownerTeacherId: auth.userId,
      });
      return { class: cls };
    }
    const now = new Date().toISOString();
    const cls: ClassroomClass = {
      id: newId(),
      name,
      grade_id: data.gradeId,
      owner_teacher_id: auth.userId,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    await mutateLocalClassStore((store) => {
      store.classes.unshift(cls);
    });
    return { class: cls };
  });

export const getClassDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({ classId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    const cls = await assertOwnsClass(auth, data.classId);
    const members = await listMembersRaw(data.classId);
    const nextGradeId = nextClassGradeId(cls.grade_id);
    return {
      class: {
        ...cls,
        gradeLabel: gradeLevelLabel(cls.grade_id),
        nextGradeId,
        nextGradeLabel: nextGradeId ? gradeLevelLabel(nextGradeId) : null,
      },
      memberIds: members.map((m) => m.student_user_id),
      memberCount: members.length,
    };
  });

/** 升级一步：上学期→同学年下学期；下学期→下一学年上学期 */
export const promoteClassToNextYear = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({ classId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const cls = await assertOwnsClass(auth, data.classId);
    const nextGradeId = nextClassGradeId(cls.grade_id);
    if (!nextGradeId) {
      throw new Error("已是最高年级下学期，无法再升级；请取消（归档）班级");
    }

    const backend = await resolveClassBackend();
    let updated: ClassroomClass | null = null;
    if (backend === "supabase") {
      const db = sbClass((await loadSupabaseAdmin())!);
      const { data: row, error } = await db
        .from("classes")
        .update({ grade_id: nextGradeId })
        .eq("id", data.classId)
        .eq("status", "active")
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      updated = {
        id: String(row.id),
        name: String(row.name),
        grade_id: String(row.grade_id),
        owner_teacher_id: String(row.owner_teacher_id),
        status: "active",
        created_at: String(row.created_at),
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
      };
    } else if (backend === "mysql") {
      const { mysqlUpdateClassGrade } = await import("@/lib/mysqlClassStore.server");
      updated = await mysqlUpdateClassGrade(data.classId, nextGradeId);
    } else {
      const now = new Date().toISOString();
      await mutateLocalClassStore((store) => {
        const hit = store.classes.find((c) => c.id === data.classId && c.status === "active");
        if (!hit) throw new Error("班级不存在");
        hit.grade_id = nextGradeId;
        hit.updated_at = now;
      });
      updated = await getClassById(data.classId);
    }
    if (!updated) throw new Error("升级失败");
    const nextAfter = nextClassGradeId(updated.grade_id);
    return {
      class: {
        ...updated,
        gradeLabel: gradeLevelLabel(updated.grade_id),
        nextGradeId: nextAfter,
        nextGradeLabel: nextAfter ? gradeLevelLabel(nextAfter) : null,
      },
    };
  });

/** 取消班级：归档后不再出现在教师班级列表 */
export const archiveClass = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({ classId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOwnsClass(auth, data.classId);

    const backend = await resolveClassBackend();
    if (backend === "supabase") {
      const db = sbClass((await loadSupabaseAdmin())!);
      const { error } = await db
        .from("classes")
        .update({ status: "archived" })
        .eq("id", data.classId)
        .eq("status", "active");
      if (error) throw new Error(error.message);
    } else if (backend === "mysql") {
      const { mysqlArchiveClass } = await import("@/lib/mysqlClassStore.server");
      const archived = await mysqlArchiveClass(data.classId);
      if (!archived) throw new Error("取消班级失败");
    } else {
      await mutateLocalClassStore((store) => {
        const hit = store.classes.find((c) => c.id === data.classId && c.status === "active");
        if (!hit) throw new Error("班级不存在");
        hit.status = "archived";
        hit.updated_at = new Date().toISOString();
      });
    }
    return { ok: true as const };
  });

export const listClassMembers = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({ classId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    await assertOwnsClass(auth, data.classId);
    const members = await listMembersRaw(data.classId);
    const entries: Array<{
      studentUserId: string;
      label: string;
      displayName: string | null;
      gradeId: string | null;
      email: string | null;
      joinedAt: string;
    }> = [];

    for (const m of members) {
      let label = m.student_user_id.slice(0, 8);
      let displayName: string | null = null;
      let gradeId: string | null = null;
      let email: string | null = null;
      try {
        const db = await loadSupabaseAdmin();
        if (db) {
          const { data: row } = await db
            .from("user_profiles")
            .select("display_name, grade_id")
            .eq("id", m.student_user_id)
            .maybeSingle();
          displayName = row?.display_name?.trim() || null;
          gradeId = row?.grade_id ?? null;
          if (displayName) label = displayName;
          const { data: user } = await db.auth.admin.getUserById(m.student_user_id);
          email = user?.user?.email ?? null;
        } else {
          const { loadLocalProfile } = await import("@/lib/mysqlAccountStore.server");
          const profile = await loadLocalProfile(m.student_user_id);
          displayName = profile?.display_name?.trim() || null;
          gradeId = profile?.grade_id ?? null;
          if (displayName) label = displayName;
        }
      } catch {
        /* keep short id */
      }
      entries.push({
        studentUserId: m.student_user_id,
        label,
        displayName,
        gradeId,
        email,
        joinedAt: m.joined_at,
      });
    }
    return { members: entries };
  });

export const addClassMembers = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({
      classId: z.string().uuid(),
      studentUserIds: z.array(z.string().uuid()).min(1).max(200),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    await assertOwnsClass(auth, data.classId);
    const ids = [...new Set(data.studentUserIds)];
    const backend = await resolveClassBackend();
    if (backend === "supabase") {
      const db = sbClass((await loadSupabaseAdmin())!);
      const { error } = await db.from("class_memberships").upsert(
        ids.map((sid) => ({ class_id: data.classId, student_user_id: sid })),
        { onConflict: "class_id,student_user_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    } else if (backend === "mysql") {
      const { mysqlAddClassMembers } = await import("@/lib/mysqlClassStore.server");
      await mysqlAddClassMembers(data.classId, ids);
    } else {
      await mutateLocalClassStore((store) => {
        const existing = new Set(
          store.members.filter((m) => m.class_id === data.classId).map((m) => m.student_user_id),
        );
        const now = new Date().toISOString();
        for (const sid of ids) {
          if (existing.has(sid)) continue;
          store.members.push({
            id: newId(),
            class_id: data.classId,
            student_user_id: sid,
            joined_at: now,
          });
        }
      });
    }
    return { ok: true as const };
  });

export const removeClassMember = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthTokenField.extend({
      classId: z.string().uuid(),
      studentUserId: z.string().uuid(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAccountSchemaReady();
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    await assertOwnsClass(auth, data.classId);
    const backend = await resolveClassBackend();
    if (backend === "supabase") {
      const db = sbClass((await loadSupabaseAdmin())!);
      const { error } = await db
        .from("class_memberships")
        .delete()
        .eq("class_id", data.classId)
        .eq("student_user_id", data.studentUserId);
      if (error) throw new Error(error.message);
    } else if (backend === "mysql") {
      const { mysqlRemoveClassMember } = await import("@/lib/mysqlClassStore.server");
      await mysqlRemoveClassMember(data.classId, data.studentUserId);
    } else {
      await mutateLocalClassStore((store) => {
        store.members = store.members.filter(
          (m) => !(m.class_id === data.classId && m.student_user_id === data.studentUserId),
        );
      });
    }
    return { ok: true as const };
  });
