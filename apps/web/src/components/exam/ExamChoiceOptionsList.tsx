import { createContext, useContext, type ReactNode } from "react";
import { MathContent } from "@/components/MathContent";
import { CHOICE_OPTIONS_LAYOUT } from "@/config/examDomain";
import { choiceLetterFromIndex, stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import {
  examChoiceOptionItemClassName,
  examChoiceOptionItemStyle,
  examChoiceOptionsClassName,
  resolveExamChoiceOptionsLayout,
  type ExamChoiceOptionsLayoutContext,
} from "@/lib/examChoiceOptionsLayout.shared";
import { cn } from "@/lib/utils";

const ChoiceOptionsLayoutCtx = createContext<ExamChoiceOptionsLayoutContext>({
  shareRowWithFigure: false,
});

/** 由 ExamFigureChoicesRegion 注入：选项是否与附图同一行 */
export function ExamChoiceOptionsLayoutProvider({
  shareRowWithFigure,
  children,
}: {
  shareRowWithFigure: boolean;
  children: ReactNode;
}) {
  return (
    <ChoiceOptionsLayoutCtx.Provider value={{ shareRowWithFigure }}>
      {children}
    </ChoiceOptionsLayoutCtx.Provider>
  );
}

export type ExamChoiceOptionsListProps = {
  options: readonly string[];
  className?: string;
  /** 覆盖 Context；缺省读 Provider（无 Provider 时按无并排处理） */
  shareRowWithFigure?: boolean;
  /** 每选项附加内容（附图、缺图提示等） */
  renderOptionExtra?: (args: {
    index: number;
    letter: string;
    option: string;
  }) => ReactNode;
  onFigureDecodeFailed?: () => void;
};

/**
 * 卷面选择题选项列表：排版由选项正文 + 是否与附图并排自适应（配置见 exam-domain.json）。
 */
export function ExamChoiceOptionsList({
  options,
  className,
  shareRowWithFigure: shareRowProp,
  renderOptionExtra,
  onFigureDecodeFailed,
}: ExamChoiceOptionsListProps) {
  if (!options.length) return null;
  const ctx = useContext(ChoiceOptionsLayoutCtx);
  const shareRowWithFigure = shareRowProp ?? Boolean(ctx.shareRowWithFigure);
  const layout = resolveExamChoiceOptionsLayout(options, CHOICE_OPTIONS_LAYOUT, {
    shareRowWithFigure,
  });
  const distributeInline =
    !shareRowWithFigure &&
    layout === "inline" &&
    CHOICE_OPTIONS_LAYOUT.noBesideInlineDistribute;
  const gapRem = CHOICE_OPTIONS_LAYOUT.noBesideInlineGapRem;
  const style =
    layout === "inline" && !shareRowWithFigure
      ? ({
          columnGap: `${gapRem}rem`,
          rowGap: "0.5rem",
        } as const)
      : undefined;

  return (
    <div
      className={cn(
        examChoiceOptionsClassName(layout, { distributeInline, inlineGapRem: gapRem }),
        className,
      )}
      style={style}
      data-choice-layout={layout}
      data-choice-beside={shareRowWithFigure ? "1" : "0"}
    >
      {options.map((opt, idx) => {
        const letter = choiceLetterFromIndex(idx);
        return (
          <div
            key={idx}
            className={examChoiceOptionItemClassName(distributeInline)}
            style={examChoiceOptionItemStyle(distributeInline)}
          >
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{letter}.</span>
            <div className="min-w-0 [&_.prose]:max-w-none">
              <MathContent onFigureDecodeFailed={onFigureDecodeFailed}>
                {stripLeadingChoiceMarker(String(opt))}
              </MathContent>
              {renderOptionExtra?.({ index: idx, letter, option: String(opt) })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
