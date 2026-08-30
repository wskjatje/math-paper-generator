import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Library, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OfflineImportImageAnnotator } from "@/components/OfflineImportImageAnnotator";
import { OfflineImportOcrStatusBanner } from "@/components/OfflineImportOcrStatusBanner";
import { CanonicalizationForensicViewer } from "@/components/CanonicalizationForensicViewer";
import { EducationalDocumentRenderer } from "@/components/education/EducationalDocumentRenderer";
import { buildEducationalRenderableDocument } from "@/lib/educationalPresentation.shared";
import { StructuredOcrPreview } from "@/components/StructuredOcrPreview";
import {
  createOfflineImportAnnotation,
  type NewOfflineImportImageAnnotation,
  type OfflineImportAnnotTool,
  type OfflineImportImageAnnotation,
} from "@/lib/offlineImportAnnotation.shared";
import {
  importOfflineExamFromDocument,
  persistImportDocumentExtract,
} from "@/lib/exam.functions.server";
import { upsertRemoteImportJob } from "@/lib/remoteImportJobsStorage";
import { requestRemoteImportQueueDrain } from "@/lib/remoteImportQueueDrain";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import {
  OFFLINE_IMPORT_DEFAULTS,
  resolveOfflineImportOcrOnlyNoPersistFigures,
  resolveOfflineImportPerQuestionAi,
} from "@/lib/offlineImportDefaults.shared";
import { gatewayOcrJson } from "@/lib/gatewayOcr.functions.server";
import { postGatewayOcrJsonFromBrowser } from "@/lib/gatewayOcrBrowser.shared";
import { isGatewayOcrTimeoutMessage } from "@/lib/gatewayOcrWarmup.shared";
import {
  ensureGatewayOcrWarmup,
  getGatewayOcrWarmupSnapshot,
  syncGatewayOcrWarmupFromStatus,
  type GatewayOcrWarmupState,
} from "@/lib/gatewayOcrWarmupController.shared";
import { useGatewayOcrWarmupSnapshot } from "@/hooks/useGatewayOcrWarmupSnapshot";
import type { GatewayOcrJsonResult } from "@/lib/gatewayOcr.shared";
import {
  runPluggableOcrPipelineWithFrontend,
  type OcrFrontendProvenanceV1,
  type PluggableOcrResult,
} from "@/lib/ocr";
import { applyFaithfulOfflineImportOcrText } from "@/lib/offlineImportFaithfulOcr.shared";
import { runEducationalTextCanonicalization } from "@/lib/educationalTextCanonicalization.shared";
import type { EducationalTextCanonicalizationTraceV1 } from "@/lib/educationalTextCanonicalization.shared";
import { assessOcrExtractQuality } from "@/lib/offlineExamCoordinateOcrNormalize.shared";
import {
  buildOfflineImportOcrIngestSummary,
  probeGatewayReadyFromBrowser,
  type OfflineImportOcrFileReport,
  type OfflineImportOcrIngestSummary,
} from "@/lib/offlineImportOcrIngestSummary.shared";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { gatewayBaseUrlForRequest, loadGatewaySettings } from "@/lib/gatewaySettingsStorage";
import { CURRICULUM_SUBJECT_OPTIONS, GRADE_LEVEL_OPTIONS } from "@/lib/generateCatalog";
import type { Difficulty } from "@/lib/types";
import {
  enhanceOfflineExtractViaHttpService,
  forwardOfflinePreviewToOpenNotebook,
} from "@/lib/integration.functions.server";
import {
  applyOfflineOcrLexiconLayer,
  persistOcrLexiconFromImportDiff,
} from "@/lib/ocrRepairLexicon.functions.server";
import type { FigureMaterializationImportContextV1 } from "@/lib/figureMaterializationTelemetry.shared";
import { persistOfflineImportDiagramCrops } from "@/lib/offlineImportDiagramCrops.functions.server";
import { persistOfflineImportFigures } from "@/lib/offlineImportFigures.functions.server";
import { collectDiagramCropDescriptors } from "@/lib/ocr/diagramCropDescriptors.shared";
import { mergeStructuredOcrChunksForImport } from "@/lib/mergeStructuredOcrChunks.shared";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const DIFF_OPTIONS: { id: Difficulty; label: string }[] = [
  { id: "beginner", label: "入门" },
  { id: "intermediate", label: "进阶" },
  { id: "competition", label: "竞赛" },
  { id: "advanced", label: "高阶竞赛" },
];

const SEL =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

/** 与 `offlineDocumentExtract` 一致：常见扫描/拍照扩展名 */
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp|tif?f)$/i;

function countMarkdownImportFigureRefs(text: string): number {
  return (text.match(/\/import-figures\//g) ?? []).length;
}

function formatExtractElapsed(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

/** 开发环境默认开启；生产构建可设 `VITE_MPG_DEBUG_VISUAL_INGEST=1` 复现管线断点 */
const DEBUG_VISUAL_INGEST =
  import.meta.env.DEV || String(import.meta.env.VITE_MPG_DEBUG_VISUAL_INGEST ?? "").trim() === "1";

export function ImportOfflineExamDialog({
  open,
  onOpenChange,
  onImported,
  integration,
  importDualTrackGateEnabled = false,
  ocrRepairLexiconPersistence = "local_file",
  importFiguresStorage: _importFiguresStorage = "local",
  gatewayOcrConfiguredOnServer = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (res: {
    examId: string;
    persisted: "supabase" | "local" | "mysql";
    import_pipeline_diagnostic?: { layout_ast_file_written: boolean };
  }) => void;
  /** 来自 getBackendCapabilities：控制可选外部集成 UI */
  integration?: {
    openNotebook: boolean;
    plaintextExtract: boolean;
  };
  /** 服务端 MPG_IMPORT_DUAL_TRACK_GATE=1 时为 true，才显示「双轨诊断」勾选 */
  importDualTrackGateEnabled?: boolean;
  /** 服务端词典写入位置（用于提示）；词典 always 可通过 data 文件落盘 */
  ocrRepairLexiconPersistence?: "supabase" | "mysql" | "local_file";
  /** 导入附图优先 Supabase Storage 或本地 public（来自 getBackendCapabilities） */
  importFiguresStorage?: "supabase" | "local";
  /** getBackendCapabilities：服务端是否配置 MPG_GATEWAY_URL */
  gatewayOcrConfiguredOnServer?: boolean;
}) {
  const importDocFn = useServerFn(importOfflineExamFromDocument);
  const persistExtractFn = useServerFn(persistImportDocumentExtract);
  const gatewayOcrJsonFn = useServerFn(gatewayOcrJson);
  const enhanceExtractFn = useServerFn(enhanceOfflineExtractViaHttpService);
  const forwardOpenNotebookFn = useServerFn(forwardOfflinePreviewToOpenNotebook);
  const applyLexiconFn = useServerFn(applyOfflineOcrLexiconLayer);
  const persistLexiconDiffFn = useServerFn(persistOcrLexiconFromImportDiff);
  const persistFiguresFn = useServerFn(persistOfflineImportFigures);
  const persistDiagramCropsFn = useServerFn(persistOfflineImportDiagramCrops);

  const [busy, setBusy] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{
    phase: string;
    startedAt: number;
  } | null>(null);
  const [extractElapsedSec, setExtractElapsedSec] = useState(0);
  const docFileRef = useRef<HTMLInputElement>(null);

  const reportExtractPhase = useCallback((phase: string) => {
    setExtractProgress((prev) => ({
      phase,
      startedAt: prev?.startedAt ?? Date.now(),
    }));
  }, []);

  useEffect(() => {
    if (!extractProgress) {
      setExtractElapsedSec(0);
      return;
    }
    const startedAt = extractProgress.startedAt;
    const tick = () => setExtractElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [extractProgress]);

  const [docExtracted, setDocExtracted] = useState("");
  /** EPL：试卷阅读 vs 编辑 canonical 原文 */
  const [docPreviewMode, setDocPreviewMode] = useState<"paper" | "edit">("paper");
  /** GOT 合并稿（compiler 输入）；与预览 canonical 分离以便 forensic replay */
  const [ocrTransportRaw, setOcrTransportRaw] = useState("");
  const [canonicalizationTrace, setCanonicalizationTrace] =
    useState<EducationalTextCanonicalizationTraceV1 | null>(null);
  const [structuredChunks, setStructuredChunks] = useState<
    { filename: string; result: PluggableOcrResult }[]
  >([]);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [ocrIngestSummary, setOcrIngestSummary] = useState<OfflineImportOcrIngestSummary | null>(
    null,
  );
  /** 服务端落盘抽取 bundle id（核对差异） */
  const [sourceDocumentId, setSourceDocumentId] = useState<string | undefined>();
  /** Sidecar 保真档位；入队时写入任务，供审核对照 */
  const [extractionQuality, setExtractionQuality] = useState<
    "high_fidelity" | "basic_fallback" | undefined
  >();
  const [docGrade, setDocGrade] = useState("");
  const [docSubject, setDocSubject] = useState("");
  const [docDifficulty, setDocDifficulty] = useState<Difficulty | "">("");
  const [docDuration, setDocDuration] = useState(90);
  /** 本次抽取的 GOT-OCR 原文备份（与预览一致，供图链 reconcile） */
  const [ocrRawBackup, setOcrRawBackup] = useState("");
  /** 抽取完成后是否先 POST 到 MPG_PLAINTEXT_EXTRACT_URL（服务端已配置时可选） */
  const [useExternalPlaintextEnhance, setUseExternalPlaintextEnhance] = useState(false);
  const { inferGeometryDiagrams } = OFFLINE_IMPORT_DEFAULTS;
  /** false = persist-enabled authoritative ingestion；true = semantic-only（无 figure registry） */
  const [ocrOnlyNoPersistFigures, setOcrOnlyNoPersistFigures] = useState(() =>
    resolveOfflineImportOcrOnlyNoPersistFigures(),
  );
  /** 双轨诊断：须服务端闸门 + 本勾选；不替换轨 A 整理结果 */
  const [importDualTrackAck, setImportDualTrackAck] = useState(false);
  const [notebookForwardBusy, setNotebookForwardBusy] = useState(false);
  /** 用户在预览区改过字后，与「仅 AI 稿」区分提示 */
  const [previewEditedByUser, setPreviewEditedByUser] = useState(false);
  /** 将人工差异写入服务端 ocr_repair_lexicon */
  const [persistLexiconLearn, setPersistLexiconLearn] = useState(false);
  /** 流水线写入预览的末次稿（未含用户手改），用于与最终稿 diff 记词典 */
  const pipelinePreviewRef = useRef<string>("");
  /** 本次选择的图片本地预览 URL（object URL），用于与原卷对照 */
  const [previewImageUrls, setPreviewImageUrls] = useState<string[]>([]);
  /** 与预览图顺序一致、已写入站点/存储的附图 URL（入库对照标注用） */
  const [persistedFigureUrls, setPersistedFigureUrls] = useState<string[]>([]);
  /** 原图对照标注（整理入库时写入试卷存储） */
  const [previewImageAnnotations, setPreviewImageAnnotations] = useState<
    OfflineImportImageAnnotation[]
  >([]);
  /** 最近一次文件抽取完成的 OCR/裁图 producer 计数（整理入库时写入 import_parse_quality） */
  const [figureMaterializationProducer, setFigureMaterializationProducer] =
    useState<FigureMaterializationImportContextV1 | null>(null);
  const ocrFrontendProvenanceRef = useRef<OcrFrontendProvenanceV1 | null>(null);
  const [annotateTool, setAnnotateTool] = useState<OfflineImportAnnotTool>("pan");
  const gatewayWarmup = useGatewayOcrWarmupSnapshot();
  const gatewayOcrWarmupState: GatewayOcrWarmupState =
    gatewayWarmup.state === "probing" ? "warming" : gatewayWarmup.state;

  const revokePreviewImageUrls = useCallback((urls: readonly string[]) => {
    for (const u of urls) URL.revokeObjectURL(u);
  }, []);
  const previewImageUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    previewImageUrlsRef.current = previewImageUrls;
  });
  useEffect(() => {
    return () => revokePreviewImageUrls(previewImageUrlsRef.current);
  }, [revokePreviewImageUrls]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    void ensureGatewayOcrWarmup();
    const id = window.setInterval(() => {
      const st = getGatewayOcrWarmupSnapshot().state;
      if (st === "warming" || st === "probing") {
        void syncGatewayOcrWarmupFromStatus();
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [open]);

  const setExtractedFromPipeline = useCallback((transportRaw: string) => {
    const { text: canonical, trace } = runEducationalTextCanonicalization(transportRaw);
    setOcrTransportRaw(transportRaw);
    setCanonicalizationTrace(trace);
    setDocExtracted(canonical);
    pipelinePreviewRef.current = canonical;
    setPreviewEditedByUser(false);
  }, []);

  const resetDocFields = () => {
    setDocExtracted("");
    setOcrTransportRaw("");
    setCanonicalizationTrace(null);
    setStructuredChunks([]);
    setExtractWarnings([]);
    setOcrIngestSummary(null);
    setSourceDocumentId(undefined);
    setExtractionQuality(undefined);
    setOcrRawBackup("");
    setUseExternalPlaintextEnhance(false);
    setImportDualTrackAck(false);
    setPreviewEditedByUser(false);
    setPersistLexiconLearn(false);
    pipelinePreviewRef.current = "";
    setPreviewImageUrls((prev) => {
      revokePreviewImageUrls(prev);
      return [];
    });
    setPersistedFigureUrls([]);
    setPreviewImageAnnotations([]);
    setFigureMaterializationProducer(null);
    ocrFrontendProvenanceRef.current = null;
    setAnnotateTool("pan");
  };

  const handleAnnotationAdd = useCallback((partial: NewOfflineImportImageAnnotation) => {
    setPreviewImageAnnotations((prev) => [...prev, createOfflineImportAnnotation(partial)]);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetDocFields();
    }
    onOpenChange(next);
  };

  const submitDocument = async () => {
    const text = docExtracted.trim();
    if (text.length < 30) {
      toast.error("请先选择 pdf/docx/xlsx/csv/图片 等文件并完成正文抽取");
      return;
    }
    if (!docSubject.trim()) {
      toast.error("请选择学科");
      return;
    }
    setBusy(true);
    try {
      const textForImport = text;

      /** 仅 OCR 模式不入库原图 URL，对照标注亦不写入试卷存储 */
      const offline_import_media =
        !ocrOnlyNoPersistFigures && persistedFigureUrls.length > 0
          ? {
              figureUrls: persistedFigureUrls,
              annotations: previewImageAnnotations,
            }
          : undefined;

      const res = await importDocFn({
        data: {
          text: textForImport,
          sourceDocumentId,
          structured_ocr_json: (() => {
            if (structuredChunks.length === 0) return undefined;
            const merged = mergeStructuredOcrChunksForImport(structuredChunks);
            return merged ? JSON.stringify(merged) : undefined;
          })(),
          /** 修复稿常丢 Markdown 图；服务端 reconcile 与备份比 token 数择优挂图 */
          figure_reconcile_source: ocrRawBackup.trim() || undefined,
          grade: docGrade || undefined,
          subject: docSubject || undefined,
          difficulty: docDifficulty || undefined,
          duration_min: docDuration,
          ai: toAiRuntimePayload(loadAiSettings()),
          offline_import_media,
          infer_geometry_diagrams: inferGeometryDiagrams,
          per_question_ai: resolveOfflineImportPerQuestionAi(undefined, textForImport),
          import_dual_track_ack:
            importDualTrackGateEnabled && importDualTrackAck ? true : undefined,
          figure_materialization_import_ctx: figureMaterializationProducer ?? undefined,
          ocr_frontend_provenance: ocrFrontendProvenanceRef.current ?? undefined,
        },
      });

      if (persistLexiconLearn && previewEditedByUser && pipelinePreviewRef.current !== text) {
        try {
          const pr = await persistLexiconDiffFn({
            data: { beforeText: pipelinePreviewRef.current, afterText: text },
          });
          if (pr.upserted > 0) {
            toast.message("已写入服务端修复词典", {
              description: `新增或更新 ${pr.upserted} 条字面替换（后续抽取/修复自动套用）`,
            });
          }
        } catch (e: unknown) {
          console.warn("[import] persistOcrLexiconFromImportDiff:", e);
        }
      }

      const baseDesc =
        res.persisted === "supabase"
          ? "云端草稿已生成，请在「导入线下卷」页核对后再点「确认入库」"
          : res.persisted === "mysql"
            ? "本机数据库草稿已生成，请在「导入线下卷」页核对后再点「确认入库」"
            : "本机草稿已生成，请在「导入线下卷」页核对后再点「确认入库」";
      toast.success("已写入「待确认」临时库", {
        description: baseDesc,
      });
      handleOpenChange(false);
      onImported?.(res);
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "整理写入失败"));
    } finally {
      setBusy(false);
    }
  };

  /** 旁路：加入导入队列（不走抽屉内直写）；OCR/正文已抽取后可后台串行整理 */
  const enqueueDocument = async () => {
    const text = docExtracted.trim();
    if (text.length < 30) {
      toast.error("请先选择 pdf/docx/xlsx/csv/图片 等文件并完成正文抽取");
      return;
    }
    if (!docSubject.trim()) {
      toast.error("请选择学科");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const grade = GRADE_LEVEL_OPTIONS.find((item) => item.id === docGrade);
      const subject = CURRICULUM_SUBJECT_OPTIONS.find((item) => item.id === docSubject);
      const primaryName = docFileRef.current?.files?.[0]?.name?.trim();
      await upsertRemoteImportJob({
        id: crypto.randomUUID(),
        importSource: "upload",
        catalogEntryId: `upload:${crypto.randomUUID()}`,
        documentText: text,
        sourceDocumentId,
        extractionQuality,
        title: primaryName || "上传的线下试卷",
        year: new Date().getFullYear(),
        gradeId: docGrade || undefined,
        subjectId: docSubject || undefined,
        gradeLabel: grade?.label ?? "未指定",
        subjectLabel: subject?.label ?? "未指定",
        difficulty: docDifficulty || undefined,
        durationMin: docDuration,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      });
      requestRemoteImportQueueDrain();
      toast.success(sourceDocumentId ? "已加入导入队列（已关联来源文档）" : "已加入导入队列");
      handleOpenChange(false);
    } catch (e: unknown) {
      const facing = toUserFacingErrorMessage(e, "加入导入队列失败");
      toast.error(facing, { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  };

  const onPickDocumentFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    setBusy(true);
    setSourceDocumentId(undefined);
    setExtractionQuality(undefined);
    reportExtractPhase("正在读取并解析文件…");
    try {
      const mod = await import("@/lib/offlineDocumentExtract");
      const gatewayOpt = gatewayBaseUrlForRequest(loadGatewaySettings());
      const gatewayBaseUrlResolved = gatewayOpt ?? null;
      const warnings: string[] = [];
      const ocrFileReports: OfflineImportOcrFileReport[] = [];
      const structuredAccum: { filename: string; result: PluggableOcrResult }[] = [];
      const imagePreviewUrls: string[] = [];

      type ImgSeg = {
        kind: "img";
        fileName: string;
        gatewaySuffix: string;
        blockBody: string;
        dataUrl: string;
        mime: string;
        /** 仅网关 OCR 成功时有值；用于按 bbox 裁剪单题示意图 */
        ocrPipeline?: PluggableOcrResult;
      };
      type DocSeg = { kind: "doc"; text: string };
      const segments: Array<ImgSeg | DocSeg> = [];

      const readFileAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result ?? ""));
          r.onerror = () => reject(r.error ?? new Error("读取失败"));
          r.readAsDataURL(file);
        });

      const ingestRasterSegment = async (
        displayName: string,
        dataUrl: string,
        mime: string,
        gatewayFilename: string,
        sourceFile?: File,
      ) => {
        imagePreviewUrls.push(dataUrl);
        let blockBody: string | null = null;
        let gatewaySuffix = "";
        let gatewayPipeline: PluggableOcrResult | undefined;
        let gatewayFailDetail: string | undefined;
        try {
          let gw: GatewayOcrJsonResult | undefined;
          if (gatewayOpt) {
            reportExtractPhase(
              `识别中：${displayName}`,
            );
            if (typeof window !== "undefined") {
              const browserGw = await postGatewayOcrJsonFromBrowser({
                file: sourceFile,
                dataUrl: sourceFile ? undefined : dataUrl,
                filename: gatewayFilename,
                mimeType: mime || "image/png",
                gatewayBaseUrl: gatewayOpt,
              });
              if (browserGw) {
                gw = browserGw;
                if (!browserGw.ok) {
                  gatewayFailDetail = browserGw.message;
                }
              } else {
                gw = { ok: false, message: "无法解析浏览器识图服务地址" };
                gatewayFailDetail = gw.message;
              }
            } else {
              const rawB64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1]! : dataUrl;
              gw = (await gatewayOcrJsonFn({
                data: {
                  image_base64: rawB64,
                  filename: gatewayFilename,
                  mime_type: mime || undefined,
                  gateway_base_url: gatewayOpt,
                },
              })) as GatewayOcrJsonResult;
              if (!gw.ok) {
                gatewayFailDetail = gw.message;
              }
            }
          } else {
            gw = { ok: false, message: "未配置" };
          }
          if (gw.ok && "raw" in gw) {
            const governed = runPluggableOcrPipelineWithFrontend(gw.raw);
            ocrFrontendProvenanceRef.current = governed.frontend.provenance;
            const pipeline: PluggableOcrResult = governed;
            gatewayPipeline = pipeline;
            structuredAccum.push({ filename: displayName, result: pipeline });
            const candidate = applyFaithfulOfflineImportOcrText(gw.raw);
            if (candidate.length > 0) {
              blockBody = candidate;
              const eng = pipeline.structured.engine;
              gatewaySuffix = eng ? ` （识图服务 · ${eng} · 结构化）` : " （识图服务 · 结构化）";
            } else {
              const meta = gw.raw.meta;
              const metaErr =
                meta &&
                typeof meta === "object" &&
                !Array.isArray(meta) &&
                typeof (meta as Record<string, unknown>).error === "string"
                  ? String((meta as Record<string, unknown>).error).trim()
                  : "";
              if (metaErr) {
                gatewayFailDetail = metaErr;
                warnings.push(`${displayName}：识图未返回正文（${metaErr}）`);
              }
            }
          } else if (!gw.ok) {
            const gwMsg = gw.message;
            gatewayFailDetail = gwMsg;
            if (!gwMsg.includes("未配置") && !isGatewayOcrTimeoutMessage(gwMsg)) {
              warnings.push(`${displayName}：识图服务：${gwMsg}`);
            }
          }
        } catch (e: unknown) {
          gatewayFailDetail = e instanceof Error ? e.message : String(e);
          if (!isGatewayOcrTimeoutMessage(gatewayFailDetail)) {
            warnings.push(
              `${displayName}：识图服务调用失败（${gatewayFailDetail}）`,
            );
          }
        }

        const gatewayTimedOut = isGatewayOcrTimeoutMessage(gatewayFailDetail);
        if (blockBody === null && gatewayTimedOut) {
          blockBody = "";
          warnings.push(
            `${displayName}：识图超时，请确认识图服务已就绪后重试。`,
          );
        } else if (blockBody === null) {
          blockBody = "";
          if (!gatewayFailDetail?.includes("未配置")) {
            warnings.push(
              `${displayName}：未识别到正文，请确认识图服务已就绪后重试。`,
            );
          }
        }

        if (!blockBody) {
          warnings.push(
            `${displayName}：未提取到文字，请换更清晰的图片后重试`,
          );
        }

        let route: OfflineImportOcrFileReport["route"] = "empty";
        let detail: string | undefined;
        if (gatewayTimedOut && !(blockBody ?? "").trim()) {
          route = "gateway_timeout";
          detail = gatewayFailDetail;
        } else if (gatewayPipeline && (blockBody ?? "").trim().length > 0) {
          route = "gateway_structured";
        } else if ((blockBody ?? "").trim().length > 0) {
          route = "gateway_structured";
          detail = gatewayFailDetail;
        }
        ocrFileReports.push({
          fileName: displayName,
          route,
          engine: gatewayPipeline?.structured.engine,
          detail,
        });

        segments.push({
          kind: "img",
          fileName: displayName,
          gatewaySuffix,
          blockBody: blockBody ?? "",
          dataUrl,
          mime: mime || "image/png",
          ...(gatewayPipeline ? { ocrPipeline: gatewayPipeline } : {}),
        });
      };

      for (const file of files) {
        if (IMG_RE.test(file.name)) {
          reportExtractPhase(`读取图片：${file.name}…`);
          const dataUrl = await readFileAsDataUrl(file);
          await ingestRasterSegment(
            file.name,
            dataUrl,
            file.type?.trim() || "image/png",
            file.name,
            file,
          );
        } else if (/\.pdf$/i.test(file.name)) {
          reportExtractPhase(`解析 PDF：${file.name}…`);
          try {
            const ab = await file.arrayBuffer();
            const { text, pages } = await mod.extractPdfTextAndRenderPagesAsJpeg(ab, {
              maxSidePx: 2400,
              jpegQuality: 0.88,
            });
            const t = text.trim();
            if (!t) {
              warnings.push(`${file.name}：PDF 文本层为空或过短（扫描版请对照逐页图核对）`);
            }
            segments.push({ kind: "doc", text: `\n\n<<< 文件: ${file.name} >>>\n\n${t}` });
            ocrFileReports.push({
              fileName: file.name,
              route: "text_layer",
              detail: t.length > 0 ? "PDF 可复制文本层" : "文本层为空",
            });
            if (pages.length === 0) {
              warnings.push(`${file.name}：未能生成逐页预览图，仅使用文本层整理`);
            } else {
              warnings.push(
                `${file.name}：已生成 ${pages.length} 页预览图并入库；合并正文将附带整页 ![](…)。图示选择题请在预览中核对 AI 是否把各选项写成含图 Markdown。`,
              );
              const stem = file.name.replace(/\.pdf$/i, "");
              for (const pg of pages) {
                await ingestRasterSegment(
                  `${stem}（第${pg.page}页）`,
                  pg.dataUrl,
                  pg.mime,
                  `${stem}-p${pg.page}.jpg`,
                );
              }
            }
          } catch (e: unknown) {
            warnings.push(
              `${file.name}：PDF 增强处理失败（${e instanceof Error ? e.message : String(e)}），回退为仅文本层`,
            );
            try {
              const t = (await mod.extractTextFromFile(file)).trim();
              segments.push({ kind: "doc", text: `\n\n<<< 文件: ${file.name} >>>\n\n${t}` });
            } catch (e2: unknown) {
              warnings.push(`${file.name}：${e2 instanceof Error ? e2.message : String(e2)}`);
            }
          }
        } else {
          reportExtractPhase(`抽取文档：${file.name}…`);
          try {
            const t = (await mod.extractTextFromFile(file)).trim();
            if (!t) {
              warnings.push(
                `${file.name}：未提取到文字（若是扫描版 PDF，可尝试导出为图片后单独上传识别）`,
              );
            }
            segments.push({ kind: "doc", text: `\n\n<<< 文件: ${file.name} >>>\n\n${t}` });
            ocrFileReports.push({
              fileName: file.name,
              route: "doc_extract",
              detail: /\.pdf$/i.test(file.name) ? undefined : "Word/CSV 等文档抽取",
            });
          } catch (e: unknown) {
            warnings.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const imgSegs = segments.filter((s): s is ImgSeg => s.kind === "img");
      const skipPersistFigures = ocrOnlyNoPersistFigures;
      let figureUrls: string[] | null = null;
      let importFiguresBatchId: string | null = null;
      if (imgSegs.length > 0 && !skipPersistFigures) {
        reportExtractPhase("正在保存附图到站点目录…");
        try {
          importFiguresBatchId = crypto.randomUUID();
          const pr = await persistFiguresFn({
            data: {
              batchId: importFiguresBatchId,
              items: imgSegs.map((s) => ({
                base64: s.dataUrl.includes(",") ? s.dataUrl.split(",", 2)[1]! : s.dataUrl,
                mime: s.mime,
              })),
            },
          });
          figureUrls = pr.urls;
        } catch (e: unknown) {
          warnings.push(
            `附图未能保存（${e instanceof Error ? e.message : String(e)}）；仍将导入识别正文，卷面可能无图`,
          );
          figureUrls = null;
        }
      }

      const diagramMdByImgIndex = new Map<number, string>();
      let viGatewayDescriptorSum = 0;
      let viGatewayPersistBatches = 0;
      let viGatewayPersistFailures = 0;
      let viGatewayUrlHits = 0;
      if (!skipPersistFigures && importFiguresBatchId && figureUrls?.length) {
        reportExtractPhase("正在按识别框裁剪小题配图…");
        for (let imgIdx = 0; imgIdx < imgSegs.length; imgIdx++) {
          const seg = imgSegs[imgIdx]!;
          if (!seg.ocrPipeline || !figureUrls[imgIdx]) continue;
          const desc = collectDiagramCropDescriptors(seg.ocrPipeline.structured, imgIdx);
          if (desc.length === 0) continue;
          viGatewayDescriptorSum += desc.length;
          const mime = seg.mime.toLowerCase();
          const sourceExt = mime.includes("png")
            ? ("png" as const)
            : mime.includes("webp")
              ? ("webp" as const)
              : mime.includes("gif")
                ? ("gif" as const)
                : mime.includes("jpeg") || mime.includes("jpg")
                  ? ("jpg" as const)
                  : ("png" as const);
          try {
            viGatewayPersistBatches += 1;
            const r = await persistDiagramCropsFn({
              data: {
                batchId: importFiguresBatchId,
                imageIndex: imgIdx,
                sourceExt,
                items: desc.map((d) => ({
                  bbox: d.bbox,
                  slug: d.slug,
                  questionIndex: d.questionIndex,
                })),
              },
            });
            let md = "";
            for (const d of desc) {
              const u = r.urls[d.slug];
              if (u) {
                viGatewayUrlHits += 1;
                md += `\n\n![${d.caption}](${u})\n`;
              }
            }
            if (md) diagramMdByImgIndex.set(imgIdx, md);
          } catch (e: unknown) {
            viGatewayPersistFailures += 1;
            warnings.push(
              `小题配图裁剪失败（${seg.fileName}）：${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }

      let viHeuristicPlanSum = 0;
      let viHeuristicPersistBatches = 0;
      let viHeuristicPersistFailures = 0;
      let viHeuristicUrlHits = 0;
      /** 网关未产出 bbox 时：浏览器侧墨迹连通域 + 几何启发式补裁剪（易误判，见 docs/architecture/paper-layout-import.md） */
      if (!skipPersistFigures && importFiguresBatchId && figureUrls?.length) {
        try {
          reportExtractPhase("版面启发式分析（补裁剪示意图）…");
          const layoutMod = await import("@/lib/paperLayoutImport/heuristicExamPageLayout.browser");
          for (let imgIdx = 0; imgIdx < imgSegs.length; imgIdx++) {
            const seg = imgSegs[imgIdx]!;
            const url = figureUrls[imgIdx];
            if (!url) continue;
            if ((diagramMdByImgIndex.get(imgIdx) ?? "").trim().length > 0) continue;

            const mime = seg.mime.toLowerCase();
            const sourceExt = mime.includes("png")
              ? ("png" as const)
              : mime.includes("webp")
                ? ("webp" as const)
                : mime.includes("gif")
                  ? ("gif" as const)
                  : mime.includes("jpeg") || mime.includes("jpg")
                    ? ("jpg" as const)
                    : ("png" as const);

            try {
              const plan = await layoutMod.planHeuristicFiguresFromDataUrl(
                imgIdx,
                seg.blockBody ?? "",
                seg.dataUrl,
              );
              if (!plan.length) continue;
              viHeuristicPlanSum += plan.length;

              viHeuristicPersistBatches += 1;
              const r = await persistDiagramCropsFn({
                data: {
                  batchId: importFiguresBatchId,
                  imageIndex: imgIdx,
                  sourceExt,
                  items: plan.map((d) => ({
                    bbox: d.bbox,
                    slug: d.slug,
                    questionIndex: d.questionIndex,
                  })),
                },
              });
              let md = "";
              for (const d of plan) {
                const u = r.urls[d.slug];
                if (u) {
                  viHeuristicUrlHits += 1;
                  md += `\n\n![${d.caption}](${u})\n`;
                }
              }
              if (md) diagramMdByImgIndex.set(imgIdx, md);
            } catch (e: unknown) {
              viHeuristicPersistFailures += 1;
              warnings.push(
                `${seg.fileName}：启发式配图裁剪失败（${e instanceof Error ? e.message : String(e)}）`,
              );
            }
          }
        } catch (e: unknown) {
          warnings.push(
            `版面启发式模块未加载（${e instanceof Error ? e.message : String(e)}），跳过浏览器侧补裁剪`,
          );
        }
      }

      const hadGatewayStructured = imgSegs.some((x) => x.ocrPipeline);
      const hadAnyCropOutput = diagramMdByImgIndex.size > 0;
      if (hadGatewayStructured && !hadAnyCropOutput) {
        if (skipPersistFigures) {
          warnings.push(
            "已勾选「不保存原图仅识别」：未写入整页扫描图与小题裁剪图，合并正文仅含识别文本。",
          );
        } else {
          warnings.push(
            "识图已完成，但未检测到可裁剪的小题示意图。导入正文仍会附带整页扫描图。",
          );
        }
      }

      const usedBrowserOcrOnly = imgSegs.length > 0 && imgSegs.every((s) => !s.gatewaySuffix);
      if (usedBrowserOcrOnly) {
        warnings.push(
          "图片未走识图服务，请确认识图服务已就绪后重新上传。",
        );
      }

      let imgOrdinal = 0;
      const blocks = segments.map((s) => {
        if (s.kind === "doc") return s.text;
        const url = figureUrls?.[imgOrdinal];
        const diagramExtra = skipPersistFigures ? "" : (diagramMdByImgIndex.get(imgOrdinal) ?? "");
        /** 已有按题裁剪的小图时默认不再挂整页；用户可勾选「仍附整页」保留对照 */
        /** 已有小题裁图时不重复挂整页（原「仍附加整页」选项已移除） */
        const skipFullPageFigure = diagramExtra.trim().length > 0;
        imgOrdinal += 1;
        let imgMd: string;
        if (skipPersistFigures) {
          imgMd = `\n\n> （${s.fileName}：未保存扫描原图，仅识别文本）\n`;
        } else if (skipFullPageFigure) {
          imgMd = "";
        } else if (url) {
          imgMd = `\n\n![附图：${s.fileName}](${url})\n`;
        } else {
          imgMd = `\n\n> （附图 ${s.fileName} 未保存，核对后可在题干中手动插入图片链接）\n`;
        }
        return `\n\n<<< 文件: ${s.fileName}${s.gatewaySuffix} >>>\n\n${s.blockBody}${diagramExtra}${imgMd}`;
      });

      const mergedAfterJoin = blocks.join("\n");
      const importFigureRefsAfterJoin = countMarkdownImportFigureRefs(mergedAfterJoin);
      const transportRaw = mergedAfterJoin;
      const { text: canonical, trace } = runEducationalTextCanonicalization(transportRaw);
      let mergedText = canonical;
      setOcrTransportRaw(transportRaw);
      setCanonicalizationTrace(trace);
      const importFigureRefsAfterNormalize = countMarkdownImportFigureRefs(mergedText);
      setPreviewImageUrls((prev) => {
        revokePreviewImageUrls(prev);
        return imagePreviewUrls;
      });
      setPersistedFigureUrls(figureUrls ?? []);
      setPreviewImageAnnotations([]);
      setAnnotateTool("pan");
      setStructuredChunks(structuredAccum);

      let importFigureRefsAfterEnhance = importFigureRefsAfterNormalize;
      if (
        mergedText.replace(/\s+/g, "").length >= 30 &&
        useExternalPlaintextEnhance &&
        integration?.plaintextExtract
      ) {
        reportExtractPhase("正在调用外部正文增强服务…");
        const er = await enhanceExtractFn({ data: { text: mergedText } });
        if (er.ok) {
          mergedText = er.text;
          importFigureRefsAfterEnhance = countMarkdownImportFigureRefs(mergedText);
          toast.success("外部正文增强已完成，预览将使用返回稿");
        } else {
          toast.warning(`外部正文增强未生效：${er.message}，预览仍为本地抽取稿`);
        }
      }

      if (mergedText.replace(/\s+/g, "").length >= 30) {
        try {
          const lx = await applyLexiconFn({ data: { text: mergedText } });
          mergedText = lx.text;
        } catch {
          /* 词典未配置或调用失败时跳过 */
        }
      }

      const importFigureRefsFinal = countMarkdownImportFigureRefs(mergedText);
      if (!skipPersistFigures) {
        setFigureMaterializationProducer({
          crop_jobs_emitted: viGatewayDescriptorSum + viHeuristicPlanSum,
          crops_persisted: viGatewayUrlHits + viHeuristicUrlHits,
          crop_persist_failures: viGatewayPersistFailures + viHeuristicPersistFailures,
          page_figures_persisted: figureUrls?.length ?? 0,
          markdown_import_refs_final: importFigureRefsFinal,
        });
      } else {
        setFigureMaterializationProducer({
          crop_jobs_emitted: 0,
          crops_persisted: 0,
          page_figures_persisted: 0,
          markdown_import_refs_final: importFigureRefsFinal,
        });
      }
      if (DEBUG_VISUAL_INGEST) {
        const imgSegsMissingOcrPipeline = imgSegs.filter((s) => !s.ocrPipeline).length;
        console.info("[visual-ingest]", {
          phase: "client_offline_extract",
          skipPersistFigures,
          imgSegCount: imgSegs.length,
          imgSegsMissingOcrPipeline,
          figureUrlCount: figureUrls?.length ?? 0,
          diagramMdImageKeys: diagramMdByImgIndex.size,
          gateway: {
            descriptorSum: viGatewayDescriptorSum,
            persistBatches: viGatewayPersistBatches,
            persistFailures: viGatewayPersistFailures,
            markdownUrlHits: viGatewayUrlHits,
          },
          heuristic: {
            planItemSum: viHeuristicPlanSum,
            persistBatches: viHeuristicPersistBatches,
            persistFailures: viHeuristicPersistFailures,
            markdownUrlHits: viHeuristicUrlHits,
          },
          importFigureMarkdownRefCounts: {
            afterJoin: importFigureRefsAfterJoin,
            afterNormalize: importFigureRefsAfterNormalize,
            afterEnhance: importFigureRefsAfterEnhance,
            finalAfterLexicon: importFigureRefsFinal,
          },
        });
      }

      reportExtractPhase("正在汇总预览正文…");
      setOcrRawBackup(transportRaw);
      const quality = assessOcrExtractQuality(mergedText);
      let gatewayReachable: boolean | undefined;
      if (gatewayBaseUrlResolved) {
        gatewayReachable = await probeGatewayReadyFromBrowser(gatewayBaseUrlResolved);
      } else if (gatewayOcrConfiguredOnServer) {
        gatewayReachable = undefined;
      }
      setOcrIngestSummary(
        buildOfflineImportOcrIngestSummary({
          gatewayBaseUrlResolved:
            gatewayBaseUrlResolved ??
            (gatewayOcrConfiguredOnServer ? "（服务端已配置网关）" : null),
          files: ocrFileReports,
          extractQualityTier: quality.tier,
          extractQualityReasons: quality.reasons,
          gatewayReachable,
        }),
      );
      if (quality.tier === "poor") {
        warnings.push(
          `抽取质量偏弱：${quality.reasons.join("；")}。建议对照左侧原图手改正文，或配置识图服务后重新上传。`,
        );
      } else if (quality.tier === "weak") {
        warnings.push(`抽取质量提示：${quality.reasons.join("；")}`);
      }
      setExtractWarnings(warnings);
      if (warnings.length) {
        toast.warning("部分文件处理有提示", { description: warnings.slice(0, 4).join("；") });
      }
      if (
        quality.tier !== "ok" &&
        structuredAccum.length > 0 &&
        segments.some((s) => s.kind === "img" && s.gatewaySuffix.includes("网关"))
      ) {
        toast.message("识图服务已接入，但本页仍有乱码", {
          description:
            "常见原因：右侧坐标图被扫进正文。请对照左侧原图手改。",
          duration: 14000,
        });
      }

      const stripped = mergedText.replace(/\s+/g, "").length;
      if (stripped < 30) {
        setExtractedFromPipeline(transportRaw);
        toast.error("合并后的正文过短，无法送入 AI；请换清晰文档或拆成多页/多图上传");
      } else {
        setDocExtracted(mergedText);
        pipelinePreviewRef.current = mergedText;
        setPreviewEditedByUser(false);
        /** 主文件落盘 + Sidecar，供待确认列表「核对差异」 */
        try {
          reportExtractPhase("正在落盘来源文档…");
          const primary = files[0]!;
          const contentBase64 = await fileToBase64(primary);
          const persisted = await persistExtractFn({
            data: {
              filename: primary.name,
              mimeType: primary.type || "application/octet-stream",
              contentBase64,
              clientPlainText: mergedText,
            },
          });
          setSourceDocumentId(persisted.documentId);
          if (
            persisted.quality === "high_fidelity" ||
            persisted.quality === "basic_fallback"
          ) {
            setExtractionQuality(persisted.quality);
          }
          if (persisted.warnings?.length) {
            warnings.push(...persisted.warnings.slice(0, 3));
            setExtractWarnings([...warnings]);
          }
        } catch (e: unknown) {
          console.warn("[import] persistImportDocumentExtract:", e);
        }
        toast.success(
          `已抽取约 ${mergedText.length} 字符，请对照原图核对`,
        );
      }
    } catch (e: unknown) {
      toast.error(toUserFacingErrorMessage(e, "抽取失败"));
    } finally {
      setBusy(false);
      setExtractProgress(null);
      if (docFileRef.current) docFileRef.current.value = "";
    }
  };

  const sheetWide = previewImageUrls.length > 0;

  const gatewayStatusLine =
    gatewayOcrWarmupState === "warming"
      ? "识图服务预热中…"
      : gatewayOcrWarmupState === "failed" || gatewayOcrWarmupState === "unavailable"
        ? "识图服务未就绪"
        : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className={
          sheetWide
            ? "flex w-full flex-col sm:max-w-4xl"
            : "flex w-full flex-col sm:max-w-lg"
        }
      >
        <SheetHeader>
          <SheetTitle>导入线下试卷</SheetTitle>
          <SheetDescription className="sr-only">导入线下试卷</SheetDescription>
        </SheetHeader>

        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <input
            ref={docFileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
            className="hidden"
            onChange={(ev) => void onPickDocumentFiles(ev.target.files)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => docFileRef.current?.click()}
              disabled={busy}
              aria-busy={busy}
            >
              <Upload className="h-4 w-4" />
              选择文件（可多选）
            </Button>
            {gatewayStatusLine ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void syncGatewayOcrWarmupFromStatus()}
              >
                {gatewayOcrWarmupState === "warming" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                {gatewayStatusLine}
              </button>
            ) : null}
          </div>

          {extractProgress ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              {extractProgress.phase}
              <span>· {formatExtractElapsed(extractElapsedSec)}</span>
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">年级</span>
              <select
                value={docGrade}
                onChange={(e) => setDocGrade(e.target.value)}
                className={SEL}
              >
                <option value="">请选择</option>
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">学科</span>
              <select
                value={docSubject}
                onChange={(e) => setDocSubject(e.target.value)}
                className={SEL}
              >
                <option value="">请选择</option>
                {CURRICULUM_SUBJECT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">难度</span>
              <select
                value={docDifficulty}
                onChange={(e) => setDocDifficulty((e.target.value || "") as Difficulty | "")}
                className={SEL}
              >
                <option value="">请选择</option>
                {DIFF_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">时长（分钟）</span>
              <input
                type="number"
                min={30}
                max={360}
                value={docDuration}
                onChange={(e) => setDocDuration(Number(e.target.value) || 90)}
                className={SEL}
              />
            </label>
          </div>

          <details className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-foreground">高级选项</summary>
            <div className="mt-3 space-y-3">
              <label
                htmlFor="offline-persist-import-figures"
                className="flex cursor-pointer items-start gap-2"
              >
                <Checkbox
                  id="offline-persist-import-figures"
                  checked={!ocrOnlyNoPersistFigures}
                  onCheckedChange={(v) => setOcrOnlyNoPersistFigures(v !== true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="text-xs text-foreground">保存配图</span>
              </label>
              {integration?.plaintextExtract ? (
                <label
                  htmlFor="offline-plaintext-http"
                  className="flex cursor-pointer items-start gap-2"
                >
                  <Checkbox
                    id="offline-plaintext-http"
                    checked={useExternalPlaintextEnhance}
                    onCheckedChange={(v) => setUseExternalPlaintextEnhance(v === true)}
                    disabled={busy}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-foreground">抽取后正文增强</span>
                </label>
              ) : null}
              {importDualTrackGateEnabled ? (
                <label
                  htmlFor="offline-import-dual-track-ack"
                  className="flex cursor-pointer items-start gap-2"
                >
                  <Checkbox
                    id="offline-import-dual-track-ack"
                    checked={importDualTrackAck}
                    onCheckedChange={(v) => setImportDualTrackAck(v === true)}
                    disabled={busy}
                    className="mt-0.5"
                  />
                  <span className="text-xs text-foreground">版面对照诊断</span>
                </label>
              ) : null}
              {integration?.openNotebook ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy || notebookForwardBusy || docExtracted.trim().length < 30}
                  onClick={() => {
                    const t = docExtracted.trim();
                    if (t.length < 30) return;
                    setNotebookForwardBusy(true);
                    void (async () => {
                      try {
                        const r = await forwardOpenNotebookFn({ data: { text: t } });
                        if (r.ok) toast.success("已提交到外部笔记");
                        else toast.error(r.message);
                      } finally {
                        setNotebookForwardBusy(false);
                      }
                    })();
                  }}
                >
                  {notebookForwardBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Library className="h-4 w-4" aria-hidden />
                  )}
                  同步到外部笔记
                </Button>
              ) : null}
            </div>
          </details>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">抽取正文预览</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {docExtracted.length} 字
                {previewEditedByUser ? " · 已编辑" : ""}
              </span>
            </div>

            <OfflineImportOcrStatusBanner summary={ocrIngestSummary} />

            <div
              className={
                previewImageUrls.length > 0
                  ? "grid gap-3 md:grid-cols-2 md:items-start"
                  : "space-y-1"
              }
            >
              {previewImageUrls.length > 0 ? (
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">原图</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={annotateTool === "error_box" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setAnnotateTool((t) => (t === "error_box" ? "pan" : "error_box"))
                        }
                        disabled={busy}
                      >
                        抄错框
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={annotateTool === "omit_oval" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setAnnotateTool((t) => (t === "omit_oval" ? "pan" : "omit_oval"))
                        }
                        disabled={busy}
                      >
                        漏抄椭圆
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={annotateTool === "reverse_z" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setAnnotateTool((t) => (t === "reverse_z" ? "pan" : "reverse_z"))
                        }
                        disabled={busy}
                      >
                        颠倒 Z
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={annotateTool === "pan" ? "secondary" : "ghost"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setAnnotateTool("pan")}
                        disabled={busy}
                      >
                        浏览
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-muted-foreground"
                        onClick={() => setPreviewImageAnnotations([])}
                        disabled={busy || previewImageAnnotations.length === 0}
                      >
                        清除
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[min(58vh,520px)] space-y-3 overflow-y-auto rounded-md border border-input bg-muted/30 p-2">
                    {previewImageUrls.map((src, i) => (
                      <figure key={`${src}-${i}`} className="space-y-1">
                        <figcaption className="text-[10px] text-muted-foreground">
                          {previewImageUrls.length > 1
                            ? `图片 ${i + 1} / ${previewImageUrls.length}`
                            : "上传图"}
                        </figcaption>
                        <OfflineImportImageAnnotator
                          src={src}
                          imageIndex={i}
                          annotations={previewImageAnnotations}
                          tool={annotateTool}
                          onAdd={handleAnnotationAdd}
                          alt={
                            previewImageUrls.length > 1
                              ? `线下试卷原图第 ${i + 1} 张`
                              : "线下试卷原图"
                          }
                        />
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 min-w-0">
                {previewImageUrls.length > 0 || docExtracted.trim().length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex rounded-md border border-border p-0.5 text-[11px]">
                      <button
                        type="button"
                        className={
                          docPreviewMode === "paper"
                            ? "rounded-sm bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                            : "rounded-sm px-2 py-0.5 text-muted-foreground hover:text-foreground"
                        }
                        onClick={() => setDocPreviewMode("paper")}
                      >
                        试卷阅读
                      </button>
                      <button
                        type="button"
                        className={
                          docPreviewMode === "edit"
                            ? "rounded-sm bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                            : "rounded-sm px-2 py-0.5 text-muted-foreground hover:text-foreground"
                        }
                        onClick={() => setDocPreviewMode("edit")}
                      >
                        编辑原文
                      </button>
                    </div>
                  </div>
                ) : null}
                {docPreviewMode === "paper" && docExtracted.trim().length > 0 ? (
                  <EducationalDocumentRenderer
                    document={buildEducationalRenderableDocument({
                      canonicalText: docExtracted,
                    })}
                    className="md:min-h-[min(58vh,520px)] md:max-h-[min(70vh,640px)] overflow-y-auto"
                  />
                ) : (
                  <textarea
                    value={docExtracted}
                    onChange={(e) => {
                      setDocExtracted(e.target.value);
                      setPreviewEditedByUser(true);
                    }}
                    placeholder="选择文件后在此显示抽取结果，可检查后再入库…"
                    rows={previewImageUrls.length > 0 ? 16 : 8}
                    spellCheck={false}
                    className="w-full min-h-[12rem] rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground md:min-h-[min(58vh,520px)]"
                  />
                )}
              </div>
            </div>

            {previewEditedByUser ? (
              <label
                htmlFor="offline-persist-lexicon"
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <Checkbox
                  id="offline-persist-lexicon"
                  checked={persistLexiconLearn}
                  onCheckedChange={(v) => setPersistLexiconLearn(v === true)}
                  disabled={busy}
                />
                <span className="text-foreground">记入修复词典</span>
              </label>
            ) : null}
            {extractWarnings.length > 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {extractWarnings.join(" · ")}
              </p>
            ) : null}

            <details className="rounded-md border border-border/60 px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">诊断</summary>
              <div className="mt-2 space-y-2">
                <CanonicalizationForensicViewer
                  trace={canonicalizationTrace}
                  canonicalText={docExtracted}
                  transportRaw={ocrTransportRaw}
                  previewEditedByUser={previewEditedByUser}
                />
                <StructuredOcrPreview chunks={structuredChunks} />
              </div>
            </details>
          </div>
        </div>

        <SheetFooter className="mt-4 gap-2 border-t border-border/60 pt-4 sm:flex-col sm:space-x-0 sm:gap-2">
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void enqueueDocument()}
              disabled={busy}
              title="加入导入队列后后台处理"
            >
              加入导入队列
            </Button>
            <Button type="button" onClick={() => void submitDocument()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI 识别并入库…
                </>
              ) : (
                "AI 识别并入库"
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
