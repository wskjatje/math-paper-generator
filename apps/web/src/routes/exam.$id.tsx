import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  generateListeningAudioForExam,
  generateListeningExampleAudioForExam,
  getExamDetail,
  repairSessionExamSnapshot,
} from "@/lib/exam.functions.server";
import {
  examHasListeningStyleExamples,
  examHasListeningStyleQuestions,
  listeningExampleTrackIndexForExampleId,
  listeningTrackIndexForQuestion,
} from "@/lib/listeningAudio.shared";
import { ExamFigureImage } from "@/components/ExamFigureImage";
import { EducationalDocumentRenderer } from "@/components/education/EducationalDocumentRenderer";
import { MathContent } from "@/components/MathContent";
import {
  buildEducationalRenderableDocument,
  shouldUseEducationalPresentation,
} from "@/lib/educationalPresentation.shared";
import { GeometryDiagramRenderer } from "@/components/GeometryDiagramRenderer";
import {
  DIFFICULTY_LABELS,
  questionDisplayTypeLabel,
  type Difficulty,
  type Question,
  type Example,
  type SolutionStep,
  type Exam,
} from "@/lib/types";
import type { OfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import { titleForExamExportFile } from "@/lib/examExportMarkdown";
import { choiceLetterFromIndex, stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import {
  Eye,
  EyeOff,
  Printer,
  FileDown,
  ArrowLeft,
  Tag,
  Clock,
  Award,
  CalendarDays,
  Headphones,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { OfflineImportFigureCrops } from "@/components/OfflineImportFigureCrops";
import { PageShell } from "@/components/layout/PageShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXAM_PRINT_LAYOUT_CN_CLASS } from "@/lib/paperPrintLayout.shared";
import { cn } from "@/lib/utils";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  EXAMPLES_BACKUP_SUFFIX,
  parseImportedExamplesFile,
  parseImportedSnapshotFile,
  parseSnapshotFromSnapQuery,
  parseSnapshotFromUrlHash,
  readExamSnapshot,
  SNAPSHOT_BACKUP_SUFFIX,
  writeExamSnapshot,
  type SessionExamSnapshot,
} from "@/lib/examSession";
import { startExamPdfViaBrowserPrint } from "@/lib/downloadExamPdf";
import { shouldOmitListeningQuestionFromPaper } from "@/lib/listeningExamPolicy.shared";
import {
  optionLetterHasConcreteFigureSupply,
  type QuestionRasterFigureRuntimeOpts,
} from "@/lib/examRasterFigureHints.shared";
import {
  MCQ_ANSWER_WITHHELD_FOR_MISSING_RASTER_MESSAGE,
  placeholderSolutionStepsWhenMcqAnswerWithheld,
  shouldEmphasizeMissingOptionFigures,
  shouldPreferVectorBeforeStemRasterAppendix,
  shouldShowMissingRasterCallout,
  shouldSuppressVectorDiagramForDisplay,
  shouldWithholdMcqAnswerForMissingRasterFigures,
} from "@/lib/questionRendererPolicy.shared";
import { rasterAppendixUrlsNotEmbedded } from "@/lib/importRasterFigures.shared";
import { isPackingDebugEnabled } from "@/lib/cognitivePackingDebug.shared";
import { filterRasterAppendixUrlsForEplPresentation } from "@/lib/projectionLeakGuard.shared";
import { resolveFigureResources } from "@/lib/resolveFigureResources.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import {
  extractMarkdownImageUrlsFromContent,
  scanQuestionContentForFigureTextAnchors,
} from "@/lib/figureTextAnchors.shared";
import { computeFigureResourcePublishState } from "@/lib/figureResourcePublishState.shared";
import { computeOwnershipResolutionStateDebug } from "@/lib/ownershipResolutionStateDebug.shared";
import { ExamForensicsPanel } from "@/components/ExamForensicsPanel";
import { formatFigureLifecycleTimelineCompact } from "@/lib/figureLifecycleTimeline.shared";

/** 导入卷 P7-1A：仅 DEV 或 `?figures_debug=1` 时展示，便于核对「本题为何拿到这些图」。 */
function FigureOwnershipDebugOverlay({
  exam,
  question,
  enabled,
  rasterRuntime,
}: {
  exam: Exam;
  question: Question;
  enabled: boolean;
  rasterRuntime?: QuestionRasterFigureRuntimeOpts;
}) {
  if (!enabled) return null;
  const resolved = resolveFigureResources(question, exam);
  const stemTextFigureAnchors = scanQuestionContentForFigureTextAnchors(
    String(question.content ?? ""),
  );
  const markdownImageUrlsInStem = extractMarkdownImageUrlsFromContent(
    String(question.content ?? ""),
  );
  const resourcePublishState = computeFigureResourcePublishState(question, exam);
  const ownershipResolutionState = computeOwnershipResolutionStateDebug(
    question,
    exam,
    rasterRuntime,
  );
  return (
    <details className="no-print mb-3 rounded-md border border-dashed border-amber-600/40 bg-amber-500/[0.07] p-3 text-left">
      <summary className="cursor-pointer text-xs font-medium text-amber-950/90 dark:text-amber-100/90">
        Figure ownership（调试）
      </summary>
      <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all">
        <p className="text-[10px] text-amber-950/70 dark:text-amber-100/70">
          本地开发默认可见；生产环境请在 URL 加{" "}
          <code className="rounded bg-muted px-1">?figures_debug=1</code>。
        </p>
        <div>
          <span className="text-foreground/85">figure_refs</span>{" "}
          {(question.figure_refs?.length ?? 0) === 0
            ? "（无）"
            : JSON.stringify(question.figure_refs, null, 2)}
        </div>
        <div>
          <span className="text-foreground/85">resolveFigureResources</span>
          {"\n"}
          {JSON.stringify(
            {
              inheritedRefCount: resolved.inheritedRefCount,
              rasterStemUrlsResolved: resolved.rasterStemUrlsResolved,
              figureIds: resolved.figureRefs.map((r) => r.figure_id),
            },
            null,
            2,
          )}
        </div>
        <div>
          <span className="text-foreground/85">raster_figures.stem（原始）</span>{" "}
          {JSON.stringify(question.raster_figures?.stem ?? [])}
        </div>
        <div>
          <span className="text-foreground/85">exam.figure_registry 项数</span>{" "}
          {exam.figure_registry?.length ?? 0}
        </div>
        <div>
          <span className="text-foreground/85">题干文本图锚点（启发式扫描，非持久化）</span>
          {"\n"}
          {stemTextFigureAnchors.length === 0
            ? "（无）"
            : JSON.stringify(stemTextFigureAnchors, null, 2)}
        </div>
        <div>
          <span className="text-foreground/85">题干 Markdown 插图 URL</span>{" "}
          {markdownImageUrlsInStem.length === 0
            ? "（无）"
            : JSON.stringify(markdownImageUrlsInStem, null, 2)}
        </div>
        <div>
          <span className="text-foreground/85">resource_publish_state（分桶，非持久化）</span>
          {"\n"}
          {JSON.stringify({ resource_publish_state: resourcePublishState }, null, 2)}
        </div>
        <div>
          <span className="text-foreground/85">supply_state（materialization gate）</span>{" "}
          <code className="rounded bg-muted px-1 text-foreground">
            {ownershipResolutionState.supply_state}
          </code>
        </div>
        <div>
          <span className="text-foreground/85">figure_lifecycle_timeline（P2 replay）</span>
          {"\n"}
          <span className="text-foreground/90">
            {formatFigureLifecycleTimelineCompact(
              ownershipResolutionState.figure_lifecycle_timeline,
            )}
          </span>
        </div>
        <div>
          <span className="text-foreground/85">figure_artifact_provenance（P3）</span>{" "}
          {ownershipResolutionState.figure_artifact_provenance.length === 0
            ? "（无）"
            : JSON.stringify(ownershipResolutionState.figure_artifact_provenance, null, 2)}
        </div>
        <div>
          <span className="text-foreground/85">ownership_resolution_state（启发式，非持久化）</span>
          {"\n"}
          {JSON.stringify({ ownership_resolution_state: ownershipResolutionState }, null, 2)}
        </div>
      </div>
    </details>
  );
}

function RasterFigureAppendix({
  urls,
  captionPrefix,
  onFigureDecodeFailed,
}: {
  urls: string[];
  captionPrefix: string;
  /** 任一附录位图加载失败（与题干 Markdown 坏链同等：broken≈missing） */
  onFigureDecodeFailed?: () => void;
}) {
  if (!urls.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3 justify-start print:break-inside-avoid">
      {urls.map((u, i) => (
        <figure key={`${captionPrefix}-${u}-${i}`} className="m-0 shrink-0">
          <ExamFigureImage
            src={u}
            alt={`${captionPrefix} ${i + 1}`}
            className="max-h-52 max-w-full rounded-md border border-border object-contain bg-muted/30"
            loadErrorLabel="（附录图无法加载，请检查裁图路径或重新上传。）"
            onDecodeFailed={onFigureDecodeFailed}
          />
        </figure>
      ))}
    </div>
  );
}

function exampleStepOrdinal(step: SolutionStep, index: number): number {
  const n = step.step;
  return typeof n === "number" && Number.isFinite(n) ? n : index + 1;
}

export const Route = createFileRoute("/exam/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "examples" ? ("examples" as const) : ("paper" as const),
    figures_debug:
      search.figures_debug === "1" || search.figures_debug === true || search.figures_debug === 1,
    packing_debug:
      search.packing_debug === "1" || search.packing_debug === true || search.packing_debug === 1,
  }),
  loader: async ({ params }) => {
    try {
      return await getExamDetail({ data: { id: params.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("未找到试卷")) {
        throw notFound();
      }
      throw e;
    }
  },
  component: ExamDetail,
  head: ({ loaderData }) => {
    const ld = loaderData as { pendingSession?: boolean; exam?: Exam };
    const titleBase = ld?.pendingSession === true ? "生成的试卷" : (ld?.exam?.title ?? "试卷");
    return {
      meta: [
        { title: `${titleBase} — 知学 Zhixue` },
        {
          name: "description",
          content:
            ld?.exam?.description ?? ld?.exam?.subtitle ?? "开源竞赛试卷 · AI 命题与分步推导",
        },
      ],
    };
  },
  errorComponent: ExamDetailError,
  notFoundComponent: () => (
    <PageShell size="narrow" className="py-20 text-center">
      试卷不存在
    </PageShell>
  ),
});

function ExamDetailError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <PageShell size="narrow" className="py-20 text-center">
      <p className="text-destructive">{error.message}</p>
      <button
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        重试
      </button>
    </PageShell>
  );
}

function ExamDetail() {
  const loaderData = Route.useLoaderData() as
    | { pendingSession: true; id: string }
    | {
        exam: Exam;
        questions: unknown[];
        examples: unknown[];
        listeningAudioReady?: boolean;
        listeningExampleAudioReady?: boolean;
        offlineImportMedia?: OfflineImportPersistedMedia | null;
      };

  if ("pendingSession" in loaderData && loaderData.pendingSession) {
    return <SessionExamPage examId={loaderData.id} />;
  }

  const data = loaderData as {
    exam: Exam;
    questions: unknown[];
    examples: unknown[];
    listeningAudioReady?: boolean;
    listeningExampleAudioReady?: boolean;
    offlineImportMedia?: OfflineImportPersistedMedia | null;
  };
  return (
    <ExamPaperBody
      exam={data.exam}
      questions={data.questions as Question[]}
      examples={data.examples as Example[]}
      listeningAudioReadyInitial={data.listeningAudioReady === true}
      listeningExampleAudioReadyInitial={data.listeningExampleAudioReady === true}
      offlineImportMedia={data.offlineImportMedia ?? null}
    />
  );
}

function SessionExamPage({ examId }: { examId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const repairSnapshot = useServerFn(repairSessionExamSnapshot);
  const [snap, setSnap] = useState<SessionExamSnapshot | null | undefined>(undefined);

  const finalizeSnapshot = useCallback(
    async (parsed: SessionExamSnapshot | null) => {
      if (!parsed) {
        setSnap(null);
        return;
      }
      try {
        const fixed = await repairSnapshot({ data: parsed });
        setSnap(fixed);
        writeExamSnapshot(examId, fixed);
      } catch (e) {
        console.warn("[session exam] repairSessionExamSnapshot:", e);
        setSnap(parsed);
        writeExamSnapshot(examId, parsed);
      }
    },
    [examId, repairSnapshot],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let parsed = readExamSnapshot(examId);
      if (!parsed && typeof window !== "undefined" && window.location.hash.length > 1) {
        const fromHash = await parseSnapshotFromUrlHash(window.location.hash);
        if (fromHash) {
          parsed = fromHash;
          writeExamSnapshot(examId, fromHash);
        }
      }
      if (!parsed && typeof window !== "undefined") {
        const snapQ = new URLSearchParams(window.location.search).get("snap");
        if (snapQ) {
          const fromSnap = await parseSnapshotFromSnapQuery(snapQ);
          if (fromSnap) {
            parsed = fromSnap;
            writeExamSnapshot(examId, fromSnap);
          }
        }
      }
      if (!cancelled) await finalizeSnapshot(parsed);
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, finalizeSnapshot]);

  const onImportSnapshot = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedSnapshotFile(text);
      if (imported) {
        if (imported.exam.id !== examId) {
          toast.error("该快照与当前链接中的试卷不一致，请打开生成时下载的同一备份文件。");
          return;
        }
        await finalizeSnapshot(imported);
        toast.success("已从备份载入试卷");
        return;
      }
      const exOnly = parseImportedExamplesFile(text);
      if (exOnly) {
        const current = readExamSnapshot(examId);
        if (!current) {
          toast.error(
            `请先导入试卷备份（${SNAPSHOT_BACKUP_SUFFIX}），再导入例题（${EXAMPLES_BACKUP_SUFFIX}）。`,
          );
          return;
        }
        if (exOnly.examId !== examId) {
          toast.error("例题文件中的试卷 id 与当前页不一致。");
          return;
        }
        const merged: SessionExamSnapshot = {
          ...current,
          examples: exOnly.examples,
        };
        await finalizeSnapshot(merged);
        toast.success("已载入例题备份并与当前试卷合并");
        return;
      }
      toast.error(
        `请选择有效的知学备份（${SNAPSHOT_BACKUP_SUFFIX} 或 ${EXAMPLES_BACKUP_SUFFIX}，且须与当前试卷对应）`,
      );
    } catch {
      toast.error("读取文件失败");
    }
  };

  if (snap === undefined) {
    return (
      <PageShell size="narrow" className="py-20">
        <p className="text-sm text-muted-foreground text-center">正在加载会话试卷…</p>
      </PageShell>
    );
  }

  if (!snap) {
    return (
      <PageShell size="narrow" className="py-16">
        <Alert variant="destructive">
          <AlertTitle>无法加载本会话试卷</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>
              命题结束时应已自动下载{" "}
              <code className="rounded bg-muted px-1 text-[11px]">{SNAPSHOT_BACKUP_SUFFIX}</code>
              （试卷）；若有例题另含{" "}
              <code className="rounded bg-muted px-1 text-[11px]">{EXAMPLES_BACKUP_SUFFIX}</code>
              ，二者分开保存。嵌入式浏览器常丢掉超长网址里的快照：请先导入试卷 JSON，再按需导入例题
              JSON。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onImportSnapshot}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              导入本地快照备份…
            </button>
            <p className="text-xs text-muted-foreground">
              仍可使用带 <code className="rounded bg-muted px-1 text-[11px]">#mpg1.</code>{" "}
              的完整地址栏链接；配置数据库后可任意设备打开。
            </p>
            <Link to="/generate" className="inline-flex text-primary underline">
              返回生成试卷
            </Link>
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <ExamPaperBody
      exam={snap.exam}
      questions={snap.questions}
      examples={snap.examples}
      sessionBanner
      offlineImportMedia={snap.offline_import_media ?? null}
    />
  );
}

function ListeningTrackPlayButton({
  examId,
  trackIndex,
  scope = "paper",
}: {
  examId: string;
  trackIndex: number;
  /** 试卷：`public/audio/<id>/track-*.wav`；同型例题：`public/audio/<id>/examples/track-*.wav` */
  scope?: "paper" | "examples";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const base = `/audio/${encodeURIComponent(examId)}/`;
  const sub = scope === "examples" ? "examples/" : "";
  const src = `${base}${sub}track-${String(trackIndex).padStart(2, "0")}.wav`;
  const label =
    scope === "examples"
      ? `播放同型例题第 ${trackIndex} 条朗读音频`
      : `播放第 ${trackIndex} 道听力音频`;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onErr = () => {
      toast.error("音频无法加载", {
        description: `请确认已用最新 dev/preview 启动（生成后写入 public）。URL：${src}`,
        duration: 10000,
      });
    };
    el.addEventListener("error", onErr);
    return () => el.removeEventListener("error", onErr);
  }, [src]);

  return (
    <div className="no-print flex shrink-0 items-center">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-accent"
        aria-label={label}
        title={scope === "examples" ? "播放例题朗读" : "播放听力"}
        onClick={() => {
          void audioRef.current?.play().catch((err: unknown) => {
            toast.error("无法播放", {
              description: err instanceof Error ? err.message : String(err),
            });
          });
        }}
      >
        <Play className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function ExamPaperBody({
  exam,
  questions,
  examples,
  sessionBanner,
  listeningAudioReadyInitial = false,
  listeningExampleAudioReadyInitial = false,
  offlineImportMedia = null,
}: {
  exam: Exam;
  questions: Question[];
  examples: Example[];
  sessionBanner?: boolean;
  listeningAudioReadyInitial?: boolean;
  listeningExampleAudioReadyInitial?: boolean;
  offlineImportMedia?: OfflineImportPersistedMedia | null;
}) {
  const router = useRouter();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const genListeningFn = useServerFn(generateListeningAudioForExam);
  const genExampleListeningFn = useServerFn(generateListeningExampleAudioForExam);
  const [listeningGenBusy, setListeningGenBusy] = useState(false);
  const [exampleListeningGenBusy, setExampleListeningGenBusy] = useState(false);
  const [listeningAudioReady, setListeningAudioReady] = useState(listeningAudioReadyInitial);
  const [listeningExampleAudioReady, setListeningExampleAudioReady] = useState(
    listeningExampleAudioReadyInitial,
  );
  const [showAll, setShowAll] = useState(true);
  const printRootRef = useRef<HTMLDivElement>(null);
  const examplesPrintRootRef = useRef<HTMLDivElement>(null);
  const displayTitleRef = useRef("");
  const pdfTitleRef = useRef("");
  const printScopeRef = useRef<"paper" | "examples" | null>(null);

  /** 仅有「已挂接到卷内某题」的例题才算已生成同型例题；否则不展示页签与整块例题区 */
  const hasLinkedExamples = examples.some(
    (ex) =>
      typeof ex.question_id === "string" &&
      ex.question_id.length > 0 &&
      questions.some((q) => q.id === ex.question_id),
  );
  const activeTab = hasLinkedExamples ? search.tab : "paper";

  const importParseRollup =
    exam.source === "imported"
      ? parseImportParseQualityRollup(exam.import_parse_quality ?? null)
      : null;
  const showImportParseBanner =
    importParseRollup != null && importParseRollup.rollup_tier !== "green";

  const showFigureOwnershipDebug =
    exam.source === "imported" && (import.meta.env.DEV || search.figures_debug === true);

  const showPackingDebug = isPackingDebugEnabled({
    dev: import.meta.env.DEV,
    searchFlag: search.packing_debug === true,
  });

  const [rasterLoadFailedQuestionIds, setRasterLoadFailedQuestionIds] = useState(
    () => new Set<string>(),
  );
  const markQuestionRasterDecodeFailed = useCallback((questionId: string) => {
    setRasterLoadFailedQuestionIds((prev) => {
      if (prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
  }, []);

  useEffect(() => {
    setRasterLoadFailedQuestionIds(new Set());
  }, [exam.id]);

  const rasterRuntimeForQuestion = useCallback(
    (q: Question): QuestionRasterFigureRuntimeOpts | undefined =>
      rasterLoadFailedQuestionIds.has(q.id) ? { runtimeRasterLoadFailed: true } : undefined,
    [rasterLoadFailedQuestionIds],
  );

  const paperPdfBlockedByImportRaster =
    exam.source === "imported" &&
    questions.some((q) =>
      shouldWithholdMcqAnswerForMissingRasterFigures(q, rasterRuntimeForQuestion(q)),
    );

  useEffect(() => {
    if (hasLinkedExamples) return;
    if (search.tab === "examples") {
      navigate({ search: (prev) => ({ ...prev, tab: "paper" }), replace: true });
    }
  }, [hasLinkedExamples, navigate, search.tab]);

  useEffect(() => {
    const display = `${exam.title} — 知学 Zhixue`;
    displayTitleRef.current = display;
    pdfTitleRef.current = titleForExamExportFile(exam.title);
    document.title = display;
  }, [exam.title]);

  useEffect(() => {
    setListeningAudioReady(listeningAudioReadyInitial);
  }, [exam.id, listeningAudioReadyInitial]);

  useEffect(() => {
    setListeningExampleAudioReady(listeningExampleAudioReadyInitial);
  }, [exam.id, listeningExampleAudioReadyInitial]);

  useEffect(() => {
    const onBeforePrint = () => {
      if (printScopeRef.current === "examples") {
        document.title = `${titleForExamExportFile(exam.title)}-同型例题`;
      } else if (printScopeRef.current === "paper") {
        document.title = pdfTitleRef.current;
      }
    };
    const onAfterPrint = () => {
      document.title = displayTitleRef.current;
      document.documentElement.removeAttribute("data-print-scope");
      printScopeRef.current = null;
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [exam.title]);

  const showPaperListeningGenerate =
    activeTab === "paper" &&
    !sessionBanner &&
    examHasListeningStyleQuestions(questions) &&
    !listeningAudioReady;

  const showExampleListeningGenerate =
    activeTab === "examples" &&
    !sessionBanner &&
    examHasListeningStyleExamples(questions, examples) &&
    !listeningExampleAudioReady;

  const onGenerateListeningAudio = async () => {
    setListeningGenBusy(true);
    try {
      const res = await genListeningFn({ data: { examId: exam.id } });
      if (res.generated > 0) {
        setListeningAudioReady(true);
        void router.invalidate();
        toast.success(`已生成 ${res.generated} 条听力音频`, {
          description: res.outputDir
            ? `文件目录：public/audio 下（部署路径视环境而定）`
            : undefined,
          duration: 8000,
        });
      } else if (res.skippedReason) {
        toast.message(res.skippedReason, {
          description:
            res.skippedReason.includes("macOS") || res.skippedReason.includes("darwin")
              ? "听力音频仅在开发机 macOS 上可用 say/afconvert"
              : undefined,
          duration: 9000,
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setListeningGenBusy(false);
    }
  };

  const onGenerateExampleListeningAudio = async () => {
    setExampleListeningGenBusy(true);
    try {
      const res = await genExampleListeningFn({ data: { examId: exam.id } });
      if (res.generated > 0) {
        setListeningExampleAudioReady(true);
        void router.invalidate();
        toast.success(`已生成 ${res.generated} 条同型例题朗读音频`, {
          description: res.outputDir
            ? `目录：public/audio/${exam.id}/examples/（部署路径视环境而定）`
            : undefined,
          duration: 8000,
        });
      } else if (res.skippedReason) {
        toast.message(res.skippedReason, {
          description:
            res.skippedReason.includes("macOS") || res.skippedReason.includes("darwin")
              ? "朗读音频仅在配置 Piper 或 macOS say 时可用"
              : undefined,
          duration: 9000,
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setExampleListeningGenBusy(false);
    }
  };

  const saveExamplesPdfAsVector = () => {
    const el = examplesPrintRootRef.current;
    if (!el || examples.length === 0) {
      toast.error("暂无同型例题");
      return;
    }
    printScopeRef.current = "examples";
    document.documentElement.setAttribute("data-print-scope", "examples");
    toast.message("导出矢量 PDF（同型例题）", {
      description:
        "即将打开打印对话框：请将打印机选为「另存为 PDF」。仅包含下方「同型例题」区域，与试卷 PDF 相互独立。",
      duration: 12000,
    });
    startExamPdfViaBrowserPrint(el);
  };

  const printPaperVector = () => {
    if (paperPdfBlockedByImportRaster) {
      const ok = window.confirm(
        "该导入卷存在「题干用语依赖卷面示意图，但当前无可用插图（未入库、链接失效或附录图无法加载）」的选择题。\n\n" +
          "继续打印或「另存为 PDF」时版面可能不完整；读卷页面对答案的隐藏策略也会体现在导出结果中。\n\n" +
          "建议先补全题干/选项中的插图或重新导入含整页 ![](…) 的正文，并确认 public/import-figures 等路径可访问。\n\n是否仍要打开系统打印对话框？",
      );
      if (!ok) return;
    }
    const el = printRootRef.current;
    if (!el) return;
    printScopeRef.current = "paper";
    document.documentElement.setAttribute("data-print-scope", "paper");
    toast.message("导出矢量 PDF（试卷）", {
      description:
        "即将打开打印对话框：请将打印机选为「另存为 PDF」。仅包含试卷题目区域，不含同型例题。",
      duration: 12000,
    });
    startExamPdfViaBrowserPrint(el);
  };

  const onExamTabChange = (value: string) => {
    if (value !== "paper" && value !== "examples") return;
    navigate({ search: (prev) => ({ ...prev, tab: value }), replace: true });
  };

  return (
    <PageShell size="medium" className="exam-print-shell">
      {sessionBanner && (
        <Alert className="no-print mb-8 border-amber-500/40 bg-amber-500/[0.06]">
          <AlertTitle className="text-foreground">会话预览 · 未写入数据库</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            未配置 Supabase 时，请用地址栏含{" "}
            <code className="rounded bg-muted px-1 text-[11px]">#mpg1.</code>{" "}
            的完整链接复制到其它浏览器；或依赖本地存储。仅路径无{" "}
            <code className="rounded bg-muted px-1 text-[11px]">#</code> 时换环境会失败。配置{" "}
            <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_URL</code> 与{" "}
            <code className="rounded bg-muted px-1 text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            后可持久保存并在试卷库查看。
          </AlertDescription>
        </Alert>
      )}
      {showImportParseBanner && importParseRollup ? (
        <Alert
          className={cn(
            "no-print mb-8",
            importParseRollup.rollup_tier === "red"
              ? "border-destructive/45 bg-destructive/[0.06]"
              : "border-amber-500/40 bg-amber-500/[0.06]",
          )}
        >
          <AlertTitle className="text-foreground">
            导入解析质检（{importParseRollup.rollup_tier === "red" ? "红" : "黄"}档）
          </AlertTitle>
          <AlertDescription className="text-muted-foreground space-y-2">
            <p>
              红 {importParseRollup.red_count} / 黄 {importParseRollup.yellow_count} / 绿{" "}
              {importParseRollup.green_count}{" "}
              题。以下为系统根据题干、选项与卷面图规则给出的提示，请对照原卷核对后再使用或确认入库。
            </p>
            {importParseRollup.summary_lines.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {importParseRollup.summary_lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-20 mb-8 border-b border-border/60 bg-background/90 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> 返回试卷库
            </Link>
            {hasLinkedExamples ? (
              <Tabs value={activeTab} onValueChange={onExamTabChange}>
                <TabsList aria-label="试卷与例题视图">
                  <TabsTrigger value="paper">试卷</TabsTrigger>
                  <TabsTrigger value="examples">同型例题</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {activeTab === "paper" ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
              >
                {showAll ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAll ? "隐藏答案" : "显示答案"}
              </button>
            ) : null}
            {showPaperListeningGenerate ? (
              <button
                type="button"
                disabled={listeningGenBusy}
                title="合成试卷听力题音频，写入 public/audio/<试卷ID>/track-*.wav（与同型例题目录独立）"
                onClick={() => void onGenerateListeningAudio()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                {listeningGenBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Headphones className="h-4 w-4" aria-hidden />
                )}
                {listeningGenBusy ? "生成中…" : "生成听力音频"}
              </button>
            ) : null}
            {showExampleListeningGenerate ? (
              <button
                type="button"
                disabled={exampleListeningGenBusy}
                title="按例题正文单独合成朗读音频，写入 public/audio/<试卷ID>/examples/（含 listening-script.md 与 track-*.wav，与试卷听力不复用）"
                onClick={() => void onGenerateExampleListeningAudio()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                {exampleListeningGenBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Headphones className="h-4 w-4" aria-hidden />
                )}
                {exampleListeningGenBusy ? "生成中…" : "生成例题音频"}
              </button>
            ) : null}
            {activeTab === "paper" ? (
              <button
                type="button"
                onClick={printPaperVector}
                title={
                  paperPdfBlockedByImportRaster
                    ? "存在卷面依赖图不可用（未入库或插图加载失败）的选择题：点击后将先确认，再打开打印对话框（建议补图后再导出）"
                    : "打印对话框中选「另存为 PDF」，仅包含试卷题目区域"
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Printer className="h-4 w-4" /> 打印试卷
              </button>
            ) : hasLinkedExamples ? (
              <button
                type="button"
                onClick={saveExamplesPdfAsVector}
                title="打印对话框中选「另存为 PDF」，仅包含同型例题区域"
                className="inline-flex items-center gap-1.5 rounded-md border border-border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
              >
                <FileDown className="h-4 w-4" /> 打印例题
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        id="exam-print-root"
        ref={printRootRef}
        className={cn(
          "exam-print-root",
          EXAM_PRINT_LAYOUT_CN_CLASS,
          activeTab !== "paper" && "hidden",
        )}
        hidden={activeTab !== "paper"}
        aria-hidden={activeTab !== "paper"}
      >
        {/* Header */}
        <header className="paper-card p-8 mb-8 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-gold">
            {exam.source === "curated"
              ? "Curated · 精选"
              : exam.source === "imported"
                ? "线下导入"
                : "AI Composed"}
          </div>
          <h1 className="text-display text-3xl md:text-5xl mt-3">{exam.title}</h1>
          {exam.subtitle && <p className="text-muted-foreground mt-3 italic">{exam.subtitle}</p>}
          <div className="gold-divider mx-auto my-5" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Award className="no-print h-4 w-4 shrink-0" />
              {DIFFICULTY_LABELS[exam.difficulty as Difficulty] ?? exam.difficulty}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="no-print h-4 w-4 shrink-0" /> {exam.duration_min} 分钟
            </span>
            <span>总分 {exam.total_score}</span>
            <span>共 {questions.length} 题</span>
            {exam.created_at && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="no-print h-4 w-4 shrink-0" />
                生成于{" "}
                {new Date(exam.created_at).toLocaleString("zh-CN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
            {exam.generation_duration_sec != null && exam.generation_duration_sec > 0 && (
              <span>命题耗时约 {exam.generation_duration_sec} 秒</span>
            )}
          </div>
          {exam.description && (
            <p className="mt-5 text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {exam.description}
            </p>
          )}
        </header>

        {offlineImportMedia ? (
          <OfflineImportFigureCrops media={offlineImportMedia} className="mb-8" />
        ) : null}

        {/* Questions */}
        <div className="space-y-8">
          <ExamForensicsPanel
            exam={exam}
            questions={questions}
            importParseRollup={importParseRollup}
            enabled={showFigureOwnershipDebug}
          />
          {questions.map((q, i) => {
            const geometryDiagram = safeParseGeometryDiagramSchema(q.diagram_schema);
            const listeningTrack = listeningAudioReady
              ? listeningTrackIndexForQuestion(questions, i)
              : null;
            const omitPrintedListeningStem = shouldOmitListeningQuestionFromPaper(
              q,
              questions,
              exam,
            );
            const rasterRt = rasterRuntimeForQuestion(q);
            const resolvedFigures = resolveFigureResources(q, exam);
            const stemAppendixUrls =
              resolvedFigures.rasterStemUrlsResolved.length > 0
                ? resolvedFigures.rasterStemUrlsResolved
                : rasterAppendixUrlsNotEmbedded(
                    String(q.content ?? ""),
                    q.raster_figures?.stem ?? [],
                  );
            const useEplPresentation = shouldUseEducationalPresentation(String(q.content ?? ""), {
              imported: exam.source === "imported",
            });
            const eplRenderableDocument = useEplPresentation
              ? buildEducationalRenderableDocument({
                  canonicalText: String(q.content ?? ""),
                  exam,
                  question: q,
                })
              : null;
            const stemAppendixUrlsForRender =
              eplRenderableDocument != null
                ? filterRasterAppendixUrlsForEplPresentation(
                    stemAppendixUrls,
                    eplRenderableDocument,
                  )
                : stemAppendixUrls;
            const showStemVector =
              geometryDiagram &&
              !shouldSuppressVectorDiagramForDisplay(q, rasterRt, exam);
            const stemVectorFirst = shouldPreferVectorBeforeStemRasterAppendix(exam, q, rasterRt);
            return (
              <article key={q.id} className="paper-card p-7">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      第 {i + 1} 题 · {questionDisplayTypeLabel(q)} · {q.points} 分
                    </div>
                    <div className="no-print flex flex-wrap gap-1.5">
                      {(q.knowledge_tags ?? []).map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground"
                        >
                          <Tag className="h-2.5 w-2.5 shrink-0" /> {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {listeningTrack != null ? (
                    <ListeningTrackPlayButton
                      examId={exam.id}
                      trackIndex={listeningTrack}
                      scope="paper"
                    />
                  ) : null}
                </div>

                <FigureOwnershipDebugOverlay
                  exam={exam}
                  question={q}
                  enabled={showFigureOwnershipDebug}
                  rasterRuntime={rasterRt}
                />

                {shouldShowMissingRasterCallout(q, rasterRt) ? (
                  <Alert className="mb-3 border-amber-500/45 bg-amber-500/[0.07] text-foreground no-print">
                    <AlertTitle>卷面示意图未随题入库</AlertTitle>
                    <AlertDescription className="text-muted-foreground text-sm space-y-1.5">
                      <p>
                        本题在纸卷上含<strong>立体图、三视图或图示选项</strong>
                        ，而当前仅文字数据，没有
                        <code className="mx-0.5 rounded bg-muted px-1 text-xs">![](…)</code>
                        附图。仅从 PDF 抽字无法得到图；请将该页
                        <strong>导出为高清图片</strong>
                        并与原卷同批导入，或整页以图片上传；也可在支持「导入裁图」时由网关结构化 OCR
                        生成小图后，在编辑器中把图链写入题干与各选项。
                      </p>
                      <p className="text-foreground/90">
                        系统<strong>不会</strong>
                        用「学科示意图」矢量重绘代替缺失的扫描图，以免产生误导性图形。
                      </p>
                    </AlertDescription>
                  </Alert>
                ) : null}

                {omitPrintedListeningStem ? (
                  <>
                    <Alert className="mt-1 border-border bg-muted/40 text-foreground">
                      <AlertTitle>听力题 · 书面印发选项，不印题干与录音稿</AlertTitle>
                      <AlertDescription className="text-muted-foreground space-y-2">
                        <p>
                          本题为<strong>英语听力</strong>：录音材料与题干
                          <strong>仅通过播放朗读</strong>，不在本书面卷印字；下方
                          <strong>仅印发选项</strong>
                          （供答题卡对应）。打印本页时选项仍会输出。
                        </p>
                        <p className="text-xs">
                          朗读编辑稿路径：
                          <code className="rounded bg-muted px-1">
                            public/audio/{exam.id}/listening-script.md
                          </code>
                          （听力原文建议写在题库该题「推导过程」各步；题干写在题干字段；生成音频后可再手工改稿。）
                        </p>
                      </AlertDescription>
                    </Alert>
                    {q.options && q.options.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-foreground">
                          选项（本书面卷印发）
                        </p>
                        {q.type === "multiple_choice_multi" && (
                          <p className="mb-2 text-xs text-muted-foreground">
                            多选题；请选出所有正确项（正确答案见「查看答案与分步推导」）。
                          </p>
                        )}
                        <div className="exam-choice-options flex flex-row flex-wrap items-baseline gap-x-6 gap-y-2 text-sm leading-relaxed">
                          {q.options.map((opt, idx) => {
                            const letter = choiceLetterFromIndex(idx);
                            const optLetter =
                              letter === "A" || letter === "B" || letter === "C" || letter === "D"
                                ? letter
                                : null;
                            const optFigUrls =
                              optLetter != null
                                ? (q.raster_figures?.by_option?.[optLetter] ?? [])
                                : [];
                            return (
                              <div
                                key={idx}
                                className="flex min-w-0 max-w-full items-baseline gap-1.5"
                              >
                                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                                  {letter}.
                                </span>
                                <div className="min-w-0 [&_.prose]:max-w-none">
                                  <MathContent
                                    onFigureDecodeFailed={() =>
                                      markQuestionRasterDecodeFailed(q.id)
                                    }
                                  >
                                    {stripLeadingChoiceMarker(String(opt))}
                                  </MathContent>
                                  <RasterFigureAppendix
                                    urls={rasterAppendixUrlsNotEmbedded(
                                      String(opt ?? ""),
                                      optFigUrls,
                                    )}
                                    captionPrefix={`选项 ${letter}`}
                                    onFigureDecodeFailed={() =>
                                      markQuestionRasterDecodeFailed(q.id)
                                    }
                                  />
                                  {shouldEmphasizeMissingOptionFigures(q, rasterRt) &&
                                  optLetter &&
                                  !optionLetterHasConcreteFigureSupply(q, optLetter) ? (
                                    <p className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-200">
                                      选项图缺失；请对照原卷或补充裁图。
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : !String(q.content ?? "").trim() ? (
                  <Alert className="mt-1 border-amber-500/40 bg-amber-500/[0.06] text-foreground">
                    <AlertTitle>题干缺失</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      本题在数据中的题干（content）为空，故无法显示题面。通常由模型未按规范返回完整题目导致。请重新生成该卷；老数据可暂时从选项与解析反推题意，或待支持编辑后补全。
                    </AlertDescription>
                  </Alert>
                ) : useEplPresentation && eplRenderableDocument ? (
                  <>
                    <EducationalDocumentRenderer
                      document={eplRenderableDocument}
                      className="mt-1 border-0 bg-transparent px-0 py-0 shadow-none"
                      showPackingDebug={showPackingDebug}
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {showStemVector && stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                    <RasterFigureAppendix
                      urls={stemAppendixUrlsForRender}
                      captionPrefix="卷面附图"
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {showStemVector && !stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                  </>
                ) : (
                  <>
                    <MathContent onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}>
                      {q.content}
                    </MathContent>
                    {showStemVector && stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                    <RasterFigureAppendix
                      urls={stemAppendixUrls}
                      captionPrefix="卷面附图"
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {showStemVector && !stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                  </>
                )}

                {!omitPrintedListeningStem && q.options && q.options.length > 0 && (
                  <div className="mt-4">
                    {q.type === "multiple_choice_multi" && (
                      <p className="text-xs text-muted-foreground mb-2">
                        多选题，至少 {q.options.length}{" "}
                        个选项；请选出所有正确项（参考「查看答案与分步推导」中的标准答案）。
                      </p>
                    )}
                    <div className="exam-choice-options flex flex-row flex-wrap items-baseline gap-x-6 gap-y-2 text-sm leading-relaxed">
                      {q.options.map((opt, idx) => {
                        const letter = choiceLetterFromIndex(idx);
                        const optLetter =
                          letter === "A" || letter === "B" || letter === "C" || letter === "D"
                            ? letter
                            : null;
                        const optFigUrls =
                          optLetter != null ? (q.raster_figures?.by_option?.[optLetter] ?? []) : [];
                        return (
                          <div key={idx} className="flex min-w-0 max-w-full items-baseline gap-1.5">
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">
                              {letter}.
                            </span>
                            <div className="min-w-0 [&_.prose]:max-w-none">
                              <MathContent
                                onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                              >
                                {stripLeadingChoiceMarker(String(opt))}
                              </MathContent>
                              <RasterFigureAppendix
                                urls={rasterAppendixUrlsNotEmbedded(String(opt ?? ""), optFigUrls)}
                                captionPrefix={`选项 ${letter}`}
                                onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                              />
                              {shouldEmphasizeMissingOptionFigures(q, rasterRt) &&
                              optLetter &&
                              !optionLetterHasConcreteFigureSupply(q, optLetter) ? (
                                <p className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-200">
                                  选项图缺失；请对照原卷或补充裁图。
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 隐藏答案时不挂载原题解析，避免打印截到答案；同型例题不在此展示，请使用工具栏「打印例题」 */}
                {!omitPrintedListeningStem && showAll && (
                  <details open className="mt-6 group">
                    <summary className="cursor-pointer text-sm font-medium text-primary hover:underline list-none">
                      ▾ 查看答案与分步推导
                    </summary>
                    <div className="mt-4 rounded-md border-l-2 border-gold bg-parchment/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-gold mb-1.5">
                        最终答案
                      </div>
                      {shouldWithholdMcqAnswerForMissingRasterFigures(q, rasterRt) ? (
                        <p className="text-sm text-amber-900/90 dark:text-amber-100/90">
                          {MCQ_ANSWER_WITHHELD_FOR_MISSING_RASTER_MESSAGE}
                        </p>
                      ) : String(q.answer ?? "").trim() ? (
                        <MathContent>{q.answer}</MathContent>
                      ) : (
                        <p className="text-sm text-muted-foreground">（答案字段为空）</p>
                      )}
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        推导过程
                      </div>
                      <ol className="space-y-3">
                        {(shouldWithholdMcqAnswerForMissingRasterFigures(q, rasterRt)
                          ? placeholderSolutionStepsWhenMcqAnswerWithheld()
                          : (q.solution_steps as SolutionStep[])
                        ).map((s) => (
                          <li key={s.step} className="flex gap-3">
                            <span className="shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-mono">
                              {s.step}
                            </span>
                            <div className="flex-1 min-w-0">
                              <MathContent className="text-sm font-medium text-foreground">
                                {s.description}
                              </MathContent>
                              {s.reasoning && (
                                <div className="mt-1 text-sm text-muted-foreground">
                                  <MathContent>{s.reasoning}</MathContent>
                                </div>
                              )}
                              {s.formula && (
                                <div className="mt-1.5">
                                  <MathContent>{s.formula}</MathContent>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {hasLinkedExamples ? (
        <div
          id="exam-examples-print-root"
          ref={examplesPrintRootRef}
          className={cn(
            "exam-print-root exam-examples-print-root mt-12 border-t border-border pt-8",
            activeTab !== "examples" && "hidden",
          )}
          hidden={activeTab !== "examples"}
          aria-hidden={activeTab !== "examples"}
        >
          <header className="paper-card p-6 mb-6 text-center">
            <h2 className="text-display text-2xl font-semibold text-foreground">同型例题</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              配套试卷：{exam.title} · 共 {examples.length} 道
            </p>
          </header>

          <div className="space-y-6">
            {questions.map((q, i) => {
              const exs = examples.filter((e) => e.question_id === q.id);
              if (!exs.length) return null;
              return (
                <section key={q.id} className="paper-card p-6">
                  <div className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
                    第 {i + 1} 题 · 同型例题
                  </div>
                  {exs.map((ex, k) => {
                    const exTrack = listeningExampleAudioReady
                      ? listeningExampleTrackIndexForExampleId(questions, examples, ex.id)
                      : null;
                    return (
                      <article
                        key={ex.id}
                        className="border-b border-border/60 pb-6 mb-6 last:mb-0 last:border-b-0 last:pb-0"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="text-sm font-medium text-foreground">例 {k + 1}</div>
                          {exTrack != null ? (
                            <ListeningTrackPlayButton
                              examId={exam.id}
                              trackIndex={exTrack}
                              scope="examples"
                            />
                          ) : null}
                        </div>
                        <MathContent>{ex.content}</MathContent>
                        <div className="mt-4 rounded-md border-l-2 border-gold bg-parchment/50 p-4">
                          <div className="text-xs uppercase tracking-wider text-gold mb-1.5">
                            答案
                          </div>
                          {String(ex.answer ?? "").trim() ? (
                            <MathContent>{ex.answer}</MathContent>
                          ) : (
                            <p className="text-sm text-muted-foreground">（例题答案缺失）</p>
                          )}
                        </div>
                        <div className="mt-4">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                            推导过程
                          </div>
                          <ol className="space-y-3 list-none">
                            {(ex.solution_steps as SolutionStep[]).map((s, si) => (
                              <li key={`${ex.id}-st-${si}`} className="flex gap-3">
                                <span className="shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-mono">
                                  {exampleStepOrdinal(s, si)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <MathContent className="text-sm font-medium text-foreground">
                                    {s.description}
                                  </MathContent>
                                  {s.reasoning ? (
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      <MathContent>{s.reasoning}</MathContent>
                                    </div>
                                  ) : null}
                                  {s.formula ? (
                                    <div className="mt-1.5">
                                      <MathContent>{s.formula}</MathContent>
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
