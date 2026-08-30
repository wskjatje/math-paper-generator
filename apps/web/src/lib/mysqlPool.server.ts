/**
 * 本机 MySQL 共用连接池（跨 HMR 挂在 globalThis，避免热更新泄漏连接打满 max_connections）。
 * 账号 / 会话 / 试卷等热路径须走此池，禁止每次 createConnection。
 */
import { createPool, type Pool } from "mysql2/promise";
import { loadMysqlConnection, type MysqlConnectionForm } from "@/lib/mysqlConnection.server";

type PoolCache = { key: string; pool: Pool };

const g = globalThis as typeof globalThis & {
  __mpgMysqlPoolCache?: PoolCache | null;
};

function poolKey(c: MysqlConnectionForm): string {
  return `${c.host}:${c.port}:${c.user}:${c.database}:${c.password ? String(c.password.length) : "0"}`;
}

function resolveConnectionLimit(): number {
  const raw = process.env.MPG_MYSQL_POOL_LIMIT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 5;
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(n, 16);
}

/** 修改配库凭证后调用，关闭旧池 */
export function invalidateMysqlPoolCache(): void {
  const cache = g.__mpgMysqlPoolCache ?? null;
  g.__mpgMysqlPoolCache = null;
  if (cache?.pool) {
    void cache.pool.end().catch(() => {
      /* ignore */
    });
  }
}

/** 当前池缓存键（供各 store 的「已 ensure 列」去重） */
export function getMysqlPoolCacheKey(): string | null {
  return g.__mpgMysqlPoolCache?.key ?? null;
}

export async function getMysqlPool(): Promise<Pool | null> {
  const c = await loadMysqlConnection();
  if (!c) return null;
  const k = poolKey(c);
  const existing = g.__mpgMysqlPoolCache ?? null;
  if (existing?.key === k) return existing.pool;
  if (existing?.pool) {
    void existing.pool.end().catch(() => {
      /* ignore */
    });
    g.__mpgMysqlPoolCache = null;
  }
  const pool = createPool({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    waitForConnections: true,
    connectionLimit: resolveConnectionLimit(),
    maxIdle: 2,
    idleTimeout: 60_000,
    enableKeepAlive: true,
  });
  g.__mpgMysqlPoolCache = { key: k, pool };
  return pool;
}

export async function withMysqlPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = await getMysqlPool();
  if (!pool) {
    throw new Error("尚未保存本机数据库连接。请先在配库页填写并保存。");
  }
  return fn(pool);
}

export function isMysqlTooManyConnectionsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "ER_CON_COUNT_ERROR" ||
    /Too many connections/i.test(msg) ||
    /ER_CON_COUNT_ERROR/i.test(msg)
  );
}
