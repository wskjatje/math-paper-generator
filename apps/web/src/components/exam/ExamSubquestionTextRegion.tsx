import { MathContent } from "@/components/MathContent";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import {
  subquestionTextLayoutClassName,
  type ExamChoiceOptionsLayout,
} from "@/lib/examSubquestionFigureLayout.shared";
import { cn } from "@/lib/utils";

export type ExamSubquestionTextRegionProps = {
  items: readonly string[];
  layout: ExamChoiceOptionsLayout;
  className?: string;
  onFigureDecodeFailed?: () => void;
};

/**
 * 无附图（或不并排）时的小问紧凑排：复用 choice 权重类名，正文来自拆分条目。
 */
export function ExamSubquestionTextRegion({
  items,
  layout,
  className,
  onFigureDecodeFailed,
}: ExamSubquestionTextRegionProps) {
  if (!items.length) return null;
  return (
    <div
      className={cn(subquestionTextLayoutClassName(layout), className)}
      style={{ marginTop: `${PAPER_SURFACE_LAYOUT.stemToSubquestionGapRem}rem` }}
    >
      {items.map((item, idx) => (
        <div key={idx} className="min-w-0 max-w-full">
          <MathContent
            className="min-w-0 break-words"
            onFigureDecodeFailed={onFigureDecodeFailed}
          >
            {item}
          </MathContent>
        </div>
      ))}
    </div>
  );
}
