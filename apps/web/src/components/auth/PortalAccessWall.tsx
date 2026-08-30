import { Link, useNavigate } from "@tanstack/react-router";
import { AccountSetupNotice } from "@/components/auth/AccountSetupNotice";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  evaluatePortalGate,
  portalHomePath,
  portalLabel,
  type PortalId,
  type PortalAuthSnapshot,
} from "@/lib/portalAuth.shared";

export function PortalAccessWall({
  auth,
  portal,
}: {
  auth: PortalAuthSnapshot & { roles?: readonly string[] };
  portal: PortalId;
}) {
  const fullAuth = useAuth();
  const navigate = useNavigate();
  const gate = evaluatePortalGate(auth, portal);
  const label = portalLabel(portal);
  const canSwitch =
    gate.state === "wrong_role" && Array.isArray(auth.roles) && auth.roles.includes(portal);

  if (gate.state === "loading") {
    return (
      <PageShell size="narrow">
        <p className="mt-12 text-sm text-muted-foreground">正在校验登录状态…</p>
      </PageShell>
    );
  }

  if (gate.state === "auth_disabled") {
    return (
      <PageShell size="narrow">
        <PageHeader title={label} />
        <div className="paper-card space-y-3 p-6">
          <AccountSetupNotice />
          <div className="flex flex-wrap gap-2">
            <Button type="button" asChild>
              <Link to="/login">前往登录</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  if (gate.state === "wrong_role") {
    return (
      <PageShell size="narrow">
        <PageHeader title={label} />
        <div className="paper-card space-y-3 p-6">
          <p className="text-sm text-muted-foreground">
            当前身份「{gate.actual ?? "未设置"}」无法进入{label}。
          </p>
          {canSwitch ? (
            <Button
              type="button"
              onClick={() => {
                fullAuth.setActiveRole(portal);
                void navigate({ to: portalHomePath(portal) });
              }}
            >
              切换为{label}身份
            </Button>
          ) : (
            <Button type="button" asChild>
              <Link to="/login">返回登录</Link>
            </Button>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell size="narrow">
      <PageHeader title={label} />
      <div className="paper-card p-6">
        <Button type="button" asChild>
          <Link to="/login">前往登录</Link>
        </Button>
      </div>
    </PageShell>
  );
}

export function usePortalAllowed(auth: PortalAuthSnapshot, portal: PortalId): boolean {
  return evaluatePortalGate(auth, portal).state === "ok";
}
