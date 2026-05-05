/**
 * MySQL 连接密码本地加密（AES-256-GCM）。
 *
 * 密钥来源（依次）：
 * 1. 环境变量 MYSQL_PASSWORD_ENC_KEY（openssl rand -base64 32），便于与运维密钥统一管理；
 * 2. 否则使用本机文件 data/mysql-password-master.key（首次保存连接时自动生成，已 gitignore）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveProjectRoot } from "@/lib/projectRoot.server";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function masterKeyPath(): string {
  return path.join(resolveProjectRoot(), "data", "mysql-password-master.key");
}

function decodeKeyFromEnv(): Buffer | null {
  const b64 = process.env.MYSQL_PASSWORD_ENC_KEY?.trim();
  if (!b64) return null;
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_LENGTH) return null;
  return key;
}

/** 优先环境变量，否则创建或读取本机 master 文件 */
export function getEncryptionKey(): Buffer {
  const fromEnv = decodeKeyFromEnv();
  if (fromEnv) return fromEnv;

  const rawEnv = process.env.MYSQL_PASSWORD_ENC_KEY?.trim();
  if (rawEnv) {
    const key = Buffer.from(rawEnv, "base64");
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `MYSQL_PASSWORD_ENC_KEY 解码后须为 ${KEY_LENGTH} 字节。请执行 openssl rand -base64 32 重新生成。`,
      );
    }
  }

  mkdirSync(path.dirname(masterKeyPath()), { recursive: true });
  if (existsSync(masterKeyPath())) {
    const line = readFileSync(masterKeyPath(), "utf8").trim().split(/\s+/)[0];
    if (!line) {
      throw new Error(
        "本机密钥文件为空，请删除 data/mysql-password-master.key 后重新保存连接。",
      );
    }
    const key = Buffer.from(line, "base64");
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        "本机密钥文件格式无效，请删除 data/mysql-password-master.key 后重新保存连接。",
      );
    }
    return key;
  }

  const key = randomBytes(KEY_LENGTH);
  writeFileSync(masterKeyPath(), `${key.toString("base64")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return key;
}

/** 用于设置页展示：密钥来自环境变量 / 本机文件 / 尚未生成（首次保存后会有文件） */
export function getMysqlEncryptionKeySource(): "env" | "local-file" | "will-create" {
  if (decodeKeyFromEnv()) return "env";
  if (existsSync(masterKeyPath())) return "local-file";
  return "will-create";
}

export function encryptMysqlPassword(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptMysqlPassword(blob: string): string {
  const key = getEncryptionKey();
  const parts = blob.split(":");
  if (parts.length !== 3) {
    throw new Error("密文格式无效");
  }
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const data = Buffer.from(parts[2], "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
