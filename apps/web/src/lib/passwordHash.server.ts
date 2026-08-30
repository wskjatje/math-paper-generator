/**
 * 本机账号密码哈希（仅服务端）。bcrypt 加盐，禁止明文落库。
 */
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  const t = plain.trim();
  if (t.length < 5) throw new Error("密码至少 5 位");
  if (t.length > 200) throw new Error("密码过长");
  return bcrypt.hash(t, ROUNDS);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  if (!passwordHash || !plain) return false;
  try {
    return await bcrypt.compare(plain, passwordHash);
  } catch {
    return false;
  }
}
