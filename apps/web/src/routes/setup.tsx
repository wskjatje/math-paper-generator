import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useCallback, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Database, Loader2, RefreshCw, Terminal } from "lucide-react";
import { AccountSetupNotice } from "@/components/auth/AccountSetupNotice";
import { EnvBootstrapPanel } from "@/components/setup/EnvBootstrapPanel";
import { LocalMysqlAdminBootstrapPanel } from "@/components/setup/LocalMysqlAdminBootstrapPanel";
import { MysqlBootstrapPanel } from "@/components/setup/MysqlBootstrapPanel";
import { FormPanel } from "@/components/layout/FormPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getAccountSetupStatus } from "@/lib/auth.functions.server";
import {
  getBundledMigrationSql,
  getDataSettingsOverview,
  runBundledMigrationsOnServer,
  type DataSettingsOverview,
} from "@/lib/dataSettings.functions.server";
import { getMysqlSettingsUiState } from "@/lib/mysqlSettings.functions.server";
import type { MysqlUiState, RuntimeEnvLocalUiState } from "@/lib/runtimeEnvLocal.shared";
import type { AccountSetupStatus } from "@/lib/runtimeReadiness.shared";
import { getSetupEnvUiState } from "@/lib/setupEnv.functions.server";

type SetupLoaderData = {
  setup: AccountSetupStatus;
  overview: DataSettingsOverview;
  mysql: MysqlUiState;
  envUi: RuntimeEnvLocalUiState;
};

export const Route = createFileRoute("/setup")({
  loader: async (): Promise<SetupLoaderData> => {
    const [setup, overview, mysql, envUi] = await Promise.all([
      getAccountSetupStatus(),
      getDataSettingsOverview(),
      getMysqlSettingsUiState(),
      getSetupEnvUiState(),
    ]);
    return { setup, overview, mysql, envUi };
  },
  component: AccountSetupPage,
  head: () => ({
    meta: [
      { title: "配库 · 知学" },
      { name: "description", content: "配库" },
    ],
  }),
});

function StatusItem({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex gap-2 border-b border-border/40 py-2.5 last:border-b-0">
      <span
        className={
          ok
            ? "mt-0.5 inline-flex h-5 shrink-0 items-center rounded bg-emerald-500/15 px-1.5 text-[11px] font-medium text-emerald-800"
            : "mt-0.5 inline-flex h-5 shrink-0 items-center rounded bg-amber-500/20 px-1.5 text-[11px] font-medium text-amber-900"
        }
      >
        {ok ? "就绪" : "缺项"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground break-all">{detail}</p>
      </div>
    </li>
  );
}

function StatusGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1">{children}</ul>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** 公开配库页：主路径本机，次路径云端默认折叠（prd-setup-ia Q1=A / Q2=A） */
function AccountSetupPage() {
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onSetupPage = pathname === "/setup" || pathname.startsWith("/setup/");
  const loaded = Route.useLoaderData();
  const setupStatusFn = useServerFn(getAccountSetupStatus);
  const overviewFn = useServerFn(getDataSettingsOverview);
  const mysqlUiFn = useServerFn(getMysqlSettingsUiState);
  const envUiFn = useServerFn(getSetupEnvUiState);
  const sqlFn = useServerFn(getBundledMigrationSql);
  const migrateFn = useServerFn(runBundledMigrationsOnServer);

  const [overview, setOverview] = useState(loaded.overview);
  const [setup, setSetup] = useState(loaded.setup);
  const [mysql, setMysql] = useState(loaded.mysql);
  const [envUi, setEnvUi] = useState(loaded.envUi);
  const [bundledSql, setBundledSql] = useState("");
  const [sqlFileNames, setSqlFileNames] = useState<string[]>([]);
  const [migrateRunning, setMigrateRunning] = useState(false);
  const [checking, setChecking] = useState(false);

  const reload = useCallback(async () => {
    setChecking(true);
    try {
      const [ov, st, ms, eu] = await Promise.all([
        overviewFn(),
        setupStatusFn(),
        mysqlUiFn(),
        envUiFn(),
      ]);
      setOverview(ov);
      setSetup(st);
      setMysql(ms);
      setEnvUi(eu);
      void auth.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "无法读取状态");
    } finally {
      setChecking(false);
    }
  }, [overviewFn, setupStatusFn, mysqlUiFn, envUiFn, auth]);

  const loadBundledSql = async () => {
    try {
      const res = await sqlFn();
      setBundledSql(res.sql);
      setSqlFileNames(res.fileNames);
      toast.success(`已加载 ${res.fileNames.length} 段脚本`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    }
  };

  const copySql = async () => {
    try {
      let text = bundledSql;
      if (!text) {
        const res = await sqlFn();
        text = res.sql;
        setBundledSql(res.sql);
        setSqlFileNames(res.fileNames);
      }
      await navigator.clipboard.writeText(text);
      toast.success("已复制，可粘贴到云端控制台执行");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "复制失败");
    }
  };

  const handleRunMigrate = async () => {
    setMigrateRunning(true);
    try {
      const res = await migrateFn();
      toast.success(`建表完成（${res.applied} 项）`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "建表失败");
    } finally {
      setMigrateRunning(false);
    }
  };

  const accountReady = setup.supabaseAuthEnabled && setup.accountSchemaReady;
  const canUiMigrate = overview.canRunUiMigration;

  const statusPanel = (
    <FormPanel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle title="状态" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={checking}
          onClick={() => void reload()}
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {checking ? "检查中…" : "重新检查"}
        </Button>
      </div>

      <div className="space-y-4">
        <StatusGroup title="共用">
          <StatusItem
            label="可登录"
            ok={setup.supabaseAuthEnabled}
            detail={setup.supabaseAuthEnabled ? "可用" : "未就绪"}
          />
          <StatusItem
            label="账号服务"
            ok={setup.accountSchemaReady}
            detail={setup.accountSchemaReady ? "已就绪" : "尚未完成"}
          />
          <StatusItem
            label="账号管理"
            ok={setup.serviceRoleReady}
            detail={setup.serviceRoleReady ? "可用" : "未就绪"}
          />
        </StatusGroup>

        <StatusGroup title="本机">
          <StatusItem
            label="本机数据库"
            ok={mysql.configured}
            detail={
              mysql.configured && mysql.host && mysql.database
                ? `${mysql.host}/${mysql.database}`
                : "未保存"
            }
          />
        </StatusGroup>

        <StatusGroup title="云端（可选）">
          <StatusItem
            label="云端数据库"
            ok={setup.databaseUrlConfigured}
            detail={
              setup.databaseUrlConfigured
                ? overview.databaseUrlHost || "已配置"
                : "未配置"
            }
          />
          <StatusItem
            label="本页一键建表"
            ok={canUiMigrate}
            detail={canUiMigrate ? "已允许" : "未允许"}
          />
        </StatusGroup>
      </div>
    </FormPanel>
  );

  const stepsPanel = (
    <div className="space-y-4 md:space-y-5">
      <FormPanel className="space-y-4">
        <SectionTitle title="1. 本机数据库" />
        <MysqlBootstrapPanel initialUi={mysql} onSaved={() => void reload()} />
      </FormPanel>

      <FormPanel className="space-y-4">
        <SectionTitle title="2. 首个运维（如需）" />
        <LocalMysqlAdminBootstrapPanel onCreated={() => void reload()} />
      </FormPanel>

      <FormPanel className="space-y-3">
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-foreground">可选 · 云端</h2>
              </div>
              <span className="text-xs text-primary group-open:hidden">展开</span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">收起</span>
            </div>
          </summary>

          <div className="mt-4 space-y-6 border-t border-border/60 pt-4">
            <section className="space-y-4">
              <SectionTitle title="云端连接" />
              <EnvBootstrapPanel initial={envUi} onSaved={() => void reload()} />
            </section>

            <section className="space-y-4">
              <SectionTitle title="云端建表" />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={migrateRunning || !canUiMigrate}
                  onClick={() => void handleRunMigrate()}
                >
                  {migrateRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Database className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  执行初始化
                </Button>
                <details className="min-w-0">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    高级：脚本预览
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadBundledSql()}
                    >
                      <Terminal className="mr-2 h-4 w-4" aria-hidden />
                      加载脚本
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copySql()}>
                      <Copy className="mr-2 h-4 w-4" aria-hidden />
                      复制
                    </Button>
                  </div>
                  {bundledSql ? (
                    <textarea
                      readOnly
                      value={bundledSql}
                      rows={6}
                      className="mt-2 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed"
                      spellCheck={false}
                    />
                  ) : null}
                  {sqlFileNames.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">共 {sqlFileNames.length} 段</p>
                  ) : null}
                </details>
              </div>
            </section>
          </div>
        </details>
      </FormPanel>
    </div>
  );

  return (
    <PageShell size="wide" className="space-y-6 md:space-y-8">
      <PageHeader title="配库" />

      <AccountSetupNotice hideSetupLink={onSetupPage} className="mx-0 max-w-none" />

      {accountReady ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950"
        >
          <p className="font-semibold">已就绪</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">{statusPanel}</aside>
        <div className="min-w-0">{stepsPanel}</div>
      </div>
    </PageShell>
  );
}
