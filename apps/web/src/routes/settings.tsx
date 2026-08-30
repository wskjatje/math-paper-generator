import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
  type AiSettingsForm,
} from "@/lib/aiSettingsStorage";
import {
  DEFAULT_GATEWAY_SETTINGS,
  loadGatewaySettings,
  saveGatewaySettings,
  type GatewaySettingsForm,
} from "@/lib/gatewaySettingsStorage";
import {
  fetchWorkspaceIntegrationSettings,
  saveWorkspaceIntegrationSettings,
} from "@/lib/workspaceSettings.functions.server";
import {
  fetchAiSettingsFromDb,
  saveAiSettingsToDb,
  fetchImportLearningOverview,
  setImportLearningAutonomousEnabled,
} from "@/lib/exam.functions.server";
import type { StoredImportLearning } from "@/lib/importLearning.shared";
import { toast } from "sonner";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import {
  Loader2,
  Save,
  PlugZap,
  Database,
  Copy,
  Terminal,
  Eraser,
  Eye,
  EyeOff,
  Cloud,
  Server,
  SlidersHorizontal,
  RefreshCw,
  Download,
  Camera,
  BookOpen,
  BrainCircuit,
} from "lucide-react";
import { FormPanel } from "@/components/layout/FormPanel";
import { PageShell } from "@/components/layout/PageShell";
import { AiModelCatalogPanel } from "@/components/settings/AiModelCatalogPanel";
import { CoursewareDirectorySection } from "@/components/settings/CoursewareDirectorySection";
import { GenerationLearningPanel } from "@/components/settings/GenerationLearningPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  type DataSettingsOverview,
  getDataSettingsOverview,
  getBundledMigrationSql,
  runBundledMigrationsOnServer,
  checkSystemUpdate,
  type SystemUpdateCheckResult,
} from "@/lib/dataSettings.functions.server";
import type { MysqlUiState } from "@/lib/mysqlConnection.server";
import {
  applyMysqlZhixueSchema,
  createMysqlDatabaseFromForm,
  getMysqlBundledSchemaSql,
  getMysqlSettingsUiState,
  saveMysqlConnectionSettings,
  testMysqlConnectionFromForm,
} from "@/lib/mysqlSettings.functions.server";
import {
  loadExamStoragePreference,
  saveExamStoragePreference,
  type ExamStoragePreference,
} from "@/lib/examStoragePreference";
import { useGenerationHabitsCloudSync } from "@/hooks/useGenerationHabitsCloudSync";
import {
  loadGenerationHabits,
  resetGenerationHabits,
  setAutonomousLearningEnabled,
  type StoredGenerationHabit,
} from "@/lib/generationHabits";
import { GENERATION_ERROR_CATEGORY_LABELS } from "@/lib/generationQuality.shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** 本地设置页输入统一底色（与原生控件观感一致） */
const LOCAL_FIELD_CONTROL = cn(CONTROL, "bg-background text-foreground antialiased");

/** 一句话说明当前命题/导入默认落在何处（与 examStorage/policy、persistImported 模块行为一致） */
function currentExamPersistenceSummary(
  pref: ExamStoragePreference,
  o: DataSettingsOverview,
): { headline: string; sub?: string } {
  const localLabel = "本机目录";
  const sb = o.supabaseConfigured;
  const lw = o.localWritable;

  if (pref === "local") {
    if (lw) return { headline: localLabel };
    return {
      headline: "本机目录不可写",
      sub: "请检查权限或改用「自动」。",
    };
  }

  if (pref === "supabase") {
    if (sb) return { headline: "云端" };
    if (o.mysqlReachable) return { headline: "本机数据库" };
    if (lw) return { headline: localLabel };
    return {
      headline: "存储不可用",
      sub: "请配置云端或本机目录。",
    };
  }

  if (pref === "builtin") {
    if (lw) return { headline: localLabel };
    if (sb) return { headline: "云端" };
    return { headline: "存储不可用" };
  }

  // auto
  if (sb) return { headline: "云端" };
  if (o.mysqlReachable) return { headline: "本机数据库" };
  if (lw) return { headline: localLabel };
  return {
    headline: "存储不可用",
    sub: "请配置云端或本机目录。",
  };
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "设置 — 知学 Zhixue" }],
  }),
});

function SettingsPage() {
  const [settingsTab, setSettingsTab] = useState("ai");
  const fetchDbFn = useServerFn(fetchAiSettingsFromDb);
  const saveDbFn = useServerFn(saveAiSettingsToDb);
  const fetchWsFn = useServerFn(fetchWorkspaceIntegrationSettings);
  const saveWsFn = useServerFn(saveWorkspaceIntegrationSettings);
  const [form, setForm] = useState<AiSettingsForm>(() => ({ ...DEFAULT_AI_SETTINGS }));
  const [gatewayForm, setGatewayForm] = useState<GatewaySettingsForm>(() => ({
    ...DEFAULT_GATEWAY_SETTINGS,
  }));
  const [mounted, setMounted] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  useEffect(() => {
    setForm(loadAiSettings());
    setGatewayForm(loadGatewaySettings());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void (async () => {
      try {
        const ws = await fetchWsFn();
        setGatewayForm({ ...DEFAULT_GATEWAY_SETTINGS, ...(ws.settings.gateway ?? {}) });
      } catch (e) {
        console.warn("[settings] fetchWorkspaceIntegrationSettings:", e);
        setGatewayForm(loadGatewaySettings());
      }
      try {
        const res = await fetchDbFn();
        if (res.ok) {
          setForm(res.settings);
          saveAiSettings(res.settings);
        }
      } catch (e) {
        console.warn("[settings] fetchAiSettingsFromDb:", e);
      }
    })();
  }, [mounted, fetchWsFn, fetchDbFn]);

  const handleSaveGateway = async () => {
    setSavingGateway(true);
    try {
      try {
        await saveWsFn({
          data: {
            gateway: { baseUrl: gatewayForm.baseUrl },
          },
        });
        saveGatewaySettings(gatewayForm);
        toast.success("网关设置已保存。");
      } catch (e) {
        saveGatewaySettings(gatewayForm);
        toast.warning(
          e instanceof Error
            ? `${e.message}（网关配置已降级写入本机浏览器）`
            : "网关配置已降级写入本机浏览器",
        );
      }
    } finally {
      setSavingGateway(false);
    }
  };

  if (!mounted) {
    return (
      <PageShell size="full">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          加载中…
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="full" className="space-y-5">
      {/* 顶栏已有「设置」，正文直接进页签，避免重复大标题 */}
      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full space-y-5">
        <TabsList variant="portal">
          <TabsTrigger variant="portal" value="ai">
            <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden />
            模型
          </TabsTrigger>
          <TabsTrigger variant="portal" value="prefs">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
            偏好
          </TabsTrigger>
          <TabsTrigger variant="portal" value="learning">
            <BrainCircuit className="h-3.5 w-3.5 shrink-0" aria-hidden />
            改进
          </TabsTrigger>
          <TabsTrigger variant="portal" value="curriculum">
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            课件
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-0 space-y-4">
          <AiModelCatalogPanel
            form={form}
            onPersist={async (next) => {
              setForm(next);
              saveAiSettings(next);
              try {
                const res = await saveDbFn({ data: next });
                if (res.ok) toast.success("模型目录已保存");
                else toast.error("未能写入工作区存储，请检查配库后重试");
              } catch (e) {
                toast.error(toUserFacingErrorMessage(e, "保存失败"));
              }
            }}
          />

          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/15 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Camera className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-sm font-semibold text-foreground">图片识图网关</span>
            </div>
            <Field label="网关根 URL（可选）">
              <input
                value={gatewayForm.baseUrl}
                onChange={(e) => setGatewayForm((g) => ({ ...g, baseUrl: e.target.value }))}
                placeholder="http://127.0.0.1:8090"
                autoComplete="off"
                spellCheck={false}
                className={LOCAL_FIELD_CONTROL}
                aria-label="API 网关根地址，用于线下导入图片识图"
              />
            </Field>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={savingGateway}
                onClick={() => void handleSaveGateway()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {savingGateway ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                保存网关
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prefs" className="mt-0">
          <DataStorageTab />
        </TabsContent>

        <TabsContent value="learning" className="mt-0">
          <GenerationLearningPanel />
        </TabsContent>

        <TabsContent value="curriculum" className="mt-0 space-y-5">
          <CoursewareDirectorySection />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function DataStorageTab() {
  const router = useRouter();
  const overviewFn = useServerFn(getDataSettingsOverview);
  const checkUpdateFn = useServerFn(checkSystemUpdate);
  const sqlFn = useServerFn(getBundledMigrationSql);
  const runMigrateFn = useServerFn(runBundledMigrationsOnServer);
  const mysqlUiFn = useServerFn(getMysqlSettingsUiState);
  const saveMysqlFn = useServerFn(saveMysqlConnectionSettings);
  const testMysqlFn = useServerFn(testMysqlConnectionFromForm);
  const createMysqlDbFn = useServerFn(createMysqlDatabaseFromForm);
  const applyMysqlFn = useServerFn(applyMysqlZhixueSchema);
  const mysqlSqlFn = useServerFn(getMysqlBundledSchemaSql);
  const fetchImportLearningFn = useServerFn(fetchImportLearningOverview);
  const setImportLearningFn = useServerFn(setImportLearningAutonomousEnabled);

  const [overview, setOverview] = useState<DataSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [bundledSql, setBundledSql] = useState<string | null>(null);
  const [sqlFileNames, setSqlFileNames] = useState<string[]>([]);
  const [migrateRunning, setMigrateRunning] = useState(false);
  const [storagePref, setStoragePref] = useState<ExamStoragePreference>("auto");

  const [mysqlUi, setMysqlUi] = useState<MysqlUiState | null>(null);
  const [importLearningProfile, setImportLearningProfile] = useState<StoredImportLearning | null>(
    null,
  );
  const [importLearningSaving, setImportLearningSaving] = useState(false);
  const [mysqlHost, setMysqlHost] = useState("127.0.0.1");
  const [mysqlPort, setMysqlPort] = useState(3306);
  const [mysqlUser, setMysqlUser] = useState("root");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [showMysqlPassword, setShowMysqlPassword] = useState(false);
  const [mysqlDatabase, setMysqlDatabase] = useState("zhixue");
  const [mysqlBusy, setMysqlBusy] = useState<string | null>(null);
  const [mysqlBundledSql, setMysqlBundledSql] = useState<string | null>(null);
  const [cloudStorageConfigOpen, setCloudStorageConfigOpen] = useState(false);
  const [localStorageConfigOpen, setLocalStorageConfigOpen] = useState(false);
  const [habitSnap, setHabitSnap] = useState<StoredGenerationHabit>(() => loadGenerationHabits());
  const [updateInfo, setUpdateInfo] = useState<SystemUpdateCheckResult | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);

  useGenerationHabitsCloudSync();
  useEffect(() => {
    const bump = () => setHabitSnap(loadGenerationHabits());
    window.addEventListener("mpg-generation-habits-sync", bump);
    return () => window.removeEventListener("mpg-generation-habits-sync", bump);
  }, []);

  useEffect(() => {
    void fetchImportLearningFn()
      .then((r) => {
        if (r.ok && r.profile) setImportLearningProfile(r.profile as StoredImportLearning);
      })
      .catch(() => {});
  }, [fetchImportLearningFn]);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const ov = await overviewFn();
      setOverview(ov);
      try {
        const ms = await mysqlUiFn();
        setMysqlUi(ms);
        if (ms.configured) {
          setMysqlHost(ms.host ?? "127.0.0.1");
          setMysqlPort(ms.port ?? 3306);
          setMysqlUser(ms.user ?? "root");
          setMysqlDatabase(ms.database ?? "zhixue");
          setMysqlPassword("");
        }
      } catch (me) {
        console.warn("[DataStorageTab] mysql overview", me);
      }
    } catch (e) {
      console.warn("[DataStorageTab]", e);
      toast.error(toUserFacingErrorMessage(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在进入设置页时拉取
  }, []);

  useEffect(() => {
    setStoragePref(loadExamStoragePreference());
  }, []);

  useEffect(() => {
    if (!cloudStorageConfigOpen) return;
    void overviewFn()
      .then(setOverview)
      .catch(() => {});
  }, [cloudStorageConfigOpen, overviewFn]);

  useEffect(() => {
    if (!localStorageConfigOpen) return;
    void mysqlUiFn()
      .then((ms) => {
        setMysqlUi(ms);
        if (ms.configured) {
          setMysqlHost(ms.host ?? "127.0.0.1");
          setMysqlPort(ms.port ?? 3306);
          setMysqlUser(ms.user ?? "root");
          setMysqlDatabase(ms.database ?? "zhixue");
          setMysqlPassword("");
        }
      })
      .catch(() => {});
  }, [localStorageConfigOpen, mysqlUiFn]);

  const onStoragePrefChange = (v: string) => {
    const p = v as ExamStoragePreference;
    setStoragePref(p);
    saveExamStoragePreference(p);
    toast.success("已保存试卷持久化偏好");
    void router.invalidate();
  };

  const loadBundledSql = async () => {
    try {
      const res = await sqlFn();
      setBundledSql(res.sql);
      setSqlFileNames(res.fileNames);
      toast.success(`已加载合并 SQL（${res.fileNames.length} 个文件）`);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "读取迁移失败"));
    }
  };

  const copySql = async () => {
    let text = bundledSql;
    if (!text) {
      try {
        const res = await sqlFn();
        text = res.sql;
        setBundledSql(res.sql);
        setSqlFileNames(res.fileNames);
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "读取迁移失败"));
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板，请到云端控制台的 SQL 编辑器粘贴执行");
    } catch {
      toast.error("复制失败，请手动全选下方文本");
    }
  };

  const handleRunMigrate = async () => {
    setMigrateRunning(true);
    try {
      const res = await runMigrateFn();
      toast.success(`迁移完成：${res.applied.join(" → ")}`);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "执行失败"));
    } finally {
      setMigrateRunning(false);
    }
  };

  const mysqlConnPayload = () => ({
    host: mysqlHost.trim(),
    port: mysqlPort,
    user: mysqlUser.trim(),
    password: mysqlPassword,
    database: mysqlDatabase.trim(),
  });

  const handleMysqlSave = async () => {
    setMysqlBusy("save");
    try {
      await saveMysqlFn({ data: mysqlConnPayload() });
      toast.success("本机数据库连接已保存");
      void refreshAll();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "保存失败"));
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleMysqlTest = async () => {
    setMysqlBusy("test");
    try {
      await testMysqlFn({ data: mysqlConnPayload() });
      toast.success("已连接到数据库");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "连接失败"));
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleMysqlCreateDb = async () => {
    setMysqlBusy("createdb");
    try {
      await createMysqlDbFn({ data: mysqlConnPayload() });
      toast.success(`已确保数据库「${mysqlDatabase.trim()}」存在`);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "创建失败"));
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleMysqlApplySchema = async () => {
    setMysqlBusy("apply");
    try {
      await applyMysqlFn({
        data: {
          connection: mysqlConnPayload(),
        },
      });
      toast.success("建表完成，已写入默认配置");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "执行失败"));
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleMysqlLoadSql = async () => {
    setMysqlBusy("sql");
    try {
      const res = await mysqlSqlFn();
      setMysqlBundledSql(res.sql);
      toast.success(`已加载 ${res.path}`);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "读取失败"));
    } finally {
      setMysqlBusy(null);
    }
  };

  const handleMysqlCopySql = async () => {
    let text = mysqlBundledSql;
    if (!text) {
      try {
        const res = await mysqlSqlFn();
        text = res.sql;
        setMysqlBundledSql(res.sql);
      } catch (e) {
        toast.error(toUserFacingErrorMessage(e, "读取失败"));
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制建表 SQL");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateChecking(true);
    try {
      const res = await checkUpdateFn();
      setUpdateInfo(res);
      if (res.latestVersion == null) {
        toast.error("检查失败：无法读取最新版本，请稍后再试");
      } else if (res.hasUpdate) {
        toast.success(`发现新版本 v${res.latestVersion}`);
      } else {
        toast.success("当前已是最新版本");
      }
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "检查更新失败"));
    } finally {
      setUpdateChecking(false);
    }
  };

  const mysqlSettingsContent = (
    <>
      {mysqlUi?.configured ? (
        <p className="text-xs text-muted-foreground">
          已保存 <code className="rounded bg-muted px-1 text-[11px]">{mysqlUi.host}</code> /{" "}
          <code className="rounded bg-muted px-1 text-[11px]">{mysqlUi.database}</code>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">尚未保存连接。</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="主机">
          <Input
            value={mysqlHost}
            onChange={(e) => setMysqlHost(e.target.value)}
            autoComplete="off"
            placeholder="host.docker.internal"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="端口">
          <Input
            type="number"
            min={1}
            max={65535}
            value={mysqlPort}
            onChange={(e) => setMysqlPort(Number(e.target.value) || 3306)}
            className="font-mono text-sm"
          />
        </Field>
        <Field label="用户名">
          <Input
            value={mysqlUser}
            onChange={(e) => setMysqlUser(e.target.value)}
            autoComplete="username"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="密码">
          <div className="relative">
            <Input
              type={showMysqlPassword ? "text" : "password"}
              value={mysqlPassword}
              onChange={(e) => setMysqlPassword(e.target.value)}
              autoComplete="current-password"
              placeholder={mysqlUi?.passwordSaved ? "••••••••（留空沿用）" : ""}
              className="font-mono text-sm pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showMysqlPassword ? "隐藏密码" : "显示密码"}
              className="absolute right-1 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setShowMysqlPassword((v) => !v)}
            >
              {showMysqlPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label="数据库名">
            <Input
              value={mysqlDatabase}
              onChange={(e) => setMysqlDatabase(e.target.value)}
              autoComplete="off"
              className="font-mono text-sm"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!mysqlBusy}
          onClick={() => void handleMysqlCreateDb()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          title="不选中数据库即可执行 CREATE DATABASE，适合尚未创建库名时"
        >
          {mysqlBusy === "createdb" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Terminal className="h-4 w-4" />
          )}
          创建数据库（IF NOT EXISTS）
        </button>
        <button
          type="button"
          disabled={!!mysqlBusy}
          onClick={() => void handleMysqlTest()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          title="需目标数据库已存在；新建库请先点上一按钮"
        >
          {mysqlBusy === "test" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlugZap className="h-4 w-4" />
          )}
          测试连接
        </button>
        <button
          type="button"
          disabled={!!mysqlBusy}
          onClick={() => void handleMysqlSave()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-95 disabled:opacity-50"
        >
          {mysqlBusy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存连接
        </button>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 space-y-3">
        <p className="text-sm font-medium text-foreground">建表</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!mysqlBusy}
            onClick={() => void handleMysqlApplySchema()}
            className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm hover:bg-amber-500/15 disabled:opacity-50"
          >
            {mysqlBusy === "apply" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            执行建表脚本
          </button>
          <button
            type="button"
            disabled={!!mysqlBusy}
            onClick={() => void handleMysqlLoadSql()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {mysqlBusy === "sql" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Terminal className="h-4 w-4" />
            )}
            加载 SQL 预览
          </button>
          <button
            type="button"
            disabled={!!mysqlBusy}
            onClick={() => void handleMysqlCopySql()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            复制 SQL
          </button>
        </div>
        {mysqlBundledSql ? (
          <textarea
            readOnly
            value={mysqlBundledSql}
            rows={10}
            className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed"
            spellCheck={false}
          />
        ) : null}
      </div>
    </>
  );

  const persistenceSummary =
    overview !== null ? currentExamPersistenceSummary(storagePref, overview) : null;

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <Link to="/remediation-rules" className="text-primary underline-offset-4 hover:underline">
          试卷修复管线
        </Link>
      </p>

      <FormPanel title="学习与更新">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">导入自主学习</h3>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              checked={importLearningProfile?.autonomousLearningEnabled !== false}
              disabled={importLearningProfile == null || importLearningSaving}
              onCheckedChange={(v) => {
                void (async () => {
                  const next = v === true;
                  setImportLearningSaving(true);
                  try {
                    await setImportLearningFn({ data: { enabled: next } });
                    const r = await fetchImportLearningFn();
                    if (r.ok && r.profile)
                      setImportLearningProfile(r.profile as StoredImportLearning);
                    toast.success(next ? "已启用导入自主学习" : "已关闭导入自主学习");
                  } catch (e) {
                    toast.error(toUserFacingErrorMessage(e, "保存失败"));
                  } finally {
                    setImportLearningSaving(false);
                  }
                })();
              }}
              className="mt-0.5"
            />
            <span className="font-medium text-foreground">启用导入自主学习补强</span>
          </label>
          {importLearningProfile ? (
            <p className="text-xs text-muted-foreground">
              累计成功 {importLearningProfile.successCount} · 失败 {importLearningProfile.failCount}{" "}
              · 当前语境连续成功 {importLearningProfile.consecutiveSuccesses}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">暂无统计</p>
          )}
        </div>

        <div className="space-y-3 border-t border-border/50 pt-5">
          <h3 className="text-sm font-medium text-foreground">系统更新</h3>
          <p className="text-xs text-muted-foreground">
            当前版本：
            <code className="rounded bg-muted px-1 text-[11px]">
              v{updateInfo?.currentVersion ?? "—"}
            </code>
            {updateInfo?.checkedAtIso ? (
              <>
                {" · "}最近检查：{new Date(updateInfo.checkedAtIso).toLocaleString()}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={updateChecking}
              onClick={() => void handleCheckUpdate()}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {updateChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              检查更新
            </button>
            {updateInfo?.hasUpdate && updateInfo.releaseUrl ? (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-95"
              >
                <Download className="h-4 w-4" />
                前往下载最新版
              </a>
            ) : null}
          </div>
          {updateInfo ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
              {updateInfo.latestVersion == null ? (
                <p className="text-muted-foreground">未能获取远端版本，请稍后再试。</p>
              ) : updateInfo.hasUpdate ? (
                <p>
                  检测到新版本：v{updateInfo.latestVersion}
                  {updateInfo.releaseName ? `（${updateInfo.releaseName}）` : ""}。
                </p>
              ) : (
                <p>
                  已是最新版本（当前 v{updateInfo.currentVersion}，远端 v{updateInfo.latestVersion}
                  ）。
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-border/50 pt-5">
          <h3 className="text-sm font-medium text-foreground">本机使用偏好</h3>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
            <input
              id="mpg-autonomous-learning"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={habitSnap.autonomousLearningEnabled !== false}
              onChange={(e) => {
                setAutonomousLearningEnabled(e.target.checked);
                setHabitSnap(loadGenerationHabits());
                toast.success(e.target.checked ? "已开启" : "已关闭");
              }}
            />
            <Label
              htmlFor="mpg-autonomous-learning"
              className="cursor-pointer text-sm text-foreground"
            >
              命题时参考本机使用偏好
            </Label>
          </div>
          <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-sm">
            <p>
              <span className="text-muted-foreground">成功命题：</span>
              {habitSnap.successCount} 次 · <span className="text-muted-foreground">失败：</span>
              {habitSnap.failCount} 次
              {habitSnap.autonomousLearningEnabled !== false ? (
                <>
                  {" "}
                  · 连续成功 {habitSnap.consecutiveSuccesses ?? 0} 次
                </>
              ) : null}
            </p>
            {habitSnap.preferred.grade ? (
              <p className="text-xs text-muted-foreground">
                最近偏好：{habitSnap.preferred.grade} / {habitSnap.preferred.subject} /{" "}
                {habitSnap.preferred.paper_kind} / {habitSnap.preferred.difficulty}
              </p>
            ) : null}
            {Object.keys(habitSnap.errorCategoryCounts).length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {Object.entries(habitSnap.errorCategoryCounts).map(([k, n]) =>
                  n ? (
                    <li key={k}>
                      {GENERATION_ERROR_CATEGORY_LABELS[
                        k as keyof typeof GENERATION_ERROR_CATEGORY_LABELS
                      ] ?? k}
                      ：{n}
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            onClick={() => {
              resetGenerationHabits();
              setHabitSnap(loadGenerationHabits());
              toast.success("已清空习惯统计");
            }}
          >
            <Eraser className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            清空习惯统计
          </button>
        </div>
      </FormPanel>

      <FormPanel title="试卷保存">
        {loading || !overview ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </p>
        ) : (
          <div className="space-y-5">
            {persistenceSummary ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                <div className="text-xs font-medium text-muted-foreground">保存位置</div>
                <p className="mt-1.5 text-sm font-semibold text-foreground leading-snug">
                  {persistenceSummary.headline}
                </p>
                {persistenceSummary.sub ? (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {persistenceSummary.sub}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">试卷库列表</div>
                <RadioGroup
                  value={storagePref}
                  onValueChange={onStoragePrefChange}
                  className="gap-3 sm:gap-2"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="auto" id="exam-store-auto" className="mt-0.5" />
                    <Label
                      htmlFor="exam-store-auto"
                      className="cursor-pointer font-normal leading-snug text-foreground"
                    >
                      自动
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="builtin" id="exam-store-builtin" className="mt-0.5" />
                    <Label
                      htmlFor="exam-store-builtin"
                      className="cursor-pointer font-normal leading-snug text-foreground"
                    >
                      项目内置 + 本地卷
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="supabase" id="exam-store-cloud" className="mt-0.5" />
                    <Label
                      htmlFor="exam-store-cloud"
                      className="cursor-pointer font-normal leading-snug text-foreground"
                    >
                      仅云端列表
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="local" id="exam-store-local" className="mt-0.5" />
                    <Label
                      htmlFor="exam-store-local"
                      className="cursor-pointer font-normal leading-snug text-foreground"
                    >
                      仅本地目录
                    </Label>
                  </div>
                </RadioGroup>
                <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCloudStorageConfigOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
                  >
                    <Cloud className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    云端连接设置
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalStorageConfigOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
                  >
                    <Server className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    本机数据库
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              云端 {overview.supabaseConfigured ? "已连" : "未配"}
              {" · "}
              本机库 {overview.mysqlReachable ? "已连" : "未连"}
              {" · "}
              建表直连 {overview.databaseUrlConfigured ? "已配" : "未配"}
            </p>
          </div>
        )}
      </FormPanel>

      <Dialog open={cloudStorageConfigOpen} onOpenChange={setCloudStorageConfigOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>云端配置</DialogTitle>
            <DialogDescription className="sr-only">云端配置</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadBundledSql()}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
              >
                <Terminal className="h-4 w-4" />
                加载合并 SQL
              </button>
              <button
                type="button"
                onClick={() => void copySql()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-95"
              >
                <Copy className="h-4 w-4" />
                复制到剪贴板
              </button>
            </div>
            {sqlFileNames.length > 0 && (
              <p className="text-[11px] text-muted-foreground">共 {sqlFileNames.length} 段 SQL</p>
            )}
            {bundledSql && (
              <textarea
                readOnly
                value={bundledSql}
                rows={10}
                className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed"
                spellCheck={false}
              />
            )}

            <code className="block rounded border border-border bg-muted/30 px-2 py-2 text-[11px] overflow-x-auto text-muted-foreground">
              DATABASE_URL=&quot;postgresql://…&quot; npm run db:apply
            </code>

            <div className="rounded-lg border border-border/80 bg-card/50 px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-foreground">本页执行迁移</p>
              <button
                type="button"
                disabled={
                  migrateRunning ||
                  !overview?.canRunUiMigration ||
                  (overview?.migrationFiles.length ?? 0) === 0
                }
                onClick={() => void handleRunMigrate()}
                className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground hover:bg-amber-500/15 disabled:opacity-50"
              >
                {migrateRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                执行迁移
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={localStorageConfigOpen} onOpenChange={setLocalStorageConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              <Database className="h-4 w-4 shrink-0" />
              本机数据库
            </DialogTitle>
            <DialogDescription className="sr-only">本机数据库</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">{mysqlSettingsContent}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
