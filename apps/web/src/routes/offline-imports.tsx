import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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

import { ImportOfflineExamDialog } from "@/components/ImportOfflineExamDialog";
import { ExamCardActionRow, EXAM_CARD_ACTION_LABEL_CLASS } from "@/components/exam/ExamCardActionRow";
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
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type Exam,
  type QuestionType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/offline-imports")({
  loader: () => listExams(),
  component: OfflineImports,
  head: () => ({
    meta: [
      { title: "导入线下试卷 — 知学 Zhixue" },
      {
        name: "description",
        content: "上传 PDF/Word/Excel/图片 等由 AI 整理入库，单独列表管理线下导入卷，与 AI 命题区分。",
      },
    ],
  }),
});

function isQuestionType(t: string): t is QuestionType {
  return Object.prototype.hasOwnProperty.call(QUESTION_TYPE_LABELS, t);
}

function OfflineImports() {
  const { exams: rawExams } = Route.useLoaderData();
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

  useEffect(() => {
    syncExamStoragePreferenceToCookie();
    void router.invalidate();
  }, [router]);

  useEffect(() => {
    void capsFn().then((c) => setPersistEnabled(c.examPersistenceEnabled));
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

  const filtered = useMemo(() => {
    if (!q.trim()) return importedOnly;
    const needle = q.toLowerCase();
    return importedOnly.filter((e) =>
      `${e.title} ${e.subtitle ?? ""} ${(e.subjects ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [importedOnly, q]);

  const sorted = useMemo(() => {
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

        <div className="paper-card mb-6 flex flex-col gap-3 p-4">
          <div className="relative min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="在本列表中搜索标题、副标题、学科…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          {sorted.length === 0 ? (
            <div className="paper-card p-16 text-center">
              <p className="text-muted-foreground">
                {importedOnly.length === 0
                  ? "尚无线下导入的试卷。点击「导入线下卷」上传 PDF/Word/Excel/图片 等文件。"
                  : "没有符合搜索条件的试卷。"}
              </p>
              <Button type="button" className="mt-4" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                导入第一份线下卷
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map((e) => {
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
                      <span
                        className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-900 dark:text-emerald-100"
                        title="由「导入线下卷」写入"
                      >
                        线下导入
                      </span>
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
                    <Link
                      to="/exam/$id"
                      params={{ id: e.id }}
                      className="group mt-3 block flex-1"
                    >
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

      <ImportOfflineExamDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(res) => {
          void router.invalidate();
          void navigate({ to: "/exam/$id", params: { id: res.examId } });
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
              「{removeExam?.title ?? ""}」将标记为逻辑删除；导入列表与试卷库中均不再出现。
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
              按勾选的题型生成配套例题；入库后在试卷详情查看。
            </DialogDescription>
          </DialogHeader>
          {examplesExam && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground line-clamp-2">{examplesExam.title}</p>
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
