/**
 * 空库种子运维账号（仅建表后、表为空时写入）。
 * 默认登录名/密码可用环境变量覆盖；禁止在其它业务代码散落字面量。
 */
import type { Connection, RowDataPacket } from "mysql2/promise";
import { hashPassword } from "@/lib/passwordHash.server";

const SEED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

export function localSeedAdminLogin(): string {
  const fromEnv = process.env.MPG_LOCAL_SEED_ADMIN_LOGIN?.trim();
  return fromEnv || "admin";
}

export function localSeedAdminPassword(): string {
  const fromEnv = process.env.MPG_LOCAL_SEED_ADMIN_PASSWORD?.trim();
  return fromEnv || "admin";
}

/** 满足邮箱列约束的载体；登录可用工号（种子登录名） */
export function localSeedAdminEmail(): string {
  const fromEnv = process.env.MPG_LOCAL_SEED_ADMIN_EMAIL?.trim();
  if (fromEnv) return fromEnv.toLowerCase();
  return `${localSeedAdminLogin().toLowerCase()}@localhost.local`;
}

/**
 * 仅当 local_accounts 为空时插入种子运维（admin+teacher+student）。
 * 密码 bcrypt 加盐，不落明文。
 */
export async function seedDefaultLocalAdminIfEmpty(db: Connection): Promise<{
  seeded: boolean;
  login: string;
}> {
  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM local_accounts`,
  );
  const count = Number(countRows[0]?.c ?? 0);
  if (count > 0) {
    return { seeded: false, login: localSeedAdminLogin() };
  }

  const login = localSeedAdminLogin();
  const password = localSeedAdminPassword();
  const email = localSeedAdminEmail();
  const passwordHash = await hashPassword(password);

  await db.query(
    `INSERT INTO local_accounts
      (id, email, password_hash, display_name, primary_role, roles, status, employee_no)
     VALUES (?, ?, ?, ?, 'admin', CAST(? AS JSON), 'active', ?)`,
    [
      SEED_ACCOUNT_ID,
      email,
      passwordHash,
      "管理员",
      JSON.stringify(["admin", "teacher", "student"]),
      login,
    ],
  );
  return { seeded: true, login };
}

/** 本机运维账号缺学生身份时补上（幂等；含已有种子与手工首个运维） */
export async function ensureSeedAdminHasStudentRole(db: Connection): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT id, roles FROM local_accounts`);
  let updated = 0;
  for (const row of rows) {
    let roles: string[] = [];
    try {
      const raw = row.roles;
      roles = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === "string"
          ? (JSON.parse(raw) as unknown[]).map(String)
          : [];
    } catch {
      roles = [];
    }
    if (!roles.includes("admin") || roles.includes("student")) continue;
    const next = [...roles, "student"];
    await db.query(`UPDATE local_accounts SET roles = CAST(? AS JSON) WHERE id = ?`, [
      JSON.stringify(next),
      row.id,
    ]);
    updated += 1;
  }
  return updated;
}

/** 已保存连接上：表就绪且空库时写入种子（幂等） */
export async function ensureDefaultLocalAdminSeed(): Promise<{
  seeded: boolean;
  login: string;
  skipped: boolean;
  reason?: string;
}> {
  const { loadMysqlConnection } = await import("@/lib/mysqlConnection.server");
  const { createConnection } = await import("mysql2/promise");
  const c = await loadMysqlConnection();
  if (!c) {
    return { seeded: false, login: localSeedAdminLogin(), skipped: true, reason: "no_conn" };
  }
  const db = await createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
  });
  try {
    const [tables] = await db.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('local_accounts', 'local_sessions')`,
      [c.database],
    );
    const names = new Set(tables.map((r) => String(r.t)));
    if (!names.has("local_accounts") || !names.has("local_sessions")) {
      return {
        seeded: false,
        login: localSeedAdminLogin(),
        skipped: true,
        reason: "schema_missing",
      };
    }
    const result = await seedDefaultLocalAdminIfEmpty(db);
    await ensureSeedAdminHasStudentRole(db);
    return { ...result, skipped: false };
  } finally {
    await db.end();
  }
}
