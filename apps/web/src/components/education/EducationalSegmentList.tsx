"use client";

import { MathContent } from "@/components/MathContent";
import { EducationalMathInlineRenderer } from "@/components/education/EducationalMathInlineRenderer";
import type { EducationalTextSegmentV1 } from "@/lib/educationalAst.shared";
import { isMathInlineNode } from "@/lib/educationalAst.shared";
import {
  segmentsToMathContentSource,
  segmentPlainText,
} from "@/lib/educationalAstMathSegments.shared";
import { cn } from "@/lib/utils";

type Props = {
  segments: EducationalTextSegmentV1[];
  labelPrefix?: string;
  className?: string;
  onFigureDecodeFailed?: () => void;
};

/** 须保留 math-native token 行（△/∠ 分词排版）的片段 */
function segmentNeedsNativeMathRenderer(s: EducationalTextSegmentV1): boolean {
  if (!isMathInlineNode(s)) return false;
  if (s.mathKind !== "geometry_triangle" && s.mathKind !== "geometry_angle") return false;
  return s.semanticTokens.length > 1;
}

/** 段落内容流：text + MathInlineNode（禁止 segments→markdown 拼接后二次 parse 几何 token） */
export function EducationalSegmentList({
  segments,
  labelPrefix,
  className,
  onFigureDecodeFailed,
}: Props) {
  const needsNative = segments.some(segmentNeedsNativeMathRenderer);

  if (!needsNative) {
    const body = segmentsToMathContentSource(segments);
    if (!body.trim() && !labelPrefix?.trim()) return null;
    return (
      <span className={cn("math-paper-segment-flow leading-[1.8]", className)}>
        {labelPrefix ? <span className="font-medium">{labelPrefix}</span> : null}
        {body.trim() ? (
          <MathContent inlineFlow onFigureDecodeFailed={onFigureDecodeFailed}>
            {body}
          </MathContent>
        ) : null}
      </span>
    );
  }

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
        const plain = segmentPlainText(s);
        if (!plain.trim()) return null;
        return (
          <MathContent
            key={`t-${i}`}
            inlineFlow
            onFigureDecodeFailed={onFigureDecodeFailed}
          >
            {plain}
          </MathContent>
        );
      })}
    </span>
  );
}
