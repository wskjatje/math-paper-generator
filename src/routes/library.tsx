import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpenCheck,
  Calendar,
  Cloud,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { ExamCardActionRow, EXAM_CARD_ACTION_LABEL_CLASS } from "@/components/exam/ExamCardActionRow";
import { ExampleGenerationJobQueueControl } from "@/components/generation/GenerationJobQueues";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAiSettingsFromDb,
  generateExamplesForExistingExam,
  getBackendCapabilities,
  listExams,
  softDeleteUserExam,
} from "@/lib/exam.functions.server";
import { loadAiSettings, saveAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { syncExamStoragePreferenceToCookie } from "@/lib/examStoragePreference";
import { examProvenance, userExamSoftDeletable } from "@/lib/examProvenance";
import {
  CURRICULUM_SUBJECT_OPTIONS,
  GRADE_LEVEL_OPTIONS,
  examMatchesCurriculumSubjectFilter,
  examMatchesGradeFilter,
} from "@/lib/generateCatalog";
import {
  curriculumLabelFromExamSubjects,
  gradeLabelFromExamSubjects,
} from "@/lib/examDisplayLabels";
import {
  EXAMPLE_PREFILL_APPLY_EVENT,
  EXAMPLE_PREFILL_STORAGE_KEY,
  loadExampleJob,
  patchExampleJob,
  upsertExampleJob,
} from "@/lib/generationJobsStorage";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type Exam,
  type Example,
  type Question,
  type QuestionType,
} from "@/lib/types";

const SELECT_FIELD =
  "w-full min-w-[11rem] rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring";

function isQuestionType(t: string): t is QuestionType {
  return Object.prototype.hasOwnProperty.call(QUESTION_TYPE_LABELS, t);
}

export const Route = createFileRoute("/library")({
  loader: () => listExams(),
  component: Library,
  head: () => ({
    meta: [
      { title: "试卷库 — 知学 Zhixue" },
      {
        name: "description",
        content: "浏览开源试卷，按年级、学科与难度筛选；支持按题型生成配套例题。",
      },
    ],
  }),
  errorComponent: LibraryError,
});

function LibraryError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-destructive">{error.message}</p>
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        重试
      </button>
    </div>
  );
}

const DIFFS: Difficulty[] = ["beginner", "intermediate", "competition", "advanced"];

/** 创建后一段时间内视为「新增」，用于列表日期旁标识 */
const NEW_EXAM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isNewlyListedExam(createdAt: string): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_EXAM_MAX_AGE_MS;
}

function Library() {
  const { exams: rawExams } = Route.useLoaderData();
  const exams = rawExams as unknown as Exam[];
  const examsRef = useRef(exams);
  examsRef.current = exams;
  const router = useRouter();
  const navigate = useNavigate();
  const examplesFn = useServerFn(generateExamplesForExistingExam);
  const deleteExamFn = useServerFn(softDeleteUserExam);
  const capsFn = useServerFn(getBackendCapabilities);
  const fetchAiDbFn = useServerFn(fetchAiSettingsFromDb);

  const [q, setQ] = useState("");
  const [diff, setDiff] = useState<Difficulty | "all">("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [provenanceFilter, setProvenanceFilter] = useState<"all" | "generated" | "imported">("all");

  const [persistEnabled, setPersistEnabled] = useState<boolean | null>(null);
  const [examplesExam, setExamplesExam] = useState<Exam | null>(null);
  const [removeExam, setRemoveExam] = useState<Exam | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [pickedTypes, setPickedTypes] = useState<QuestionType[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);

  useEffect(() => {
    syncExamStoragePreferenceToCookie();
  }, []);

  useEffect(() => {
    void capsFn().then((c) => setPersistEnabled(c.examPersistenceEnabled));
  }, [capsFn]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchAiDbFn();
        if (res.ok) saveAiSettings(res.settings);
      } catch (e) {
        console.warn("[library] fetchAiSettingsFromDb:", e);
      }
    })();
  }, [fetchAiDbFn]);

  const syncExamplePrefillFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    const examList = examsRef.current;
    const raw = sessionStorage.getItem(EXAMPLE_PREFILL_STORAGE_KEY);
    if (!raw) return;
    let parsed: { examId?: string; types?: string[] };
    try {
      parsed = JSON.parse(raw) as { examId?: string; types?: string[] };
    } catch {
      sessionStorage.removeItem(EXAMPLE_PREFILL_STORAGE_KEY);
      return;
    }
    const examId = parsed.examId;
    const types = (parsed.types ?? []).filter(isQuestionType);
    if (!examId || types.length === 0) {
      sessionStorage.removeItem(EXAMPLE_PREFILL_STORAGE_KEY);
      toast.error("例题预填数据无效");
      return;
    }
    const exam = examList.find((e) => e.id === examId);
    if (!exam) {
      if (examList.length === 0) return;
      toast.warning("未在试卷库中找到对应试卷，已清除队列预填");
      sessionStorage.removeItem(EXAMPLE_PREFILL_STORAGE_KEY);
      return;
    }
    sessionStorage.removeItem(EXAMPLE_PREFILL_STORAGE_KEY);
    setExamplesExam(exam);
    setPickedTypes(types);
    toast.message("已从队列恢复例题选项", {
      description: "请在对话框中确认后提交生成。",
    });
  }, []);

  useEffect(() => {
    syncExamplePrefillFromStorage();
  }, [exams, syncExamplePrefillFromStorage]);

  useEffect(() => {
    const fn = () => syncExamplePrefillFromStorage();
    window.addEventListener(EXAMPLE_PREFILL_APPLY_EVENT, fn);
    return () => window.removeEventListener(EXAMPLE_PREFILL_APPLY_EVENT, fn);
  }, [syncExamplePrefillFromStorage]);

  useEffect(() => {
    if (!examplesExam) return;
    const raw = examplesExam.question_types ?? [];
    const valid = raw.filter(isQuestionType);
    setPickedTypes(valid.length ? valid : []);
  }, [examplesExam]);

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (provenanceFilter !== "all" && examProvenance(e) !== provenanceFilter) return false;
      if (diff !== "all" && e.difficulty !== diff) return false;
      if (gradeFilter !== "all" && !examMatchesGradeFilter(e.subjects, gradeFilter)) return false;
      if (subjectFilter !== "all" && !examMatchesCurriculumSubjectFilter(e.subjects, subjectFilter))
        return false;
      if (
        q &&
        !`${e.title} ${e.subtitle ?? ""} ${(e.subjects ?? []).join(" ")}`
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;
      return true;
    });
  }, [exams, q, diff, gradeFilter, subjectFilter, provenanceFilter]);

  /** 按创建时间降序（最新在前） */
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [filtered]);

  const toggleType = (t: QuestionType) => {
    setPickedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submitExamples = async () => {
    if (!examplesExam) return;
    if (!pickedTypes.length) {
      toast.error("请至少勾选一种题型");
      return;
    }
    const exam = examplesExam;
    const types = [...pickedTypes];
    const gradeLabel = gradeLabelFromExamSubjects(exam.subjects);
    const subjectLabel = curriculumLabelFromExamSubjects(exam.subjects);
    const jobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    upsertExampleJob({
      id: jobId,
      examTitle: exam.title,
      examId: exam.id,
      gradeLabel,
      subjectLabel,
      status: "running",
      createdAt: nowIso,
      updatedAt: nowIso,
      payload: { examId: exam.id, types },
    });

    setExamplesLoading(true);
    try {
      await examplesFn({
        data: {
          examId: exam.id,
          types,
          ai: toAiRuntimePayload(loadAiSettings()),
        },
      });

      const jobAfter = loadExampleJob(jobId);
      const userCancelled = jobAfter?.status === "cancelled" || jobAfter?.cancelRequested;
      if (userCancelled) {
        return;
      }

      patchExampleJob(jobId, { status: "success", cancelRequested: false });

      const openedExamId = exam.id;
      toast.success("例题生成完成", {
        description: "同型例题与试卷正文分开展示；可打开试卷页使用「打印例题」等导出方式",
        action: {
          label: "打开试卷",
          onClick: () => void navigate({ to: "/exam/$id", params: { id: openedExamId } }),
        },
      });
      setExamplesExam(null);
      void router.invalidate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "生成失败";
      const jobAfter = loadExampleJob(jobId);
      if (jobAfter?.status !== "cancelled" && !jobAfter?.cancelRequested) {
        patchExampleJob(jobId, { status: "failed", errorMessage: msg });
      }
      toast.error(msg);
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

  return (
    <>
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-display text-4xl md:text-5xl">试卷库</h1>
            <p className="mt-2 text-sm text-muted-foreground">共 {exams.length} 份</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <ExampleGenerationJobQueueControl />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 font-semibold tracking-wide shadow-sm"
              onClick={() => {
                void router.invalidate();
                toast.success("列表已刷新");
              }}
            >
              <RefreshCw className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              刷新列表
            </Button>
            <Button asChild size="sm" className="gap-1.5 bg-primary font-semibold tracking-wide text-primary-foreground shadow-sm">
              <Link to="/generate">
                <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                生成新试卷
              </Link>
            </Button>
          </div>
        </div>

        <div className="paper-card mb-6 flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索标题、学科、知识点…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={diff === "all"} onClick={() => setDiff("all")}>
                全部
              </FilterChip>
              {DIFFS.map((d) => (
                <FilterChip key={d} active={diff === d} onClick={() => setDiff(d)}>
                  {DIFFICULTY_LABELS[d]}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[11rem] flex-1 space-y-1.5">
              <span className="text-xs text-muted-foreground">来源</span>
              <select
                value={provenanceFilter}
                onChange={(e) =>
                  setProvenanceFilter(e.target.value as "all" | "generated" | "imported")
                }
                className={SELECT_FIELD}
              >
                <option value="all">全部</option>
                <option value="generated">AI 命题</option>
                <option value="imported">线下导入</option>
              </select>
            </label>
            <label className="block min-w-[11rem] flex-1 space-y-1.5">
              <span className="text-xs text-muted-foreground">年级</span>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className={SELECT_FIELD}
              >
                <option value="all">全部年级</option>
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[11rem] flex-1 space-y-1.5">
              <span className="text-xs text-muted-foreground">学科</span>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className={SELECT_FIELD}
              >
                <option value="all">全部学科</option>
                {CURRICULUM_SUBJECT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div>
          {sortedFiltered.length === 0 ? (
            <div className="paper-card p-16 text-center">
              {exams.length === 0 && persistEnabled === true ? (
                <p className="text-muted-foreground">
                  题库中还没有试卷。已配置持久化时，命题将写入云端（若已接 Supabase）或本地。
                </p>
              ) : exams.length === 0 ? (
                <p className="text-muted-foreground">暂无试卷。</p>
              ) : (
                <p className="text-muted-foreground">没有符合当前筛选的试卷。</p>
              )}
              <Link to="/generate" className="mt-3 inline-block text-primary hover:underline">
                去生成一份
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {sortedFiltered.map((e) => {
                const types = (e.question_types ?? []).filter(isQuestionType);
                const canExamples =
                  persistEnabled === true && types.length > 0 && e.storage_source !== "project";

                return (
                  <div
                    key={e.id}
                    className="paper-card flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-primary/8 px-2 py-0.5 text-primary">
                        {DIFFICULTY_LABELS[e.difficulty as Difficulty] ?? e.difficulty}
                      </span>
                      {examProvenance(e) === "imported" && (
                        <span
                          className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-900 dark:text-emerald-100"
                          title="由试卷库「导入线下卷」写入"
                        >
                          线下导入
                        </span>
                      )}
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
                      <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3 w-3 opacity-70" />
                        {new Date(e.created_at).toLocaleDateString("zh-CN")}
                        {isNewlyListedExam(e.created_at) && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                            title="最近 7 日内入库"
                          >
                            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                            新增
                          </span>
                        )}
                      </span>
                    </div>
                    <Link to="/exam/$id" params={{ id: e.id }} className="group mt-3 block flex-1">
                      <h3 className="text-display text-xl transition-colors group-hover:text-primary line-clamp-2">
                        {e.title}
                      </h3>
                      {e.subtitle && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                          {e.subtitle}
                        </p>
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
                            disabled={
                              !canExamples || examplesLoading || e.storage_source === "project"
                            }
                            title={
                              persistEnabled === false
                                ? "配置云端或本地可写后可持久化并生成例题"
                                : types.length === 0
                                  ? "无题型数据"
                                  : e.storage_source === "project"
                                    ? "内置演示卷不支持生成例题"
                                    : e.storage_source === "local"
                                      ? "例题将追加写入本地"
                                      : "按勾选题型写入云端并生成配套例题"
                            }
                            onClick={() => setExamplesExam(e)}
                          >
                            <BookOpenCheck
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2}
                              aria-hidden
                            />
                            <span className={cn(EXAM_CARD_ACTION_LABEL_CLASS, "truncate")}>
                              生成例题
                            </span>
                          </Button>
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
              「{removeExam?.title ?? ""}
              」将标记为逻辑删除，列表中不再出现；数据仍保留在数据库或本地文件中。
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
            <DialogDescription>
              按勾选的题型，用卷内同类题为范式，按当前「设置」里的模型生成配套例题；入库后在试卷详情查看。
            </DialogDescription>
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
                        id={`qt-${t}`}
                        checked={pickedTypes.includes(t)}
                        onCheckedChange={() => toggleType(t)}
                      />
                      <label htmlFor={`qt-${t}`} className="cursor-pointer text-sm">
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

function FilterChip({
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
        "rounded-md border px-3 py-1.5 text-sm transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent")
      }
    >
      {children}
    </button>
  );
}
