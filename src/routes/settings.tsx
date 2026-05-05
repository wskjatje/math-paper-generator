import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
  toAiRuntimePayload,
  type AiSettingsForm,
} from "@/lib/aiSettingsStorage";
import { DEFAULT_CLOUD_MODEL } from "@/lib/aiRuntime.shared";
import {
  probeAiConnection,
  probeSubmitExamToolCallFn,
  fetchAiSettingsFromDb,
  saveAiSettingsToDb,
  listLocalModels,
} from "@/lib/exam.functions.server";
import { toast } from "sonner";
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
  ChevronDown,
} from "lucide-react";
import { FormPanel } from "@/components/layout/FormPanel";
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
  readHabitsLocalMeta,
  resetGenerationHabits,
  setAutonomousLearningEnabled,
  type StoredGenerationHabit,
} from "@/lib/generationHabits";
import { GENERATION_ERROR_CATEGORY_LABELS } from "@/lib/generationQuality.shared";
import { CURRICULUM_SUBJECT_OPTIONS } from "@/lib/generateCatalog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const CONTROL =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** 本地设置页输入/下拉统一底色（避免原生 select 与相邻 input 观感不一致） */
const LOCAL_FIELD_CONTROL = cn(
  CONTROL,
  "bg-background text-foreground antialiased",
);

const LOAD_MODELS_BTN =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

/** 一句话说明当前命题/导入默认落在何处（与 examStorage/policy、persistImported 模块行为一致） */
function currentExamPersistenceSummary(
  pref: ExamStoragePreference,
  o: DataSettingsOverview,
): { headline: string; sub?: string } {
  const localLabel = "本地（data/local-exams）";
  const sb = o.supabaseConfigured;
  const lw = o.localWritable;

  if (pref === "local") {
    if (lw) return { headline: localLabel };
    return {
      headline: "本地目录不可写，仅本次会话能存卷",
      sub: "请检查目录权限或改用「自动」。",
    };
  }

  if (pref === "supabase") {
    if (sb) {
      return {
        headline: "云端",
        sub: o.supabaseUrlHost ? `主机 ${o.supabaseUrlHost}` : undefined,
      };
    }
    if (lw) {
      return {
        headline: `${localLabel}（云端未配置，已回退）`,
      };
    }
    return {
      headline: "未配云端且本地不可写，仅本次会话能存",
      sub: "请配置云端或让本地目录可写。",
    };
  }

  if (pref === "builtin") {
    if (lw) {
      return {
        headline: `${localLabel}（新建优先写本地）`,
      };
    }
    if (sb) {
      return {
        headline: "云端（本地不可写时）",
        sub: o.supabaseUrlHost ? `主机 ${o.supabaseUrlHost}` : undefined,
      };
    }
    return {
      headline: "未配云端且本地不可写，仅本次会话能存",
    };
  }

  // auto
  if (sb) {
    return {
      headline: "云端（自动，优先写云端）",
      sub: o.supabaseUrlHost ? `主机 ${o.supabaseUrlHost}` : undefined,
    };
  }
  if (lw) {
    return {
      headline: `${localLabel}（自动，当前未配云端）`,
    };
  }
  return {
    headline: "未配云端且本地不可写，仅本次会话能存",
    sub: "请配置云端或让本地目录可写。",
  };
}

/** 用户常把 Lovable/网关 API Key 误填进「云端模型 ID」；模型名一般形如 google/… 或带 / */
function looksLikeApiKeyMistake(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^sk[-_]/i.test(t)) return true;
  if (t.length >= 32 && !t.includes("/") && /^[a-f0-9-]+$/i.test(t)) return true;
  return false;
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "设置 — 知学 Zhixue" },
      {
        name: "description",
        content: "模型推理配置与云端 / 本机数据库连接。",
      },
    ],
  }),
});

function SettingsPage() {
  const [settingsTab, setSettingsTab] = useState("ai");
  const probeFn = useServerFn(probeAiConnection);
  const probeToolFn = useServerFn(probeSubmitExamToolCallFn);
  const fetchDbFn = useServerFn(fetchAiSettingsFromDb);
  const saveDbFn = useServerFn(saveAiSettingsToDb);
  const loadModelsFn = useServerFn(listLocalModels);
  const [form, setForm] = useState<AiSettingsForm>(() => ({ ...DEFAULT_AI_SETTINGS }));
  const [mounted, setMounted] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toolTesting, setToolTesting] = useState(false);
  const [loadedModels, setLoadedModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [subjectModelsDialogOpen, setSubjectModelsDialogOpen] = useState(false);
  const [subjectModelsDraft, setSubjectModelsDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(loadAiSettings());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void (async () => {
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
  }, [mounted, fetchDbFn]);

  const update = <K extends keyof AiSettingsForm>(key: K, value: AiSettingsForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    saveAiSettings(form);
    try {
      const res = await saveDbFn({ data: form });
      if (res.ok) {
        toast.success("已保存：本机与数据库已同步（换浏览器后会自动加载）");
      } else if (res.reason === "no_supabase") {
        toast.success("已保存到本机浏览器；服务端未配置 Supabase，无法同步到其他设备");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "写入数据库失败");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const payload = toAiRuntimePayload(form);
      const res = await probeFn({ data: payload });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "探测失败");
    } finally {
      setTesting(false);
    }
  };

  const handleLoadModels = async () => {
    const url = form.localBaseUrl?.trim();
    if (!url) {
      toast.error("请先填写本地接口根 URL");
      return;
    }
    setLoadingModels(true);
    try {
      const res = await loadModelsFn({
        data: {
          localBaseUrl: url,
          localApiKey: form.localApiKey?.trim() || undefined,
        },
      });
      setLoadedModels(res.models);
      toast.success(
        `已加载 ${res.models.length} 个模型（${res.source === "ollama" ? "Ollama" : "OpenAI 兼容"}）`,
      );
      setForm((f) => {
        const next = { ...f };
        if (res.models.length > 0) {
          const cur = next.localModel?.trim() ?? "";
          if (!cur || !res.models.includes(cur)) {
            next.localModel = res.models[0];
          }
        }
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载模型列表失败");
    } finally {
      setLoadingModels(false);
    }
  };

  const subjectOverrideCount = Object.keys(form.localSubjectModels ?? {}).filter(
    (k) => (form.localSubjectModels?.[k] ?? "").trim(),
  ).length;

  const openSubjectModelsDialog = () => {
    setSubjectModelsDraft({ ...(form.localSubjectModels ?? {}) });
    setSubjectModelsDialogOpen(true);
  };

  const applySubjectModelsDialog = () => {
    setForm((f) => ({ ...f, localSubjectModels: { ...subjectModelsDraft } }));
    setSubjectModelsDialogOpen(false);
    toast.success("学科命题模型已应用；若需持久化请点击「保存设置」");
  };

  const handleTestSubmitExamTool = async () => {
    setToolTesting(true);
    try {
      const payload = toAiRuntimePayload(form);
      const res = await probeToolFn({ data: payload });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "submit_exam 探测失败");
    } finally {
      setToolTesting(false);
    }
  };

  if (!mounted) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const cloudMode = form.mode === "cloud";
  const cloudModelLooksLikeKey = looksLikeApiKeyMistake(form.cloudModel ?? "");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-display text-4xl md:text-5xl">设置</h1>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full">
        <TabsList className="mb-4 flex h-auto w-fit gap-1 rounded-md bg-muted/50 p-1">
          <TabsTrigger value="ai" className="gap-1.5 rounded-sm">
            <PlugZap className="h-3.5 w-3.5" />
            模型与接口
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5 rounded-sm">
            <Database className="h-3.5 w-3.5" />
            本地与数据库
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-0">
          <FormPanel className="space-y-6">
            <Field label="推理后端">
              <div className="flex flex-wrap gap-2">
                <ModeBtn active={cloudMode} onClick={() => update("mode", "cloud")}>
                  云端（Lovable Gateway）
                </ModeBtn>
                <ModeBtn active={!cloudMode} onClick={() => update("mode", "local")}>
                  本地（OpenAI 兼容）
                </ModeBtn>
              </div>
            </Field>

            {cloudMode ? (
              <>
                {!cloudModelLooksLikeKey && (
                  <p className="text-xs text-muted-foreground">
                    密钥在服务端 <code className="rounded bg-muted px-1 text-[11px]">.env</code>
                    （参考 <code className="rounded bg-muted px-1 text-[11px]">.env.example</code>
                    ）；此处仅模型 ID，可留空。
                  </p>
                )}
                <Field label="云端模型 ID（可选）">
                  <input
                    value={form.cloudModel ?? ""}
                    onChange={(e) => update("cloudModel", e.target.value)}
                    placeholder={DEFAULT_CLOUD_MODEL}
                    autoComplete="off"
                    aria-invalid={cloudModelLooksLikeKey}
                    className={cn(
                      CONTROL,
                      cloudModelLooksLikeKey &&
                        "border-destructive focus-visible:ring-destructive/30",
                    )}
                  />
                </Field>
                {cloudModelLooksLikeKey && (
                  <p className="text-sm text-destructive" role="alert">
                    勿填密钥于此；密钥进 .env，本框填模型 ID（通常含 <code className="text-xs">/</code>）。
                  </p>
                )}
              </>
            ) : (
              <>
                <Field
                  label="本地接口根 URL"
                  hint="如 http://127.0.0.1:11434；第三方勿以 /v1 结尾"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={form.localBaseUrl ?? ""}
                        onChange={(e) => update("localBaseUrl", e.target.value)}
                        placeholder="http://127.0.0.1:11434"
                        className={cn(LOCAL_FIELD_CONTROL, "min-w-0 flex-1 !w-auto")}
                      />
                      <button
                        type="button"
                        disabled={loadingModels || !form.localBaseUrl?.trim()}
                        onClick={() => void handleLoadModels()}
                        className={LOAD_MODELS_BTN}
                      >
                        {loadingModels ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlugZap className="h-4 w-4" />
                        )}
                        加载模型列表
                      </button>
                    </div>
                    {loadedModels.length > 0 && (
                      <p className="text-xs text-muted-foreground">已载入 {loadedModels.length} 个</p>
                    )}
                  </div>
                </Field>
                <Field label="本地默认模型">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {loadedModels.length > 0 ? (
                        <div className="relative min-w-0 flex-1">
                          <select
                            className={cn(
                              LOCAL_FIELD_CONTROL,
                              "w-full appearance-none cursor-pointer pr-9",
                            )}
                            value={
                              loadedModels.includes((form.localModel ?? "").trim())
                                ? (form.localModel ?? "").trim()
                                : (loadedModels[0] ?? "")
                            }
                            onChange={(e) => update("localModel", e.target.value)}
                            aria-label="选择本地默认模型"
                          >
                            {loadedModels.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
                        </div>
                      ) : (
                        <input
                          value={form.localModel ?? ""}
                          onChange={(e) => update("localModel", e.target.value)}
                          placeholder="例如 llama3.2:latest、gemma2:27b"
                          className={cn(LOCAL_FIELD_CONTROL, "min-w-0 flex-1 !w-auto")}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      )}
                      <button
                        type="button"
                        onClick={openSubjectModelsDialog}
                        className={LOAD_MODELS_BTN}
                        aria-label="打开学科命题模型设置"
                      >
                        <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                        设置学科命题模型
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      测试连接、「测试 submit_exam」与命题共用；未在右侧弹窗单独填写的学科，命题时亦使用此处所选模型。
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subjectOverrideCount > 0
                        ? `已单独指定 ${subjectOverrideCount} 门学科的命题模型`
                        : "尚未单独指定学科命题模型"}
                    </p>
                  </div>
                </Field>
                <Dialog open={subjectModelsDialogOpen} onOpenChange={setSubjectModelsDialogOpen}>
                  <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b border-border/60">
                      <DialogTitle>设置学科命题模型</DialogTitle>
                      <DialogDescription className="text-left leading-relaxed">
                        与命题页「学科」一致；未填写的学科将使用主界面「本地默认模型」
                        {loadedModels.length ? "（输入框可联想已加载列表）" : ""}。
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-2">
                      {CURRICULUM_SUBJECT_OPTIONS.map((s) => (
                        <div
                          key={s.id}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                        >
                          <span className="shrink-0 text-sm text-muted-foreground sm:w-[8.5rem]">
                            {s.label}
                          </span>
                          <input
                            value={subjectModelsDraft[s.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSubjectModelsDraft((prev) => {
                                const next = { ...prev };
                                if (!v.trim()) delete next[s.id];
                                else next[s.id] = v.trim();
                                return next;
                              });
                            }}
                            placeholder={`默认：${(form.localModel ?? "").trim() || "未填写主模型"}`}
                            className={cn(CONTROL, "font-mono text-[13px]")}
                            autoComplete="off"
                            spellCheck={false}
                            list={loadedModels.length ? `mpg-local-models-dlg-${s.id}` : undefined}
                          />
                          {loadedModels.length > 0 ? (
                            <datalist id={`mpg-local-models-dlg-${s.id}`}>
                              {loadedModels.map((m) => (
                                <option key={m} value={m} />
                              ))}
                            </datalist>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-6 py-4 shrink-0 bg-muted/20">
                      <button
                        type="button"
                        className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
                        onClick={() => setSubjectModelsDialogOpen(false)}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95"
                        onClick={applySubjectModelsDialog}
                      >
                        应用
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Field label="本地 API Key（可选）">
                  <input
                    type="password"
                    value={form.localApiKey ?? ""}
                    onChange={(e) => update("localApiKey", e.target.value)}
                    placeholder="留空表示无需鉴权"
                    autoComplete="off"
                    className={LOCAL_FIELD_CONTROL}
                  />
                </Field>
              </>
            )}

            <div
              className="flex flex-wrap gap-3 pt-2"
              title="本地请求经开发服务器转发；远程部署时不可用本机 127.0.0.1"
            >
              <button
                type="button"
                disabled={cloudMode && cloudModelLooksLikeKey}
                onClick={handleSave}
                title={
                  cloudMode && cloudModelLooksLikeKey
                    ? "请先修正云端模型 ID（勿填 API 密钥）"
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                保存设置
              </button>
              <button
                type="button"
                disabled={testing || (cloudMode && cloudModelLooksLikeKey)}
                onClick={handleTest}
                title={
                  cloudMode && cloudModelLooksLikeKey
                    ? "请先修正云端模型 ID"
                    : "检测接口是否可达"
                }
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                测试连接
              </button>
              <button
                type="button"
                disabled={toolTesting || testing || (cloudMode && cloudModelLooksLikeKey)}
                onClick={() => void handleTestSubmitExamTool()}
                title={
                  cloudMode && cloudModelLooksLikeKey
                    ? "请先修正云端模型 ID"
                    : "验证函数调用（命题需要）；可能产生费用"
                }
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {toolTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                测试 submit_exam
              </button>
            </div>
          </FormPanel>
        </TabsContent>

        <TabsContent value="data" className="mt-0">
          <DataStorageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataStorageTab() {
  const router = useRouter();
  const overviewFn = useServerFn(getDataSettingsOverview);
  const sqlFn = useServerFn(getBundledMigrationSql);
  const runMigrateFn = useServerFn(runBundledMigrationsOnServer);
  const mysqlUiFn = useServerFn(getMysqlSettingsUiState);
  const saveMysqlFn = useServerFn(saveMysqlConnectionSettings);
  const testMysqlFn = useServerFn(testMysqlConnectionFromForm);
  const createMysqlDbFn = useServerFn(createMysqlDatabaseFromForm);
  const applyMysqlFn = useServerFn(applyMysqlZhixueSchema);
  const mysqlSqlFn = useServerFn(getMysqlBundledSchemaSql);

  const [overview, setOverview] = useState<DataSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [bundledSql, setBundledSql] = useState<string | null>(null);
  const [sqlFileNames, setSqlFileNames] = useState<string[]>([]);
  const [migrateRunning, setMigrateRunning] = useState(false);
  const [storagePref, setStoragePref] = useState<ExamStoragePreference>("auto");

  const [mysqlUi, setMysqlUi] = useState<MysqlUiState | null>(null);
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

  useGenerationHabitsCloudSync();
  useEffect(() => {
    const bump = () => setHabitSnap(loadGenerationHabits());
    window.addEventListener("mpg-generation-habits-sync", bump);
    return () => window.removeEventListener("mpg-generation-habits-sync", bump);
  }, []);

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
      toast.error(e instanceof Error ? e.message : "加载失败");
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
      toast.error(e instanceof Error ? e.message : "读取迁移失败");
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
        toast.error(e instanceof Error ? e.message : "读取迁移失败");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板，请到 Supabase SQL Editor 粘贴执行");
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
      toast.error(e instanceof Error ? e.message : "执行失败");
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
      toast.success("MySQL 连接已保存到服务端 data/mysql-connection.json（勿提交 Git）");
      void refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
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
      toast.error(e instanceof Error ? e.message : "连接失败");
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
      toast.error(e instanceof Error ? e.message : "创建失败");
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
      toast.success("MySQL 建表脚本已执行（若表已存在则跳过创建）");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "执行失败");
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
      toast.error(e instanceof Error ? e.message : "读取失败");
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
        toast.error(e instanceof Error ? e.message : "读取失败");
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制 MySQL 建表 SQL");
    } catch {
      toast.error("复制失败");
    }
  };

  const mysqlSettingsContent = (
    <>
      {mysqlUi?.configured ? (
        <p className="text-xs text-muted-foreground">
          已保存{" "}
          <code className="rounded bg-muted px-1 text-[11px]">{mysqlUi.host}</code> /{" "}
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
          {mysqlBusy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          测试连接
        </button>
        <button
          type="button"
          disabled={!!mysqlBusy}
          onClick={() => void handleMysqlSave()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-95 disabled:opacity-50"
        >
          {mysqlBusy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
            {mysqlBusy === "sql" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
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
    <div className="space-y-8">
      <FormPanel className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">本机命题习惯</h2>
        {overview && !loading ? (
          <p className="text-xs text-muted-foreground">
            {overview.supabaseConfigured
              ? (() => {
                  const m = readHabitsLocalMeta();
                  return m?.lastPushOkAt
                    ? `云端习惯已写入 · ${new Date(m.lastPushOkAt).toLocaleString()}`
                    : "云端可同步：统计在变更后自动上传（失败摘要不入云）";
                })()
              : "未配 Supabase 时习惯仅本机；配置后自动备份统计到云端。"}
          </p>
        ) : null}
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5"
          title="启停与累计仍存本机；已配 Supabase 时与云端按时间合并"
        >
          <input
            id="mpg-autonomous-learning"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={habitSnap.autonomousLearningEnabled !== false}
            onChange={(e) => {
              setAutonomousLearningEnabled(e.target.checked);
              setHabitSnap(loadGenerationHabits());
              toast.success(e.target.checked ? "已开启自主学习优化" : "已关闭自主学习（不再注入习惯补强）");
            }}
          />
          <Label htmlFor="mpg-autonomous-learning" className="cursor-pointer text-sm text-foreground">
            启用命题自主学习优化
          </Label>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-sm space-y-1.5">
          <p>
            <span className="text-muted-foreground">成功命题：</span>
            {habitSnap.successCount} 次 ·{" "}
            <span className="text-muted-foreground">失败：</span>
            {habitSnap.failCount} 次
            {habitSnap.autonomousLearningEnabled !== false ? (
              <>
                {" "}
                · <span className="text-muted-foreground">当前场景连续成功：</span>
                {habitSnap.consecutiveSuccesses ?? 0} 次
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
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {Object.entries(habitSnap.errorCategoryCounts).map(([k, n]) =>
                n ? (
                  <li key={k}>
                    {GENERATION_ERROR_CATEGORY_LABELS[k as keyof typeof GENERATION_ERROR_CATEGORY_LABELS] ??
                      k}
                    ：{n}
                  </li>
                ) : null,
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">暂无失败类型记录。</p>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          onClick={() => {
            resetGenerationHabits();
            setHabitSnap(loadGenerationHabits());
            toast.success("已清空；若已配云端将同步为空统计（失败摘要本就仅存本机）");
          }}
        >
          <Eraser className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          清空习惯统计
        </button>
      </FormPanel>

      <FormPanel className="space-y-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Database className="h-4 w-4" />
          数据库概览
        </h2>
        {loading || !overview ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
          </p>
        ) : (
          <div className="space-y-5">
            {persistenceSummary ? (
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/[0.07] px-4 py-3 dark:bg-emerald-500/[0.05]">
                <div className="text-xs font-medium text-foreground">当前试卷保存位置</div>
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
                    <Label htmlFor="exam-store-auto" className="cursor-pointer font-normal leading-snug">
                      <span className="text-foreground">自动</span>
                      <span className="block text-xs text-muted-foreground">云端+本地，能写则入库</span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="builtin" id="exam-store-builtin" className="mt-0.5" />
                    <Label
                      htmlFor="exam-store-builtin"
                      className="cursor-pointer font-normal leading-snug"
                    >
                      <span className="text-foreground">项目内置 + 本地卷</span>
                      <span className="block text-xs text-muted-foreground">演示+本地，新建先本地</span>
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
                    本机与 MySQL
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              云端 <span className={overview.supabaseConfigured ? "text-emerald-700 dark:text-emerald-400" : ""}>
                {overview.supabaseConfigured ? "已连" : "未配"}
              </span>
              {overview.supabaseUrlHost ? (
                <>
                  {" "}
                  <code className="rounded bg-muted px-1 text-[10px]">{overview.supabaseUrlHost}</code>
                </>
              ) : null}
              {" · "}
              直连{" "}
              <span className={overview.databaseUrlConfigured ? "text-emerald-700 dark:text-emerald-400" : ""}>
                {overview.databaseUrlConfigured ? "已配" : "未配"}
              </span>
            </p>
          </div>
        )}
      </FormPanel>


      <Dialog open={cloudStorageConfigOpen} onOpenChange={setCloudStorageConfigOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>云端配置</DialogTitle>
            <DialogDescription>
              密钥只在 .env；下方加载 SQL 后在 Supabase SQL 窗执行，再配环境变量。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 text-[11px]">.env</code>：{" "}
              <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_URL</code> +{" "}
              <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code>
              ，改后重启。也可配{" "}
              <code className="rounded bg-muted px-1 text-[11px]">DATABASE_URL</code> 做迁移。
            </p>

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
              <p className="text-xs text-muted-foreground">
                需 <code className="rounded bg-muted px-1 text-[11px]">DATABASE_URL</code> 与{" "}
                <code className="rounded bg-muted px-1 text-[11px]">ALLOW_UI_DB_MIGRATIONS=true</code>
              </p>
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
              {overview && !overview.canRunUiMigration && (
                <p className="text-xs text-amber-800 dark:text-amber-200/90">条件未满足，按钮不可用</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={localStorageConfigOpen} onOpenChange={setLocalStorageConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              <Database className="h-4 w-4 shrink-0" />
              本机 MySQL
            </DialogTitle>
            <DialogDescription>本机 MySQL，用于建库/建表（与试卷本地目录不同）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">{mysqlSettingsContent}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md border px-4 py-2 text-sm transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-card hover:bg-accent")
      }
    >
      {children}
    </button>
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
