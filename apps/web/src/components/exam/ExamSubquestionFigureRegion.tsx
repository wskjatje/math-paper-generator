import type { CSSProperties, ReactNode } from "react";
import { QuestionAttachments } from "@/components/exam/QuestionAttachments";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import type { QuestionAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ExamSubquestionFigureRegionProps = {
  /** 小问正文（已含（1）（2）…） */
  subquestions: ReactNode;
  attachments?: QuestionAttachment[];
  /** 自定义图区（位图附录等）；优先于 attachments */
  figure?: ReactNode;
  /** stacked=小问上图下；beside=小问左图右 */
  composition: "stacked" | "beside";
  className?: string;
};

/**
 * 无选项时：短小问与附图并排（左问右图）或上下叠放。
 * 间距/宽度来自 paperSurfaceLayout。
 */
export function ExamSubquestionFigureRegion({
  subquestions,
  attachments,
  figure: figureProp,
  composition,
  className,
}: ExamSubquestionFigureRegionProps) {
  const gapRem =
    composition === "beside"
      ? PAPER_SURFACE_LAYOUT.subquestionFigureBesideGapRem
      : PAPER_SURFACE_LAYOUT.stemToFigureGapRem;
  const figMaxW = PAPER_SURFACE_LAYOUT.subquestionFigureBesideFigureMaxWidthRem;

  const figure =
    figureProp ??
    (attachments?.length ? (
      <QuestionAttachments
        attachments={attachments}
        className="my-0 w-fit max-w-full"
        compact
      />
    ) : null);

  if (!figure) return <div className={cn("min-w-0", className)}>{subquestions}</div>;

  if (composition === "beside") {
    const style = {
      gap: `${gapRem}rem`,
      marginTop: `${PAPER_SURFACE_LAYOUT.stemToFigureGapRem}rem`,
    } satisfies CSSProperties;
    return (
      <div
        className={cn(
          "exam-subquestion-figure exam-subquestion-figure--beside flex flex-col items-stretch sm:flex-row sm:items-start sm:justify-start",
          className,
        )}
        style={style}
      >
        <div className="min-w-0 flex-1 basis-0">{subquestions}</div>
        <div
          className="w-fit shrink-0 self-start"
          style={{ maxWidth: `min(100%, ${figMaxW}rem)` }}
        >
          {figure}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "exam-subquestion-figure exam-subquestion-figure--stacked flex flex-col items-stretch",
        className,
      )}
      style={{
        gap: `${gapRem}rem`,
        marginTop: `${PAPER_SURFACE_LAYOUT.stemToFigureGapRem}rem`,
      }}
    >
      <div className="min-w-0">{subquestions}</div>
      {figure}
    </div>
  );
}
