import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getImportExtractionSummary,
  lockImportReviewFields,
  resolveImportReviewFinding,
} from "@/lib/exam.functions.server";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";
import type { ImportReviewFinding, ImportReviewFindingSeverity, ImportReviewStatus } from "@/lib/documentExtraction.shared";

type Summary = Awaited<ReturnType<typeof getImportExtractionSummary>>;

const SEVERITY_LABEL: Record<ImportReviewFindingSeverity, string> = {
  blocker: "须核对",
  warning: "建议核对",
  info: "提示",
};

const FINDING_CODE_LABEL: Record<ImportReviewFinding["code"], string> = {
  numeric_mismatch: "数值不一致",
  formula_mismatch: "公式不一致",
  figure_count_mismatch: "配图数量不一致",
  point_label_mismatch: "分值标注不一致",
  subquestion_mismatch: "小题结构不一致",
  low_confidence: "识别置信度偏低",
  other: "其他差异",
};

const QUALITY_LABEL: Record<string, string> = {
  high_fidelity: "高保真",
  basic_fallback: "基础抽取",
};

const REVIEW_STATUS_LABEL: Record<ImportReviewStatus, string> = {
  pending: "待复核",
  in_review: "复核中",
  needs_changes: "需修改",
  approved: "已通过",
  rejected: "已驳回",
};

function fieldPathUserLabel(path: string): string {
  const m = /^q(\d+)\.(content|attachments)$/.exec(path);
  if (!m) return path;
  const n = m[1];
  return m[2] === "content" ? `第 ${n} 题正文` : `第 ${n} 题附件`;
}

/**
 * 导入核对台：对照来源抽取与发布稿差异；支持标记已解决与锁定本题。
 */
export function ImportReviewWorkbench({
  documentId,
  className,
}: {
  documentId: string;
  className?: string;
}) {
  const loadFn = useServerFn(getImportExtractionSummary);
  const resolveFn = useServerFn(resolveImportReviewFinding);
  const lockFn = useServerFn(lockImportReviewFields);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const res = await loadFn({ data: { documentId } });
      setSummary(res);
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "加载抽取摘要失败"));
    } finally {
      setBusy(false);
    }
  }, [documentId, loadFn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onResolve = async (finding: ImportReviewFinding) => {
    setActingId(finding.id);
    try {
      await resolveFn({
        data: {
          documentId,
          findingId: finding.id,
          note: "人工对照原图后确认可放行",
        },
      });
      toast.success("已标记差异为已解决");
      await reload();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "标记失败"));
    } finally {
      setActingId(null);
    }
  };

  const onLockCandidate = async (questionIndex: number) => {
    setActingId(`lock-${questionIndex}`);
    try {
      await lockFn({
        data: {
          documentId,
          fieldPaths: [`q${questionIndex}.content`, `q${questionIndex}.attachments`],
          note: "审核工作台锁定",
        },
      });
      toast.success(`已锁定第 ${questionIndex} 题`);
      await reload();
    } catch (e) {
      toast.error(toUserFacingErrorMessage(e, "锁定失败"));
    } finally {
      setActingId(null);
    }
  };

  if (!summary && busy) {
    return <p className="text-sm text-muted-foreground">正在加载来源内容…</p>;
  }
  if (!summary) return null;

  const findings: ImportReviewFinding[] = summary.review?.findings ?? [];
  const blockers = findings.filter((f) => f.severity === "blocker" && !f.resolved);
  const locked = summary.review?.lockedFieldPaths ?? [];
  const qualityLabel = QUALITY_LABEL[summary.quality] ?? "已抽取";
  const reviewStatus = summary.review?.status;
  const reviewStatusLabel = reviewStatus ? REVIEW_STATUS_LABEL[reviewStatus] : null;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">核对差异</h3>
        <Badge variant="outline">{qualityLabel}</Badge>
        <Badge variant="secondary">{summary.sourceFilename}</Badge>
        {reviewStatusLabel ? (
          <Badge variant="outline">复核：{reviewStatusLabel}</Badge>
        ) : null}
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => void reload()}>
          刷新
        </Button>
      </div>
      {summary.warnings.length > 0 ? (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
          {summary.warnings.slice(0, 5).join(" · ")}
        </p>
      ) : null}
      {blockers.length > 0 ? (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          还有 {blockers.length} 处需核对，请先「标记已解决」再确认入库。
        </div>
      ) : null}
      {locked.length > 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          已锁定：{locked.slice(0, 12).map(fieldPathUserLabel).join("、")}
          {locked.length > 12 ? "…" : ""}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            来源候选 · {summary.candidateCount} 题 · {summary.pageCount} 页
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
            {summary.candidates.map((c, i) => (
              <li key={c.regionId} className="rounded border border-border/40 bg-muted/20 p-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">候选 {i + 1}</span>
                  <span className="text-muted-foreground">
                    第 {c.pageIndex + 1} 页 · 图 {c.figureCount}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                  {c.sourceTextPreview}
                  {c.sourceTextPreview.length >= 400 ? "…" : ""}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[11px]"
                  disabled={actingId === `lock-${i + 1}`}
                  onClick={() => void onLockCandidate(i + 1)}
                >
                  锁定本题
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">与发布稿的差异</p>
          {findings.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无差异。</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className={
                    f.severity === "blocker" && !f.resolved
                      ? "rounded border border-destructive/30 bg-destructive/5 p-2"
                      : "rounded border border-border/40 p-2"
                  }
                >
                  <div className="mb-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {SEVERITY_LABEL[f.severity]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {FINDING_CODE_LABEL[f.code]}
                    </Badge>
                    {f.resolved ? (
                      <Badge className="bg-emerald-600 text-[10px] text-white">已解决</Badge>
                    ) : null}
                    {f.questionIndex != null ? (
                      <span className="text-muted-foreground">第 {f.questionIndex} 题</span>
                    ) : null}
                  </div>
                  <p>{f.summary}</p>
                  {f.sourceSnippet || f.publishedSnippet ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      来源：{f.sourceSnippet ?? "—"} → 发布：{f.publishedSnippet ?? "—"}
                    </p>
                  ) : null}
                  {!f.resolved ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-2 h-7 text-[11px]"
                      disabled={actingId === f.id}
                      onClick={() => void onResolve(f)}
                    >
                      标记已解决
                    </Button>
                  ) : f.resolutionNote ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">{f.resolutionNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {summary.assets.filter((a) => a.uri).length > 0 ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">来源原图（对照）</p>
              <div className="flex flex-wrap gap-2">
                {summary.assets
                  .filter((a) => a.uri)
                  .slice(0, 12)
                  .map((a) => (
                    <a
                      key={a.id}
                      href={a.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex flex-col gap-1 rounded border border-border/50 p-1 text-[11px] text-primary"
                    >
                      <span className="underline">
                        {a.role}
                        {a.pageIndex != null ? ` p${a.pageIndex + 1}` : ""}
                      </span>
                      <img
                        src={a.uri}
                        alt={a.role}
                        className="max-h-20 max-w-[7rem] object-contain"
                        loading="lazy"
                      />
                    </a>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
