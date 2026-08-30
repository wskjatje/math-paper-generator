// @ts-nocheck
/**
 * 仅导出 createServerFn（及类型再导出）。
 * 纯函数/类型 → accountAdmin.shared.ts；勿在此混出客户端会静态依赖的非 ServerFn，
 * 否则 Vite 客户端（Web 与 Electron 渲染进程）会连带拉入 node:fs。
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { profileHasRole, type AuthContext } from "@/lib/auth.shared";
import { normalizeProfileRoles } from "@/lib/activeRoleStorage";
import {
  localLoginCarrierEmail,
  looksLikeEmail,
  normalizeLoginIdentifier,
  normalizePhoneDigits,
} from "@/lib/loginIdentifier.shared";
import { CURRICULUM_SUBJECT_OPTIONS, GRADE_LEVEL_OPTIONS, subjectsAllowedForGrade } from "@/lib/generateCatalog";
import type { UserRole } from "@/lib/types";
import {
  deriveAccountStackStatus,
  teacherCanCreateStudent,
  type AccountAdminCapability,
  type AccountProfileRow,
  type TeacherStudentRow,
} from "@/lib/accountAdmin.shared";

export type {
  AccountAdminCapability,
  AccountProfileRow,
  AccountStackStatus,
  TeacherStudentPairRow,
  TeacherStudentRow,
} from "@/lib/accountAdmin.shared";

/**
 * 运维账号主路径为 MySQL；Supabase `user_profiles` / `teacher_students` 尚未进入当前 Database 类型。
 * 此处用宽松客户端，避免阻断门户编译。
 */
type SupabaseAdminClient = {
  from: (relation: string) => any;
  auth: { admin: any };
};
type ProfileUpdate = Record<string, unknown>;

/** 永久封禁时长（Supabase Auth 无「永久」枚举，用超长时长表达） */
const BAN_FOREVER = "876000h";

const GRADE_IDS = new Set<string>(GRADE_LEVEL_OPTIONS.map((g) => g.id));
const SUBJECT_IDS = new Set<string>(CURRICULUM_SUBJECT_OPTIONS.map((s) => s.id));

function assertSubjectsMatchStudentGrade(
  gradeId: string | null | undefined,
  subjectIds: string[],
): void {
  if (!subjectIds.length) return;
  if (!gradeId?.trim()) {
    throw new Error("学生未设置年级，无法绑定学科；请先补全年级");
  }
  const allowed = new Set(subjectsAllowedForGrade(gradeId));
  const mismatched = subjectIds.filter((id) => !allowed.has(id));
  if (mismatched.length) {
    throw new Error("所选学科与学生年级不匹配");
  }
}

const GradeIdSchema = z
  .string()
  .max(40)
  .refine((v) => GRADE_IDS.has(v), { message: "年级 id 不在可选范围（GRADE_LEVEL_OPTIONS）" });

const SubjectIdSchema = z
  .string()
  .max(40)
  .refine((v) => SUBJECT_IDS.has(v), {
    message: "学科 id 不在可选范围（CURRICULUM_SUBJECT_OPTIONS）",
  });

const AuthField = z.object({
  accessToken: z.string().min(10).optional(),
});

async function loadSupabaseAdmin() {
  const { getSupabaseAdmin } = await import("@/lib/supabaseOptional.server");
  return getSupabaseAdmin();
}

async function supabaseAuthConfigured(): Promise<boolean> {
  const { getRuntimeEnv } = await import("@/lib/runtimeEnvLocal.server");
  return !!(getRuntimeEnv("SUPABASE_URL") && getRuntimeEnv("SUPABASE_PUBLISHABLE_KEY"));
}

async function requireSupabaseAdmin(): Promise<SupabaseAdminClient> {
  const admin = await loadSupabaseAdmin();
  if (!admin) {
    throw new Error("账号管理不可用：请先在配库页完成账号服务设置。");
  }
  return admin as unknown as SupabaseAdminClient;
}

async function loadAuthHelpers() {
  return import("@/lib/auth.helpers.server");
}

async function loadAssertAdminAccess() {
  const { assertAdminAccess } = await import("@/lib/adminGate.server");
  return assertAdminAccess;
}

export type OpsAccessOptions = {
  /** 默认允许 MPG_ADMIN_TOKEN 走运维闸门；设为 false 时只认 role=admin 的登录态 */
  allowAdminToken?: boolean;
};

/** 运维（admin）权限：档案 roles 含 admin，或 adminGate 的 MPG_ADMIN_TOKEN */
async function assertOpsAccess(ctx: AuthContext, opts: OpsAccessOptions = {}): Promise<void> {
  const { allowAdminToken = true } = opts;
  if (ctx.status === "disabled") throw new Error("账号已停用，请联系管理员");
  if (ctx.userId && profileHasRole(ctx, "admin")) return;
  if (allowAdminToken) {
    const assertAdminAccess = await loadAssertAdminAccess();
    assertAdminAccess();
    return;
  }
  throw new Error("需要运维（admin）权限");
}

async function hasOpsAccess(ctx: AuthContext): Promise<boolean> {
  try {
    await assertOpsAccess(ctx);
    return true;
  } catch {
    return false;
  }
}

async function readProfile(
  admin: SupabaseAdminClient,
  userId: string,
): Promise<{
  id: string;
  role: UserRole | null;
  roles: UserRole[];
  display_name: string | null;
  grade_id: string | null;
  status: "active" | "disabled";
} | null> {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id, role, roles, display_name, grade_id, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const roles = normalizeProfileRoles(data.role, data.roles);
  const primary =
    data.role === "teacher" || data.role === "student" || data.role === "admin"
      ? data.role
      : (roles[0] ?? null);
  return {
    id: data.id,
    role: primary,
    roles,
    display_name: data.display_name,
    grade_id: data.grade_id ?? null,
    status: data.status === "disabled" ? "disabled" : "active",
  };
}

/** 批量解析 auth 邮箱：优先分页扫描，未命中的再逐个补齐 */
async function collectEmails(
  admin: SupabaseAdminClient,
  ids: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const wanted = new Set(ids);
  if (!wanted.size) return out;

  const perPage = 200;
  const maxPages = 25;
  for (let page = 1; page <= maxPages && wanted.size > 0; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    for (const user of users) {
      if (wanted.has(user.id)) {
        out.set(user.id, user.email ?? null);
        wanted.delete(user.id);
      }
    }
    if (users.length < perPage) break;
  }

  if (wanted.size > 0) {
    const rest = [...wanted];
    const resolved = await Promise.all(
      rest.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data?.user?.email ?? null] as const;
      }),
    );
    for (const [id, email] of resolved) out.set(id, email);
  }
  return out;
}

async function applyAuthBan(
  admin: SupabaseAdminClient,
  userId: string,
  disabled: boolean,
): Promise<string | null> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? BAN_FOREVER : "none",
  });
  return error ? error.message : null;
}

type CreateAccountArgs = {
  admin: SupabaseAdminClient;
  email: string;
  password: string;
  role: UserRole;
  roles: UserRole[];
  displayName?: string;
  gradeId?: string;
  loginPhone?: string | null;
  studentNo?: string | null;
  employeeNo?: string | null;
  createdBy: string | null;
  /** 建号成功后的关联写入；抛错会连同 auth 用户一起回滚 */
  afterProfile?: (userId: string) => Promise<void>;
};

/** 建号：auth 用户 + user_profiles；任一步失败清理半成品 */
async function createAccountWithProfile(args: CreateAccountArgs): Promise<{
  userId: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
}> {
  const { admin } = args;
  const roles = normalizeProfileRoles(args.role, args.roles);
  if (!roles.length) throw new Error("至少选择一个身份");
  if (!roles.includes(args.role)) {
    throw new Error("默认身份必须属于已选身份集合");
  }
  const created = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
  });
  if (created.error || !created.data?.user) {
    throw new Error(created.error?.message ?? "创建账号失败");
  }
  const userId = created.data.user.id;

  try {
    const { error: profileErr } = await admin.from("user_profiles").upsert(
      {
        id: userId,
        role: args.role,
        roles,
        display_name: args.displayName?.trim() || null,
        grade_id: args.gradeId ?? null,
        login_phone: args.loginPhone ?? null,
        student_no: args.studentNo ?? null,
        employee_no: args.employeeNo ?? null,
        status: "active",
        created_by: args.createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileErr) throw new Error(profileErr.message);
    await args.afterProfile?.(userId);
  } catch (err) {
    await admin.from("user_profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw err instanceof Error ? err : new Error(String(err));
  }

  return { userId, email: args.email, role: args.role, roles };
}

async function insertTeacherLinks(
  admin: SupabaseAdminClient,
  rows: {
    teacherUserId: string;
    studentUserId: string;
    subjectId: string;
    createdBy: string | null;
  }[],
): Promise<void> {
  if (!rows.length) return;
  const { error } = await admin.from("teacher_students").upsert(
    rows.map((r) => ({
      teacher_user_id: r.teacherUserId,
      student_user_id: r.studentUserId,
      subject_id: r.subjectId,
      created_by: r.createdBy,
    })),
    { onConflict: "teacher_user_id,student_user_id,subject_id" },
  );
  if (error) throw new Error(error.message);
}

async function teacherOwnsStudent(
  admin: SupabaseAdminClient,
  teacherUserId: string,
  studentUserId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("teacher_students")
    .select("id")
    .eq("teacher_user_id", teacherUserId)
    .eq("student_user_id", studentUserId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** 运维能力探测：前端据此决定是否展示账号管理入口 */
export const getAccountAdminCapability = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccountAdminCapability> => {
    const { loadMysqlConnection } = await import("@/lib/mysqlConnection.server");
    const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
    const mysqlConfigured = !!(await loadMysqlConnection());
    const mysqlProbe = await probeMysqlAccountSchemaReady();
    const supabaseReady = await supabaseAuthConfigured();
    const admin = await loadSupabaseAdmin();
    const serviceRoleReady = !!admin || mysqlProbe.accountSchemaReady;
    const { getRuntimeEnv } = await import("@/lib/runtimeEnvLocal.server");
    const databaseUrlConfigured = !!getRuntimeEnv("DATABASE_URL");
    const status = deriveAccountStackStatus({
      supabaseReady,
      serviceRoleReady: !!admin,
      mysqlConfigured,
      mysqlAccountReady: mysqlProbe.accountSchemaReady,
      databaseUrlConfigured,
    });
    return {
      supabaseReady,
      serviceRoleReady,
      mysqlConfigured,
      mysqlAccountReady: mysqlProbe.accountSchemaReady,
      databaseUrlConfigured,
      teacherCanCreateStudent: teacherCanCreateStudent(),
      status,
    };
  },
);

/** 首个运维引导：登录邮箱匹配 MPG_BOOTSTRAP_ADMIN_EMAIL 时提升为 admin */
export const bootstrapAdminIfNeeded = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthField.extend({ accessToken: z.string().min(10) }).parse(data),
  )
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken });
    if (!auth.userId) throw new Error("登录已失效，请重新登录");
    const promoted = await (await loadAuthHelpers()).bootstrapAdminForUserIfNeeded(auth.userId, auth.email);
    const refreshed = promoted
      ? await (await loadAuthHelpers()).resolveAuthContextFromInput({ accessToken: data.accessToken })
      : auth;
    return {
      ok: true as const,
      promoted,
      role: refreshed.role,
      roles: refreshed.roles,
    };
  });

const ListProfilesSchema = AuthField.extend({
  role: z.enum(["teacher", "student", "admin", "all"]).default("all"),
  status: z.enum(["active", "disabled", "all"]).default("all"),
  /** 仅按 display_name 模糊匹配；邮箱由 auth 侧解析，不参与 DB 过滤 */
  search: z.string().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});


/** 运维：分页列出账号（含邮箱） */
export const listProfiles = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListProfilesSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOpsAccess(auth);

    const { probeMysqlAccountSchemaReady, listLocalAccounts } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const listed = await listLocalAccounts({
        page: data.page,
        pageSize: data.pageSize,
        role: data.role,
        status: data.status,
        search: data.search,
      });
      const profiles: AccountProfileRow[] = listed.profiles.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        roles: r.roles,
        displayName: r.displayName,
        gradeId: r.gradeId,
        explainAbilityBandId: r.explainAbilityBandId,
        status: r.status,
        createdAt: r.createdAt,
      }));
      return { profiles, total: listed.total, page: data.page, pageSize: data.pageSize };
    }

    const admin = await requireSupabaseAdmin();

    const from = (data.page - 1) * data.pageSize;
    let query = admin
      .from("user_profiles")
      .select("id, role, roles, display_name, grade_id, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (data.role !== "all") query = query.contains("roles", [data.role]);
    if (data.status !== "all") query = query.eq("status", data.status);
    const search = data.search?.trim();
    if (search) query = query.ilike("display_name", `%${search}%`);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const emails = await collectEmails(
      admin,
      list.map((r) => r.id),
    );

    const profiles: AccountProfileRow[] = list.map((r) => {
      const roles = normalizeProfileRoles(r.role, r.roles);
      return {
        id: r.id,
        email: emails.get(r.id) ?? null,
        role: roles[0] ?? null,
        roles,
        displayName: r.display_name,
        gradeId: r.grade_id ?? null,
        explainAbilityBandId: null,
        status: r.status === "disabled" ? "disabled" : "active",
        createdAt: r.created_at ?? null,
      };
    });

    return { profiles, total: count ?? profiles.length, page: data.page, pageSize: data.pageSize };
  });

const CreateUserSchema = AuthField.extend({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  /** 默认身份 */
  role: z.enum(["teacher", "student", "admin"]),
  /** 可切换身份；未传则仅默认身份 */
  roles: z.array(z.enum(["teacher", "student", "admin"])).min(1).max(3).optional(),
  displayName: z.string().min(1).max(80).optional(),
  gradeId: GradeIdSchema.optional(),
  explainAbilityBandId: z.string().max(32).nullable().optional(),
  loginPhone: z.string().max(32).optional(),
  studentNo: z.string().max(64).optional(),
  employeeNo: z.string().max(64).optional(),
  /** 与 teacherUserId 搭配使用：为新建学生建立师生关系（教师多学科关系用 linkTeacherStudent） */
  subjectIds: z.array(SubjectIdSchema).max(20).optional(),
  teacherUserId: z.string().uuid().optional(),
});

/** 运维：创建账号（教师/学生/运维） */
export const createUserAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateUserSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOpsAccess(auth);
    await (await import("@/lib/runtimeReadiness.server")).assertAccountSchemaReady();

    const roles = normalizeProfileRoles(data.role, data.roles ?? [data.role]);
    if (!roles.includes(data.role)) {
      throw new Error("默认身份必须属于已选身份集合");
    }

    let loginPhone: string | null = null;
    if (data.loginPhone?.trim()) {
      const phone = normalizePhoneDigits(data.loginPhone);
      if (!phone) throw new Error("手机号格式无效");
      loginPhone = phone;
    }
    const studentNo = data.studentNo?.trim() || null;
    const employeeNo = data.employeeNo?.trim() || null;
    if (studentNo && normalizeLoginIdentifier(studentNo)?.kind === "email") {
      throw new Error("学生号不能是邮箱格式");
    }

    const subjectIds = [...new Set(data.subjectIds ?? [])];
    if (subjectIds.length && (!roles.includes("student") || !data.teacherUserId)) {
      throw new Error("subjectIds 仅用于新建学生并指定 teacherUserId 时建立师生关系");
    }
    if (subjectIds.length) {
      assertSubjectsMatchStudentGrade(data.gradeId, subjectIds);
    }

    const { normalizeExplainAbilityBandIdOrNull } = await import("@/config/explainVideo");
    const explainAbilityBandId = normalizeExplainAbilityBandIdOrNull(
      data.explainAbilityBandId,
    );

    const { probeMysqlAccountSchemaReady, createLocalAccount } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const {
        getLocalAccountRoles,
        insertLocalTeacherLinks,
      } = await import("@/lib/mysqlTeacherStudents.server");
      if (data.teacherUserId) {
        const teacherRoles = await getLocalAccountRoles(data.teacherUserId);
        if (!teacherRoles?.includes("teacher")) {
          throw new Error("指定的 teacherUserId 不是教师账号");
        }
      }
      const created = await createLocalAccount({
        email: data.email.trim(),
        password: data.password,
        displayName: data.displayName,
        roles,
        loginPhone,
        studentNo,
        employeeNo,
        gradeId: data.gradeId ?? null,
        explainAbilityBandId,
      });
      if (data.teacherUserId && subjectIds.length) {
        await insertLocalTeacherLinks(
          subjectIds.map((subjectId) => ({
            teacherUserId: data.teacherUserId as string,
            studentUserId: created.id,
            subjectId,
            createdBy: auth.userId,
          })),
        );
      }
      return {
        ok: true as const,
        userId: created.id,
        email: data.email.trim().toLowerCase(),
        role: data.role,
        roles,
      };
    }

    const admin = await requireSupabaseAdmin();
    if (data.teacherUserId) {
      const teacher = await readProfile(admin, data.teacherUserId);
      if (!teacher || !teacher.roles.includes("teacher")) {
        throw new Error("指定的 teacherUserId 不是教师账号");
      }
    }

    const created = await createAccountWithProfile({
      admin,
      email: data.email.trim(),
      password: data.password,
      role: data.role,
      roles,
      displayName: data.displayName,
      gradeId: data.gradeId,
      loginPhone,
      studentNo,
      employeeNo,
      createdBy: auth.userId,
      afterProfile: async (userId) => {
        if (!data.teacherUserId || !subjectIds.length) return;
        await insertTeacherLinks(
          admin,
          subjectIds.map((subjectId) => ({
            teacherUserId: data.teacherUserId as string,
            studentUserId: userId,
            subjectId,
            createdBy: auth.userId,
          })),
        );
      },
    });

    return {
      ok: true as const,
      userId: created.userId,
      email: created.email,
      role: created.role,
      roles: created.roles,
    };
  });

const UpdateProfileSchema = AuthField.extend({
  userId: z.string().uuid(),
  displayName: z.string().max(80).nullable().optional(),
  gradeId: GradeIdSchema.nullable().optional(),
  explainAbilityBandId: z.string().max(32).nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  role: z.enum(["teacher", "student", "admin"]).optional(),
  roles: z.array(z.enum(["teacher", "student", "admin"])).min(1).max(3).optional(),
});

/** 运维：修改档案（姓名 / 年级 / 讲解档 / 状态 / 身份） */
export const updateUserProfileAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateProfileSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOpsAccess(auth);

    if (auth.userId && auth.userId === data.userId && data.status === "disabled") {
      throw new Error("不能停用当前登录的运维账号");
    }

    const { normalizeExplainAbilityBandIdOrNull } = await import("@/config/explainVideo");
    const explainAbilityBandId =
      data.explainAbilityBandId !== undefined
        ? normalizeExplainAbilityBandIdOrNull(data.explainAbilityBandId)
        : undefined;

    const { probeMysqlAccountSchemaReady, updateLocalAccountProfile, loadLocalProfile } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const existing = await loadLocalProfile(data.userId);
      if (!existing) throw new Error("账号档案不存在");

      const updated = await updateLocalAccountProfile({
        id: data.userId,
        displayName: data.displayName,
        gradeId: data.gradeId,
        explainAbilityBandId,
        status: data.status,
        roles: data.roles,
        primaryRole: data.role,
      });

      if (data.status === "disabled" && existing.status !== "disabled") {
        const { revokeAllLocalSessionsForAccount } = await import("@/lib/localSession.server");
        await revokeAllLocalSessionsForAccount(data.userId);
      }

      return { ok: true as const, userId: data.userId, warning: null as string | null, status: updated.status };
    }

    const admin = await requireSupabaseAdmin();

    const existing = await readProfile(admin, data.userId);
    if (!existing) throw new Error("账号档案不存在");

    const patch: ProfileUpdate = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName?.trim() || null;
    if (data.gradeId !== undefined) patch.grade_id = data.gradeId ?? null;
    if (data.status !== undefined) patch.status = data.status;

    if (data.roles !== undefined || data.role !== undefined) {
      const nextRoles = normalizeProfileRoles(
        data.role ?? existing.role,
        data.roles ?? existing.roles,
      );
      if (!nextRoles.length) throw new Error("至少保留一个身份");
      const nextDefault = data.role ?? existing.role;
      if (!nextDefault || !nextRoles.includes(nextDefault)) {
        throw new Error("默认身份必须属于已选身份集合");
      }
      patch.role = nextDefault;
      patch.roles = nextRoles;
    }

    const { error } = await admin.from("user_profiles").update(patch).eq("id", data.userId);
    if (error) throw new Error(error.message);

    let warning: string | null = null;
    if (data.status !== undefined && data.status !== existing.status) {
      warning = await applyAuthBan(admin, data.userId, data.status === "disabled");
    }

    return { ok: true as const, userId: data.userId, warning };
  });

const SetDisabledSchema = AuthField.extend({
  userId: z.string().uuid(),
  disabled: z.boolean().default(true),
});

/** 运维：停用 / 恢复账号（档案 status + 会话失效 / auth 登录封禁） */
export const setUserDisabled = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SetDisabledSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOpsAccess(auth);

    if (auth.userId && auth.userId === data.userId && data.disabled) {
      throw new Error("不能停用当前登录的运维账号");
    }

    const status = data.disabled ? "disabled" : "active";

    const { probeMysqlAccountSchemaReady, updateLocalAccountProfile, loadLocalProfile } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const existing = await loadLocalProfile(data.userId);
      if (!existing) throw new Error("账号档案不存在");
      await updateLocalAccountProfile({ id: data.userId, status });
      if (data.disabled) {
        const { revokeAllLocalSessionsForAccount } = await import("@/lib/localSession.server");
        await revokeAllLocalSessionsForAccount(data.userId);
      }
      return {
        ok: true as const,
        userId: data.userId,
        status,
        authBanApplied: true as const,
        warning: null as string | null,
      };
    }

    const admin = await requireSupabaseAdmin();
    const existing = await readProfile(admin, data.userId);
    if (!existing) throw new Error("账号档案不存在");

    const { error } = await admin
      .from("user_profiles")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    const banWarning = await applyAuthBan(admin, data.userId, data.disabled);
    return {
      ok: true as const,
      userId: data.userId,
      status,
      authBanApplied: !banWarning,
      warning: banWarning,
    };
  });

const AdminSetPasswordSchema = AuthField.extend({
  userId: z.string().uuid(),
  password: z.string().min(8).max(200),
});

/** 运维：直接设置新密码（本机写 hash；云端走 Auth Admin） */
export const adminSetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AdminSetPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    await assertOpsAccess(auth);

    const { probeMysqlAccountSchemaReady, setLocalAccountPassword, loadLocalProfile } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const existing = await loadLocalProfile(data.userId);
      if (!existing) throw new Error("账号档案不存在");
      await setLocalAccountPassword(data.userId, data.password);
      return { ok: true as const, userId: data.userId, mode: "mysql" as const };
    }

    const admin = await requireSupabaseAdmin();
    const existing = await readProfile(admin, data.userId);
    if (!existing) throw new Error("账号档案不存在");
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, userId: data.userId, mode: "supabase" as const };
  });

const LinkSchema = AuthField.extend({
  teacherUserId: z.string().uuid().optional(),
  studentUserId: z.string().uuid(),
  /** 单学科（兼容旧调用） */
  subjectId: SubjectIdSchema.optional(),
  /** 多学科；与 subjectId 至少提供一种 */
  subjectIds: z.array(SubjectIdSchema).min(1).max(40).optional(),
}).refine((v) => Boolean(v.subjectId || (v.subjectIds && v.subjectIds.length > 0)), {
  message: "请选择学科",
});

function resolveSubjectIds(data: {
  subjectId?: string;
  subjectIds?: string[];
}): string[] {
  const fromArr = data.subjectIds ?? [];
  const single = data.subjectId ? [data.subjectId] : [];
  return [...new Set([...fromArr, ...single])];
}

async function resolveTeacherScope(
  auth: AuthContext,
  teacherUserId: string | undefined,
): Promise<string> {
  if (await hasOpsAccess(auth)) {
    const target = teacherUserId ?? auth.userId;
    if (!target) throw new Error("请指定 teacherUserId");
    return target;
  }
  (await loadAuthHelpers()).assertTeacherAccess(auth);
  if (!auth.userId) throw new Error("请先登录教师账号");
  if (teacherUserId && teacherUserId !== auth.userId) {
    throw new Error("教师只能管理自己的师生关系");
  }
  return auth.userId;
}

/** 运维 / 教师：建立师生关系（支持多学科一次写入） */
export const linkTeacherStudent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const teacherUserId = await resolveTeacherScope(auth, data.teacherUserId);
    const subjectIds = resolveSubjectIds(data);
    if (!subjectIds.length) throw new Error("请选择学科");

    const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const {
        getLocalAccountRoles,
        insertLocalTeacherLinks,
      } = await import("@/lib/mysqlTeacherStudents.server");
      const { loadLocalProfile } = await import("@/lib/mysqlAccountStore.server");
      const teacherRoles = await getLocalAccountRoles(teacherUserId);
      if (!teacherRoles?.includes("teacher")) {
        throw new Error("teacherUserId 不是教师账号");
      }
      const studentRoles = await getLocalAccountRoles(data.studentUserId);
      if (!studentRoles?.includes("student")) {
        throw new Error("studentUserId 不是学生账号");
      }
      const studentProfile = await loadLocalProfile(data.studentUserId);
      assertSubjectsMatchStudentGrade(studentProfile?.grade_id, subjectIds);
      await insertLocalTeacherLinks(
        subjectIds.map((subjectId) => ({
          teacherUserId,
          studentUserId: data.studentUserId,
          subjectId,
          createdBy: auth.userId,
        })),
      );
      return {
        ok: true as const,
        teacherUserId,
        studentUserId: data.studentUserId,
        subjectIds,
      };
    }

    const admin = await requireSupabaseAdmin();

    const teacher = await readProfile(admin, teacherUserId);
    if (!teacher || !teacher.roles.includes("teacher")) {
      throw new Error("teacherUserId 不是教师账号");
    }
    const student = await readProfile(admin, data.studentUserId);
    if (!student || !student.roles.includes("student")) throw new Error("studentUserId 不是学生账号");
    assertSubjectsMatchStudentGrade(student.grade_id, subjectIds);

    await insertTeacherLinks(
      admin,
      subjectIds.map((subjectId) => ({
        teacherUserId,
        studentUserId: data.studentUserId,
        subjectId,
        createdBy: auth.userId,
      })),
    );
    return {
      ok: true as const,
      teacherUserId,
      studentUserId: data.studentUserId,
      subjectIds,
    };
  });

const ReplaceSubjectsSchema = AuthField.extend({
  teacherUserId: z.string().uuid().optional(),
  studentUserId: z.string().uuid(),
  subjectIds: z.array(SubjectIdSchema).min(1).max(40),
});

/** 运维 / 教师：整对覆盖学科集合（先清该对全部学科再写入） */
export const replaceTeacherStudentSubjects = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ReplaceSubjectsSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const teacherUserId = await resolveTeacherScope(auth, data.teacherUserId);
    const subjectIds = [...new Set(data.subjectIds)];
    if (!subjectIds.length) throw new Error("请至少保留一门学科");

    const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const { deleteLocalTeacherLinks, insertLocalTeacherLinks, localTeacherOwnsStudent } =
        await import("@/lib/mysqlTeacherStudents.server");
      const { loadLocalProfile } = await import("@/lib/mysqlAccountStore.server");
      const owned = await localTeacherOwnsStudent(teacherUserId, data.studentUserId);
      if (!owned && !(await hasOpsAccess(auth))) {
        throw new Error("只能修改自己名下的师生关系");
      }
      const studentProfile = await loadLocalProfile(data.studentUserId);
      assertSubjectsMatchStudentGrade(studentProfile?.grade_id, subjectIds);
      await deleteLocalTeacherLinks({
        teacherUserId,
        studentUserId: data.studentUserId,
      });
      await insertLocalTeacherLinks(
        subjectIds.map((subjectId) => ({
          teacherUserId,
          studentUserId: data.studentUserId,
          subjectId,
          createdBy: auth.userId,
        })),
      );
      return { ok: true as const, teacherUserId, studentUserId: data.studentUserId, subjectIds };
    }

    const admin = await requireSupabaseAdmin();
    if (!(await hasOpsAccess(auth))) {
      const owned = await teacherOwnsStudent(admin, teacherUserId, data.studentUserId);
      if (!owned) throw new Error("只能修改自己名下的师生关系");
    }
    const student = await readProfile(admin, data.studentUserId);
    if (!student) throw new Error("学生档案不存在");
    assertSubjectsMatchStudentGrade(student.grade_id, subjectIds);
    const { error: delErr } = await admin
      .from("teacher_students")
      .delete()
      .eq("teacher_user_id", teacherUserId)
      .eq("student_user_id", data.studentUserId);
    if (delErr) throw new Error(delErr.message);
    await insertTeacherLinks(
      admin,
      subjectIds.map((subjectId) => ({
        teacherUserId,
        studentUserId: data.studentUserId,
        subjectId,
        createdBy: auth.userId,
      })),
    );
    return { ok: true as const, teacherUserId, studentUserId: data.studentUserId, subjectIds };
  });

/** 运维 / 教师：解除师生关系；不传 subjectId 时解除全部学科 */
export const unlinkTeacherStudent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    AuthField.extend({
      teacherUserId: z.string().uuid().optional(),
      studentUserId: z.string().uuid(),
      subjectId: SubjectIdSchema.optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const teacherUserId = await resolveTeacherScope(auth, data.teacherUserId);

    const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const { deleteLocalTeacherLinks } = await import("@/lib/mysqlTeacherStudents.server");
      await deleteLocalTeacherLinks({
        teacherUserId,
        studentUserId: data.studentUserId,
        subjectId: data.subjectId,
      });
      return { ok: true as const, teacherUserId, studentUserId: data.studentUserId };
    }

    const admin = await requireSupabaseAdmin();

    let query = admin
      .from("teacher_students")
      .delete()
      .eq("teacher_user_id", teacherUserId)
      .eq("student_user_id", data.studentUserId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true as const, teacherUserId, studentUserId: data.studentUserId };
  });

const ListLinksSchema = AuthField.extend({
  teacherUserId: z.string().uuid().optional(),
  studentUserId: z.string().uuid().optional(),
  subjectId: SubjectIdSchema.optional(),
});

/** 教师查自己名下学生；运维可查任意教师 */
export const listTeacherStudents = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListLinksSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });

    const { probeMysqlAccountSchemaReady } = await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const { listLocalTeacherLinks } = await import("@/lib/mysqlTeacherStudents.server");
      const filter: {
        teacherUserId?: string;
        studentUserId?: string;
        subjectId?: string;
        limit?: number;
      } = { subjectId: data.subjectId, limit: 500 };

      if (await hasOpsAccess(auth)) {
        if (data.teacherUserId) filter.teacherUserId = data.teacherUserId;
        if (data.studentUserId) filter.studentUserId = data.studentUserId;
      } else if (profileHasRole(auth, "student")) {
        if (!auth.userId) throw new Error("请先登录学生账号");
        filter.studentUserId = auth.userId;
      } else {
        const teacherUserId = await resolveTeacherScope(auth, data.teacherUserId);
        filter.teacherUserId = teacherUserId;
        if (data.studentUserId) filter.studentUserId = data.studentUserId;
      }

      const links: TeacherStudentRow[] = await listLocalTeacherLinks(filter);
      return { links };
    }

    const admin = await requireSupabaseAdmin();

    let query = admin
      .from("teacher_students")
      .select("id, teacher_user_id, student_user_id, subject_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (await hasOpsAccess(auth)) {
      if (data.teacherUserId) query = query.eq("teacher_user_id", data.teacherUserId);
      if (data.studentUserId) query = query.eq("student_user_id", data.studentUserId);
    } else if (profileHasRole(auth, "student")) {
      if (!auth.userId) throw new Error("请先登录学生账号");
      query = query.eq("student_user_id", auth.userId);
    } else {
      const teacherUserId = await resolveTeacherScope(auth, data.teacherUserId);
      query = query.eq("teacher_user_id", teacherUserId);
      if (data.studentUserId) query = query.eq("student_user_id", data.studentUserId);
    }
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    const studentIds = [...new Set(list.map((r) => r.student_user_id))];
    const [{ data: profiles }, emails] = await Promise.all([
      studentIds.length
        ? admin
            .from("user_profiles")
            .select("id, display_name, grade_id, status")
            .in("id", studentIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              display_name: string | null;
              grade_id: string | null;
              status: string;
            }[],
          }),
      collectEmails(admin, studentIds),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const links: TeacherStudentRow[] = list.map((r) => {
      const p = profileById.get(r.student_user_id);
      return {
        id: r.id,
        teacherUserId: r.teacher_user_id,
        studentUserId: r.student_user_id,
        subjectId: r.subject_id,
        createdAt: r.created_at,
        student: p
          ? {
              displayName: p.display_name,
              gradeId: p.grade_id ?? null,
              status: p.status === "disabled" ? "disabled" : "active",
              email: emails.get(r.student_user_id) ?? null,
            }
          : null,
      };
    });

    return { links };
  });

const TeacherCreateStudentSchema = AuthField.extend({
  /** 登录用户名 → 写入 student_no */
  studentNo: z.string().min(1).max(64),
  /** 选填；缺省时用本地不可投递载体邮箱满足存储约束 */
  email: z.string().max(200).optional(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80),
  gradeId: GradeIdSchema.optional(),
  subjectIds: z.array(SubjectIdSchema).min(1).max(20),
}).superRefine((v, ctx) => {
  const e = v.email?.trim();
  if (e && !looksLikeEmail(e)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "邮箱格式无效", path: ["email"] });
  }
});

/** 教师：为自己名下建学生账号并自动建立师生关系 */
export const teacherCreateStudent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => TeacherCreateStudentSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    if (!teacherCanCreateStudent()) {
      throw new Error("已关闭教师建号，请联系运维开通");
    }
    (await loadAuthHelpers()).assertTeacherAccess(auth);
    if (!auth.userId) throw new Error("请先登录教师账号");

    const teacherUserId = auth.userId;
    const subjectIds = [...new Set(data.subjectIds)];
    assertSubjectsMatchStudentGrade(data.gradeId, subjectIds);
    const studentNo = data.studentNo.trim();
    if (normalizeLoginIdentifier(studentNo)?.kind === "email") {
      throw new Error("用户名不能是邮箱格式；邮箱请填在邮箱栏");
    }
    const email = (data.email?.trim() || localLoginCarrierEmail(studentNo)).toLowerCase();

    const { probeMysqlAccountSchemaReady, createLocalAccount } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const { insertLocalTeacherLinks } = await import("@/lib/mysqlTeacherStudents.server");
      const created = await createLocalAccount({
        email,
        password: data.password,
        displayName: data.displayName,
        roles: ["student"],
        studentNo,
        gradeId: data.gradeId ?? null,
      });
      await insertLocalTeacherLinks(
        subjectIds.map((subjectId) => ({
          teacherUserId,
          studentUserId: created.id,
          subjectId,
          createdBy: teacherUserId,
        })),
      );
      return {
        ok: true as const,
        userId: created.id,
        email,
        studentNo,
        teacherUserId,
        subjectIds,
      };
    }

    const admin = await requireSupabaseAdmin();

    const created = await createAccountWithProfile({
      admin,
      email,
      password: data.password,
      role: "student",
      roles: ["student"],
      displayName: data.displayName,
      gradeId: data.gradeId,
      studentNo,
      createdBy: teacherUserId,
      afterProfile: async (userId) => {
        await insertTeacherLinks(
          admin,
          subjectIds.map((subjectId) => ({
            teacherUserId,
            studentUserId: userId,
            subjectId,
            createdBy: teacherUserId,
          })),
        );
      },
    });

    return {
      ok: true as const,
      userId: created.userId,
      email: created.email,
      studentNo,
      teacherUserId,
      subjectIds,
    };
  });

const ResetPasswordSchema = AuthField.extend({
  userId: z.string().uuid().optional(),
  email: z.string().email().max(200).optional(),
  redirectTo: z.string().url().max(500).optional(),
}).refine((v) => !!(v.userId || v.email), { message: "请提供 userId 或 email" });

/** 运维 / 教师（限名下学生）：生成重置密码链接，由操作者转交本人（不返回明文密码） */
export const requestPasswordResetForUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ResetPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    const admin = await requireSupabaseAdmin();

    const targetUserId = data.userId ?? null;
    let targetEmail = data.email?.trim() ?? null;

    if (targetUserId) {
      const { data: found, error } = await admin.auth.admin.getUserById(targetUserId);
      if (error || !found?.user) throw new Error("账号不存在");
      targetEmail = found.user.email ?? null;
    }
    if (!targetEmail) throw new Error("该账号没有邮箱，无法生成重置链接");

    if (!await hasOpsAccess(auth)) {
      (await loadAuthHelpers()).assertTeacherAccess(auth);
      if (!auth.userId) throw new Error("请先登录教师账号");
      if (!targetUserId) throw new Error("教师重置学生密码需提供 userId");
      const owned = await teacherOwnsStudent(admin, auth.userId, targetUserId);
      if (!owned) throw new Error("只能重置自己名下学生的密码");
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
    });
    if (linkErr || !link?.properties?.action_link) {
      throw new Error(linkErr?.message ?? "生成重置链接失败");
    }

    return {
      ok: true as const,
      email: targetEmail,
      actionLink: link.properties.action_link,
    };
  });

const TeacherUpdateStudentSchema = AuthField.extend({
  /** 本班 classId：改档只认班内名册，不认运维链接 alone */
  classId: z.string().uuid(),
  studentUserId: z.string().uuid(),
  displayName: z.string().max(80).nullable().optional(),
  gradeId: GradeIdSchema.nullable().optional(),
  password: z.string().min(8).max(200).optional(),
});

/** 教师：修改本班名册内学生显示名 / 年级 / 可选新密码（不可改非本班、不可改身份与停用） */
export const teacherUpdateLinkedStudentProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => TeacherUpdateStudentSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    (await loadAuthHelpers()).assertTeacherAccess(auth);
    if (!auth.userId) throw new Error("请先登录教师账号");
    if (
      data.displayName === undefined &&
      data.gradeId === undefined &&
      data.password === undefined
    ) {
      throw new Error("请至少修改一项");
    }

    const { assertTeacherManagesClassStudent } = await import("@/lib/class.helpers.server");
    await assertTeacherManagesClassStudent({
      teacherUserId: auth.userId,
      classId: data.classId,
      studentUserId: data.studentUserId,
    });

    const { probeMysqlAccountSchemaReady, updateLocalAccountProfile, setLocalAccountPassword } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      if (data.displayName !== undefined || data.gradeId !== undefined) {
        await updateLocalAccountProfile({
          id: data.studentUserId,
          displayName: data.displayName,
          gradeId: data.gradeId,
        });
      }
      if (data.password) {
        await setLocalAccountPassword(data.studentUserId, data.password);
      }
      return { ok: true as const, studentUserId: data.studentUserId };
    }

    const admin = await requireSupabaseAdmin();
    const existing = await readProfile(admin, data.studentUserId);
    if (!existing) throw new Error("学生档案不存在");
    const patch: ProfileUpdate = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName?.trim() || null;
    if (data.gradeId !== undefined) patch.grade_id = data.gradeId ?? null;
    if (Object.keys(patch).length > 1) {
      const { error } = await admin
        .from("user_profiles")
        .update(patch)
        .eq("id", data.studentUserId);
      if (error) throw new Error(error.message);
    }
    if (data.password) {
      const { error } = await admin.auth.admin.updateUserById(data.studentUserId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, studentUserId: data.studentUserId };
  });

const OwnProfileSchema = AuthField.extend({
  displayName: z.string().max(80).nullable().optional(),
  gradeId: GradeIdSchema.nullable().optional(),
});

/** 登录用户：修改本人显示名 / 年级 */
export const updateOwnProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => OwnProfileSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    if (!auth.userId) throw new Error("请先登录");
    if (auth.status === "disabled") throw new Error("账号已停用，请联系管理员");
    if (data.displayName === undefined && data.gradeId === undefined) {
      throw new Error("请至少修改一项");
    }

    const { probeMysqlAccountSchemaReady, updateLocalAccountProfile, loadLocalProfile } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const existing = await loadLocalProfile(auth.userId);
      if (!existing) throw new Error("账号档案不存在");
      const updated = await updateLocalAccountProfile({
        id: auth.userId,
        displayName: data.displayName,
        gradeId: data.gradeId,
      });
      return {
        ok: true as const,
        displayName: updated.display_name,
        gradeId: updated.grade_id,
      };
    }

    const admin = await requireSupabaseAdmin();
    const existing = await readProfile(admin, auth.userId);
    if (!existing) throw new Error("账号档案不存在");
    const patch: ProfileUpdate = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName?.trim() || null;
    if (data.gradeId !== undefined) patch.grade_id = data.gradeId ?? null;
    const { error } = await admin.from("user_profiles").update(patch).eq("id", auth.userId);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      displayName: (patch.display_name as string | null | undefined) ?? existing.display_name,
      gradeId:
        data.gradeId !== undefined ? data.gradeId : existing.grade_id,
    };
  });

const ChangeOwnPasswordSchema = AuthField.extend({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/** 登录用户：校验旧密码后设置新密码 */
export const changeOwnPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ChangeOwnPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    if (!auth.userId) throw new Error("请先登录");
    if (auth.status === "disabled") throw new Error("账号已停用，请联系管理员");

    const { probeMysqlAccountSchemaReady, verifyLocalAccountPassword, setLocalAccountPassword } =
      await import("@/lib/mysqlAccountStore.server");
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const ok = await verifyLocalAccountPassword(auth.userId, data.currentPassword);
      if (!ok) throw new Error("当前密码不正确");
      await setLocalAccountPassword(auth.userId, data.newPassword);
      return { ok: true as const };
    }

    const admin = await requireSupabaseAdmin();
    const email = auth.email?.trim();
    if (!email) throw new Error("当前账号无邮箱，无法改密");
    const { getRuntimeEnv } = await import("@/lib/runtimeEnvLocal.server");
    const url = getRuntimeEnv("SUPABASE_URL");
    const anon = getRuntimeEnv("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !anon) throw new Error("账号服务未配置");
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await anonClient.auth.signInWithPassword({
      email,
      password: data.currentPassword,
    });
    if (signErr) throw new Error("当前密码不正确");
    const { error } = await admin.auth.admin.updateUserById(auth.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const GetOwnProfileSchema = AuthField.extend({});

/** 登录用户：读取本人档案（供学生端编辑表单） */
export const getOwnAccountProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GetOwnProfileSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const auth = await (await loadAuthHelpers()).resolveAuthContextFromInput({
      accessToken: data.accessToken,
    });
    if (!auth.userId) throw new Error("请先登录");

    const { probeMysqlAccountSchemaReady, loadLocalProfile } = await import(
      "@/lib/mysqlAccountStore.server"
    );
    const mysql = await probeMysqlAccountSchemaReady();
    if (mysql.accountSchemaReady) {
      const profile = await loadLocalProfile(auth.userId);
      if (!profile) throw new Error("账号档案不存在");
      return {
        id: auth.userId,
        email: auth.email,
        displayName: profile.display_name,
        gradeId: profile.grade_id,
        status: profile.status === "disabled" ? ("disabled" as const) : ("active" as const),
      };
    }

    const admin = await requireSupabaseAdmin();
    const profile = await readProfile(admin, auth.userId);
    if (!profile) throw new Error("账号档案不存在");
    return {
      id: auth.userId,
      email: auth.email,
      displayName: profile.display_name,
      gradeId: profile.grade_id,
      status: profile.status,
    };
  });
