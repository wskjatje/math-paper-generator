import type { UserRole } from "@/lib/types";

const STORAGE_KEY = "zhixue.activePortalRole.v1";

export function loadActiveRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "teacher" || raw === "student" || raw === "admin") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveActiveRole(role: UserRole | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!role) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function isUserRole(v: unknown): v is UserRole {
  return v === "teacher" || v === "student" || v === "admin";
}

/** 从档案字段解析身份列表（无硬编码业务账号） */
export function normalizeProfileRoles(role: unknown, roles: unknown): UserRole[] {
  const out: UserRole[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    if (!isUserRole(v) || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  if (Array.isArray(roles)) {
    for (const r of roles) push(r);
  }
  push(role);
  return out;
}

/** 在可选身份中解析当前展示身份 */
export function pickActiveRole(
  available: UserRole[],
  preferred: UserRole | null | undefined,
): UserRole | null {
  if (!available.length) return null;
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? null;
}
