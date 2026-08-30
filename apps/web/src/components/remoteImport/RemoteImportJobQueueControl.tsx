import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SimplePager,
  TABLE_LIST_PAGE_SIZE,
  pageCountFor,
  paginateSlice,
} from "@/components/list/SimplePager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHasRunningRemoteImportJob, useRemoteImportJobs } from "@/hooks/useRemoteImportJobs";
import type { GenJobStatus } from "@/lib/generationJobs.types";
import type { RemoteImportJob } from "@/lib/remoteImportJobs.types";
import {
  clearCompletedRemoteImportJobs,
  clearFailedRemoteImportJobs,
  forceFailRunningRemoteImportJobs,
  patchRemoteImportJob,
  upsertRemoteImportJob,
} from "@/lib/remoteImportJobsStorage";
import { requestRemoteImportQueueDrain } from "@/lib/remoteImportQueueDrain";
import { cn } from "@/lib/utils";
import { recoverImportedExamDraft } from "@/lib/exam.functions.server";
import { loadAiSettings, toAiRuntimePayload } from "@/lib/aiSettingsStorage";
import { toUserFacingErrorMessage } from "@/lib/userFacingError.shared";

function statusLabel(s: GenJobStatus): string {
  switch (s) {
    case "queued":
      return "排队中";
    case "running":
      return "导入中";
    case "success":
      return "导入成功";
    case "failed":
      return "导入失败";
    case "cancelled":
      return "已取消";
    default:
      return s;
  }
}

function statusBadgeClass(s: GenJobStatus): string {
  switch (s) {
    case "queued":
      return "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:text-amber-100";
    case "running":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100";
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "cancelled":
      return "border-border bg-muted/60 text-muted-foreground";
    default:
      return "";
  }
}

function RemoteImportJobTable({
  jobs,
  onCancel,
  onRetry,
  onDetails,
  onRecover,
  recoveringId,
}: {
  jobs: RemoteImportJob[];
  onCancel: (id: string) => void;
  onRetry: (job: RemoteImportJob) => void;
  onDetails: (job: RemoteImportJob) => void;
  onRecover: (job: RemoteImportJob) => void;
  recoveringId: string | null;
}) {
  const [page, setPage] = useState(1);
  const pageJobs = useMemo(
    () => paginateSlice(jobs, page, TABLE_LIST_PAGE_SIZE),
    [jobs, page],
  );
  const pageCount = pageCountFor(jobs.length, TABLE_LIST_PAGE_SIZE);

  return (
    <>
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">试卷名称</th>
            <th className="px-3 py-2.5">年份</th>
            <th className="px-3 py-2.5">年级</th>
            <th className="px-3 py-2.5">学科</th>
            <th className="px-3 py-2.5">试卷场景</th>
            <th className="px-3 py-2.5">状态</th>
            <th className="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                暂无记录
              </td>
            </tr>
          ) : (
            pageJobs.map((j) => (
              <tr key={j.id} className="border-b border-border/40 last:border-0">
                <td className="max-w-[200px] px-3 py-2 font-medium text-foreground">
                  <span className="line-clamp-2" title={j.title}>
                    {j.title}
                  </span>
                  {(j.importSource ?? "upload") === "web" ? (
                    <Badge variant="secondary" className="ml-1 align-middle text-[10px] font-normal">
                      外网
                    </Badge>
                  ) : (j.importSource ?? "upload") === "upload" ? (
                    <Badge variant="secondary" className="ml-1 align-middle text-[10px] font-normal">
                      文件
                    </Badge>
                  ) : null}
                  {j.errorMessage && j.status === "failed" ? (
                    <p className="mt-1 text-[11px] text-destructive line-clamp-2" title={toUserFacingErrorMessage(j.errorMessage, "导入失败")}>
                      {toUserFacingErrorMessage(j.errorMessage, "导入失败")}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.year}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.gradeLabel}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.subjectLabel}</td>
                <td className="max-w-[140px] px-3 py-2 text-muted-foreground">
                  <span className="line-clamp-2 text-xs">{j.paperSceneLabel ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={cn("font-normal", statusBadgeClass(j.status))}
                  >
                    {statusLabel(j.status)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {(j.status === "running" || j.status === "queued") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => onCancel(j.id)}
                      >
                        取消
                      </Button>
                    )}
                    {(j.status === "failed" || j.status === "cancelled") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => onRetry(j)}
                      >
                        重新排队
                      </Button>
                    )}
                    {j.status === "failed" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => onDetails(j)}
                      >
                        失败详情
                      </Button>
                    )}
                    {j.status === "failed" && j.recoveryDraftId && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={recoveringId === j.id}
                        onClick={() => onRecover(j)}
                      >
                        {recoveringId === j.id ? "处理中…" : "处理已返回结果"}
                      </Button>
                    )}
                    {j.status === "success" && j.examId && (
                      <Button asChild size="sm" className="h-8">
                        <Link
                          to="/exam/$id"
                          params={{ id: j.examId }}
                          search={{ tab: "paper", figures_debug: false, packing_debug: false }}
                        >
                          预览
                        </Link>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <SimplePager
      page={page}
      pageCount={pageCount}
      total={jobs.length}
      pageSize={TABLE_LIST_PAGE_SIZE}
      onPageChange={setPage}
      className="mt-3"
    />
    </>
  );
}

export function RemoteImportJobQueueControl({
  className,
  hideWhenIdle = false,
}: {
  className?: string;
  hideWhenIdle?: boolean;
}) {
  const jobs = useRemoteImportJobs();
  const [open, setOpen] = useState(false);
  const [detailsJob, setDetailsJob] = useState<RemoteImportJob | null>(null);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const hasRunning = useHasRunningRemoteImportJob();
  const recoverFn = useServerFn(recoverImportedExamDraft);

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued").length,
    [jobs],
  );
  const failedCount = useMemo(() => jobs.filter((j) => j.status === "failed").length, [jobs]);

  const onCancel = useCallback((id: string) => {
    patchRemoteImportJob(id, { status: "cancelled", cancelRequested: true });
    requestRemoteImportQueueDrain();
  }, []);

  const retryEnqueue = useCallback((job: RemoteImportJob) => {
    if (job.importSource === "upload" && !job.documentText) {
      toast.error("该任务的抽取正文已过期，请重新选择文件");
      return;
    }
    const nextId = crypto.randomUUID();
    const now = new Date().toISOString();
    upsertRemoteImportJob({
      id: nextId,
      importSource: job.importSource ?? "upload",
      catalogEntryId: job.catalogEntryId,
      webFetchUrl: job.webFetchUrl,
      paperKindId: job.paperKindId,
      documentText: job.documentText,
      durationMin: job.durationMin,
      totalScore: job.totalScore,
      difficulty: job.difficulty,
      gradeId: job.gradeId,
      subjectId: job.subjectId,
      title: job.title,
      year: job.year,
      gradeLabel: job.gradeLabel,
      subjectLabel: job.subjectLabel,
      paperSceneLabel: job.paperSceneLabel,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    requestRemoteImportQueueDrain();
    toast.success("已重新加入队列");
  }, []);

  const recoverDraft = useCallback(
    async (job: RemoteImportJob) => {
      if (!job.recoveryDraftId || recoveringId) return;
      setRecoveringId(job.id);
      try {
        const res = await recoverFn({
          data: {
            draftId: job.recoveryDraftId,
            ai: toAiRuntimePayload(loadAiSettings()),
          },
        });
        patchRemoteImportJob(job.id, {
          status: "success",
          examId: res.examId,
          recoveryDraftId: undefined,
          documentText: undefined,
          errorMessage: undefined,
        });
        toast.success("已处理并保存模型返回的试卷", {
          description: "如仍有配图问题，本次修复与失败均已记入「改进建议」供查阅。",
        });
      } catch (error) {
        const message = toUserFacingErrorMessage(error, "处理已返回结果失败");
        // 服务端会把本次修复失败写回草稿并记入审计学习；这里同步失败详情供「失败详情」查看
        patchRemoteImportJob(job.id, {
          errorMessage: error instanceof Error ? error.message : message,
        });
        toast.error(message, {
          description: "本次失败已记入「改进建议」；可再次点击「处理已返回结果」重试。",
          duration: 10_000,
        });
      } finally {
        setRecoveringId(null);
      }
    },
    [recoverFn, recoveringId],
  );

  if (hideWhenIdle && activeCount === 0 && failedCount === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("relative gap-1.5 font-semibold shadow-sm", className)}
        onClick={() => setOpen(true)}
        aria-label="导入队列"
      >
        <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        导入队列
        {activeCount > 0 ? (
          <Badge
            variant="secondary"
            className="ml-0.5 h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]"
          >
            {activeCount}
          </Badge>
        ) : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>导入队列</SheetTitle>
            <SheetDescription className="sr-only">导入队列</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <RemoteImportJobTable
              jobs={jobs}
              onCancel={onCancel}
              onRetry={retryEnqueue}
              onDetails={setDetailsJob}
              onRecover={(job) => void recoverDraft(job)}
              recoveringId={recoveringId}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={!hasRunning}
              title="将当前「导入中」任务标为失败，以便排队任务继续"
              onClick={() => {
                if (!window.confirm("将把当前「导入中」任务标为失败，后续排队任务会继续执行。确定？")) {
                  return;
                }
                void (async () => {
                  const n = await forceFailRunningRemoteImportJobs();
                  if (n === 0) {
                    toast.message("没有处于导入中的任务");
                    return;
                  }
                  toast.success(`已标记 ${n} 条任务为失败`);
                  requestRemoteImportQueueDrain();
                })();
              }}
            >
              释放卡住任务
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={failedCount === 0}
              onClick={() => {
                if (!window.confirm(`确定清除导入队列中的 ${failedCount} 条失败任务吗？`)) return;
                void (async () => {
                  const removed = await clearFailedRemoteImportJobs();
                  toast.success(`已清除 ${removed} 条失败任务`);
                })();
              }}
            >
              清除失败任务{failedCount > 0 ? `（${failedCount}）` : ""}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => clearCompletedRemoteImportJobs()}
            >
              清除已完成记录
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={Boolean(detailsJob)} onOpenChange={(next) => !next && setDetailsJob(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入失败详情</DialogTitle>
            <DialogDescription>
              {detailsJob?.title} · {detailsJob?.subjectLabel} ·{" "}
              {detailsJob ? new Date(detailsJob.updatedAt).toLocaleString("zh-CN") : ""}
            </DialogDescription>
          </DialogHeader>
          {detailsJob?.errorMessage ? (
            <div className="space-y-3">
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {toUserFacingErrorMessage(detailsJob.errorMessage, "导入失败")}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
