/**
 * 将服务端/模型技术错误映射为教师可见的白话说明。
 * 规则表见 exam-domain.json → userFacingErrors（禁止在业务里硬编码文案）。
 */
import { USER_FACING_ERRORS } from "@/config/examDomain";

export function toUserFacingErrorMessage(
  raw: unknown,
  fallback = USER_FACING_ERRORS.fallback,
): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  const t = msg.trim();
  if (!t) return fallback;

  for (const rule of USER_FACING_ERRORS.rules ?? []) {
    const src = String(rule.match ?? "").trim();
    const text = String(rule.message ?? "").trim();
    if (!src || !text) continue;
    try {
      if (new RegExp(src, "i").test(t)) return text;
    } catch {
      /* 跳过非法正则 */
    }
  }

  const devPat = String(USER_FACING_ERRORS.devTracePattern ?? "").trim();
  if (devPat) {
    try {
      if (new RegExp(devPat, "i").test(t)) {
        return USER_FACING_ERRORS.devTraceFallback || fallback;
      }
    } catch {
      /* ignore */
    }
  }

  const maxLen = Number(USER_FACING_ERRORS.maxRawLength) || 180;
  if (t.length > maxLen) return `${t.slice(0, Math.max(40, maxLen - 20))}…`;
  return t;
}
