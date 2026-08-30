import type { CSSProperties, ReactNode } from "react";
import { ExamChoiceOptionsLayoutProvider } from "@/components/exam/ExamChoiceOptionsList";
import { QuestionAttachments } from "@/components/exam/QuestionAttachments";
import { CHOICE_OPTIONS_LAYOUT, PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { resolveExamFigureChoicesComposition } from "@/lib/examChoiceOptionsLayout.shared";
import { hasDisplayableFigureAttachment } from "@/lib/examSubquestionFigureLayout.shared";
import type { QuestionAttachment } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ExamFigureChoicesRegionProps = {
  attachments?: QuestionAttachment[];
  options?: readonly string[] | null;
  /** 选项列表（由调用方提供，已含附图附录等） */
  choices: ReactNode;
  className?: string;
};

/**
 * 题干后的附图 + 选项：
 * - 选项较紧凑：选项在左、图在右（flex，图按内容宽度，间距来自配置）
 * - 长选项：选项在上、图在下
 * 不按题型硬编码。
 */
export function ExamFigureChoicesRegion({
  attachments,
  options,
  choices,
  className,
}: ExamFigureChoicesRegionProps) {
  const hasFigure = hasDisplayableFigureAttachment(attachments);
  const hasChoices = Array.isArray(options) && options.length > 0;
  const composition =
    hasFigure && hasChoices
      ? resolveExamFigureChoicesComposition(true, options)
      : "stacked";

  if (!hasFigure && !hasChoices) return null;

  const figure = hasFigure ? (
    <QuestionAttachments attachments={attachments} className="my-0 w-fit max-w-full" compact />
  ) : null;

  const stemGapRem = PAPER_SURFACE_LAYOUT.stemToFigureGapRem;

  if (composition === "beside" && hasFigure && hasChoices) {
    const gapStyle = {
      ["--exam-figure-choices-gap" as string]: `${CHOICE_OPTIONS_LAYOUT.besideGapRem}rem`,
      gap: `${CHOICE_OPTIONS_LAYOUT.besideGapRem}rem`,
      marginTop: `${stemGapRem}rem`,
    } satisfies CSSProperties;

    return (
      <div
        className={cn(
          "exam-figure-choices exam-figure-choices--beside flex flex-col items-stretch sm:flex-row sm:items-start sm:justify-start",
          className,
        )}
        style={gapStyle}
      >
        <div className="min-w-0 flex-1 basis-0">
          <ExamChoiceOptionsLayoutProvider shareRowWithFigure>
            {choices}
          </ExamChoiceOptionsLayoutProvider>
        </div>
        <div className="w-fit max-w-full shrink-0 self-start">{figure}</div>
      </div>
    );
  }

  const stackedGapStyle = {
    ["--exam-figure-choices-gap" as string]: `${CHOICE_OPTIONS_LAYOUT.stackedGapRem}rem`,
    gap: `${CHOICE_OPTIONS_LAYOUT.stackedGapRem}rem`,
    marginTop: `${stemGapRem}rem`,
  } satisfies CSSProperties;

  return (
    <div
      className={cn(
        "exam-figure-choices exam-figure-choices--stacked flex flex-col items-stretch",
        className,
      )}
      style={stackedGapStyle}
    >
      {/* 无并排：选项按 noBeside 阈值自适应（双列/均分），图在下 */}
      {hasChoices ? (
        <div className="min-w-0">
          <ExamChoiceOptionsLayoutProvider shareRowWithFigure={false}>
            {choices}
          </ExamChoiceOptionsLayoutProvider>
        </div>
      ) : null}
      {figure}
    </div>
  );
}
