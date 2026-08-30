import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AccountLoginForm } from "@/components/auth/AccountLoginForm";
import { useAuth } from "@/hooks/useAuth";
import { portalHomePath, type PortalId } from "@/lib/portalAuth.shared";

export const Route = createFileRoute("/login/")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "登录 · 知学" },
      { name: "description", content: "教师、学生、运维统一登录入口" },
    ],
  }),
});

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.loading) return;
    const loggedIn = Boolean(auth.accessToken);
    if (!loggedIn || !auth.role) return;
    if (auth.role === "teacher" || auth.role === "student" || auth.role === "admin") {
      void navigate({ to: portalHomePath(auth.role as PortalId) });
    }
  }, [auth.loading, auth.accessToken, auth.mode, auth.role, navigate]);

  return <AccountLoginForm />;
}
