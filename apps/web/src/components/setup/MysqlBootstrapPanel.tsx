import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Database, Eye, EyeOff, Loader2, PlugZap, Save, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MysqlUiState } from "@/lib/mysqlConnection.server";
import {
  applyMysqlZhixueSchema,
  createMysqlDatabaseFromForm,
  getMysqlBundledSchemaSql,
  getMysqlSettingsUiState,
  saveMysqlConnectionSettings,
  testMysqlConnectionFromForm,
  testMysqlSavedConnection,
} from "@/lib/mysqlSettings.functions.server";

type MysqlBootstrapPanelProps = {
  initialUi?: MysqlUiState | null;
  onSaved?: () => void;
};

/**
 * 换机/首次部署用：本机 MySQL（无硬编码主机/用户/库名；仅用已保存值或空表单）。
 */
export function MysqlBootstrapPanel({ initialUi = null, onSaved }: MysqlBootstrapPanelProps) {
  const mysqlUiFn = useServerFn(getMysqlSettingsUiState);
  const saveMysqlFn = useServerFn(saveMysqlConnectionSettings);
  const testMysqlFn = useServerFn(testMysqlConnectionFromForm);
  const testSavedFn = useServerFn(testMysqlSavedConnection);
  const createMysqlDbFn = useServerFn(createMysqlDatabaseFromForm);
  const applyMysqlFn = useServerFn(applyMysqlZhixueSchema);
  const mysqlSqlFn = useServerFn(getMysqlBundledSchemaSql);

  const [mysqlUi, setMysqlUi] = useState<MysqlUiState | null>(initialUi);
  const [mysqlHost, setMysqlHost] = useState(initialUi?.host ?? "");
  const [mysqlPort, setMysqlPort] = useState(initialUi?.port != null ? String(initialUi.port) : "");
  const [mysqlUser, setMysqlUser] = useState(initialUi?.user ?? "");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [showMysqlPassword, setShowMysqlPassword] = useState(false);
  const [mysqlDatabase, setMysqlDatabase] = useState(initialUi?.database ?? "");
  const [mysqlBusy, setMysqlBusy] = useState<string | null>(null);
  const [mysqlBundledSql, setMysqlBundledSql] = useState<string | null>(null);
  const [lastProbe, setLastProbe] = useState<"ok" | "fail" | null>(null);

  const applyUi = (ms: MysqlUiState) => {
    setMysqlUi(ms);
    setMysqlHost(ms.host ?? "");
    setMysqlPort(ms.port != null ? String(ms.port) : "");
    setMysqlUser(ms.user ?? "");
    setMysqlDatabase(ms.database ?? "");
    setMysqlPassword("");
  };

  useEffect(() => {
    if (initialUi) {
      applyUi(initialUi);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ms = await mysqlUiFn();
        if (!cancelled) applyUi(ms);
      } catch {
        /* 空表单 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialUi, mysqlUiFn]);

  const payload = () => {
    const portNum = Number(mysqlPort);
    if (!mysqlHost.trim() || !mysqlUser.trim() || !mysqlDatabase.trim()) {
      throw new Error("请填写主机、用户名与数据库名");
    }
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error("请填写有效端口");
    }
    return {
      host: mysqlHost.trim(),
      port: portNum,
      user: mysqlUser.trim(),
      password: mysqlPassword,
      database: mysqlDatabase.trim(),
    };
  };

  const refreshUi = async () => {
    applyUi(await mysqlUiFn());
  };

  const run = async (kind: string, fn: () => Promise<void>, okMsg: string) => {
    setMysqlBusy(kind);
    try {
      await fn();
      toast.success(okMsg);
      await refreshUi();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleProbeSaved = async () => {
    setMysqlBusy("probe");
    try {
      const res = await testSavedFn();
      setLastProbe("ok");
      toast.success(`本机连接正常：${res.host}/${res.database}`);
      await refreshUi();
      onSaved?.();
    } catch (e) {
      setLastProbe("fail");
      toast.error(e instanceof Error ? e.message : "检查失败");
    } finally {
      setMysqlBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {mysqlUi?.configured ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            已保存{" "}
            <code className="rounded bg-muted px-1">{mysqlUi.host}</code> /{" "}
            <code className="rounded bg-muted px-1">{mysqlUi.database}</code>
            {lastProbe === "ok" ? (
              <span className="ml-2 text-emerald-700">· 最近检查通过</span>
            ) : lastProbe === "fail" ? (
              <span className="ml-2 text-amber-800">· 最近检查失败</span>
            ) : null}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!!mysqlBusy}
            onClick={() => void handleProbeSaved()}
          >
            {mysqlBusy === "probe" ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlugZap className="mr-2 h-3.5 w-3.5" />
            )}
            检查连接
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">尚未保存连接</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm">主机</Label>
          <Input
            value={mysqlHost}
            onChange={(e) => setMysqlHost(e.target.value)}
            autoComplete="off"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">端口</Label>
          <Input
            type="number"
            min={1}
            max={65535}
            value={mysqlPort}
            onChange={(e) => setMysqlPort(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">用户名</Label>
          <Input
            value={mysqlUser}
            onChange={(e) => setMysqlUser(e.target.value)}
            autoComplete="username"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">密码</Label>
          <div className="relative">
            <Input
              type={showMysqlPassword ? "text" : "password"}
              value={mysqlPassword}
              onChange={(e) => setMysqlPassword(e.target.value)}
              autoComplete="current-password"
              placeholder={mysqlUi?.passwordSaved ? "沿用已保存" : undefined}
              className="pr-10 font-mono text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              aria-label={showMysqlPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-1 top-1/2 z-10 h-8 w-8 -translate-y-1/2"
              onClick={() => setShowMysqlPassword((v) => !v)}
            >
              {showMysqlPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">数据库名</Label>
          <Input
            value={mysqlDatabase}
            onChange={(e) => setMysqlDatabase(e.target.value)}
            autoComplete="off"
            className="font-mono text-sm"
          />
        </div>
        <div className="hidden sm:block" aria-hidden />
      </div>

      {/* 主操作在前；创建库/测试为辅助 */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!!mysqlBusy}
          onClick={() =>
            void run("save", async () => {
              await saveMysqlFn({ data: payload() });
            }, "已保存连接")
          }
        >
          {mysqlBusy === "save" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          保存连接
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!!mysqlBusy}
          onClick={() =>
            void run(
              "apply",
              async () => {
                const res = await applyMysqlFn({ data: { connection: payload() } });
                if (res.seededAdmin && res.seedLogin) {
                  toast.message(`已写入空库种子运维（登录名：${res.seedLogin}）`);
                }
              },
              "建表完成",
            )
          }
        >
          {mysqlBusy === "apply" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Database className="mr-2 h-4 w-4" />
          )}
          执行建表
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!!mysqlBusy}
          onClick={() =>
            void run(
              "test",
              async () => {
                await testMysqlFn({ data: payload() });
                setLastProbe("ok");
              },
              "连接成功",
            )
          }
        >
          {mysqlBusy === "test" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="mr-2 h-4 w-4" />
          )}
          测试连接
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!!mysqlBusy}
          onClick={() =>
            void run("createdb", async () => {
              await createMysqlDbFn({ data: payload() });
            }, "已确保数据库存在")
          }
        >
          {mysqlBusy === "createdb" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Terminal className="mr-2 h-4 w-4" />
          )}
          创建数据库
        </Button>
      </div>

      <details className="min-w-0">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          高级：建表脚本预览
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!mysqlBusy}
            onClick={() =>
              void (async () => {
                setMysqlBusy("sql");
                try {
                  const res = await mysqlSqlFn();
                  setMysqlBundledSql(res.sql);
                  toast.success("已加载预览");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "加载失败");
                } finally {
                  setMysqlBusy(null);
                }
              })()
            }
          >
            {mysqlBusy === "sql" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Terminal className="mr-2 h-4 w-4" />
            )}
            加载预览
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!mysqlBusy}
            onClick={() =>
              void (async () => {
                try {
                  let text = mysqlBundledSql;
                  if (!text) {
                    const res = await mysqlSqlFn();
                    text = res.sql;
                    setMysqlBundledSql(res.sql);
                  }
                  await navigator.clipboard.writeText(text);
                  toast.success("已复制");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "复制失败");
                }
              })()
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            复制脚本
          </Button>
        </div>
        {mysqlBundledSql ? (
          <textarea
            readOnly
            value={mysqlBundledSql}
            rows={6}
            className="mt-2 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
        ) : null}
      </details>
    </div>
  );
}
