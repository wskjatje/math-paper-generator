import { Link, useNavigate } from "@tanstack/react-router";
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
import {
  useExampleGenJobs,
  useHasRunningGenerationJob,
  usePaperGenJobs,
} from "@/hooks/useGenerationJobs";
import type { ExampleGenJob, GenJobStatus, PaperGenJob } from "@/lib/generationJobs.types";
import {
  EXAMPLE_PREFILL_STORAGE_KEY,
  EXAMPLE_PREFILL_APPLY_EVENT,
  PAPER_PREFILL_STORAGE_KEY,
  PAPER_PREFILL_APPLY_EVENT,
  patchExampleJob,
  patchPaperJob,
  clearCompletedExampleJobs,
  clearCompletedPaperJobs,
  forceFailAllRunningGenerationJobs,
} from "@/lib/generationJobsStorage";
import { requestGenerationQueueDrain } from "@/lib/generationQueueDrain";
import { cn } from "@/lib/utils";

function statusLabel(s: GenJobStatus): string {
  switch (s) {
    case "queued":
      return "排队中";
    case "running":
      return "生成中";
    case "success":
      return "生成成功";
    case "failed":
      return "生成失败";
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

function PaperJobTable({
  jobs,
  onCancel,
  onRegenerate,
}: {
  jobs: PaperGenJob[];
  onCancel: (id: string) => void;
  onRegenerate: (job: PaperGenJob) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">试卷名称</th>
            <th className="px-3 py-2.5">年级</th>
            <th className="px-3 py-2.5">学科</th>
            <th className="px-3 py-2.5">状态</th>
            <th className="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                暂无命题记录；提交「生成试卷」后将出现在此。
              </td>
            </tr>
          ) : (
            jobs.map((j) => (
              <tr key={j.id} className="border-b border-border/40 last:border-0">
                <td className="max-w-[200px] px-3 py-2 font-medium text-foreground">
                  <span className="line-clamp-2" title={j.title}>
                    {j.title}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.gradeLabel}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {j.subjectLabel}
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
                        onClick={() => onRegenerate(j)}
                      >
                        重新生成
                      </Button>
                    )}
                    {j.status === "success" && j.examId && (
                      <Button asChild size="sm" className="h-8">
                        <Link to="/exam/$id" params={{ id: j.examId }}>
                          查看
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

function ExampleJobTable({
  jobs,
  onCancel,
  onRegenerate,
}: {
  jobs: ExampleGenJob[];
  onCancel: (id: string) => void;
  onRegenerate: (job: ExampleGenJob) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">试卷名称</th>
            <th className="px-3 py-2.5">年级</th>
            <th className="px-3 py-2.5">学科</th>
            <th className="px-3 py-2.5">状态</th>
            <th className="px-3 py-2.5 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                暂无例题生成记录；在卡片上生成例题后将出现在此。
              </td>
            </tr>
          ) : (
            jobs.map((j) => (
              <tr key={j.id} className="border-b border-border/40 last:border-0">
                <td className="max-w-[200px] px-3 py-2 font-medium text-foreground">
                  <span className="line-clamp-2" title={j.examTitle}>
                    {j.examTitle}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{j.gradeLabel}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {j.subjectLabel}
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
                        onClick={() => onRegenerate(j)}
                      >
                        重新生成
                      </Button>
                    )}
                    {j.status === "success" && j.examId && (
                      <Button asChild size="sm" className="h-8">
                        <Link to="/exam/$id" params={{ id: j.examId }}>
                          查看
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

export function PaperGenerationJobQueueControl({ className }: { className?: string }) {
  const jobs = usePaperGenJobs();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const hasRunningGlobal = useHasRunningGenerationJob();

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued").length,
    [jobs],
  );

  const onCancel = useCallback((id: string) => {
    patchPaperJob(id, { status: "cancelled", cancelRequested: true });
  }, []);

  const onRegenerate = useCallback(
    (job: PaperGenJob) => {
      try {
        /** 只把 job.payload 预填到 /generate；用户再次点击「定制生成」时走与首次提交相同的 generateExam → finalizeGenerateExamClientResult（含仅会话临时快照二次拉取）。 */
        sessionStorage.setItem(PAPER_PREFILL_STORAGE_KEY, JSON.stringify(job.payload));
        window.dispatchEvent(new CustomEvent(PAPER_PREFILL_APPLY_EVENT));
        setOpen(false);
        void navigate({ to: "/generate" });
      } catch (e) {
        console.error(e);
      }
    },
    [navigate],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("relative gap-1.5 font-semibold shadow-sm", className)}
        onClick={() => setOpen(true)}
        aria-label="命题任务队列"
      >
        <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        命题队列
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
            <SheetTitle>命题任务队列</SheetTitle>
            <SheetDescription>
              本机浏览器记录；换设备或清缓存会丢失。可连续提交多份，同一时间仅执行 1 个任务，其余「排队中」；执行中或排队可取消；失败或已取消可重新生成并带入表单。
              若异常退出导致任务长期停在「生成中」，系统在继续排队时会自动超时标记失败；也可手动「释放卡住任务」。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <PaperJobTable jobs={jobs} onCancel={onCancel} onRegenerate={onRegenerate} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={!hasRunningGlobal}
              title="将所有「生成中」任务标为失败（命题与例题队列一并处理），以便排队任务继续"
              onClick={() => {
                if (
                  !window.confirm(
                    "将把当前所有「生成中」任务（命题 + 例题）标为失败，后续排队任务会继续执行。若任务实际仍在服务端运行，标记后前端将不再等待其结果。确定？",
                  )
                ) {
                  return;
                }
                const r = forceFailAllRunningGenerationJobs();
                const n = r.paper + r.example;
                if (n === 0) {
                  toast.message("没有处于生成中的任务");
                  return;
                }
                toast.success(`已标记 ${n} 条任务为失败`, {
                  description: "排队任务将随后自动开始",
                });
                requestGenerationQueueDrain();
              }}
            >
              释放卡住任务
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => clearCompletedPaperJobs()}
            >
              清除已完成记录
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function ExampleGenerationJobQueueControl({ className }: { className?: string }) {
  const jobs = useExampleGenJobs();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const hasRunningGlobal = useHasRunningGenerationJob();

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "running" || j.status === "queued").length,
    [jobs],
  );

  const onCancel = useCallback((id: string) => {
    patchExampleJob(id, { status: "cancelled", cancelRequested: true });
  }, []);

  const onRegenerate = useCallback(
    (job: ExampleGenJob) => {
      try {
        sessionStorage.setItem(
          EXAMPLE_PREFILL_STORAGE_KEY,
          JSON.stringify({ examId: job.examId, types: job.payload.types }),
        );
        window.dispatchEvent(new CustomEvent(EXAMPLE_PREFILL_APPLY_EVENT));
        setOpen(false);
        void navigate({ to: "/library" });
      } catch (e) {
        console.error(e);
      }
    },
    [navigate],
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("relative gap-1.5 font-semibold shadow-sm", className)}
        onClick={() => setOpen(true)}
        aria-label="例题生成队列"
      >
        <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        例题队列
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
            <SheetTitle>例题生成队列</SheetTitle>
            <SheetDescription>
              本机浏览器记录。可连续加入多条例题任务，同一时间仅执行 1 个，其余「排队中」。重新生成将把试卷与题型选项写回「生成例题」对话框（请在试卷库页面确认后提交）。
              若异常退出导致长期「生成中」，系统会在继续排队时自动超时标记失败；也可手动「释放卡住任务」（与命题队列共用）。
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <ExampleJobTable jobs={jobs} onCancel={onCancel} onRegenerate={onRegenerate} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={!hasRunningGlobal}
              title="将所有「生成中」任务标为失败（命题与例题队列一并处理），以便排队任务继续"
              onClick={() => {
                if (
                  !window.confirm(
                    "将把当前所有「生成中」任务（命题 + 例题）标为失败，后续排队任务会继续执行。若任务实际仍在服务端运行，标记后前端将不再等待其结果。确定？",
                  )
                ) {
                  return;
                }
                const r = forceFailAllRunningGenerationJobs();
                const n = r.paper + r.example;
                if (n === 0) {
                  toast.message("没有处于生成中的任务");
                  return;
                }
                toast.success(`已标记 ${n} 条任务为失败`, {
                  description: "排队任务将随后自动开始",
                });
                requestGenerationQueueDrain();
              }}
            >
              释放卡住任务
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => clearCompletedExampleJobs()}
            >
              清除已完成记录
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
