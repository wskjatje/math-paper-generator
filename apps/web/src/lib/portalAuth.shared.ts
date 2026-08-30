import type { UserRole } from "@/lib/types";

export type PortalId = "teacher" | "student" | "admin";

export type PortalGate =
  | { state: "loading" }
  | { state: "ok" }
  | { state: "need_login" }
  | { state: "wrong_role"; actual: UserRole | null }
  | { state: "auth_disabled" };

export type PortalAuthSnapshot = {
  loading: boolean;
  supabaseAuthEnabled: boolean;
  accessToken: string | null;
  role: UserRole | null;
  mode: "supabase" | "mysql" | null;
};

/** 门户闸门：须真实登录；禁止未认证角色旁路 */
export function evaluatePortalGate(auth: PortalAuthSnapshot, portal: PortalId): PortalGate {
  if (auth.loading) return { state: "loading" };
  if (!auth.supabaseAuthEnabled) return { state: "auth_disabled" };
  if (!auth.accessToken) return { state: "need_login" };
  if (auth.role !== portal) return { state: "wrong_role", actual: auth.role };
  return { state: "ok" };
}

export function portalLoginPath(portal: PortalId): "/login/teacher" | "/login/student" | "/login/admin" {
  if (portal === "teacher") return "/login/teacher";
  if (portal === "student") return "/login/student";
  return "/login/admin";
}

export function portalHomePath(portal: PortalId): "/teacher" | "/student" | "/admin" {
  if (portal === "teacher") return "/teacher";
  if (portal === "student") return "/student";
  return "/admin";
}

export function portalLabel(portal: PortalId): string {
  if (portal === "teacher") return "课堂";
  if (portal === "student") return "作业";
  return "运维端";
}
