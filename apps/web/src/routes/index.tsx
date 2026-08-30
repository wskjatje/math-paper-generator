import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AccountSetupNotice } from "@/components/auth/AccountSetupNotice";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/hooks/useAuth";
import { portalHomePath, type PortalId } from "@/lib/portalAuth.shared";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "知学 · 教师与学生在线学习系统" },
      {
        name: "description",
        content: "统一的运维、教师、学生端；运维管理账号与师生关系，教师布置试卷，学生按年级完成作业。",
      },
    ],
  }),
});

function isPortalId(r: string): r is PortalId {
  return r === "teacher" || r === "student" || r === "admin";
}

/**
 * 未确认已登录时始终展示落地页（含登录入口），避免 loading 卡住看不到「登录」。
 */
function LandingPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const loggedIn = Boolean(auth.accessToken);

  useEffect(() => {
    if (auth.loading) return;
    if (!loggedIn || !auth.role || !isPortalId(auth.role)) return;
    void navigate({ to: portalHomePath(auth.role), replace: true });
  }, [auth.loading, loggedIn, auth.role, navigate]);

  if (!auth.loading && loggedIn && auth.role && isPortalId(auth.role)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">正在进入工作区…</p>
      </div>
    );
  }

  return (
    <PageShell size="narrow" noVerticalPadding className="flex flex-1 items-center justify-center">
      <div className="space-y-8 py-10 text-center">
        <div className="space-y-3">
          <h1 className="text-display text-3xl tracking-tight sm:text-4xl">让教与学，更有秩序</h1>
        </div>
        <AccountSetupNotice />
      </div>
    </PageShell>
  );
}
