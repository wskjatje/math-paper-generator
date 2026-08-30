import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bootstrapLocalMysqlAdmin,
  getLocalMysqlBootstrapStatus,
} from "@/lib/auth.functions.server";

type LocalMysqlAdminBootstrapPanelProps = {
  onCreated?: () => void;
};

/**
 * 本机 MySQL 账号表就绪且尚无账号时，创建首个运维（admin+teacher+student）。
 * 不预填样例邮箱/密码。
 */
export function LocalMysqlAdminBootstrapPanel({ onCreated }: LocalMysqlAdminBootstrapPanelProps) {
  const statusFn = useServerFn(getLocalMysqlBootstrapStatus);
  const bootstrapFn = useServerFn(bootstrapLocalMysqlAdmin);

  const [ready, setReady] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [accountCount, setAccountCount] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await statusFn();
      setReady(s.accountSchemaReady);
      setCanBootstrap(s.canBootstrap);
      setAccountCount(s.accountCount);
      setDetail(s.detail);
    } catch (e) {
      setReady(false);
      setCanBootstrap(false);
      setDetail(e instanceof Error ? e.message : "无法探测本机账号");
    } finally {
      setLoading(false);
    }
  }, [statusFn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await bootstrapFn({
        data: {
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        },
      });
      toast.success("已创建首个本机运维账号，请前往登录");
      setPassword("");
      await reload();
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在检查本机账号…
      </p>
    );
  }

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground">
        {detail ?? "本机数据库尚未就绪"}
      </p>
    );
  }

  if (!canBootstrap) {
    return (
      <p className="text-sm text-muted-foreground">
        本机已有 {accountCount} 个账号。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-sm">邮箱</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">密码</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="pr-10 font-mono text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-1 top-1/2 z-10 h-8 w-8 -translate-y-1/2"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">显示名</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            placeholder="显示名"
            className="text-sm"
          />
        </div>
      </div>
      <Button
        type="button"
        disabled={busy || !email.trim() || password.length < 5}
        onClick={() => void handleCreate()}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
        创建首个本机运维账号
      </Button>
    </div>
  );
}
