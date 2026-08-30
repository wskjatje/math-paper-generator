/**
 * 登录账号标识归一化（邮箱 / 手机 / 学号 / 工号）。
 * 不硬编码具体学校号段或号码样例。
 */

export type LoginIdentifierKind = "email" | "phone" | "student_no" | "employee_no" | "unknown";

export type NormalizedLoginIdentifier =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "code"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 去掉空白与常见分隔符后的数字串；保留开头的 + */
export function normalizePhoneDigits(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const plus = t.startsWith("+") ? "+" : "";
  const digits = t.replace(/[^\d]/g, "");
  return plus + digits;
}

export function looksLikeEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

/** 手机号启发式：仅含数字与常见分隔符，归一化后 7–15 位数字（可带国家码 +） */
export function looksLikePhone(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  // 含字母等则不是手机号（避免学号/工号被抽数字误判）
  if (!/^\+?[\d\s\-()]+$/.test(t)) return false;
  const n = normalizePhoneDigits(t);
  const digits = n.startsWith("+") ? n.slice(1) : n;
  return /^\d{7,15}$/.test(digits);
}

/**
 * 将用户输入归类为邮箱 / 手机 / 学号或工号码。
 * 学号与工号形态重叠，查找时由服务端按列依次匹配。
 */
export function normalizeLoginIdentifier(raw: string): NormalizedLoginIdentifier | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (looksLikeEmail(trimmed)) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  if (looksLikePhone(trimmed)) {
    return { kind: "phone", value: normalizePhoneDigits(trimmed) };
  }
  // 学号 / 工号：非空、去首尾空白，不做学校规则臆测
  return { kind: "code", value: trimmed };
}

export function loginIdentifierKindLabel(kind: LoginIdentifierKind): string {
  if (kind === "email") return "邮箱";
  if (kind === "phone") return "手机号";
  if (kind === "student_no") return "学生号";
  if (kind === "employee_no") return "工号";
  return "账号";
}

/**
 * 无真实邮箱时的本地凭据载体（RFC 2606 `.invalid`，不可投递）。
 * 仅作存储/唯一键；登录仍用 student_no / 手机号等标识，不臆造学校域名。
 */
export function localLoginCarrierEmail(loginCode: string): string {
  const raw = loginCode.trim().toLowerCase();
  if (!raw) throw new Error("登录用户名不能为空");
  const local = raw.replace(/[^a-z0-9._+-]/g, "_").replace(/^\.+|\.+$/g, "") || "user";
  return `${local}@users.invalid`;
}
