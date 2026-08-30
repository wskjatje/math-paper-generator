import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  generateExamQuestionFigures,
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
import {
  examOffersExampleFigureGenerateAction,
  examOffersFigureGenerateAction,
} from "@/lib/diagram/figureRequireGate.shared";
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
  Shapes,
} from "lucide-react";
import { toast } from "sonner";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import { OfflineImportFigureCrops } from "@/components/OfflineImportFigureCrops";
import { ExamPrintChrome } from "@/components/exam/ExamPrintChrome";
import { ListeningOmittedStemSurface } from "@/components/exam/ListeningOmittedStemSurface";
import { ExamAnswerWritingSpace } from "@/components/exam/ExamAnswerWritingSpace";
import { ExamChoiceOptionsList } from "@/components/exam/ExamChoiceOptionsList";
import { ExamFigureChoicesRegion } from "@/components/exam/ExamFigureChoicesRegion";
import { ExamSubquestionFigureRegion } from "@/components/exam/ExamSubquestionFigureRegion";
import { ExamSubquestionTextRegion } from "@/components/exam/ExamSubquestionTextRegion";
import { PageShell } from "@/components/layout/PageShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { paperTemplateById } from "@/config/paperTemplates";
import {
  formatSectionQuestionIndex,
  formatSectionQuestionPoints,
  formatSectionHeadingLine,
  examSectionHeaderClassName,
  groupQuestionsBySection,
} from "@/lib/examSections.shared";
import {
  applyInlinePointsToStem,
  composePaperStemIndexPlain,
  resolvePaperStemChrome,
} from "@/lib/examPaperStemChrome.shared";
import {
  hasDisplayableFigureAttachment,
  planStemSubquestionFigureLayout,
  planStemSubquestionTextLayout,
} from "@/lib/examSubquestionFigureLayout.shared";
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
  shouldPreferVectorBeforeStemRasterAppendix,
  shouldSuppressVectorDiagramForDisplay,
  shouldWithholdMcqAnswerForMissingRasterFigures,
} from "@/lib/questionRendererPolicy.shared";
import {
  examDetailAppendixLoadErrorLabel,
  examDetailForensicsEnabled,
  examDetailShowImportParseBanner,
  examDetailShowOfflineImportFigureCrops,
  examDetailShowPerOptionMissingFigureHint,
  examDetailShowQuestionMissingRasterCallout,
} from "@/lib/examDetailUi.shared";
import { rasterAppendixUrlsNotEmbedded } from "@/lib/importRasterFigures.shared";
import { isPackingDebugEnabled } from "@/lib/cognitivePackingDebug.shared";
import { resolveMcqPaperDisplay } from "@/lib/examMcqOptions.shared";
import { stemHasLabeledSections } from "@/lib/examStemLabeledSections.shared";
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
import { ExamQualityPanel } from "@/components/exam/ExamQualityPanel";
import { formatFigureLifecycleTimelineCompact } from "@/lib/figureLifecycleTimeline.shared";

/** 导入卷图 ownership：显隐由 exam-domain `examDetailUi.forensicsAndFigureOwnership` 驱动。 */
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
    <div
      className="flex flex-wrap justify-start print:break-inside-avoid"
      style={{
        marginTop: `${PAPER_SURFACE_LAYOUT.stemToFigureGapRem}rem`,
        gap: `${PAPER_SURFACE_LAYOUT.attachmentStackGapRem}rem`,
      }}
    >
      {urls.map((u, i) => (
        <figure key={`${captionPrefix}-${u}-${i}`} className="m-0 shrink-0">
          <ExamFigureImage
            src={u}
            alt={`${captionPrefix} ${i + 1}`}
            className="max-h-52 max-w-full rounded-md border border-border object-contain bg-muted/30"
            loadErrorLabel={examDetailAppendixLoadErrorLabel()}
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
            <p>会话已失效。请重新导入试卷备份。</p>
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
              导入本地备份…
            </button>
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
        description: "请确认已生成听力音频后刷新页面再试。",
        duration: 8000,
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
  const genFiguresFn = useServerFn(generateExamQuestionFigures);
  const [listeningGenBusy, setListeningGenBusy] = useState(false);
  const [exampleListeningGenBusy, setExampleListeningGenBusy] = useState(false);
  const [figureGenBusy, setFigureGenBusy] = useState(false);
  const [listeningAudioReady, setListeningAudioReady] = useState(listeningAudioReadyInitial);
  const [listeningExampleAudioReady, setListeningExampleAudioReady] = useState(
    listeningExampleAudioReadyInitial,
  );
  const [showAll, setShowAll] = useState(false);
  const [examMeta, setExamMeta] = useState(exam);
  const printRootRef = useRef<HTMLDivElement>(null);
  const examplesPrintRootRef = useRef<HTMLDivElement>(null);
  const displayTitleRef = useRef("");
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
  const showImportParseBanner = examDetailShowImportParseBanner(
    importParseRollup != null && importParseRollup.rollup_tier !== "green",
  );

  const showFigureOwnershipDebug = examDetailForensicsEnabled({
    source: exam.source,
    figuresDebugSearch: search.figures_debug === true,
    isDev: Boolean(import.meta.env.DEV),
  });

  const showOfflineImportFigureCrops = examDetailShowOfflineImportFigureCrops({
    hasMedia: Boolean(offlineImportMedia),
    figuresDebugSearch: search.figures_debug === true,
    isDev: Boolean(import.meta.env.DEV),
  });

  const showPackingDebug = isPackingDebugEnabled({
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
      // 另存为 PDF 默认文件名用试卷名；避免带上「— 知学 Zhixue」站点后缀
      if (printScopeRef.current === "examples") {
        document.title = `${titleForExamExportFile(exam.title)}-同型例题`;
      } else {
        document.title = titleForExamExportFile(exam.title);
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
          description: res.engine ? `引擎：${res.engine}` : undefined,
          duration: 8000,
        });
      } else if (res.skippedReason) {
        toast.message(res.skippedReason);
      }
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "生成失败"));
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
          description: res.engine ? `引擎：${res.engine}` : undefined,
          duration: 8000,
        });
      } else if (res.skippedReason) {
        toast.message(res.skippedReason);
      }
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "生成失败"));
    } finally {
      setExampleListeningGenBusy(false);
    }
  };

  /** 例题页也可生成题图（同型例题继承原题配图需求，服务端同一入口处理） */
  const showFigureGenerate =
    !sessionBanner &&
    (activeTab === "paper"
      ? examOffersFigureGenerateAction(questions)
      : activeTab === "examples" &&
        hasLinkedExamples &&
        examOffersExampleFigureGenerateAction(questions, examples));

  const onGenerateQuestionFigures = async () => {
    setFigureGenBusy(true);
    try {
      const { loadAiSettings, toAiRuntimePayload } = await import("@/lib/aiSettingsStorage");
      const ai = toAiRuntimePayload(loadAiSettings());
      const res = await genFiguresFn({
        data: {
          examId: exam.id,
          force: true,
          preferAi: true,
          ai,
        },
      });
      void router.invalidate();
      const aiCount = res.results.filter((r) => r.source === "ai_svg").length;
      const sceneCount = res.results.filter(
        (r) => r.source === "figure_scene" || r.source === "stem_infer",
      ).length;
      const failed = res.results.filter((r) => !r.generated && !r.skipped);
      const failReasons = failed
        .filter((r) => r.reason)
        .slice(0, 2)
        .map((r) => r.reason)
        .join("；");
      const skipped = res.results.filter((r) => r.skipped);
      if (res.generatedCount === 0 && failed.length === 0 && skipped.length > 0) {
        toast.message("未生成题图", {
          description:
            "本卷题干多无「如图」且未命中可配图形态，或几何解算/绘图未产出可用图。可检查设置中的配图模型后重试。",
          duration: 10000,
        });
      } else {
        toast.success(`已生成 ${res.generatedCount} 道题图`, {
          description: [
            sceneCount > 0 ? `结构图 ${sceneCount} 题` : null,
            aiCount > 0 ? `智能绘图 ${aiCount} 题` : null,
            failed.length > 0 ? `${failed.length} 题未生成` : null,
            failReasons || null,
          ]
            .filter(Boolean)
            .join(" · "),
          duration: 10000,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "生成题图失败";
      toast.error(msg, { duration: 10000 });
    } finally {
      setFigureGenBusy(false);
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
        "即将打开打印对话框：请选「另存为 PDF」，并取消勾选「页眉和页脚」（去掉网址与日期）。仅含同型例题。",
      duration: 12000,
    });
    startExamPdfViaBrowserPrint(el, {
      documentTitle: `${titleForExamExportFile(exam.title)}-同型例题`,
    });
  };

  const printPaperVector = () => {
    if (paperPdfBlockedByImportRaster) {
      const ok = window.confirm(
        "该导入卷存在「题干用语依赖卷面示意图，但当前无可用插图（未入库、链接失效或附录图无法加载）」的选择题。\n\n" +
          "继续打印或「另存为 PDF」时版面可能不完整；读卷页面对答案的隐藏策略也会体现在导出结果中。\n\n" +
          "建议先补全题干/选项中的插图或重新导入含图正文。\n\n是否仍要打开系统打印对话框？",
      );
      if (!ok) return;
    }
    const el = printRootRef.current;
    if (!el) return;
    printScopeRef.current = "paper";
    document.documentElement.setAttribute("data-print-scope", "paper");
    toast.message("导出矢量 PDF（试卷）", {
      description:
        "即将打开打印对话框：请选「另存为 PDF」，并取消勾选「页眉和页脚」（去掉网址与日期）。仅含试卷题目。",
      duration: 12000,
    });
    startExamPdfViaBrowserPrint(el, {
      documentTitle: titleForExamExportFile(exam.title),
    });
  };

  const onExamTabChange = (value: string) => {
    if (value !== "paper" && value !== "examples") return;
    navigate({ search: (prev) => ({ ...prev, tab: value }), replace: true });
  };

  const paperTemplate = paperTemplateById(examMeta.paper_template_id);
  const showPaperSections = paperTemplate?.showSectionHeaders !== false;
  const paperQuestionGroups = groupQuestionsBySection(
    examMeta.sections ?? undefined,
    questions,
  );

  return (
    <PageShell size="medium" className="exam-print-shell">
      {sessionBanner && (
        <Alert className="no-print mb-8 border-amber-500/40 bg-amber-500/[0.06]">
          <AlertTitle className="text-foreground">会话预览 · 尚未保存</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            尚未保存到试卷库。
          </AlertDescription>
        </Alert>
      )}
      {!sessionBanner ? (
        <ExamQualityPanel
          examId={examMeta.id}
          exam={examMeta}
          onExamPatched={(next) => {
            setExamMeta(next);
            void router.invalidate();
          }}
        />
      ) : null}
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
              {importParseRollup.green_count} 题。请对照原卷核对。
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
              to={exam.source === "imported" ? "/offline-imports" : "/library"}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {exam.source === "imported" ? "返回导入" : "返回试卷库"}
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
                title="为试卷听力题合成朗读音频"
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
                title="为例题单独合成朗读音频"
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
            {showFigureGenerate ? (
              <button
                type="button"
                disabled={figureGenBusy}
                title="生成题图"
                onClick={() => void onGenerateQuestionFigures()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
              >
                {figureGenBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Shapes className="h-4 w-4" aria-hidden />
                )}
                {figureGenBusy ? "生成中…" : "生成题图"}
              </button>
            ) : null}
            {activeTab === "paper" ? (
              <button
                type="button"
                onClick={printPaperVector}
                title={
                  paperPdfBlockedByImportRaster ? "部分插图不可用，建议补图后再导出" : "打印为 PDF"
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Printer className="h-4 w-4" /> 打印试卷
              </button>
            ) : hasLinkedExamples ? (
              <button
                type="button"
                onClick={saveExamplesPdfAsVector}
                title="打开打印对话框；请取消勾选「页眉和页脚」，再选「另存为 PDF」（仅同型例题）"
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
          paperTemplate?.printClassName,
          activeTab !== "paper" && "hidden",
        )}
        data-paper-template={exam.paper_template_id ?? paperTemplate?.id}
        hidden={activeTab !== "paper"}
        aria-hidden={activeTab !== "paper"}
      >
        <ExamPrintChrome exam={exam} />
        {/* Header */}
        <header className="paper-card p-8 mb-8 text-center">
          <h1 className="text-display text-2xl sm:text-3xl md:text-4xl">{exam.title}</h1>
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
              <span className="no-print inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0" />
                生成于{" "}
                {new Date(exam.created_at).toLocaleString("zh-CN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
            {exam.generation_duration_sec != null && exam.generation_duration_sec > 0 && (
              <span className="no-print">命题耗时约 {exam.generation_duration_sec} 秒</span>
            )}
          </div>
          {/* description 为卷库元数据；仅模板显式开启时上卷面（默认与打印页眉一致：不展示） */}
          {paperTemplate?.showDescription && exam.description?.trim() ? (
            <p className="mt-5 text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {exam.description.trim()}
            </p>
          ) : null}
        </header>

        {showOfflineImportFigureCrops && offlineImportMedia ? (
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
          {paperQuestionGroups.map(({ section, questions: sectionItems }) => (
            <section key={section.id} className="exam-paper-section space-y-6">
              {showPaperSections ? (
                <header className={examSectionHeaderClassName()}>
                  <h2 className="text-display text-base font-semibold tracking-wide text-foreground sm:text-lg">
                    {formatSectionHeadingLine(section)}
                  </h2>
                </header>
              ) : null}
              {sectionItems.map(({ question: q, globalIndex: i }) => {
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
            const paperDisplay = resolveMcqPaperDisplay({
              content: String(q.content ?? ""),
              options: q.options,
              type: q.type,
            });
            const paperStem = paperDisplay.stem;
            const paperOptions = paperDisplay.options;
            const stemAppendixUrls =
              resolvedFigures.rasterStemUrlsResolved.length > 0
                ? resolvedFigures.rasterStemUrlsResolved
                : rasterAppendixUrlsNotEmbedded(
                    paperStem,
                    q.raster_figures?.stem ?? [],
                  );
            /** 含输入/样例等标签段时必须走 MathContent 层级缩进；EPL 按行拆段会丢掉缩进 */
            const useEplPresentation =
              !stemHasLabeledSections(paperStem) &&
              shouldUseEducationalPresentation(paperStem, {
                imported: exam.source === "imported",
              });
            const hasChoiceOptions = paperOptions.length > 0;
            const stemFigurePlan = planStemSubquestionFigureLayout({
              content: paperStem,
              hasChoiceOptions,
              attachments: q.attachments,
              stemRasterUrls: stemAppendixUrls,
            });
            const stemSplit = stemFigurePlan.split;
            /** 短小问+图：并排优先于 EPL 竖排，避免右侧大块留白 */
            const useSubquestionFigureBeside = stemFigurePlan.useBeside;
            const stemTextPlan = planStemSubquestionTextLayout({
              content: paperStem,
              hasChoiceOptions,
              useBeside: useSubquestionFigureBeside,
            });
            const useCompactSubquestions = stemTextPlan.useCompact;
            const qIndexLabel = showPaperSections
              ? formatSectionQuestionIndex(i)
              : `第 ${i + 1} 题`;
            const qPointsLabel = showPaperSections
              ? formatSectionQuestionPoints(q.points)
              : `· ${questionDisplayTypeLabel(q)} · ${q.points} 分`;
            const stemChrome = resolvePaperStemChrome({
              indexLabel: qIndexLabel,
              pointsLabel: showPaperSections ? qPointsLabel : "",
              stem: paperStem,
            });
            /** EPL：题号写入 canonical 首行；分值按配置插入导语末（有小问）或整段末 */
            const eplStemBody =
              stemChrome.appendPointsInline && showPaperSections
                ? applyInlinePointsToStem(paperStem, qPointsLabel)
                : paperStem;
            const eplCanonicalBase = composePaperStemIndexPlain(qIndexLabel, eplStemBody);
            const eplRenderableDocument = useEplPresentation
              ? buildEducationalRenderableDocument({
                  canonicalText: eplCanonicalBase,
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
            const besideUsesAttachments = hasDisplayableFigureAttachment(q.attachments);
            const pointsAfterBlock =
              stemChrome.showPointsAfterBlock && showPaperSections ? (
                <span className="exam-q-points mt-1 block whitespace-nowrap">{qPointsLabel}</span>
              ) : null;
            const leadMarkdownWithInlinePoints = stemChrome.appendPointsInline
              ? `${stemChrome.leadMarkdown} ${qPointsLabel}`
              : stemChrome.leadMarkdown;
            const compactLead = resolvePaperStemChrome({
              indexLabel: qIndexLabel,
              pointsLabel: showPaperSections ? qPointsLabel : "",
              stem: paperStem,
              leadBody: useSubquestionFigureBeside
                ? stemSplit.preamble
                : stemTextPlan.split.preamble,
            });
            const compactLeadMarkdown = compactLead.appendPointsInline
              ? `${compactLead.leadMarkdown} ${qPointsLabel}`
              : compactLead.leadMarkdown;
            return (
              <article key={q.id} className="paper-card p-7">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="no-print flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {(q.knowledge_tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded border border-border px-1.5 py-0.5 text-muted-foreground"
                      >
                        <Tag className="h-2.5 w-2.5 shrink-0" /> {t}
                      </span>
                    ))}
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

                {examDetailShowQuestionMissingRasterCallout(q, rasterRt) ? (
                  <Alert className="mb-3 border-amber-500/45 bg-amber-500/[0.07] text-foreground no-print">
                    <AlertTitle>卷面示意图缺失</AlertTitle>
                    <AlertDescription className="text-muted-foreground text-sm">
                      示意图缺失，请补图或生成题图。
                    </AlertDescription>
                  </Alert>
                ) : null}

                {omitPrintedListeningStem ? (
                  <>
                    <div className="mb-1 text-base font-medium text-foreground">
                      {qIndexLabel}{" "}
                      <span className="font-normal text-muted-foreground">听力</span>{" "}
                      {qPointsLabel}
                    </div>
                  <ListeningOmittedStemSurface
                    question={q}
                    variant="authoring"
                    revealStemForAuthoring
                    choices={
                      paperOptions.length > 0 ? (
                        <div className="mt-1">
                          <ExamChoiceOptionsList
                            options={paperOptions}
                            onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                            renderOptionExtra={({ letter, option }) => {
                              const optLetter =
                                letter === "A" ||
                                letter === "B" ||
                                letter === "C" ||
                                letter === "D"
                                  ? letter
                                  : null;
                              const optFigUrls =
                                optLetter != null
                                  ? (q.raster_figures?.by_option?.[optLetter] ?? [])
                                  : [];
                              return (
                                <>
                                  <RasterFigureAppendix
                                    urls={rasterAppendixUrlsNotEmbedded(
                                      String(option ?? ""),
                                      optFigUrls,
                                    )}
                                    captionPrefix={`选项 ${letter}`}
                                    onFigureDecodeFailed={() =>
                                      markQuestionRasterDecodeFailed(q.id)
                                    }
                                  />
                                  {examDetailShowPerOptionMissingFigureHint(q, rasterRt) &&
                                  optLetter &&
                                  !optionLetterHasConcreteFigureSupply(q, optLetter) ? (
                                    <p className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-200 no-print">
                                      选项图缺失
                                    </p>
                                  ) : null}
                                </>
                              );
                            }}
                          />
                        </div>
                      ) : null
                    }
                  />
                  </>
                ) : !paperStem.trim() ? (
                  <Alert className="mt-1 border-amber-500/40 bg-amber-500/[0.06] text-foreground">
                    <AlertTitle>题干缺失</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      请重新生成该卷或补全题干。
                    </AlertDescription>
                  </Alert>
                ) : useSubquestionFigureBeside ? (
                  <div className="exam-q-stem-flow text-base leading-relaxed text-foreground">
                    <MathContent
                      inlineFlow
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    >
                      {compactLeadMarkdown}
                    </MathContent>
                    <ExamSubquestionFigureRegion
                      composition="beside"
                      attachments={
                        besideUsesAttachments ? (q.attachments ?? undefined) : undefined
                      }
                      figure={
                        besideUsesAttachments ? undefined : (
                          <RasterFigureAppendix
                            urls={stemAppendixUrls}
                            captionPrefix="卷面附图"
                            onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                          />
                        )
                      }
                      subquestions={
                        <MathContent
                          onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                        >
                          {stemSplit.subquestions!}
                        </MathContent>
                      }
                    />
                    {pointsAfterBlock}
                    {showStemVector && stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                    {showStemVector && !stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5" />
                    ) : null}
                  </div>
                ) : useCompactSubquestions ? (
                  <div className="exam-q-stem-flow text-base leading-relaxed text-foreground">
                    <MathContent
                      inlineFlow
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    >
                      {compactLeadMarkdown}
                    </MathContent>
                    <ExamSubquestionTextRegion
                      items={stemTextPlan.items}
                      layout={stemTextPlan.layout}
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {pointsAfterBlock}
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
                  </div>
                ) : useEplPresentation && eplRenderableDocument ? (
                  <div className="exam-q-stem-flow text-base leading-relaxed text-foreground">
                    <EducationalDocumentRenderer
                      document={eplRenderableDocument}
                      className="border-0 bg-transparent px-0 py-0 shadow-none"
                      showPackingDebug={showPackingDebug}
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {pointsAfterBlock}
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
                  </div>
                ) : (
                  <div className="exam-q-stem-flow text-base leading-relaxed text-foreground">
                    <MathContent
                      inlineFlow
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    >
                      {leadMarkdownWithInlinePoints}
                    </MathContent>
                    {pointsAfterBlock}
                    {showStemVector && stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5 block" />
                    ) : null}
                    <RasterFigureAppendix
                      urls={stemAppendixUrls}
                      captionPrefix="卷面附图"
                      onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                    />
                    {showStemVector && !stemVectorFirst ? (
                      <GeometryDiagramRenderer schema={geometryDiagram} className="mt-5 block" />
                    ) : null}
                  </div>
                )}

                {!omitPrintedListeningStem &&
                !useSubquestionFigureBeside &&
                ((q.attachments?.length ?? 0) > 0 || paperOptions.length > 0) ? (
                  <ExamFigureChoicesRegion
                    attachments={q.attachments ?? undefined}
                    options={paperOptions}
                    choices={
                      paperOptions.length > 0 ? (
                        <ExamChoiceOptionsList
                          options={paperOptions}
                          onFigureDecodeFailed={() => markQuestionRasterDecodeFailed(q.id)}
                          renderOptionExtra={({ letter, option }) => {
                            const optLetter =
                              letter === "A" ||
                              letter === "B" ||
                              letter === "C" ||
                              letter === "D"
                                ? letter
                                : null;
                            const optFigUrls =
                              optLetter != null
                                ? (q.raster_figures?.by_option?.[optLetter] ?? [])
                                : [];
                            return (
                              <>
                                <RasterFigureAppendix
                                  urls={rasterAppendixUrlsNotEmbedded(
                                    String(option ?? ""),
                                    optFigUrls,
                                  )}
                                  captionPrefix={`选项 ${letter}`}
                                  onFigureDecodeFailed={() =>
                                    markQuestionRasterDecodeFailed(q.id)
                                  }
                                />
                                {examDetailShowPerOptionMissingFigureHint(q, rasterRt) &&
                                optLetter &&
                                !optionLetterHasConcreteFigureSupply(q, optLetter) ? (
                                  <p className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-200 no-print">
                                    选项图缺失
                                  </p>
                                ) : null}
                              </>
                            );
                          }}
                        />
                      ) : null
                    }
                  />
                ) : null}

                <ExamAnswerWritingSpace
                  type={q.type}
                  type_label={q.type_label}
                  options={paperOptions}
                />

                {/* 隐藏答案时不挂载原题解析，避免打印截到答案；同型例题不在此展示，请使用工具栏「打印例题」 */}
                {/* 听力不印题干时仍可在命题端展开答案核对 */}
                {showAll && (
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
            </section>
          ))}
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
