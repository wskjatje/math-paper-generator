import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  forceFailRunningRemoteImportJobs,
  patchRemoteImportJob,
  upsertRemoteImportJob,
} from "@/lib/remoteImportJobsStorage";
import { requestRemoteImportQueueDrain } from "@/lib/remoteImportQueueDrain";
import { cn } from "@/lib/utils";

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
}: {
  jobs: RemoteImportJob[];
  onCancel: (id: string) => void;
  onRetry: (job: RemoteImportJob) => void;
}) {
  return (
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
                暂无记录；在导入线下卷页检索试卷后会自动加入队列。
              </td>
            </tr>
          ) : (
            jobs.map((j) => (
              <tr key={j.id} className="border-b border-border/40 last:border-0">
                <td className="max-w-[200px] px-3 py-2 font-medium text-foreground">
                  <span className="line-clamp-2" title={j.title}>
                    {j.title}
                  </span>
                  {(j.importSource ?? "catalog") === "web" ? (
                    <Badge
                      variant="secondary"
                      className="ml-1 align-middle text-[10px] font-normal"
                    >
                      外网
                    </Badge>
                  ) : null}
                  {j.errorMessage && j.status === "failed" ? (
                    <p
                      className="mt-1 text-[11px] text-destructive line-clamp-2"
                      title={j.errorMessage}
                    >
                      {j.errorMessage}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.year}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {j.gradeLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {j.subjectLabel}
                </td>
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
                    {j.status === "success" && j.examId && (
                      <Button asChild size="sm" className="h-8">
                        <Link to="/exam/$id" params={{ id: j.examId }} search={{}}>
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
  );
}

export function RemoteImportJobQueueControl({ className }: { className?: string }) {
  const jobs = useRemoteImportJobs();
  const [open, setOpen] = useState(false);
  const hasRunning = useHasRunningRemoteImportJob();

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued").length,
    [jobs],
  );

  const onCancel = useCallback((id: string) => {
    void (async () => {
      await patchRemoteImportJob(id, { status: "cancelled", cancelRequested: true });
      requestRemoteImportQueueDrain();
    })();
  }, []);

  const retryEnqueue = useCallback((job: RemoteImportJob) => {
    void (async () => {
      const nextId = crypto.randomUUID();
      const now = new Date().toISOString();
      await upsertRemoteImportJob({
        id: nextId,
        importSource: job.importSource ?? "catalog",
        catalogEntryId: job.catalogEntryId,
        webFetchUrl: job.webFetchUrl,
        paperKindId: job.paperKindId,
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
    })();
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("relative gap-1.5 font-semibold shadow-sm", className)}
        onClick={() => setOpen(true)}
        aria-label="网上导入队列"
      >
        <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        网上导入队列
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
            <SheetTitle>网上导入队列</SheetTitle>
            <SheetDescription>
              任务保存在服务端数据库（无 Supabase 时落本机 MySQL 或 data 目录）。同一时间仅执行 1
              条导入任务，其余排队；抓取正文后使用「设置」中的模型整理为结构化试卷并写入临时库。
              若长期停在「导入中」，可先「释放卡住任务」再继续排队。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <RemoteImportJobTable jobs={jobs} onCancel={onCancel} onRetry={retryEnqueue} />
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
                if (
                  !window.confirm("将把当前「导入中」任务标为失败，后续排队任务会继续执行。确定？")
                ) {
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
              className="text-muted-foreground"
              onClick={() => void clearCompletedRemoteImportJobs()}
            >
              清除已完成记录
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
