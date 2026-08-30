import type { CSSProperties } from "react";
import { resolveAnswerWritingSpaceMinHeightRem } from "@/lib/examAnswerWritingSpace.shared";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { cn } from "@/lib/utils";

export type ExamAnswerWritingSpaceProps = {
  type?: string | null;
  type_label?: string | null;
  options?: readonly string[] | null;
  className?: string;
};

/**
 * 证明/解答/计算等题干后的书写留白（高度来自 exam-domain.json，跨学科）。
 * 须进入打印/PDF，故不加 no-print。
 */
export function ExamAnswerWritingSpace({
  type,
  type_label,
  options,
  className,
}: ExamAnswerWritingSpaceProps) {
  const minHeightRem = resolveAnswerWritingSpaceMinHeightRem({
    type,
    type_label,
    options,
  });
  if (minHeightRem <= 0) return null;
  const style = {
    minHeight: `${minHeightRem}rem`,
  } satisfies CSSProperties;
  return (
    <div
      className={cn(
        "exam-answer-writing-space mt-4 w-full print:mt-3",
        PAPER_SURFACE_LAYOUT.answerWritingSpace.showBottomBorder === true &&
          "border-b border-dashed border-border/40",
        className,
      )}
      style={style}
      aria-hidden
      data-answer-space-rem={minHeightRem}
    />
  );
}
