import type { UserRole } from "@/lib/types";

const ROLE_KEY = "zhixue.userRole.v1";

export function loadUserRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw === "teacher" || raw === "student") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveUserRole(role: UserRole): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function clearUserRole(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};
