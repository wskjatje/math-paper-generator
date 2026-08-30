/**
 * 账号管理：可安全出现在客户端的类型与纯函数。
 * createServerFn 与带 node:fs 的探测 → accountAdmin.functions.server.ts。
 */
import type { UserRole } from "@/lib/types";

export type AccountStackStatus =
  | "ready"
  | "mysql_account_ready"
  | "mysql_needs_account_schema"
  | "auth_without_service_role"
  | "database_url_only"
  | "unset";

export type AccountAdminCapability = {
  /** 可走邮箱登录（SUPABASE_URL + PUBLISHABLE_KEY） */
  supabaseReady: boolean;
  /** 可走账号/师生/定向作业服务端写（URL + SERVICE_ROLE_KEY） */
  serviceRoleReady: boolean;
  /** 设置页本机 MySQL 已保存 */
  mysqlConfigured: boolean;
  /** 本机账号表已就绪（方案 A） */
  mysqlAccountReady: boolean;
  /** 已配 DATABASE_URL（仅迁移/直连） */
  databaseUrlConfigured: boolean;
  teacherCanCreateStudent: boolean;
  status: AccountStackStatus;
};

export type AccountProfileRow = {
  id: string;
  email: string | null;
  role: UserRole | null;
  roles: UserRole[];
  displayName: string | null;
  gradeId: string | null;
  /** 讲解能力档；空=未绑定 */
  explainAbilityBandId: string | null;
  status: "active" | "disabled";
  createdAt: string | null;
};

export type TeacherStudentRow = {
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

/** 列表按「教师+学生」合并后的一行（学科聚合） */
export type TeacherStudentPairRow = {
  teacherUserId: string;
  studentUserId: string;
  subjectIds: string[];
  /** 该对关系中最早创建时间 */
  createdAt: string;
  student: TeacherStudentRow["student"];
};

/** 学科列默认展示上限；超出用悬停展示全部 */
export const TEACHER_STUDENT_SUBJECT_PREVIEW_MAX = 3;

/** 师生关系列表默认分页大小 */
export const TEACHER_STUDENT_LINKS_PAGE_SIZE = 20;

/** 将一行一学科的链接合并为师生一对一行 */
export function groupTeacherStudentLinks(links: TeacherStudentRow[]): TeacherStudentPairRow[] {
  const map = new Map<string, TeacherStudentPairRow>();
  for (const link of links) {
    const key = `${link.teacherUserId}\0${link.studentUserId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        teacherUserId: link.teacherUserId,
        studentUserId: link.studentUserId,
        subjectIds: [link.subjectId],
        createdAt: link.createdAt,
        student: link.student,
      });
      continue;
    }
    if (!existing.subjectIds.includes(link.subjectId)) {
      existing.subjectIds.push(link.subjectId);
    }
    if (link.createdAt && (!existing.createdAt || link.createdAt < existing.createdAt)) {
      existing.createdAt = link.createdAt;
    }
    if (!existing.student && link.student) existing.student = link.student;
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

export function deriveAccountStackStatus(opts: {
  supabaseReady: boolean;
  serviceRoleReady: boolean;
  mysqlConfigured: boolean;
  mysqlAccountReady: boolean;
  databaseUrlConfigured: boolean;
}): AccountStackStatus {
  if (opts.mysqlAccountReady) return "mysql_account_ready";
  if (opts.serviceRoleReady) return "ready";
  if (opts.supabaseReady) return "auth_without_service_role";
  if (opts.mysqlConfigured) return "mysql_needs_account_schema";
  if (opts.databaseUrlConfigured) return "database_url_only";
  return "unset";
}

/** 运维/教师端共用：根据探测结果生成说明（不含密钥与主机猜测） */
export function accountStackStatusMessage(status: AccountStackStatus): string {
  switch (status) {
    case "mysql_account_ready":
      return "本机账号服务已就绪，可登录并管理师生。";
    case "ready":
      return "云端账号服务已就绪。";
    case "auth_without_service_role":
      return "已可登录，但云端师生名册尚不可用。可在配库页补全服务端密钥，或改用本机账号服务。";
    case "mysql_needs_account_schema":
      return "本机已连接，但账号服务尚未就绪。请前往配库完成建表。";
    case "database_url_only":
      return "已配置云端连接。请前往配库完成建表，或改用本机账号服务。";
    case "unset":
      return "尚未配置账号服务。请前往配库完成本机或云端设置。";
  }
}

/** 教师建号开关：默认开启，MPG_TEACHER_CAN_CREATE_STUDENT=0 时关闭 */
export function teacherCanCreateStudent(): boolean {
  return process.env.MPG_TEACHER_CAN_CREATE_STUDENT?.trim() !== "0";
}
