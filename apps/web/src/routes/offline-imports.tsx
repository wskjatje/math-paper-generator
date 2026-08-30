import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Calendar,
  Cloud,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

import { ImportOfflineExamDialog } from "@/components/ImportOfflineExamDialog";
import {
  ExamCardActionRow,
  EXAM_CARD_ACTION_LABEL_CLASS,
} from "@/components/exam/ExamCardActionRow";
import { ExamQualityStatusBadge } from "@/components/exam/ExamQualityStatusBadge";
import { EXAM_QUALITY_REMEDIATION, GENERATE_DEFAULTS } from "@/config/examDomain";
import {
  examQualityValidateIsLocked,
} from "@/lib/examQualityReport.shared";
import {
  suggestedActionsForIssues,
  type ExamQualityActionId,
} from "@/lib/examQualityRemediation.shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
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
import { FilterToolbar } from "@/components/ui/filter-chip";
import { RemoteImportJobQueueControl } from "@/components/remoteImport/RemoteImportJobQueueControl";
import { ImportReviewWorkbench } from "@/components/remoteImport/ImportReviewWorkbench";
import {
  EXAM_LIST_PAGE_SIZE,
  SimplePager,
  pageCountFor,
  paginateSlice,
} from "@/components/list/SimplePager";
import {
  fetchAiSettingsFromDb,
  generateExamplesForExistingExam,
  getBackendCapabilities,
  listExamsForOfflineImports,
  promoteImportedExamFromStaging,
  remediateExamQuality,
  softDeleteUserExam,
  validateExamQuality,
} from "@/lib/exam.functions.server";
import {
  CURRICULUM_SUBJECT_OPTIONS,
  GRADE_LEVEL_OPTIONS,
  PAPER_KIND_OPTIONS,
  curriculumSubjectIdsFromExamSubjects,
  emptyQuestionComposition,
  paperKindLabel,
  preferredGradeIdFromExamSubjects,
  type PaperKindId,
} from "@/lib/generateCatalog";
import { loadAiSettings, saveAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { syncExamStoragePreferenceToCookie } from "@/lib/examStoragePreference";
import { examProvenance, userExamSoftDeletable } from "@/lib/examProvenance";
import { writePaperPrefillPayload } from "@/lib/generationJobsStorage";
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

function paperKindIdFromExam(exam: Exam): PaperKindId | undefined {
  const tag = (exam.subjects ?? []).find((s) => s.startsWith("试卷场景:"));
  if (!tag) return undefined;
  const label = tag.slice("试卷场景:".length).trim();
  const hit = PAPER_KIND_OPTIONS.find((o) => o.label === label);
  return hit?.id as PaperKindId | undefined;
}

function prefillGenerateFromImportedExam(exam: Exam) {
  const grade = preferredGradeIdFromExamSubjects(exam.subjects) ?? "";
  const subjectIds = curriculumSubjectIdsFromExamSubjects(exam.subjects);
  const subject = subjectIds[0] ?? "";
  const paper_kind = paperKindIdFromExam(exam) ?? ("regular_daily" as PaperKindId);
  const edition =
    typeof exam.textbook_edition === "string" ? exam.textbook_edition.trim() : "";
  const curriculumNote =
    typeof exam.curriculum_version === "string" && exam.curriculum_version.trim()
      ? `建议课件版本：${exam.curriculum_version.trim()}`
      : "";
  writePaperPrefillPayload({
    title: `${exam.title}（仿照生成）`.slice(0, 120),
    grade,
    subject,
    scopes: [],
    competition_focus: [],
    paper_kind,
    difficulty: exam.difficulty,
    duration_min: exam.duration_min || GENERATE_DEFAULTS.duration_min,
    total_score: exam.total_score || GENERATE_DEFAULTS.total_score,
    compositionPayload: [],
    composition: emptyQuestionComposition(),
    customCompositionSlots: [],
    compositionRowOrder: [],
    notes: curriculumNote,
    allow_overlap_with_library_question_types: true,
    textbook_edition_hint: edition || undefined,
    textbook_edition: edition || undefined,
  });
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
  const [formalPage, setFormalPage] = useState(1);
  const [stagingPage, setStagingPage] = useState(1);
  const [persistEnabled, setPersistEnabled] = useState<boolean | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [examplesExam, setExamplesExam] = useState<Exam | null>(null);
  const [removeExam, setRemoveExam] = useState<Exam | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [pickedTypes, setPickedTypes] = useState<QuestionType[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);

  const [promoteBusyId, setPromoteBusyId] = useState<string | null>(null);
  const [reviewDocumentId, setReviewDocumentId] = useState<string | null>(null);
  const [integrationCaps, setIntegrationCaps] = useState({
    openNotebook: false,
    plaintextExtract: false,
    ocrRepairLexiconPersistence: "local_file" as "supabase" | "mysql" | "local_file",
    importFiguresStorage: "local" as "supabase" | "local",
    importDualTrackGateEnabled: false,
    gatewayOcrConfigured: false,
  });

  const promoteFn = useServerFn(promoteImportedExamFromStaging);
  const validateQualityFn = useServerFn(validateExamQuality);
  const remediateQualityFn = useServerFn(remediateExamQuality);
  const [qualityBusyId, setQualityBusyId] = useState<string | null>(null);

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
        gatewayOcrConfigured: c.gatewayOcrConfigured === true,
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

  const pageFormal = useMemo(
    () => paginateSlice(sortedFormal, formalPage, EXAM_LIST_PAGE_SIZE),
    [sortedFormal, formalPage],
  );
  const pageStaging = useMemo(
    () => paginateSlice(sortedStaging, stagingPage, EXAM_LIST_PAGE_SIZE),
    [sortedStaging, stagingPage],
  );

  useEffect(() => {
    setFormalPage(1);
  }, [q, importedFormal.length]);
  useEffect(() => {
    setStagingPage(1);
  }, [q, importedStaging.length]);
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
        action: {
          label: "打开试卷",
          onClick: () => void navigate({ to: "/exam/$id", params: { id: openedExamId } }),
        },
      });
      setExamplesExam(null);
      void router.invalidate();
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "生成失败"));
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
      toast.error(toUserFacingErrorMessage(e, "删除失败"));
    } finally {
      setRemoveBusy(false);
    }
  };

  const submitPromoteStaging = async (examId: string) => {
    setPromoteBusyId(examId);
    try {
      await promoteFn({ data: { examId } });
      toast.success("已确认入库");
      void router.invalidate();
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "确认失败"));
    } finally {
      setPromoteBusyId(null);
    }
  };

  const runValidateExam = async (examId: string) => {
    if (qualityBusyId) return;
    setQualityBusyId(examId);
    try {
      const res = (await validateQualityFn({ data: { examId } })) as {
        report: { issueCount: number };
      };
      await router.invalidate();
      if (res.report.issueCount === 0) toast.success("验证通过");
      else toast.message(`发现 ${res.report.issueCount} 项问题`);
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "验证失败"));
    } finally {
      setQualityBusyId(null);
    }
  };

  const runRepairExam = async (exam: Exam) => {
    if (qualityBusyId) return;
    if (examQualityValidateIsLocked(exam)) {
      toast.message("已通过验证，无需修复");
      return;
    }
    const issues = exam.quality_report?.issues ?? [];
    let actions: ExamQualityActionId[] =
      issues.length > 0
        ? suggestedActionsForIssues(issues)
        : ["regenerate_failing_questions"];
    if (!actions.includes("regenerate_failing_questions")) {
      actions = [...actions, "regenerate_failing_questions"];
    }
    setQualityBusyId(exam.id);
    try {
      if (!exam.quality_report || (exam.quality_report.issueCount ?? 0) === 0) {
        await validateQualityFn({ data: { examId: exam.id } });
      }
      const ai = toAiRuntimePayload(loadAiSettings());
      const res = (await remediateQualityFn({
        data: {
          examId: exam.id,
          actions,
          revalidate: true,
          ai,
        },
      })) as { notes: string[]; report: { status?: string } | null };
      await router.invalidate();
      const summary = res.notes.join("；") || "已处置";
      if (res.report?.status === "pass") toast.success(summary);
      else toast.message(summary);
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "修复失败"));
    } finally {
      setQualityBusyId(null);
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
              <ExamQualityStatusBadge exam={e} showUnknown />
              {staging ? (
                <span
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-950 dark:text-amber-100"
                  title="待核对，确认后入正式库"
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
                  版面·{importParseRollup.rollup_tier === "red" ? "红" : "黄"}
                </span>
              ) : null}
              {e.storage_source === "local" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title="保存在本机"
                >
                  <HardDrive className="h-3 w-3 shrink-0 opacity-80" />
                  本地
                </span>
              ) : e.storage_source === "supabase" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-900 dark:text-sky-100"
                  title="保存在云端"
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
              <div className="mt-4 space-y-2">
                {e.source_document_id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 w-full"
                    onClick={() => setReviewDocumentId(e.source_document_id!)}
                  >
                    核对差异（原图对照）
                  </Button>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={qualityBusyId != null || examQualityValidateIsLocked(e)}
                    onClick={() => void runValidateExam(e.id)}
                  >
                    {qualityBusyId === e.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "验证"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    disabled={qualityBusyId != null || examQualityValidateIsLocked(e)}
                    onClick={() => void runRepairExam(e)}
                  >
                    {EXAM_QUALITY_REMEDIATION.actionLabels.regenerate_failing_questions}
                  </Button>
                </div>
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
            ) : (
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={qualityBusyId != null || examQualityValidateIsLocked(e)}
                    onClick={() => void runValidateExam(e.id)}
                  >
                    {qualityBusyId === e.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "验证"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    disabled={qualityBusyId != null || examQualityValidateIsLocked(e)}
                    onClick={() => void runRepairExam(e)}
                  >
                    {EXAM_QUALITY_REMEDIATION.actionLabels.regenerate_failing_questions}
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-9 w-full"
                  onClick={() => {
                    prefillGenerateFromImportedExam(e);
                    void navigate({ to: "/generate" });
                  }}
                >
                  仿照生成
                </Button>
              </div>
            )}
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
      <PageShell size="full">
        <PageHeader
          title="导入线下试卷"
          actions={
            <div className="flex flex-wrap items-center gap-2">
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
                  ? "请先在设置中配置试卷保存位置"
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
          }
        />


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
          <FilterToolbar className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <TabsList
              variant="portal"
              className="border-border/50 bg-background/70"
            >
              <TabsTrigger variant="portal" value="formal">
                正式导入
                {importedFormal.length > 0 ? (
                  <span className="text-[10px] opacity-80">({importedFormal.length})</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger variant="portal" value="staging">
                待确认（临时库）
                {importedStaging.length > 0 ? (
                  <span className="text-[10px] opacity-80">({importedStaging.length})</span>
                ) : null}
              </TabsTrigger>
            </TabsList>
            <div className="relative min-w-[12rem] w-full flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索标题、副标题、学科…"
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </FilterToolbar>
          <TabsContent value="formal" className="mt-0">
            {sortedFormal.length === 0 ? (
              <div className="paper-card px-6 py-10 text-center">
                <p className="text-muted-foreground">
                  {importedFormal.length === 0 ? "暂无已导入试卷" : "没有符合搜索的试卷"}
                </p>
                <Button type="button" className="mt-4" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  导入线下卷
                </Button>
              </div>
            ) : (
              <>
                {renderExamGrid(pageFormal, false)}
                <SimplePager
                  page={formalPage}
                  pageCount={pageCountFor(sortedFormal.length, EXAM_LIST_PAGE_SIZE)}
                  total={sortedFormal.length}
                  pageSize={EXAM_LIST_PAGE_SIZE}
                  onPageChange={setFormalPage}
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="staging" className="mt-0">
            {sortedStaging.length === 0 ? (
              <div className="paper-card px-6 py-10 text-center">
                <p className="text-muted-foreground">
                  {importedStaging.length === 0 ? "暂无待确认试卷" : "没有符合搜索的试卷"}
                </p>
              </div>
            ) : (
              <>
                {renderExamGrid(pageStaging, true)}
                <SimplePager
                  page={stagingPage}
                  pageCount={pageCountFor(sortedStaging.length, EXAM_LIST_PAGE_SIZE)}
                  total={sortedStaging.length}
                  pageSize={EXAM_LIST_PAGE_SIZE}
                  onPageChange={setStagingPage}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </PageShell>


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
            <DialogDescription className="sr-only">按题型生成例题</DialogDescription>
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

      <Dialog
        open={reviewDocumentId !== null}
        onOpenChange={(open) => {
          if (!open) setReviewDocumentId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>核对差异</DialogTitle>
            <DialogDescription className="sr-only">核对差异</DialogDescription>
          </DialogHeader>
          {reviewDocumentId ? <ImportReviewWorkbench documentId={reviewDocumentId} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewDocumentId(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
