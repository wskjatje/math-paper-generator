/**
 * 列表/卡片：语义验证状态徽章（quality_status，非导入解析 rollup）。
 */
import { cn } from "@/lib/utils";
import {
  examIsAssignableByQuality,
  examQualityStatusLabel,
} from "@/lib/examQualityReport.shared";
import type { Exam } from "@/lib/types";

type Props = {
  exam: Pick<Exam, "quality_status" | "quality_exclude_assign">;
  /** 为 true 时「未验证」也显示（导入列表需要一眼区分） */
  showUnknown?: boolean;
  className?: string;
};

export function ExamQualityStatusBadge({ exam, showUnknown = false, className }: Props) {
  const status = exam.quality_status ?? "unknown";
  if (!showUnknown && (status === "unknown" || exam.quality_status == null)) {
    return null;
  }

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        status === "pass" &&
          "border border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
        status === "fail" &&
          "border border-destructive/35 bg-destructive/10 text-destructive",
        status === "needs_review" &&
          "border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100",
        (status === "unknown" || !exam.quality_status) &&
          "border border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {examQualityStatusLabel(status)}
      {!examIsAssignableByQuality(exam) && exam.quality_exclude_assign ? " · 不可布置" : ""}
    </span>
  );
}
