import { cn } from "@/lib/utils";
import { paperTemplateById } from "@/config/paperTemplates";
import type { Exam } from "@/lib/types";

type ExamPrintChromeProps = {
  exam: Exam;
  className?: string;
};

/** 打印/PDF 用页眉页脚（依赖 @media print 与 counter(page)；默认不显示页眉，避免与浏览器页眉叠床架屋） */
export function ExamPrintChrome({ exam, className }: ExamPrintChromeProps) {
  const tpl = paperTemplateById(exam.paper_template_id);
  const showHeader = tpl?.showPrintHeader === true;
  const showFooter = tpl?.showPageFooter ?? false;
  const footerPattern = tpl?.footerPattern ?? "第 {{page}} 页（共 {{pages}} 页）";

  if (!showHeader && !showFooter) return null;

  return (
    <div className={cn("exam-print-chrome pointer-events-none", className)} aria-hidden>
      {showHeader ? (
        <div className="exam-print-chrome-header">
          <div className="exam-print-chrome-header-title">{exam.title}</div>
          {exam.subtitle ? (
            <div className="exam-print-chrome-header-sub">{exam.subtitle}</div>
          ) : null}
          <div className="exam-print-chrome-header-meta">
            {exam.duration_min} 分钟 · 总分 {exam.total_score}
          </div>
        </div>
      ) : null}
      {showFooter ? (
        <div
          className="exam-print-chrome-footer"
          data-footer-pattern={footerPattern}
        />
      ) : null}
    </div>
  );
}
