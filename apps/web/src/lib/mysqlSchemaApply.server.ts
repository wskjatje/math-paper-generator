/**
 * 对本地 MySQL 执行 sql/mysql/zhixue_schema.sql
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection, type Connection } from "mysql2/promise";
import type { MysqlConnectionForm } from "@/lib/mysqlConnection.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

const SCHEMA_REL = path.join("sql", "mysql", "zhixue_schema.sql");

export async function readBundledMysqlSchemaSql(): Promise<string> {
  const p = path.join(resolveProjectRoot(), SCHEMA_REL);
  return readFile(p, "utf8");
}

function createOpts(c: MysqlConnectionForm) {
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    multipleStatements: true,
  } as const;
}

/** 仅测连到指定库 */
export async function testMysqlWithDatabase(c: MysqlConnectionForm): Promise<void> {
  const conn: Connection = await createConnection(createOpts(c));
  try {
    await conn.query("SELECT 1 AS ok");
  } finally {
    await conn.end();
  }
}

/**
 * 不指定 database，用于「创建库」前探测账号是否可用
 */
export async function testMysqlServerLogin(
  c: Pick<MysqlConnectionForm, "host" | "port" | "user" | "password">,
): Promise<void> {
  const conn: Connection = await createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });
  try {
    await conn.query("SELECT 1 AS ok");
  } finally {
    await conn.end();
  }
}

function escapeMysqlIdentifier(id: string): string {
  return "`" + id.replace(/`/g, "``") + "`";
}

/**
 * 在已连接服务器上创建库（若不存在）
 */
export async function ensureMysqlDatabase(
  c: Pick<MysqlConnectionForm, "host" | "port" | "user" | "password" | "database">,
): Promise<void> {
  const dbId = escapeMysqlIdentifier(c.database);
  const conn: Connection = await createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${dbId} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

export async function applyZhixueMysqlSchema(c: MysqlConnectionForm): Promise<void> {
  const sql = await readBundledMysqlSchemaSql();
  const conn: Connection = await createConnection(createOpts(c));
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}
