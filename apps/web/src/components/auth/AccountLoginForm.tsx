import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AccountSetupNotice } from "@/components/auth/AccountSetupNotice";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { USER_ROLE_LABELS } from "@/lib/userRoleStorage";
import {
  portalHomePath,
  portalLabel,
  type PortalId,
} from "@/lib/portalAuth.shared";
import type { UserRole } from "@/lib/types";

function isPortalId(r: UserRole): r is PortalId {
  return r === "teacher" || r === "student" || r === "admin";
}

type AccountLoginFormProps = {
  preferPortal?: PortalId;
};

/** 真实账号登录：邮箱 / 手机号 / 学生号 / 工号 + 密码 */
export function AccountLoginForm({ preferPortal }: AccountLoginFormProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickRoles, setPickRoles] = useState<UserRole[] | null>(null);

  const canSubmit = Boolean(
    !auth.loading && auth.supabaseAuthEnabled && auth.accountSchemaReady,
  );

  const goWithRole = (role: UserRole) => {
    if (!isPortalId(role)) return;
    auth.setActiveRole(role);
    toast.success(`已进入${portalLabel(role)}`);
    void navigate({ to: portalHomePath(role) });
  };

  const onSignIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!auth.supabaseAuthEnabled || !auth.accountSchemaReady) {
      toast.error("账号服务未就绪，请先完成配库");
      return;
    }
    if (!identifier.trim() || !password) {
      toast.error("请填写账号与密码");
      return;
    }
    setBusy(true);
    try {
      const session = await auth.signInWithPassword(identifier.trim(), password);
      const roles = session.roles ?? [];
      if (!roles.length) {
        await auth.signOut();
        toast.error("该账号未分配身份，请联系运维开通");
        return;
      }
      if (preferPortal && roles.includes(preferPortal)) {
        goWithRole(preferPortal);
        return;
      }
      if (roles.length === 1) {
        goWithRole(roles[0]!);
        return;
      }
      setPickRoles(roles);
      toast.success("登录成功，请选择当前身份");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  if (pickRoles) {
    return (
      <PageShell size="narrow" noVerticalPadding className="flex flex-1 items-center justify-center">
        <div className="w-full space-y-4 paper-card p-6 md:p-8">
          <div className="space-y-1 text-center">
            <h1 className="text-display text-2xl">选择身份</h1>
          </div>
          <ul className="space-y-2">
            {pickRoles.map((role) => (
              <li key={role}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start px-4 py-3"
                  onClick={() => goWithRole(role)}
                >
                  {USER_ROLE_LABELS[role]}
                  {isPortalId(role) ? ` · ${portalLabel(role)}` : ""}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell size="narrow" noVerticalPadding className="flex flex-1 items-center justify-center">
      <form
        onSubmit={(e) => void onSignIn(e)}
        className="w-full space-y-4 paper-card p-6 md:p-8"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-display text-2xl">登录</h1>
        </div>

        <AccountSetupNotice compact />

        <div className="space-y-2">
          <Label className="text-sm">账号</Label>
          <Input
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            placeholder="邮箱 / 手机号 / 学生号 / 工号"
            className="w-full"
            disabled={!canSubmit}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">密码</Label>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full"
            disabled={!canSubmit}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !canSubmit}>
          {busy ? "处理中…" : "登录"}
        </Button>
      </form>
    </PageShell>
  );
}
