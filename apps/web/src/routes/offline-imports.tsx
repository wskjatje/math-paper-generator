import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Calendar,
  Cloud,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { ImportOfflineExamDialog } from "@/components/ImportOfflineExamDialog";
import {
  ExamCardActionRow,
  EXAM_CARD_ACTION_LABEL_CLASS,
} from "@/components/exam/ExamCardActionRow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RemoteImportJobQueueControl } from "@/components/remoteImport/RemoteImportJobQueueControl";
import {
  fetchAiSettingsFromDb,
  generateExamplesForExistingExam,
  getBackendCapabilities,
  listExamsForOfflineImports,
  listRemotePaperCatalogEntries,
  promoteImportedExamFromStaging,
  softDeleteUserExam,
} from "@/lib/exam.functions.server";
import {
  CURRICULUM_SUBJECT_OPTIONS,
  GRADE_LEVEL_OPTIONS,
  PAPER_KIND_OPTIONS,
  curriculumOptionsForGrade,
  paperKindLabel,
} from "@/lib/generateCatalog";
import type { RemotePaperCatalogEntry } from "@/lib/remotePaperCatalog.server";
import { loadRemoteImportJobs, upsertRemoteImportJob } from "@/lib/remoteImportJobsStorage";
import { requestRemoteImportQueueDrain } from "@/lib/remoteImportQueueDrain";
import { loadAiSettings, saveAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { syncExamStoragePreferenceToCookie } from "@/lib/examStoragePreference";
import { examProvenance, userExamSoftDeletable } from "@/lib/examProvenance";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type Exam,
  type QuestionType,
} from "@/lib/types";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/offline-imports")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "staging" ? ("staging" as const) : ("formal" as const),
  }),
  loader: () => listExamsForOfflineImports(),
  component: OfflineImports,
  head: () => ({
    meta: [
      { title: "导入线下试卷 — 知学 Zhixue" },
      {
        name: "description",
        content:
          "上传 PDF/Word/Excel/图片 等由 AI 整理入库，单独列表管理线下导入卷，与 AI 命题区分。",
      },
    ],
  }),
});

function isQuestionType(t: string): t is QuestionType {
  return Object.prototype.hasOwnProperty.call(QUESTION_TYPE_LABELS, t);
}

function OfflineImports() {
  const { exams: rawExams } = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const exams = rawExams as unknown as Exam[];
  const router = useRouter();
  const navigate = useNavigate();
  const examplesFn = useServerFn(generateExamplesForExistingExam);
  const deleteExamFn = useServerFn(softDeleteUserExam);
  const capsFn = useServerFn(getBackendCapabilities);
  const fetchAiDbFn = useServerFn(fetchAiSettingsFromDb);

  const [q, setQ] = useState("");
  const [persistEnabled, setPersistEnabled] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [examplesExam, setExamplesExam] = useState<Exam | null>(null);
  const [removeExam, setRemoveExam] = useState<Exam | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [pickedTypes, setPickedTypes] = useState<QuestionType[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);

  const [listYear, setListYear] = useState<number | "">("");
  const [listGradeId, setListGradeId] = useState("");
  const [listSubjectId, setListSubjectId] = useState("");
  const [listPaperKind, setListPaperKind] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogRows, setCatalogRows] = useState<RemotePaperCatalogEntry[]>([]);
  /** 最近一次目录加载成功但条数为 0，用于页内提示（不用 toast 冒充报错） */
  const [catalogNoMatch, setCatalogNoMatch] = useState(false);
  const [promoteBusyId, setPromoteBusyId] = useState<string | null>(null);
  const [integrationCaps, setIntegrationCaps] = useState({
    openNotebook: false,
    plaintextExtract: false,
    ocrRepairLexiconPersistence: "local_file" as "supabase" | "mysql" | "local_file",
    importFiguresStorage: "local" as "supabase" | "local",
    importDualTrackGateEnabled: false,
  });

  const listCatalogFn = useServerFn(listRemotePaperCatalogEntries);
  const promoteFn = useServerFn(promoteImportedExamFromStaging);

  useEffect(() => {
    syncExamStoragePreferenceToCookie();
    void router.invalidate();
  }, [router]);

  useEffect(() => {
    void capsFn().then((c) => {
      setPersistEnabled(c.examPersistenceEnabled);
      setIntegrationCaps({
        openNotebook: c.openNotebookIntegrationConfigured === true,
        plaintextExtract: c.plaintextExtractServiceConfigured === true,
        ocrRepairLexiconPersistence: c.ocrRepairLexiconPersistence ?? "local_file",
        importFiguresStorage: c.importFiguresStorage ?? "local",
        importDualTrackGateEnabled: c.importDualTrackGateEnabled === true,
      });
    });
  }, [capsFn]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchAiDbFn();
        if (res.ok) saveAiSettings(res.settings);
      } catch (e) {
        console.warn("[offline-imports] fetchAiSettingsFromDb:", e);
      }
    })();
  }, [fetchAiDbFn]);

  useEffect(() => {
    if (!examplesExam) return;
    const raw = examplesExam.question_types ?? [];
    const valid = raw.filter(isQuestionType);
    setPickedTypes(valid.length ? valid : []);
  }, [examplesExam]);

  const importedOnly = useMemo(
    () => exams.filter((e) => examProvenance(e) === "imported"),
    [exams],
  );

  const importedFormal = useMemo(
    () => importedOnly.filter((e) => e.import_review_status !== "staging"),
    [importedOnly],
  );

  const importedStaging = useMemo(
    () => importedOnly.filter((e) => e.import_review_status === "staging"),
    [importedOnly],
  );

  const subjectOptionsForPicker = useMemo(
    () => curriculumOptionsForGrade(listGradeId),
    [listGradeId],
  );

  const filterBySearch = useCallback(
    (list: Exam[]) => {
      if (!q.trim()) return list;
      const needle = q.toLowerCase();
      return list.filter((e) =>
        `${e.title} ${e.subtitle ?? ""} ${(e.subjects ?? []).join(" ")}`
          .toLowerCase()
          .includes(needle),
      );
    },
    [q],
  );

  const sortedFormal = useMemo(() => {
    return [...filterBySearch(importedFormal)].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [importedFormal, filterBySearch]);

  const sortedStaging = useMemo(() => {
    return [...filterBySearch(importedStaging)].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [importedStaging, filterBySearch]);

  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = 2026; y >= 2010; y--) ys.push(y);
    return ys;
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void (async () => {
        setCatalogBusy(true);
        setCatalogNoMatch(false);
        try {
          const res = await listCatalogFn({
            data: {
              year: listYear === "" ? undefined : Number(listYear),
              gradeId: listGradeId.trim() || undefined,
              subjectId: listSubjectId.trim() || undefined,
              paperKind: listPaperKind.trim() || undefined,
            },
          });
          setCatalogRows(res.entries);
          setCatalogNoMatch(res.entries.length === 0);
        } catch (e: unknown) {
          setCatalogRows([]);
          setCatalogNoMatch(false);
          toast.error(e instanceof Error ? e.message : "加载目录失败");
        } finally {
          setCatalogBusy(false);
        }
      })();
    }, 350);
    return () => window.clearTimeout(id);
  }, [listYear, listGradeId, listSubjectId, listPaperKind, listCatalogFn]);

  const toggleType = (t: QuestionType) => {
    setPickedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submitExamples = async () => {
    if (!examplesExam) return;
    if (!pickedTypes.length) {
      toast.error("请至少勾选一种题型");
      return;
    }
    setExamplesLoading(true);
    try {
      await examplesFn({
        data: {
          examId: examplesExam.id,
          types: pickedTypes,
          ai: toAiRuntimePayload(loadAiSettings()),
        },
      });
      const openedExamId = examplesExam.id;
      toast.success("例题生成完成", {
        description: "可在试卷详情查看同型例题",
        action: {
          label: "打开试卷",
          onClick: () => void navigate({ to: "/exam/$id", params: { id: openedExamId } }),
        },
      });
      setExamplesExam(null);
      void router.invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setExamplesLoading(false);
    }
  };

  const submitRemoveExam = async () => {
    if (!removeExam) return;
    setRemoveBusy(true);
    try {
      await deleteExamFn({ data: { id: removeExam.id } });
      toast.success("已从题库删除（逻辑删除）");
      setRemoveExam(null);
      void router.invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setRemoveBusy(false);
    }
  };

  const catalogEntryInFlight = (entryId: string) =>
    loadRemoteImportJobs().some(
      (j) =>
        j.importSource !== "web" &&
        j.catalogEntryId === entryId &&
        (j.status === "queued" || j.status === "running"),
    );

  const enqueueRemoteImport = async (
    entry: RemotePaperCatalogEntry,
    opts?: { silent?: boolean },
  ): Promise<boolean> => {
    if (catalogEntryInFlight(entry.id)) {
      if (!opts?.silent) {
        toast.message("该试卷已在队列中", {
          description: "请在网上导入队列中查看进度。",
        });
      }
      return false;
    }
    const gradeLabel =
      GRADE_LEVEL_OPTIONS.find((g) => g.id === entry.gradeId)?.label ?? entry.gradeId;
    const subjectLabel =
      CURRICULUM_SUBJECT_OPTIONS.find((s) => s.id === entry.subjectId)?.label ?? entry.subjectId;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await upsertRemoteImportJob({
      id,
      importSource: "catalog",
      catalogEntryId: entry.id,
      title: entry.title,
      year: entry.year,
      gradeLabel,
      subjectLabel,
      paperSceneLabel: entry.paper_kind ? paperKindLabel(entry.paper_kind) : undefined,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    requestRemoteImportQueueDrain();
    if (!opts?.silent) {
      toast.success("已加入网上导入队列", {
        description: "同一时间仅执行 1 条任务；进度见右上角「网上导入队列」。",
      });
    }
    return true;
  };

  const submitPromoteStaging = async (examId: string) => {
    setPromoteBusyId(examId);
    try {
      await promoteFn({ data: { examId } });
      toast.success("已确认入库", {
        description: "试卷已移入本页「正式库」标签，不会进入「试卷库」。",
      });
      void router.invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "确认失败");
    } finally {
      setPromoteBusyId(null);
    }
  };

  const renderExamGrid = (list: Exam[], staging: boolean) => (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {list.map((e) => {
        const types = (e.question_types ?? []).filter(isQuestionType);
        const canExamples =
          persistEnabled === true && types.length > 0 && e.storage_source !== "project";
        const importParseRollup = parseImportParseQualityRollup(e.import_parse_quality ?? null);

        return (
          <div
            key={e.id}
            className="paper-card flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/8 px-2 py-0.5 text-primary">
                {DIFFICULTY_LABELS[e.difficulty as Difficulty] ?? e.difficulty}
              </span>
              <span
                className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-900 dark:text-emerald-100"
                title="由「导入线下卷」写入"
              >
                线下导入
              </span>
              {staging ? (
                <span
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-950 dark:text-amber-100"
                  title="待核对草稿；确认后进入本页正式库（不进试卷库）"
                >
                  待确认
                </span>
              ) : null}
              {importParseRollup && importParseRollup.rollup_tier !== "green" ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    importParseRollup.rollup_tier === "red"
                      ? "border-red-500/45 bg-red-500/10 text-red-950 dark:text-red-100"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
                  )}
                  title={importParseRollup.summary_lines.join(" ")}
                >
                  质检·{importParseRollup.rollup_tier === "red" ? "红" : "黄"}
                </span>
              ) : null}
              {e.storage_source === "local" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title="本地 data/local-exams"
                >
                  <HardDrive className="h-3 w-3 shrink-0 opacity-80" />
                  本地
                </span>
              ) : e.storage_source === "supabase" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-900 dark:text-sky-100"
                  title="Supabase 云端"
                >
                  <Cloud className="h-3 w-3 shrink-0 opacity-80" />
                  云端
                </span>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3 opacity-70" />
                {new Date(e.created_at).toLocaleDateString("zh-CN")}
              </span>
            </div>
            <Link to="/exam/$id" params={{ id: e.id }} className="group mt-3 block flex-1">
              <h3 className="text-display text-xl transition-colors group-hover:text-primary line-clamp-2">
                {e.title}
              </h3>
              {e.subtitle && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{e.subtitle}</p>
              )}
            </Link>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(e.subjects ?? []).slice(0, 5).map((s) => (
                <span
                  key={s}
                  className="text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {e.duration_min} 分钟 · {e.total_score} 分
              </span>
            </div>
            {types.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {types.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[11px] text-primary"
                  >
                    {QUESTION_TYPE_LABELS[t]}
                  </span>
                ))}
              </div>
            )}
            {staging ? (
              <div className="mt-4">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 w-full"
                  disabled={promoteBusyId === e.id}
                  onClick={() => void submitPromoteStaging(e.id)}
                >
                  {promoteBusyId === e.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      确认中…
                    </>
                  ) : (
                    "确认入库（正式库）"
                  )}
                </Button>
              </div>
            ) : null}
            <ExamCardActionRow
              examId={e.id}
              canRemove={userExamSoftDeletable(e)}
              onRemove={() => setRemoveExam(e)}
              hasMiddleAction={!e.has_examples}
              middle={
                e.has_examples ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full min-w-0 gap-1.5 border-border bg-card shadow-sm hover:bg-muted/55"
                    disabled={!canExamples || examplesLoading}
                    title={
                      persistEnabled === false
                        ? "配置云端或本地可写后可生成例题"
                        : types.length === 0
                          ? "无题型数据"
                          : e.storage_source === "local"
                            ? "例题追加写入本地"
                            : "按勾选题型生成配套例题"
                    }
                    onClick={() => setExamplesExam(e)}
                  >
                    <BookOpenCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    <span className={cn(EXAM_CARD_ACTION_LABEL_CLASS, "truncate")}>生成例题</span>
                  </Button>
                )
              }
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-display text-4xl md:text-5xl">导入线下试卷</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void router.invalidate();
                toast.success("列表已刷新");
              }}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <RemoteImportJobQueueControl />
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={persistEnabled === false || persistEnabled === null}
              title={
                persistEnabled === false
                  ? "需配置 Supabase 或可写的 data/local-exams"
                  : persistEnabled === null
                    ? "正在检测持久化…"
                    : undefined
              }
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" />
              导入线下卷
            </Button>
          </div>
        </div>

        <Alert className="mb-6 border-border/80 bg-muted/25">
          <AlertTitle className="text-sm">线下导入建议流程（零依赖）</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>
                上传文件 → 在预览区核对正文（可选用 AI 语义修复 / 服务端配置的外部正文增强）。
              </li>
              <li>点「AI 整理并写入待确认」→ 草稿进入「待确认（临时库）」标签页。</li>
              <li>
                打开试卷核对题目与公式 → 满意后再点「确认入库（正式库）」；确认后仍在本页管理，<strong>不会</strong>进入「试卷库」。
              </li>
            </ol>
            <p className="mt-2">
              可选松耦合：单独部署 Open Notebook
              时，在导入对话框可将同一预览正文同步为对方资料源（需服务端环境变量）；自建 HTTP
              正文服务见{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                docs/architecture/open-notebook-and-extract-integration.md
              </code>
              。
            </p>
          </AlertDescription>
        </Alert>

        <div className="paper-card mb-6 flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">从网上获取历年试卷</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            应用<strong className="font-medium text-foreground">不会</strong>
            自动从任意网站爬取整套真题；真实试卷须由您在
            <strong className="font-medium text-foreground">有权使用</strong>
            的前提下，自行维护清单（正文见条目中的{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              plainText
            </code> 或托管的{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">textUrl</code>
            纯文本）。清单来源：本地{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              data/remote-paper-catalog.json
            </code>
            ，及可选环境变量{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              MPG_REMOTE_IMPORT_CATALOG_URL
            </code>
            （HTTPS JSON，与本地合并）。字段{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">paper_kind</code>{" "}
            与命题页试卷场景 id 一致。合规说明与流水线示例见{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              docs/remote-paper-catalog.md
            </code>
            。修改上方筛选后，系统会加载匹配清单；在表格中逐条「加入导入队列」（须已配置可写题库）。
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              年份
              <select
                value={listYear === "" ? "" : String(listYear)}
                onChange={(ev) => {
                  const v = ev.target.value;
                  setListYear(v === "" ? "" : Number(v));
                }}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              >
                <option value="">不限</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-muted-foreground">
              年级
              <select
                value={listGradeId}
                onChange={(ev) => {
                  setListGradeId(ev.target.value);
                  setListSubjectId("");
                }}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              >
                <option value="">不限</option>
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs text-muted-foreground">
              学科
              <select
                value={listSubjectId}
                onChange={(ev) => setListSubjectId(ev.target.value)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              >
                <option value="">不限</option>
                {subjectOptionsForPicker.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[11rem] flex-col gap-1 text-xs text-muted-foreground">
              试卷场景
              <select
                value={listPaperKind}
                onChange={(ev) => setListPaperKind(ev.target.value)}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
              >
                <option value="">不限</option>
                {PAPER_KIND_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {catalogBusy ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground pb-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                加载清单…
              </span>
            ) : null}
          </div>
          {catalogNoMatch ? (
            <div
              role="status"
              className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground"
            >
              <p className="font-medium text-foreground">当前筛选条件下没有目录条目</p>
              <p className="mt-1.5 text-xs leading-relaxed">
                默认仓库内清单可能为空：请在有权使用的试卷文本就绪后，编辑{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  data/remote-paper-catalog.json
                </code>{" "}
                或配置{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  MPG_REMOTE_IMPORT_CATALOG_URL
                </code>
                ，填写 <code className="rounded bg-muted px-1 py-0.5 text-[11px]">year</code>、
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">gradeId</code>、
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">subjectId</code>、
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">paper_kind</code>{" "}
                及正文来源（
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">plainText</code> /{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">textUrl</code>
                ）。也可放宽年份或学科为「不限」再试。详见{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  docs/remote-paper-catalog.md
                </code>
                。
              </p>
            </div>
          ) : null}
          {catalogRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                    <th className="px-3 py-2">标题</th>
                    <th className="px-3 py-2">年份</th>
                    <th className="px-3 py-2">年级</th>
                    <th className="px-3 py-2">学科</th>
                    <th className="px-3 py-2">试卷场景</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogRows.map((row) => {
                    const gLabel =
                      GRADE_LEVEL_OPTIONS.find((g) => g.id === row.gradeId)?.label ?? row.gradeId;
                    const sLabel =
                      CURRICULUM_SUBJECT_OPTIONS.find((s) => s.id === row.subjectId)?.label ??
                      row.subjectId;
                    return (
                      <tr key={row.id} className="border-b border-border/40 last:border-0">
                        <td className="max-w-[240px] px-3 py-2 font-medium line-clamp-2">
                          {row.title}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {row.year}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {gLabel}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {sLabel}
                        </td>
                        <td className="max-w-[160px] px-3 py-2 text-xs text-muted-foreground">
                          {row.paper_kind ? paperKindLabel(row.paper_kind) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={persistEnabled === false || persistEnabled === null}
                            onClick={() => void enqueueRemoteImport(row)}
                          >
                            加入导入队列
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="paper-card mb-6 flex flex-col gap-3 p-4">
          <div className="relative min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="在当前标签页的列表中搜索标题、副标题、学科…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(next) => {
            void navigate({
              to: "/offline-imports",
              search: { tab: next as "formal" | "staging" },
              replace: true,
            });
          }}
          className="w-full"
        >
          <TabsList className="mb-4 flex h-auto w-full flex-wrap gap-1 rounded-md bg-muted/50 p-1 sm:w-fit">
            <TabsTrigger value="formal" className="gap-1.5 rounded-sm">
              正式导入
              {importedFormal.length > 0 ? (
                <span className="text-[10px] text-muted-foreground">({importedFormal.length})</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="staging" className="gap-1.5 rounded-sm">
              待确认（临时库）
              {importedStaging.length > 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  ({importedStaging.length})
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="formal" className="mt-0">
            {sortedFormal.length === 0 ? (
              <div className="paper-card p-16 text-center">
                <p className="text-muted-foreground">
                  {importedFormal.length === 0
                    ? "尚无已入库的线下导入试卷。可上传文件，或使用上方清单逐条加入「网上导入队列」。"
                    : "没有符合搜索条件的试卷。"}
                </p>
                <Button type="button" className="mt-4" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  导入线下卷
                </Button>
              </div>
            ) : (
              renderExamGrid(sortedFormal, false)
            )}
          </TabsContent>
          <TabsContent value="staging" className="mt-0">
            {sortedStaging.length === 0 ? (
              <div className="paper-card p-16 text-center">
                <p className="text-muted-foreground">
                  {importedStaging.length === 0
                    ? "临时库为空。完成「网上导入队列」中的任务后，试卷会出现在此处，核对后可确认入库。"
                    : "没有符合搜索条件的待确认试卷。"}
                </p>
              </div>
            ) : (
              renderExamGrid(sortedStaging, true)
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ImportOfflineExamDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        gatewayOcrConfiguredOnServer={integrationCaps.gatewayOcrConfigured}
        importDualTrackGateEnabled={integrationCaps.importDualTrackGateEnabled}
        ocrRepairLexiconPersistence={integrationCaps.ocrRepairLexiconPersistence}
        importFiguresStorage={integrationCaps.importFiguresStorage}
        integration={{
          openNotebook: integrationCaps.openNotebook,
          plaintextExtract: integrationCaps.plaintextExtract,
        }}
        onImported={() => {
          void router.invalidate();
          void navigate({
            to: "/offline-imports",
            search: { tab: "staging" },
            replace: true,
          });
        }}
      />

      <Dialog
        open={removeExam !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveExam(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>从题库删除？</DialogTitle>
            <DialogDescription>
              「{removeExam?.title ?? ""}」将标记为逻辑删除；本页列表中不再出现。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveExam(null)}
              disabled={removeBusy}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void submitRemoveExam()}
              disabled={removeBusy}
            >
              {removeBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                "确认删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={examplesExam !== null}
        onOpenChange={(open) => {
          if (!open) setExamplesExam(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>按题型生成例题</DialogTitle>
            <DialogDescription>按勾选的题型生成配套例题；入库后在试卷详情查看。</DialogDescription>
          </DialogHeader>
          {examplesExam && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground line-clamp-2">
                {examplesExam.title}
              </p>
              {(examplesExam.question_types ?? []).filter(isQuestionType).length === 0 ? (
                <p className="text-sm text-muted-foreground">该试卷暂无题型数据。</p>
              ) : (
                <ul className="space-y-2">
                  {(examplesExam.question_types ?? []).filter(isQuestionType).map((t) => (
                    <li key={t} className="flex items-center gap-3">
                      <Checkbox
                        id={`offline-qt-${t}`}
                        checked={pickedTypes.includes(t)}
                        onCheckedChange={() => toggleType(t)}
                      />
                      <label htmlFor={`offline-qt-${t}`} className="cursor-pointer text-sm">
                        {QUESTION_TYPE_LABELS[t]}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExamplesExam(null)}
              disabled={examplesLoading}
            >
              取消
            </Button>
            <Button type="button" onClick={() => void submitExamples()} disabled={examplesLoading}>
              {examplesLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中…
                </>
              ) : (
                "开始生成"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
