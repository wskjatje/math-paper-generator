/**
 * 本机 MySQL 连接信息（仅服务端；写入 data/mysql-connection.json，已加入 .gitignore）
 * 密码一律以 AES-256-GCM 密文保存（passwordEnc）；密钥来自 MYSQL_PASSWORD_ENC_KEY 或首次保存时生成的 data/mysql-password-master.key。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  decryptMysqlPassword,
  encryptMysqlPassword,
  getMysqlEncryptionKeySource,
} from "@/lib/mysqlPasswordCrypto.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export type MysqlConnectionForm = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function mysqlConfigPath(): string {
  return path.join(resolveProjectRoot(), "data", "mysql-connection.json");
}

async function readConfigRaw(): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(mysqlConfigPath(), "utf8");
    const j = JSON.parse(raw) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function loadMysqlConnection(): Promise<MysqlConnectionForm | null> {
  const o = await readConfigRaw();
  if (!o) return null;
  const host = typeof o.host === "string" ? o.host : "";
  const user = typeof o.user === "string" ? o.user : "";
  const database = typeof o.database === "string" ? o.database : "";
  const port = typeof o.port === "number" && Number.isFinite(o.port) ? o.port : 3306;

  let password = "";
  if (typeof o.passwordEnc === "string" && o.passwordEnc.length > 0) {
    password = decryptMysqlPassword(o.passwordEnc);
  } else if (typeof o.password === "string") {
    password = o.password;
  }

  if (!host || !user || !database) return null;
  return { host, port, user, password, database };
}

export async function saveMysqlConnection(c: MysqlConnectionForm): Promise<void> {
  await mkdir(path.dirname(mysqlConfigPath()), { recursive: true });

  const payload: Record<string, unknown> = {
    host: c.host.trim(),
    port: c.port,
    user: c.user.trim(),
    database: c.database.trim(),
  };

  if (c.password) {
    payload.passwordEnc = encryptMysqlPassword(c.password);
  } else {
    const prev = await readConfigRaw();
    if (prev && typeof prev.passwordEnc === "string" && prev.passwordEnc.length > 0) {
      payload.passwordEnc = prev.passwordEnc;
    } else if (prev && typeof prev.password === "string" && prev.password.length > 0) {
      payload.passwordEnc = encryptMysqlPassword(prev.password);
    }
  }

  await writeFile(mysqlConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export type MysqlUiState = {
  configured: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  database: string | null;
  passwordSaved: boolean;
  /** 文件中是否为密文 passwordEnc */
  passwordStoredEncrypted: boolean;
  /** 加密密钥来源：环境变量 / 本机文件 / 尚未生成（首次保存连接后会生成本机密钥文件） */
  encryptionKeySource: "env" | "local-file" | "will-create";
};

export async function getMysqlUiState(): Promise<MysqlUiState> {
  const raw = await readConfigRaw();
  const keySource = getMysqlEncryptionKeySource();

  if (!raw) {
    return {
      configured: false,
      host: null,
      port: null,
      user: null,
      database: null,
      passwordSaved: false,
      passwordStoredEncrypted: false,
      encryptionKeySource: keySource,
    };
  }

  const host = typeof raw.host === "string" ? raw.host : "";
  const user = typeof raw.user === "string" ? raw.user : "";
  const database = typeof raw.database === "string" ? raw.database : "";
  const port = typeof raw.port === "number" && Number.isFinite(raw.port) ? raw.port : 3306;
  const hasEnc =
    typeof raw.passwordEnc === "string" && (raw.passwordEnc as string).length > 0;
  const hasPlain =
    typeof raw.password === "string" && (raw.password as string).length > 0;

  return {
    configured: !!(host && user && database),
    host: host || null,
    port,
    user: user || null,
    database: database || null,
    passwordSaved: hasEnc || hasPlain,
    passwordStoredEncrypted: hasEnc,
    encryptionKeySource: keySource,
  };
}
