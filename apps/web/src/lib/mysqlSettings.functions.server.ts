import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getMysqlUiState,
  loadMysqlConnection,
  saveMysqlConnection,
  type MysqlConnectionForm,
} from "@/lib/mysqlConnection.server";
import {
  applyZhixueMysqlSchema,
  ensureMysqlDatabase,
  readBundledMysqlSchemaSql,
  testMysqlServerLogin,
  testMysqlWithDatabase,
} from "@/lib/mysqlSchemaApply.server";

const MysqlConnSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(3306),
  user: z.string().min(1).max(128),
  password: z.string().max(500).default(""),
  database: z.string().min(1).max(64),
});

function formatMysqlTestFailure(
  e: unknown,
  database: string,
  endpoint?: { host?: string; port?: number },
): string {
  const err = e as { code?: string; errno?: number; message?: string };
  const errno = err.errno;
  const code = err.code;
  const msg = e instanceof Error ? e.message : String(e);
  if (errno === 1049 || code === "ER_BAD_DB_ERROR") {
    return `数据库「${database}」尚不存在。请先点击「创建数据库（IF NOT EXISTS）」，成功后再点「测试连接」。`;
  }
  if (errno === 1045 || code === "ER_ACCESS_DENIED_ERROR") {
    return `账号或密码被拒绝（Access denied）。请核对 root 密码，或在设置页密码框点「眼睛」显示明文；也可用终端 mysql -u root -p 验证能登录。`;
  }
  if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
    const host = endpoint?.host ?? "127.0.0.1";
    const port = endpoint?.port ?? 3306;
    return `无法连接 ${host}:${port}（连接被拒绝）。若通过 Docker 网关访问（浏览器为 localhost:8090），请将「主机」改为 host.docker.internal，不要用 127.0.0.1——容器内的 127.0.0.1 不是 Mac 上的 MySQL。若直接访问本机开发服务（如 :8080），可用 127.0.0.1。请确认本机 mysqld 已启动。`;
  }
  return msg;
}

/** 设置页：当前是否已写入本机 mysql-connection.json（不回传密码） */
export const getMysqlSettingsUiState = createServerFn({ method: "GET" }).handler(async () =>
  getMysqlUiState(),
);

/** 保存连接信息到服务端 data/mysql-connection.json（勿提交到 Git）。密码留空则沿用上次保存的密码。 */
export const saveMysqlConnectionSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MysqlConnSchema.parse(data))
  .handler(async ({ data }) => {
    let d = data as MysqlConnectionForm;
    if (!d.password) {
      const prev = await loadMysqlConnection();
      if (prev) d = { ...d, password: prev.password };
    }
    await saveMysqlConnection(d);
    return { ok: true as const };
  });

/** 使用表单参数测试连接（须数据库已存在） */
export const testMysqlConnectionFromForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MysqlConnSchema.parse(data))
  .handler(async ({ data }) => {
    let d = data as MysqlConnectionForm;
    if (!d.password) {
      const prev = await loadMysqlConnection();
      if (prev) d = { ...d, password: prev.password };
    }
    try {
      await testMysqlWithDatabase(d);
      return { ok: true as const };
    } catch (e: unknown) {
      throw new Error(
        `连接失败：${formatMysqlTestFailure(e, d.database, { host: d.host, port: d.port })}`,
      );
    }
  });

/** 创建数据库（IF NOT EXISTS），不指定库连接服务器执行 */
export const createMysqlDatabaseFromForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => MysqlConnSchema.parse(data))
  .handler(async ({ data }) => {
    let d = data as MysqlConnectionForm;
    if (!d.password) {
      const prev = await loadMysqlConnection();
      if (prev) d = { ...d, password: prev.password };
    }
    try {
      await ensureMysqlDatabase(d);
      return { ok: true as const };
    } catch (e: unknown) {
      const err = e as { errno?: number; code?: string };
      if (err.errno === 1045 || err.code === "ER_ACCESS_DENIED_ERROR") {
        throw new Error(
          `创建数据库失败：账号或密码被拒绝。请核对密码（可在密码框显示明文），或用终端 mysql -u ${d.user} -p 验证。`,
        );
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`创建数据库失败：${msg}`);
    }
  });

/** 仅校验账号能否登录 MySQL（不选库） */
export const testMysqlServerLoginFromForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(3306),
        user: z.string().min(1),
        password: z.string().max(500).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      await testMysqlServerLogin(data);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`登录失败：${msg}`);
    }
  });

/** 读取 sql/mysql/zhixue_schema.sql 供复制 */
export const getMysqlBundledSchemaSql = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await readBundledMysqlSchemaSql();
  return { sql, path: "sql/mysql/zhixue_schema.sql" };
});

/** 对已保存的连接执行建表；若传入 connection 则优先使用表单（无需先保存） */
export const applyMysqlZhixueSchema = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ connection: MysqlConnSchema.optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    let conn = data.connection as MysqlConnectionForm | undefined;
    if (conn && !conn.password) {
      const prev = await loadMysqlConnection();
      if (prev) conn = { ...conn, password: prev.password };
    }
    conn = conn ?? (await loadMysqlConnection());
    if (!conn) {
      throw new Error("请先填写连接信息并保存到本机，或在请求中传入完整 connection。");
    }
    try {
      await applyZhixueMysqlSchema(conn);
      return { ok: true as const };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`执行建表脚本失败：${msg}`);
    }
  });
