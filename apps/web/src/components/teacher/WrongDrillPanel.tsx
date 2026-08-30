import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createClassroomAssignment,
  enqueueWrongDrillFreshByType,
  enqueueWrongDrillVariantExam,
  previewWrongDrillComposition,
} from "@/lib/classroom.functions.server";
import { classroomAuthPayload, useAuth } from "@/hooks/useAuth";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import {
  upsertPaperJob,
  PAPER_PREFILL_STORAGE_KEY,
  PAPER_PREFILL_APPLY_EVENT,
  PAPER_QUEUE_OPEN_EVENT,
} from "@/lib/generationJobsStorage";
import { requestGenerationQueueDrain } from "@/lib/generationQueueDrain";
import type { PaperGenPayloadSnapshot } from "@/lib/generationJobs.types";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

type TypeRow = {
  type: string;
  label: string;
  wrongHits: number;
  plannedCount: number;
  generatable: boolean;
};

type SubjectOption = { id: string; label: string };

type PreviewState = {
  ok: boolean;
  reason?: string;
  examTitle?: string;
  studentSubmitCount: number;
  wrongHitCount: number;
  typeRows: TypeRow[];
  seedQuestionIds: string[];
  suggestedSubjectId: string;
  suggestedGradeId: string;
  subjectIds: string[];
  subjectOptions: SubjectOption[];
  subjectLabel: string;
  gradeLabel: string;
  gradeLocked: boolean;
  subjectLocked: boolean;
  gradeFromExam?: boolean;
  needsSubjectChoice: boolean;
  needsSubjectOrGrade: boolean;
};

export function WrongDrillPanel({
  assignmentId,
  assignmentTitle,
  classId,
  defaultGradeId,
  classLabel,
}: {
  assignmentId: string;
  assignmentTitle: string;
  classId?: string | null;
  defaultGradeId?: string | null;
  /** 班级显示名（发布作业时写入；勿当作 CSS class） */
  classLabel?: string | null;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const previewFn = useServerFn(previewWrongDrillComposition);
  const freshFn = useServerFn(enqueueWrongDrillFreshByType);
  const variantFn = useServerFn(enqueueWrongDrillVariantExam);
  const createFn = useServerFn(createClassroomAssignment);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedKnowledgeTags, setSelectedKnowledgeTags] = useState<string[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [busy, setBusy] = useState<"preview" | "fresh" | "supplement" | "variant" | "publish" | null>(
    null,
  );
  const [variantExamId, setVariantExamId] = useState<string | null>(null);

  const typeRows = preview?.typeRows ?? [];
  const subjectOptions = preview?.subjectOptions ?? [];
  const generatableSelected = selectedKnowledgeTags.filter((id) =>
    typeRows.some((r) => r.type === id && r.generatable),
  );
  const allGeneratableIds = typeRows.filter((r) => r.generatable).map((r) => r.type);
  const effectiveSubjectId =
    preview?.subjectLocked ?
      preview.suggestedSubjectId
    : selectedSubjectId && subjectOptions.some((o) => o.id === selectedSubjectId)
      ? selectedSubjectId
      : "";
  const missingSubject =
    !preview ||
    subjectOptions.length === 0 ||
    (subjectOptions.length > 1 && !effectiveSubjectId);
  const missingGrade = Boolean(preview && !preview.suggestedGradeId);

  useEffect(() => {
    setPreview(null);
    setVariantExamId(null);
    setSelectedKnowledgeTags([]);
    setSelectedSubjectId("");
    setTeacherNotes("");
  }, [assignmentId, defaultGradeId]);

  const authData = () => classroomAuthPayload(auth);

  const onPreview = async () => {
    setBusy("preview");
    setVariantExamId(null);
    try {
      const res = (await previewFn({
        data: {
          assignmentId,
          subjectId: selectedSubjectId || undefined,
          ...authData(),
        },
      })) as PreviewState;
      setPreview(res);
      const rows = Array.isArray(res.typeRows) ? res.typeRows : [];
      setSelectedKnowledgeTags(rows.filter((r) => r.generatable).map((r) => r.type));
      const opts = Array.isArray(res.subjectOptions) ? res.subjectOptions : [];
      if (opts.length === 1) {
        setSelectedSubjectId(opts[0]!.id);
      } else if (res.suggestedSubjectId && opts.some((o) => o.id === res.suggestedSubjectId)) {
        setSelectedSubjectId(res.suggestedSubjectId);
      } else if (opts.length > 1) {
        setSelectedSubjectId((prev) => (opts.some((o) => o.id === prev) ? prev : ""));
      } else {
        setSelectedSubjectId("");
      }
      if (!res.ok) toast.message(res.reason ?? "暂不可生成巩固卷");
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "预览失败"));
    } finally {
      setBusy(null);
    }
  };

  // 打开巩固面板即按当前所选作业试卷拉取年级/学科与错题分布
  useEffect(() => {
    void onPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随作业切换自动预览
  }, [assignmentId]);

  const enqueueFresh = async (mode: "fresh" | "supplement") => {
    if (missingGrade || subjectOptions.length === 0) {
      toast.error("试卷/班级未带入年级或学科，无法生成（禁止猜测）");
      return;
    }
    if (missingSubject) {
      toast.error("本卷含多个学科，请先选择本次巩固学科");
      return;
    }
    const tags = mode === "fresh" ? allGeneratableIds : generatableSelected;
    if (tags.length === 0) {
      toast.error(
        mode === "supplement" ? "请勾选要补充生成的错题知识点" : "没有可生成的卷内知识点",
      );
      return;
    }
    setBusy(mode);
    try {
      const suffix = mode === "supplement" ? " · 知识点补充" : " · 错题巩固";
      const res = await freshFn({
        data: {
          assignmentId,
          selectedKnowledgeTags: tags,
          subjectId: effectiveSubjectId,
          title: `${assignmentTitle}${suffix}`,
          notes: teacherNotes.trim() || undefined,
          ...authData(),
        },
      });
      const payload = res.paperPrefill as PaperGenPayloadSnapshot;
      const nowIso = new Date().toISOString();
      upsertPaperJob({
        id: crypto.randomUUID(),
        title: payload.title,
        gradeId: payload.grade,
        subjectId: payload.subject,
        gradeLabel: res.gradeLabel,
        subjectLabel: res.subjectLabel,
        status: "queued",
        createdAt: nowIso,
        updatedAt: nowIso,
        payload,
      });
      try {
        sessionStorage.setItem(PAPER_PREFILL_STORAGE_KEY, JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent(PAPER_PREFILL_APPLY_EVENT));
      } catch {
        /* ignore */
      }
      requestGenerationQueueDrain();
      toast.success("试卷已加入命题任务列表", {
        action: {
          label: "查看队列",
          onClick: () => window.dispatchEvent(new CustomEvent(PAPER_QUEUE_OPEN_EVENT)),
        },
      });
      void navigate({ to: "/generate" }).then(() => {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(PAPER_QUEUE_OPEN_EVENT));
        }, 120);
      });
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "入队失败"));
    } finally {
      setBusy(null);
    }
  };

  const onVariant = async () => {
    if (generatableSelected.length === 0) {
      toast.error("请勾选至少一项错题知识点作为变式种子");
      return;
    }
    setBusy("variant");
    setVariantExamId(null);
    try {
      const res = await variantFn({
        data: {
          assignmentId,
          selectedKnowledgeTags: generatableSelected,
          subjectId: effectiveSubjectId || undefined,
          title: `${assignmentTitle} · 错题变式`,
          ai: toAiRuntimePayload(loadAiSettings()),
          ...authData(),
        },
      });
      setVariantExamId(res.examId);
      toast.success(`变式卷已生成（${res.questionCount} 题），可发布为作业`);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "变式卷生成失败"));
    } finally {
      setBusy(null);
    }
  };

  const onPublishVariant = async () => {
    if (!variantExamId) return;
    setBusy("publish");
    try {
      await createFn({
        data: {
          examId: variantExamId,
          title: `${assignmentTitle} · 错题变式练习`,
          classId: classId?.trim() || undefined,
          className: classLabel?.trim() || undefined,
          gradeId: preview?.suggestedGradeId || defaultGradeId || undefined,
          teacherLabel: auth.displayName?.trim() || "教师",
          hideAnswers: true,
          visibleToAll: true,
          ...authData(),
        },
      });
      toast.success("变式卷已发布为本班新作业");
      setVariantExamId(null);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "发布失败"));
    } finally {
      setBusy(null);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedKnowledgeTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const canGenerate = Boolean(preview && typeRows.some((r) => r.generatable));
  const blockEnqueue = missingGrade || missingSubject;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {preview?.examTitle
            ? preview.examTitle
            : busy === "preview"
              ? "正在加载试卷…"
              : "等待错题分析"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void onPreview()}
        >
          {busy === "preview" ? "分析中…" : "刷新错题分布"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">年级</Label>
          <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            {busy === "preview" && !preview
              ? "解析中…"
              : preview
                ? preview.gradeLabel || "试卷未标注年级"
                : "—"}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">学科</Label>
          {!preview && busy === "preview" ? (
            <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              解析中…
            </p>
          ) : !preview ? (
            <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">—</p>
          ) : subjectOptions.length === 0 ? (
            <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-destructive">
              试卷未标注学科
            </p>
          ) : subjectOptions.length === 1 ? (
            <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              {subjectOptions[0]!.label}
            </p>
          ) : (
            <Select value={selectedSubjectId || undefined} onValueChange={setSelectedSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder="选择本卷学科" />
              </SelectTrigger>
              <SelectContent>
                {subjectOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {preview && missingGrade ? (
        <p className="text-xs text-destructive">班级/试卷缺少可识别年级，无法生成（禁止猜测）。</p>
      ) : null}
      {preview && subjectOptions.length === 0 ? (
        <p className="text-xs text-destructive">本卷缺少可识别学科标签，无法生成（禁止猜测）。</p>
      ) : null}
      {preview && subjectOptions.length > 1 && !effectiveSubjectId ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          请选择本次巩固学科。
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-3 text-xs text-muted-foreground">
          <p>
            提交 {preview.studentSubmitCount} 份 · 错题命中 {preview.wrongHitCount} 次 · 变式种子{" "}
            {preview.seedQuestionIds.length} 题
          </p>
          {typeRows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs text-foreground">错题题型（卷内知识点）</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={allGeneratableIds.length === 0}
                    onClick={() => setSelectedKnowledgeTags(allGeneratableIds)}
                  >
                    全选可生成
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={selectedKnowledgeTags.length === 0}
                    onClick={() => setSelectedKnowledgeTags([])}
                  >
                    清空
                  </Button>
                </div>
              </div>
              <ul className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                {typeRows.map((row) => (
                  <li key={row.type} className="flex items-start gap-2 text-sm text-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={selectedKnowledgeTags.includes(row.type)}
                      disabled={!row.generatable}
                      onCheckedChange={() => {
                        if (row.generatable) toggleTag(row.type);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{row.label}</span>
                      <p className="text-xs text-muted-foreground">
                        错题 {row.wrongHits} 次
                        {row.generatable
                          ? ` · 拟出约 ${row.plannedCount} 题`
                          : " · 不可生成"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="wrong-drill-notes" className="text-xs text-foreground">
              补充说明（选填）
            </Label>
            <Textarea
              id="wrong-drill-notes"
              value={teacherNotes}
              onChange={(e) => setTeacherNotes(e.target.value.slice(0, 2000))}
              placeholder="例如：侧重诱导公式应用、题干勿与原卷雷同…"
              rows={3}
              className="text-sm"
            />
          </div>

          {preview.ok === false ? <p className="text-destructive">{preview.reason}</p> : null}
        </div>
      ) : busy === "preview" ? (
        <p className="text-xs text-muted-foreground">正在按所选试卷分析错题…</p>
      ) : (
        <p className="text-xs text-muted-foreground">暂无错题数据</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            busy !== null || !canGenerate || blockEnqueue || allGeneratableIds.length === 0
          }
          onClick={() => void enqueueFresh("fresh")}
        >
          {busy === "fresh" ? "入队中…" : "生成同知识点巩固卷"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={
            busy !== null || !canGenerate || blockEnqueue || generatableSelected.length === 0
          }
          onClick={() => void enqueueFresh("supplement")}
        >
          {busy === "supplement" ? "入队中…" : "补充生成所选知识点"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !canGenerate || generatableSelected.length === 0}
          onClick={() => void onVariant()}
        >
          {busy === "variant" ? "生成中…" : "生成错题变式卷"}
        </Button>
      </div>

      {variantExamId ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <p className="text-sm text-foreground">变式卷已生成，可发布或打开查看。</p>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() => void onPublishVariant()}
          >
            {busy === "publish" ? "发布中…" : "发布为本班作业"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void navigate({
                to: "/exam/$id",
                params: { id: variantExamId },
                search: { tab: "paper", figures_debug: false, packing_debug: false },
              })
            }
          >
            打开试卷
          </Button>
        </div>
      ) : null}
    </div>
  );
}
