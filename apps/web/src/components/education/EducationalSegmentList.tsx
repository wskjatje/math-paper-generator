"use client";

import { EducationalMathInlineRenderer } from "@/components/education/EducationalMathInlineRenderer";
import type { EducationalTextSegmentV1 } from "@/lib/educationalAst.shared";
import { isMathInlineNode } from "@/lib/educationalAst.shared";
import { prettifyForEducationalRender } from "@/lib/educationalPresentationPrettify.shared";
import { repairPresentationMathLatex } from "@/lib/educationalPresentationMathRepair.shared";
import { cn } from "@/lib/utils";

type Props = {
  segments: EducationalTextSegmentV1[];
  labelPrefix?: string;
  className?: string;
  onFigureDecodeFailed?: () => void;
};

/** 段落内容流：text + MathInlineNode（禁止 segments→markdown 拼接） */
export function EducationalSegmentList({
  segments,
  labelPrefix,
  className,
  onFigureDecodeFailed,
}: Props) {
  return (
    <span className={cn("math-paper-segment-flow leading-[1.8]", className)}>
      {labelPrefix ? <span className="font-medium">{labelPrefix}</span> : null}
      {segments.map((s, i) => {
        if (isMathInlineNode(s)) {
          return (
            <EducationalMathInlineRenderer
              key={`m-${i}-${s.mathKind}`}
              node={s}
              onFigureDecodeFailed={onFigureDecodeFailed}
            />
          );
        }
        const plain = /\\frac|\\sqrt|\\backslash/.test(s.value)
          ? repairPresentationMathLatex(s.value)
          : prettifyForEducationalRender(s.value);
        return (
          <span key={`t-${i}`} className="math-paper-prose whitespace-pre-wrap">
            {plain}
          </span>
        );
      })}
    </span>
  );
}
