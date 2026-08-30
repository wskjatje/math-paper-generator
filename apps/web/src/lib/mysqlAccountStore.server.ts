/**
 * 本机 MySQL 账号表探测与读写（仅服务端）。
 * 连接来自已保存的 mysql-connection（无硬编码主机）。
 *
 * 注：`local_accounts` / `local_sessions` 不在 `sql/mysql/zhixue_schema.sql`；
 * 表须已由配库建表脚本创建。讲解能力档列由本模块启动/ensure 幂等 ADD COLUMN（忽略 1060）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { normalizeExplainAbilityBandIdOrNull } from "@/config/explainVideo";
import { loadMysqlConnection } from "@/lib/mysqlConnection.server";
import {
  getMysqlPool,
  getMysqlPoolCacheKey,
  isMysqlTooManyConnectionsError,
  withMysqlPool,
} from "@/lib/mysqlPool.server";
import { hashPassword, verifyPassword } from "@/lib/passwordHash.server";
import { normalizeProfileRoles } from "@/lib/activeRoleStorage";
import { normalizeLoginIdentifier } from "@/lib/loginIdentifier.shared";
import type { UserRole } from "@/lib/types";
import type { AccountStatus, AuthContext, ProfileSnapshot } from "@/lib/auth.shared";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** 与池对齐：旧库缺列时首轮读写前自动 ADD COLUMN */
let ensuredExplainAbilityBandColumnForPool: string | null = null;

async function ensureExplainAbilityBandColumn(db: Pool): Promise<void> {
  const k = getMysqlPoolCacheKey() ?? "";
  if (k && ensuredExplainAbilityBandColumnForPool === k) return;
  try {
    await db.query(
      `ALTER TABLE local_accounts
       ADD COLUMN explain_ability_band_id VARCHAR(32) NULL
       COMMENT '讲解能力档 id（EXPLAIN_VIDEO.abilityBands）'`,
    );
  } catch (e: unknown) {
    const errno =
      e && typeof e === "object" && "errno" in e
        ? Number((e as { errno: number }).errno)
        : 0;
    if (errno !== 1060) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Duplicate column name|Duplicate column/i.test(msg)) throw e;
    }
  }
  if (k) ensuredExplainAbilityBandColumnForPool = k;
}

async function withConn<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  return withMysqlPool(async (db) => {
    await ensureExplainAbilityBandColumn(db);
    return fn(db);
  });
}

/** 账号表是否已建（local_accounts + local_sessions） */
export async function probeMysqlAccountSchemaReady(): Promise<{
  mysqlConfigured: boolean;
  accountSchemaReady: boolean;
  detail: string | null;
}> {
  const c = await loadMysqlConnection();
  if (!c) {
    return {
      mysqlConfigured: false,
      accountSchemaReady: false,
      detail: null,
    };
  }
  try {
    const pool = await getMysqlPool();
    if (!pool) {
      return {
        mysqlConfigured: false,
        accountSchemaReady: false,
        detail: null,
      };
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('local_accounts', 'local_sessions')`,
      [c.database],
    );
    const names = new Set(rows.map((r) => String(r.t)));
    const ok = names.has("local_accounts") && names.has("local_sessions");
    return {
      mysqlConfigured: true,
      accountSchemaReady: ok,
      detail: ok
        ? null
        : "本机已连接，但账号服务尚未就绪。请在配库页完成建表。",
    };
  } catch (e: unknown) {
    if (isMysqlTooManyConnectionsError(e)) {
      return {
        mysqlConfigured: true,
        accountSchemaReady: false,
        detail:
          "数据库连接数已满。请重启开发服务（或结束多余 MySQL 连接）后重试，勿反复刷新。",
      };
    }
    return {
      mysqlConfigured: true,
      accountSchemaReady: false,
      detail: "无法检查本机账号服务，请核对配库页中的连接后重试。",
    };
  }
}

type AccountRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  primary_role: string | null;
  roles: unknown;
  status: string;
  login_phone: string | null;
  student_no: string | null;
  employee_no: string | null;
  grade_id: string | null;
  explain_ability_band_id: string | null;
};

function parseRoles(raw: unknown, primary: string | null): UserRole[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  return normalizeProfileRoles(primary, arr);
}

function rowToProfile(row: AccountRow): ProfileSnapshot {
  const roles = parseRoles(row.roles, row.primary_role);
  const role =
    row.primary_role === "teacher" ||
    row.primary_role === "student" ||
    row.primary_role === "admin"
      ? row.primary_role
      : (roles[0] ?? null);
  return {
    role,
    roles,
    display_name: row.display_name,
    status: row.status === "disabled" ? "disabled" : "active",
    grade_id: row.grade_id,
    explain_ability_band_id: row.explain_ability_band_id ?? null,
  };
}

async function findAccountByEmail(db: Pool, email: string): Promise<AccountRow | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, email, password_hash, display_name, primary_role, roles, status,
            login_phone, student_no, employee_no, grade_id, explain_ability_band_id
     FROM local_accounts WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  return (rows[0] as AccountRow | undefined) ?? null;
}

async function findAccountByIdentifier(db: Pool, identifier: string): Promise<AccountRow | null> {
  const norm = normalizeLoginIdentifier(identifier);
  if (!norm) return null;
  if (norm.kind === "email") return findAccountByEmail(db, norm.value);

  const col =
    norm.kind === "phone" ? "login_phone" : "student_no"; /* employee also via student_no then employee_no */
  if (norm.kind === "phone") {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, email, password_hash, display_name, primary_role, roles, status,
              login_phone, student_no, employee_no, grade_id, explain_ability_band_id
       FROM local_accounts WHERE login_phone = ? LIMIT 1`,
      [norm.value],
    );
    return (rows[0] as AccountRow | undefined) ?? null;
  }

  const [byStudent] = await db.query<RowDataPacket[]>(
    `SELECT id, email, password_hash, display_name, primary_role, roles, status,
            login_phone, student_no, employee_no, grade_id, explain_ability_band_id
     FROM local_accounts WHERE student_no = ? LIMIT 1`,
    [norm.value],
  );
  if (byStudent[0]) return byStudent[0] as AccountRow;

  const [byEmp] = await db.query<RowDataPacket[]>(
    `SELECT id, email, password_hash, display_name, primary_role, roles, status,
            login_phone, student_no, employee_no, grade_id, explain_ability_band_id
     FROM local_accounts WHERE employee_no = ? LIMIT 1`,
    [norm.value],
  );
  return (byEmp[0] as AccountRow | undefined) ?? null;
}

export async function countLocalAccounts(): Promise<number> {
  return withConn(async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM local_accounts`);
    return Number(rows[0]?.c ?? 0);
  });
}

export type LocalAccountListRow = {
  id: string;
  email: string;
  role: UserRole | null;
  roles: UserRole[];
  displayName: string | null;
  gradeId: string | null;
  explainAbilityBandId: string | null;
  status: "active" | "disabled";
  createdAt: string | null;
};

export async function listLocalAccounts(opts: {
  page: number;
  pageSize: number;
  role?: "all" | UserRole;
  status?: "all" | "active" | "disabled";
  search?: string | null;
}): Promise<{ profiles: LocalAccountListRow[]; total: number }> {
  return withConn(async (db) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.role && opts.role !== "all") {
      where.push(`JSON_CONTAINS(roles, CAST(? AS JSON))`);
      params.push(JSON.stringify(opts.role));
    }
    if (opts.status && opts.status !== "all") {
      where.push(`status = ?`);
      params.push(opts.status);
    }
    const search = opts.search?.trim();
    if (search) {
      where.push(`(display_name LIKE ? OR email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM local_accounts ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.c ?? 0);
    const offset = Math.max(0, (opts.page - 1) * opts.pageSize);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, email, display_name, primary_role, roles, status, grade_id,
              explain_ability_band_id, created_at
       FROM local_accounts ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, opts.pageSize, offset],
    );
    const profiles: LocalAccountListRow[] = rows.map((r) => {
      const roles = parseRoles(r.roles, r.primary_role as string | null);
      return {
        id: String(r.id),
        email: String(r.email),
        role: roles[0] ?? null,
        roles,
        displayName: (r.display_name as string | null) ?? null,
        gradeId: (r.grade_id as string | null) ?? null,
        explainAbilityBandId: (r.explain_ability_band_id as string | null) ?? null,
        status: r.status === "disabled" ? "disabled" : "active",
        createdAt: r.created_at ? String(r.created_at) : null,
      };
    });
    return { profiles, total };
  });
}

export type CreateLocalAccountInput = {
  email: string;
  password: string;
  displayName?: string | null;
  roles: UserRole[];
  loginPhone?: string | null;
  studentNo?: string | null;
  employeeNo?: string | null;
  gradeId?: string | null;
  explainAbilityBandId?: string | null;
};

export async function createLocalAccount(input: CreateLocalAccountInput): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("请填写有效邮箱（本机登录凭据载体）");
  const roles = input.roles.filter((r) => r === "teacher" || r === "student" || r === "admin");
  if (!roles.length) throw new Error("至少指定一个角色");
  const passwordHash = await hashPassword(input.password);
  const id = newId();
  const primary = roles.includes("admin")
    ? "admin"
    : roles.includes("teacher")
      ? "teacher"
      : "student";
  const explainBand = normalizeExplainAbilityBandIdOrNull(input.explainAbilityBandId);

  await withConn(async (db) => {
    await db.query(
      `INSERT INTO local_accounts
        (id, email, password_hash, display_name, primary_role, roles, status,
         login_phone, student_no, employee_no, grade_id, explain_ability_band_id)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 'active', ?, ?, ?, ?, ?)`,
      [
        id,
        email,
        passwordHash,
        input.displayName?.trim() || null,
        primary,
        JSON.stringify(roles),
        input.loginPhone?.trim() || null,
        input.studentNo?.trim() || null,
        input.employeeNo?.trim() || null,
        input.gradeId?.trim() || null,
        explainBand,
      ],
    );
  });
  return { id };
}

export async function authenticateLocalAccount(
  identifier: string,
  password: string,
): Promise<{ accountId: string; email: string; profile: ProfileSnapshot }> {
  const result = await tryAuthenticateLocalAccount(identifier, password);
  if (result === "bad_password" || !result) {
    throw new Error("账号或密码不正确");
  }
  return result;
}

/**
 * 本机认证尝试：未找到标识 → null（可回落云端）；密码错 → "bad_password"；成功 → 账号信息。
 */
export async function tryAuthenticateLocalAccount(
  identifier: string,
  password: string,
): Promise<
  | { accountId: string; email: string; profile: ProfileSnapshot }
  | "bad_password"
  | null
> {
  return withConn(async (db) => {
    const row = await findAccountByIdentifier(db, identifier);
    if (!row) return null;
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return "bad_password";
    const profile = rowToProfile(row);
    if (profile.status === "disabled") throw new Error("账号已停用，请联系管理员");
    return { accountId: row.id, email: row.email, profile };
  });
}

export async function loadLocalProfile(accountId: string): Promise<ProfileSnapshot | null> {
  return withConn(async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, email, password_hash, display_name, primary_role, roles, status,
              login_phone, student_no, employee_no, grade_id, explain_ability_band_id
       FROM local_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    const row = rows[0] as AccountRow | undefined;
    if (!row) return null;
    return rowToProfile(row);
  });
}

function primaryRoleFromRoles(roles: UserRole[], preferred?: UserRole | null): UserRole {
  if (preferred && roles.includes(preferred)) return preferred;
  if (roles.includes("admin")) return "admin";
  if (roles.includes("teacher")) return "teacher";
  return "student";
}

export type UpdateLocalAccountProfileInput = {
  id: string;
  displayName?: string | null;
  gradeId?: string | null;
  explainAbilityBandId?: string | null;
  status?: "active" | "disabled";
  roles?: UserRole[];
  primaryRole?: UserRole;
};

/** 运维修改本机账号档案（显示名 / 年级 / 讲解档 / 状态 / 身份） */
export async function updateLocalAccountProfile(
  input: UpdateLocalAccountProfileInput,
): Promise<ProfileSnapshot> {
  return withConn(async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, email, password_hash, display_name, primary_role, roles, status,
              login_phone, student_no, employee_no, grade_id, explain_ability_band_id
       FROM local_accounts WHERE id = ? LIMIT 1`,
      [input.id],
    );
    const row = rows[0] as AccountRow | undefined;
    if (!row) throw new Error("账号档案不存在");

    const existing = rowToProfile(row);
    const nextRoles =
      input.roles !== undefined
        ? input.roles.filter((r) => r === "teacher" || r === "student" || r === "admin")
        : existing.roles;
    if (!nextRoles.length) throw new Error("至少保留一个身份");
    const nextPrimary = primaryRoleFromRoles(
      nextRoles,
      input.primaryRole ?? existing.role,
    );
    if (!nextRoles.includes(nextPrimary)) {
      throw new Error("默认身份必须属于已选身份集合");
    }

    const nextDisplay =
      input.displayName !== undefined
        ? input.displayName?.trim() || null
        : existing.display_name;
    const nextGrade =
      input.gradeId !== undefined ? input.gradeId?.trim() || null : existing.grade_id;
    const nextExplainBand =
      input.explainAbilityBandId !== undefined
        ? normalizeExplainAbilityBandIdOrNull(input.explainAbilityBandId)
        : existing.explain_ability_band_id;
    const nextStatus =
      input.status !== undefined
        ? input.status === "disabled"
          ? "disabled"
          : "active"
        : existing.status;

    await db.query(
      `UPDATE local_accounts
       SET display_name = ?, grade_id = ?, explain_ability_band_id = ?,
           status = ?, primary_role = ?, roles = CAST(? AS JSON)
       WHERE id = ?`,
      [
        nextDisplay,
        nextGrade,
        nextExplainBand,
        nextStatus,
        nextPrimary,
        JSON.stringify(nextRoles),
        input.id,
      ],
    );

    return {
      ...existing,
      display_name: nextDisplay,
      grade_id: nextGrade,
      explain_ability_band_id: nextExplainBand,
      status: nextStatus,
      role: nextPrimary,
      roles: nextRoles,
    };
  });
}

/** 运维为本机账号设置新密码 */
export async function setLocalAccountPassword(
  accountId: string,
  plainPassword: string,
): Promise<void> {
  if (plainPassword.length < 8) throw new Error("密码至少 8 位");
  const passwordHash = await hashPassword(plainPassword);
  await withConn(async (db) => {
    const [check] = await db.query<RowDataPacket[]>(
      `SELECT id FROM local_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    if (!check[0]) throw new Error("账号档案不存在");
    await db.query(`UPDATE local_accounts SET password_hash = ? WHERE id = ?`, [
      passwordHash,
      accountId,
    ]);
  });
}

/** 校验本机账号当前密码 */
export async function verifyLocalAccountPassword(
  accountId: string,
  plainPassword: string,
): Promise<boolean> {
  return withConn(async (db) => {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT password_hash FROM local_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    const hash = rows[0]?.password_hash as string | undefined;
    if (!hash) return false;
    return verifyPassword(plainPassword, hash);
  });
}

export function authContextFromLocal(opts: {
  accountId: string;
  email: string;
  profile: ProfileSnapshot;
}): AuthContext {
  return {
    mode: "mysql",
    userId: opts.accountId,
    role: opts.profile.role,
    roles: opts.profile.roles,
    email: opts.email,
    displayName: opts.profile.display_name,
    status: opts.profile.status as AccountStatus,
    gradeId: opts.profile.grade_id,
    explainAbilityBandId: opts.profile.explain_ability_band_id,
  };
}
