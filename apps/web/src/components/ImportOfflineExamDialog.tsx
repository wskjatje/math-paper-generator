import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Library, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

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
import { OfflineImportImageAnnotator } from "@/components/OfflineImportImageAnnotator";
import { StructuredOcrPreview } from "@/components/StructuredOcrPreview";
import {
  createOfflineImportAnnotation,
  type NewOfflineImportImageAnnotation,
  type OfflineImportAnnotTool,
  type OfflineImportImageAnnotation,
} from "@/lib/offlineImportAnnotation.shared";
import { importOfflineExamFromDocument } from "@/lib/exam.functions.server";
import { gatewayOcrJson } from "@/lib/gatewayOcr.functions.server";
import { repairOfflineOcrTextWithAi } from "@/lib/ocrRepair.functions.server";
import {
  applyEducationSymbolLexicon,
  extractPlainTextFromGatewayRaw,
  mergeFormulaHints,
  runPluggableOcrPipeline,
  type PluggableOcrResult,
} from "@/lib/ocr";
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";
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
import { persistOfflineImportFigures } from "@/lib/offlineImportFigures.functions.server";

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

export function ImportOfflineExamDialog({
  open,
  onOpenChange,
  onImported,
  integration,
  ocrRepairLexiconPersistence = "local_file",
  importFiguresStorage = "local",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (res: { examId: string; persisted: "supabase" | "local" | "mysql" }) => void;
  /** 来自 getBackendCapabilities：控制可选外部集成 UI */
  integration?: {
    openNotebook: boolean;
    plaintextExtract: boolean;
  };
  /** 服务端词典写入位置（用于提示）；词典 always 可通过 data 文件落盘 */
  ocrRepairLexiconPersistence?: "supabase" | "mysql" | "local_file";
  /** 导入附图优先 Supabase Storage 或本地 public（来自 getBackendCapabilities） */
  importFiguresStorage?: "supabase" | "local";
}) {
  const importDocFn = useServerFn(importOfflineExamFromDocument);
  const gatewayOcrJsonFn = useServerFn(gatewayOcrJson);
  const repairOcrAiFn = useServerFn(repairOfflineOcrTextWithAi);
  const enhanceExtractFn = useServerFn(enhanceOfflineExtractViaHttpService);
  const forwardOpenNotebookFn = useServerFn(forwardOfflinePreviewToOpenNotebook);
  const applyLexiconFn = useServerFn(applyOfflineOcrLexiconLayer);
  const persistLexiconDiffFn = useServerFn(persistOcrLexiconFromImportDiff);
  const persistFiguresFn = useServerFn(persistOfflineImportFigures);

  const [busy, setBusy] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);

  const [docExtracted, setDocExtracted] = useState("");
  const [structuredChunks, setStructuredChunks] = useState<
    { filename: string; result: PluggableOcrResult }[]
  >([]);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [docGrade, setDocGrade] = useState("");
  const [docSubject, setDocSubject] = useState("");
  const [docDifficulty, setDocDifficulty] = useState<Difficulty | "">("");
  const [docDuration, setDocDuration] = useState(90);
  /** 默认开启：教育场景 OCR 须经规则+AI 语义层后再整理入库（可在预览前取消勾选） */
  const [useAiRepairBeforeImport, setUseAiRepairBeforeImport] = useState(true);
  /** 本次抽取的原始 OCR 合并文（未跑 AI），用于取消勾选时还原预览 */
  const [ocrRawBackup, setOcrRawBackup] = useState("");
  /** 当前预览是否已是 AI 修复结果（与 ocrRawBackup 对应同一次上传） */
  const [previewAiRepairApplied, setPreviewAiRepairApplied] = useState(false);
  /** 抽取完成后是否先 POST 到 MPG_PLAINTEXT_EXTRACT_URL（服务端已配置时可选） */
  const [useExternalPlaintextEnhance, setUseExternalPlaintextEnhance] = useState(false);
  const [notebookForwardBusy, setNotebookForwardBusy] = useState(false);
  /** 用户在预览区改过字后，与「仅 AI 稿」区分提示 */
  const [previewEditedByUser, setPreviewEditedByUser] = useState(false);
  /** 将人工差异写入服务端 ocr_repair_lexicon */
  const [persistLexiconLearn, setPersistLexiconLearn] = useState(false);
  /** 流水线写入预览的末次稿（未含用户手改），用于与最终稿 diff 记词典 */
  const pipelinePreviewRef = useRef<string>("");
  /** 本次选择的图片本地预览 URL（object URL），用于与原卷对照 */
  const [previewImageUrls, setPreviewImageUrls] = useState<string[]>([]);
  /** 原图对照标注（会话内；不入库） */
  const [previewImageAnnotations, setPreviewImageAnnotations] = useState<
    OfflineImportImageAnnotation[]
  >([]);
  const [annotateTool, setAnnotateTool] = useState<OfflineImportAnnotTool>("pan");

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

  const setExtractedFromPipeline = useCallback((text: string) => {
    setDocExtracted(text);
    pipelinePreviewRef.current = text;
    setPreviewEditedByUser(false);
  }, []);

  const resetDocFields = () => {
    setDocExtracted("");
    setStructuredChunks([]);
    setExtractWarnings([]);
    setUseAiRepairBeforeImport(true);
    setOcrRawBackup("");
    setPreviewAiRepairApplied(false);
    setUseExternalPlaintextEnhance(false);
    setPreviewEditedByUser(false);
    setPersistLexiconLearn(false);
    pipelinePreviewRef.current = "";
    setPreviewImageUrls((prev) => {
      revokePreviewImageUrls(prev);
      return [];
    });
    setPreviewImageAnnotations([]);
    setAnnotateTool("pan");
  };

  const handleAnnotationAdd = useCallback((partial: NewOfflineImportImageAnnotation) => {
    setPreviewImageAnnotations((prev) => [...prev, createOfflineImportAnnotation(partial)]);
  }, []);

  /** 成功时返回修复后正文（便于入库同步使用，避免 setState 滞后） */
  const runAiRepairPreview = async (
    sourceText: string,
  ): Promise<{ ok: true; text: string } | { ok: false }> => {
    const repaired = await repairOcrAiFn({
      data: {
        text: sourceText,
        curriculum_subject_id: docSubject || undefined,
        ai: toAiRuntimePayload(loadAiSettings()),
      },
    });
    if (repaired.ok) {
      setExtractedFromPipeline(repaired.text);
      setPreviewAiRepairApplied(true);
      return { ok: true, text: repaired.text };
    }
    toast.warning(`AI 修复未生效：${repaired.message}，预览仍为抽取原文`);
    setExtractedFromPipeline(sourceText);
    setPreviewAiRepairApplied(false);
    return { ok: false };
  };

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
    setBusy(true);
    try {
      let textForImport = text;
      if (useAiRepairBeforeImport && !previewAiRepairApplied) {
        toast.message("预览未应用 AI 修复，整理写入前正在补跑…");
        const src = (ocrRawBackup.trim() || text).trim();
        const r = await runAiRepairPreview(src);
        textForImport = r.ok ? r.text.trim() : text;
      }

      const res = await importDocFn({
        data: {
          text: textForImport,
          /** 修复稿常丢 Markdown 图；服务端 reconcile 与备份比 token 数择优挂图 */
          figure_reconcile_source: ocrRawBackup.trim() || undefined,
          grade: docGrade || undefined,
          subject: docSubject || undefined,
          difficulty: docDifficulty || undefined,
          duration_min: docDuration,
          ai: toAiRuntimePayload(loadAiSettings()),
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

      toast.success("已写入「待确认」临时库", {
        description:
          res.persisted === "supabase"
            ? "云端草稿已生成，请在列表核对后再点「确认入库」"
            : res.persisted === "mysql"
              ? "本地 MySQL 草稿已生成，请在列表核对后再点「确认入库」"
              : "本地目录草稿已生成，请在列表核对后再点「确认入库」",
      });
      handleOpenChange(false);
      onImported?.(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "整理写入失败");
    } finally {
      setBusy(false);
    }
  };

  const onPickDocumentFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    const hasImg = files.some((f) => IMG_RE.test(f.name));
    toast.message("正在抽取文本…", {
      description: hasImg
        ? "图片优先经服务端网关 OCR（「设置 → 模型与接口」中的网关地址优先，其次部署环境变量）；不可用或过短时再使用浏览器识别（首次可能需下载语言包）"
        : undefined,
    });
    try {
      const mod = await import("@/lib/offlineDocumentExtract");
      const gatewayOpt = gatewayBaseUrlForRequest(loadGatewaySettings());
      const warnings: string[] = [];
      const structuredAccum: { filename: string; result: PluggableOcrResult }[] = [];
      const imagePreviewUrls: string[] = [];

      type ImgSeg = {
        kind: "img";
        fileName: string;
        gatewaySuffix: string;
        blockBody: string;
        dataUrl: string;
        mime: string;
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

      for (const file of files) {
        if (IMG_RE.test(file.name)) {
          imagePreviewUrls.push(URL.createObjectURL(file));
          let blockBody: string | null = null;
          let gatewaySuffix = "";
          const dataUrl = await readFileAsDataUrl(file);
          try {
            const rawB64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1]! : dataUrl;
            const gw = await gatewayOcrJsonFn({
              data: {
                image_base64: rawB64,
                filename: file.name,
                mime_type: file.type || undefined,
                gateway_base_url: gatewayOpt,
              },
            });
            if (gw.ok && "raw" in gw) {
              const pipeline = runPluggableOcrPipeline(gw.raw);
              structuredAccum.push({ filename: file.name, result: pipeline });
              const candidate =
                pipeline.plainText.trim() ||
                extractPlainTextFromGatewayRaw(gw.raw).trim() ||
                mergeFormulaHints(pipeline.structured.blocks).trim();
              if (candidate.length > 0) {
                blockBody = candidate;
                const eng = pipeline.structured.engine;
                gatewaySuffix = eng ? ` （网关 OCR · ${eng} · 结构化）` : " （网关 OCR · 结构化）";
              }
            } else if (!gw.ok && !gw.message.includes("未配置")) {
              warnings.push(`${file.name}：网关 OCR：${gw.message}，改用浏览器 OCR`);
            }
          } catch (e: unknown) {
            warnings.push(
              `${file.name}：网关 OCR 调用失败（${e instanceof Error ? e.message : String(e)}），改用浏览器 OCR`,
            );
          }

          if (blockBody === null) {
            try {
              blockBody = (await mod.extractTextFromFile(file)).trim();
              gatewaySuffix = "";
            } catch (e: unknown) {
              warnings.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
              blockBody = "";
            }
          }

          if (!blockBody) {
            warnings.push(
              `${file.name}：未提取到文字（若是扫描版 PDF，可尝试导出为图片后单独上传做 OCR）`,
            );
          }
          segments.push({
            kind: "img",
            fileName: file.name,
            gatewaySuffix,
            blockBody: blockBody ?? "",
            dataUrl,
            mime: file.type?.trim() || "image/png",
          });
        } else {
          try {
            const t = (await mod.extractTextFromFile(file)).trim();
            if (!t) {
              warnings.push(
                `${file.name}：未提取到文字（若是扫描版 PDF，可尝试导出为图片后单独上传做 OCR）`,
              );
            }
            segments.push({ kind: "doc", text: `\n\n<<< 文件: ${file.name} >>>\n\n${t}` });
          } catch (e: unknown) {
            warnings.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const imgSegs = segments.filter((s): s is ImgSeg => s.kind === "img");
      let figureUrls: string[] | null = null;
      if (imgSegs.length > 0) {
        try {
          const batchId = crypto.randomUUID();
          const pr = await persistFiguresFn({
            data: {
              batchId,
              items: imgSegs.map((s) => ({
                base64: s.dataUrl.includes(",") ? s.dataUrl.split(",", 2)[1]! : s.dataUrl,
                mime: s.mime,
              })),
            },
          });
          figureUrls = pr.urls;
        } catch (e: unknown) {
          warnings.push(
            `附图未能写入站点目录（${e instanceof Error ? e.message : String(e)}）；仍将导入 OCR 正文，卷面可能无图`,
          );
          figureUrls = null;
        }
      }

      let imgOrdinal = 0;
      const blocks = segments.map((s) => {
        if (s.kind === "doc") return s.text;
        const url = figureUrls?.[imgOrdinal];
        imgOrdinal += 1;
        const imgMd = url
          ? `\n\n![附图：${s.fileName}](${url})\n`
          : `\n\n> （附图 ${s.fileName} 未保存，核对后可在题干中手动插入图片链接）\n`;
        return `\n\n<<< 文件: ${s.fileName}${s.gatewaySuffix} >>>\n\n${s.blockBody}${imgMd}`;
      });

      let mergedText = blocks.join("\n");
      mergedText = normalizeMathExamOcrText(applyEducationSymbolLexicon(mergedText));
      setPreviewImageUrls((prev) => {
        revokePreviewImageUrls(prev);
        return imagePreviewUrls;
      });
      setPreviewImageAnnotations([]);
      setAnnotateTool("pan");
      setStructuredChunks(structuredAccum);
      setExtractWarnings(warnings);
      setPreviewAiRepairApplied(false);
      if (warnings.length) {
        toast.warning("部分文件处理有提示", { description: warnings.slice(0, 3).join("；") });
      }

      if (
        mergedText.replace(/\s+/g, "").length >= 30 &&
        useExternalPlaintextEnhance &&
        integration?.plaintextExtract
      ) {
        setBusy(true);
        toast.message("正在调用外部正文增强服务…");
        try {
          const er = await enhanceExtractFn({ data: { text: mergedText } });
          if (er.ok) {
            mergedText = er.text;
            toast.success("外部正文增强已完成，预览将使用返回稿");
          } else {
            toast.warning(`外部正文增强未生效：${er.message}，预览仍为本地抽取稿`);
          }
        } finally {
          setBusy(false);
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

      setOcrRawBackup(mergedText);
      const stripped = mergedText.replace(/\s+/g, "").length;
      if (stripped < 30) {
        setExtractedFromPipeline(mergedText);
        toast.error("合并后的正文过短，无法送入 AI；请换清晰文档或拆成多页/多图上传");
      } else if (useAiRepairBeforeImport) {
        setBusy(true);
        toast.message("正在进行 AI 语义修复（预览）…");
        try {
          const r = await runAiRepairPreview(mergedText);
          if (r.ok) {
            toast.success(
              `已抽取约 ${mergedText.length} 字符；预览已切换为 AI 修复结果，核对后可整理写入待确认`,
            );
          } else {
            toast.success(`已抽取约 ${mergedText.length} 字符`);
          }
        } finally {
          setBusy(false);
        }
      } else {
        setExtractedFromPipeline(mergedText);
        toast.success(`已抽取约 ${mergedText.length} 字符`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "抽取失败");
    }
    if (docFileRef.current) docFileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>导入线下试卷</DialogTitle>
          <DialogDescription>
            上传 <strong>PDF / Word / Excel / CSV / 图片</strong>
            。抽取后会先做<strong className="font-medium text-foreground">教育符号规则纠错</strong>
            ，并<strong className="font-medium text-foreground">默认启用 AI 语义修复</strong>
            （可在下方取消勾选）；整理结果写入「待确认」临时库，核对无误后再确认入库。图片 OCR
            建议在设置中配置网关。附图保存：
            <span className="text-foreground">
              {importFiguresStorage === "supabase"
                ? "已配置 Supabase Storage 桶（MPG_IMPORT_FIGURES_BUCKET），优先云端 URL"
                : "站点目录 public/import-figures（可在环境变量配置桶名以使用云端存储）"}
            </span>
            。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={docFileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
            className="hidden"
            onChange={(ev) => void onPickDocumentFiles(ev.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5 font-medium shadow-sm"
            onClick={() => docFileRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
          >
            <Upload className="h-4 w-4" />
            选择文件（可多选）
          </Button>
          <p className="text-xs text-muted-foreground leading-relaxed">
            PDF / Word（.docx）/ Excel（.xls .xlsx）/ CSV / 常见图片；老式 .doc 不支持请另存 .docx。
          </p>

          <label
            htmlFor="offline-ai-repair"
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-muted/20 px-3 py-2"
          >
            <Checkbox
              id="offline-ai-repair"
              checked={useAiRepairBeforeImport}
              onCheckedChange={(v) => {
                const on = v === true;
                setUseAiRepairBeforeImport(on);
                void (async () => {
                  const raw = ocrRawBackup.trim();
                  const short = raw.replace(/\s+/g, "").length < 30;
                  if (on && raw && !short && !previewAiRepairApplied) {
                    setBusy(true);
                    toast.message("正在进行 AI 语义修复（预览）…");
                    try {
                      await runAiRepairPreview(raw);
                      toast.success("预览已切换为 AI 修复结果");
                    } finally {
                      setBusy(false);
                    }
                  }
                  if (!on && raw) {
                    setExtractedFromPipeline(ocrRawBackup);
                    setPreviewAiRepairApplied(false);
                  }
                })();
              }}
              disabled={busy}
              className="mt-0.5"
            />
            <span className="text-xs leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">预览时 AI 语义修复</span>
              ：抽取完成后即在预览区展示修复稿（规则词典 +
              大模型）；点击下方按钮整理时以当前预览正文为准。需在设置中配置云端或本地模型。
              {previewAiRepairApplied ? (
                <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                  （当前预览已是修复稿）
                </span>
              ) : null}
            </span>
          </label>

          {integration?.plaintextExtract ? (
            <label
              htmlFor="offline-plaintext-http"
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border/80 bg-muted/20 px-3 py-2"
            >
              <Checkbox
                id="offline-plaintext-http"
                checked={useExternalPlaintextEnhance}
                onCheckedChange={(v) => setUseExternalPlaintextEnhance(v === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <span className="text-xs leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">抽取后 HTTP 正文增强（可选）</span>
                ：在 AI 语义修复之前，将合并正文 POST 到服务端配置的增强 URL（自建适配器）。须在本次
                <strong className="text-foreground">选择文件前</strong>
                勾选；下次上传生效。
              </span>
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">年级标签（可选）</span>
              <select
                value={docGrade}
                onChange={(e) => setDocGrade(e.target.value)}
                className={SEL}
              >
                <option value="">自动（默认）</option>
                {GRADE_LEVEL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">学科（可选）</span>
              <select
                value={docSubject}
                onChange={(e) => setDocSubject(e.target.value)}
                className={SEL}
              >
                <option value="">自动（默认数学）</option>
                {CURRICULUM_SUBJECT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">难度（可选）</span>
              <select
                value={docDifficulty}
                onChange={(e) => setDocDifficulty((e.target.value || "") as Difficulty | "")}
                className={SEL}
              >
                <option value="">自动（默认进阶）</option>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">抽取正文预览</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {docExtracted.length} 字{previewAiRepairApplied ? " · 已 AI 修复" : ""}
                {previewEditedByUser ? " · 已人工编辑" : ""}
              </span>
            </div>

            {previewImageUrls.length > 0 ? (
              <div
                className="rounded-md border border-border/80 bg-muted/15 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
                role="note"
              >
                <p className="font-medium text-foreground">原卷对照（人工核对）</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  <li>
                    <span className="text-foreground">抄错类</span>
                    ：点名、边名、分数/整数、选项公式等与卷面不一致 — 可用左侧
                    <strong className="text-foreground">「抄错框」</strong>
                    标出后，在右侧正文改正。
                  </li>
                  <li>
                    <span className="text-foreground">漏抄类</span>
                    ：卷面上有字但正文缺句 — 用
                    <strong className="text-foreground">「漏抄椭圆」</strong>
                    圈出卷面位置，在正文遗漏处补上。
                  </li>
                  <li>
                    <span className="text-foreground">颠倒/串意类</span>
                    ：几何关系或整句逻辑被写反 — 用
                    <strong className="text-foreground">「Z」</strong>
                    打点标记，建议整段重写正文。
                  </li>
                </ul>
              </div>
            ) : null}

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
                      <span className="text-[10px] text-muted-foreground">标注</span>
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
                        清除标注
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

              <div className="space-y-1 min-w-0">
                {previewImageUrls.length > 0 ? (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    抽取正文（可编辑）
                  </span>
                ) : null}
                <textarea
                  value={docExtracted}
                  onChange={(e) => {
                    setDocExtracted(e.target.value);
                    setPreviewEditedByUser(true);
                  }}
                  placeholder="选择文件后在此显示抽取结果，可直接修改正文再整理写入待确认…"
                  rows={previewImageUrls.length > 0 ? 16 : 10}
                  spellCheck={false}
                  className="w-full min-h-[12rem] rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground md:min-h-[min(58vh,520px)]"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              OCR 与 AI
              修复均可能误读分数、几何点名或选项；请务必对照原卷核对，可直接在本框改正后再入库。拍照尽量平整清晰；有文字层的
              PDF 识别更稳。
              {previewImageUrls.length === 0 ? " 上传图片后左侧会显示原图，便于逐字对照。" : ""}
            </p>
            {previewEditedByUser ? (
              <label
                htmlFor="offline-persist-lexicon"
                className="flex cursor-pointer items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2"
              >
                <Checkbox
                  id="offline-persist-lexicon"
                  checked={persistLexiconLearn}
                  onCheckedChange={(v) => setPersistLexiconLearn(v === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="text-xs leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">记入服务端修复词典</span>
                  ：把本次<strong className="text-foreground">手改稿</strong>
                  与上一版流水线预览的逐行差异写入数据库（或本地{" "}
                  <code className="rounded bg-muted px-1 text-[10px]">
                    data/ocr-repair-lexicon.json
                  </code>
                  ），后续合并正文与 AI 修复后会
                  <strong className="text-foreground">自动套用</strong>，无需写死在前端。
                  当前写入位置：
                  <span className="text-foreground">
                    {ocrRepairLexiconPersistence === "supabase"
                      ? "Supabase"
                      : ocrRepairLexiconPersistence === "mysql"
                        ? "MySQL"
                        : "本地 data 文件"}
                  </span>
                  。
                </span>
              </label>
            ) : null}
            {extractWarnings.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {extractWarnings.join(" · ")}
              </p>
            )}
            <StructuredOcrPreview chunks={structuredChunks} />
          </div>

          {integration?.openNotebook ? (
            <div className="rounded-md border border-dashed border-border/80 bg-muted/15 px-3 py-2">
              <p className="mb-2 text-xs font-medium text-foreground">
                Open Notebook（可选 · 独立部署）
              </p>
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                把当前预览正文作为文本来源提交到 Open Notebook，便于在其侧 RAG / Transformations；与
                MPG「待确认 → 确认入库」流程相互独立。
              </p>
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
                      if (r.ok) {
                        toast.success("已提交到 Open Notebook", {
                          description: `来源 id：${r.sourceId}（异步处理中，请在对方界面查看）`,
                        });
                      } else {
                        toast.error(r.message);
                      }
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
                同步预览到 Open Notebook
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button type="button" onClick={() => void submitDocument()} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI 整理并写入待确认…
              </>
            ) : (
              "AI 整理并写入待确认"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
