/**
 * 本机会话：opaque token + SHA-256 哈希入库；密钥来自环境或本机文件（无仓库默认密钥）。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "@/lib/mysqlPool.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import {
  authContextFromLocal,
  loadLocalProfile,
} from "@/lib/mysqlAccountStore.server";
import type { AuthContext } from "@/lib/auth.shared";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 天

function masterKeyPath(): string {
  return path.join(resolveProjectRoot(), "data", "local-session-master.key");
}

/** 会话 HMAC/混淆用材料；未配置时生成本机文件（与 MySQL 密码主密钥同模式） */
export function resolveLocalSessionPepper(): string {
  const fromEnv = process.env.MPG_LOCAL_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const p = masterKeyPath();
  if (existsSync(p)) {
    return readFileSync(p, "utf8").trim().split(/\s+/)[0] ?? "";
  }
  mkdirSync(path.dirname(p), { recursive: true });
  const key = randomBytes(32).toString("base64url");
  writeFileSync(p, `${key}\n`, { encoding: "utf8", mode: 0o600 });
  return key;
}

function hashToken(rawToken: string): string {
  const pepper = resolveLocalSessionPepper();
  return createHash("sha256").update(`${pepper}:${rawToken}`).digest("hex");
}

export async function createLocalSession(accountId: string): Promise<{
  accessToken: string;
  expiresAtIso: string;
}> {
  const pool = await getMysqlPool();
  if (!pool) throw new Error("尚未保存本机 MySQL 连接");
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const id = randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO local_sessions (id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [id, accountId, tokenHash, expires],
  );
  return { accessToken: `mpg_local.${rawToken}`, expiresAtIso: expires.toISOString() };
}

export async function revokeLocalSession(accessToken: string): Promise<void> {
  const raw = accessToken.startsWith("mpg_local.")
    ? accessToken.slice("mpg_local.".length)
    : accessToken;
  const tokenHash = hashToken(raw);
  const pool = await getMysqlPool();
  if (!pool) return;
  await pool.query(`DELETE FROM local_sessions WHERE token_hash = ?`, [tokenHash]);
}

/** 停用账号时清掉该账号全部本机会话 */
export async function revokeAllLocalSessionsForAccount(accountId: string): Promise<void> {
  const pool = await getMysqlPool();
  if (!pool) return;
  await pool.query(`DELETE FROM local_sessions WHERE account_id = ?`, [accountId]);
}

export async function resolveAuthContextFromLocalToken(
  accessToken: string,
): Promise<AuthContext | null> {
  if (!accessToken.startsWith("mpg_local.")) return null;
  const raw = accessToken.slice("mpg_local.".length);
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const pool = await getMysqlPool();
  if (!pool) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.account_id AS account_id, a.email AS email
       FROM local_sessions s
       INNER JOIN local_accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
       LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0] as { account_id: string; email: string } | undefined;
  if (!row) return null;
  const profile = await loadLocalProfile(row.account_id);
  if (!profile) return null;
  if (profile.status === "disabled") return null;
  return authContextFromLocal({
    accountId: row.account_id,
    email: row.email,
    profile,
  });
}
