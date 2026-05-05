import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importOfflineExamFromDocument } from "@/lib/exam.functions.server";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { CURRICULUM_SUBJECT_OPTIONS, GRADE_LEVEL_OPTIONS } from "@/lib/generateCatalog";
import type { Difficulty } from "@/lib/types";

const DIFF_OPTIONS: { id: Difficulty; label: string }[] = [
  { id: "beginner", label: "入门" },
  { id: "intermediate", label: "进阶" },
  { id: "competition", label: "竞赛" },
  { id: "advanced", label: "高阶竞赛" },
];

const SEL =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ImportOfflineExamDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (res: { examId: string; persisted: "supabase" | "local" }) => void;
}) {
  const importDocFn = useServerFn(importOfflineExamFromDocument);

  const [busy, setBusy] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);

  const [docExtracted, setDocExtracted] = useState("");
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [docGrade, setDocGrade] = useState("");
  const [docSubject, setDocSubject] = useState("");
  const [docDifficulty, setDocDifficulty] = useState<Difficulty | "">("");
  const [docDuration, setDocDuration] = useState(90);

  const resetDocFields = () => {
    setDocExtracted("");
    setExtractWarnings([]);
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
      const res = await importDocFn({
        data: {
          text,
          grade: docGrade || undefined,
          subject: docSubject || undefined,
          difficulty: docDifficulty || undefined,
          duration_min: docDuration,
          ai: toAiRuntimePayload(loadAiSettings()),
        },
      });
      toast.success(
        res.persisted === "supabase"
          ? "文档已识别并导入云端（来源：线下导入）"
          : "文档已识别并写入本地（来源：线下导入）",
      );
      handleOpenChange(false);
      onImported?.(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "识别入库失败");
    } finally {
      setBusy(false);
    }
  };

  const onPickDocumentFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list);
    toast.message("正在抽取文本…", {
      description:
        files.some((f) => /\.(png|jpe?g|webp|gif|tif?f)$/i.test(f.name))
          ? "图片 OCR 首次需下载语言包，可能要数十秒"
          : undefined,
    });
    try {
      const { extractTextFromFiles } = await import("@/lib/offlineDocumentExtract");
      const { text, warnings } = await extractTextFromFiles(files);
      setDocExtracted(text);
      setExtractWarnings(warnings);
      if (warnings.length) {
        toast.warning("部分文件处理有提示", { description: warnings.slice(0, 3).join("；") });
      }
      const stripped = text.replace(/\s+/g, "").length;
      if (stripped < 30) {
        toast.error("合并后的正文过短，无法送入 AI；请换清晰文档或拆成多页/多图上传");
      } else {
        toast.success(`已抽取约 ${text.length} 字符`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "抽取失败");
    }
    if (docFileRef.current) docFileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入线下试卷</DialogTitle>
          <DialogDescription>
            上传 <strong>PDF / Word / Excel / CSV / 图片</strong>
            ，由浏览器抽取正文后使用「设置」中的模型整理为结构化试卷并入库。
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
            className="gap-1.5"
            onClick={() => docFileRef.current?.click()}
            disabled={busy}
          >
            <Upload className="h-4 w-4" />
            选择文件（可多选）
          </Button>
          <p className="text-xs text-muted-foreground leading-relaxed">
            PDF / Word（.docx）/ Excel（.xls .xlsx）/ CSV / 常见图片；老式 .doc 不支持请另存 .docx。
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">年级标签（可选）</span>
              <select value={docGrade} onChange={(e) => setDocGrade(e.target.value)} className={SEL}>
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
              <select value={docSubject} onChange={(e) => setDocSubject(e.target.value)} className={SEL}>
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

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">抽取正文预览</span>
              <span className="text-[11px] text-muted-foreground">{docExtracted.length} 字</span>
            </div>
            <textarea
              readOnly
              value={docExtracted}
              placeholder="选择文件后在此显示抽取结果，可检查后再入库…"
              rows={8}
              className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
            />
            {extractWarnings.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{extractWarnings.join(" · ")}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            取消
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
