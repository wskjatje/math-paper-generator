"use client";

import type { CSSProperties } from "react";
import { MathContent } from "@/components/MathContent";
import { EducationalFigureBlock } from "@/components/education/EducationalFigureBlock";
import { EducationalSegmentList } from "@/components/education/EducationalSegmentList";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import type { EducationalAstNodeV1 } from "@/lib/educationalAst.shared";
import {
  packingHintForFigure,
  type CognitivePackingRuntimeV1,
} from "@/lib/cognitivePackingRuntime.shared";
import type { FigureCognitiveSemanticsRuntimeV1 } from "@/lib/figureCognitiveSemantics.shared";
import { figureSemanticsById } from "@/lib/figureCognitiveSemantics.shared";
import { compositionClassNames } from "@/lib/educationalCompositionConstraint.shared";
import { segmentPlainText } from "@/lib/educationalAstMathSegments.shared";
import { cn } from "@/lib/utils";

/** 小问统一左缩进：读 paperSurfaceLayout.subquestionIndentRem，禁止 depth/cluster 叠 Tailwind pl-* */
function subquestionIndentStyle(
  type: EducationalAstNodeV1["type"],
): CSSProperties | undefined {
  if (type !== "subquestion") return undefined;
  const rem = PAPER_SURFACE_LAYOUT.subquestionIndentRem;
  if (!(rem > 0)) return undefined;
  return { paddingLeft: `${rem}rem` };
}

type NodeRowProps = {
  node: EducationalAstNodeV1;
  figureSemantics?: FigureCognitiveSemanticsRuntimeV1;
  cognitivePacking?: CognitivePackingRuntimeV1;
  showPackingDebug?: boolean;
  onFigureDecodeFailed?: () => void;
  nested?: boolean;
};

/**
 * EPL renderer — 仅按 `node.type` 分支（禁止 startsWith 式第二套 heuristic）。
 */
export function EducationalAstNodeRenderer({
  node,
  figureSemantics,
  cognitivePacking,
  showPackingDebug,
  onFigureDecodeFailed,
  nested = false,
}: NodeRowProps) {
  switch (node.type) {
    case "figure": {
      const sem = figureSemantics ? figureSemanticsById(figureSemantics).get(node.id) : undefined;
      const packing = packingHintForFigure(cognitivePacking, node.id);
      return (
        <EducationalFigureBlock
          label={node.label}
          src={node.src}
          alt={node.alt}
          layoutKind={node.layoutKind}
          cognitiveRole={sem?.role}
          projectionModulation={sem?.modulation}
          packingHint={packing}
          showPackingDebug={showPackingDebug}
          className={cn(
            compositionClassNames(node.layoutHints),
            node.layoutKind === "compact" && "my-2",
            node.placement === "inline_with_subquestion" &&
              "sm:float-right sm:ml-4 sm:max-w-[min(42%,280px)]",
          )}
          onFigureDecodeFailed={onFigureDecodeFailed}
        />
      );
    }

    case "math_block":
      return (
        <div className="math-paper-render-math-block my-2 rounded-md bg-muted/30 px-3 py-2">
          <MathContent onFigureDecodeFailed={onFigureDecodeFailed}>{node.latex}</MathContent>
        </div>
      );

    case "section": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      const hasChildren = node.children.length > 0;
      if (!hasBody && !hasChildren) return null;
      return (
        <section
          className={cn("math-paper-render-section-group", !nested && "mt-4 first:mt-0")}
        >
          {hasBody ? (
            <div className="math-paper-render-section text-[15px] font-medium leading-[1.8] tracking-[0.01em]">
              <EducationalSegmentList
                segments={node.segments}
                labelPrefix={`${node.labelDisplay} `}
                onFigureDecodeFailed={onFigureDecodeFailed}
              />
            </div>
          ) : null}
          {hasChildren ? (
            <div
              className={cn(
                "math-paper-render-section-children mt-2 flex flex-col",
                "border-l-2 border-primary/20 pl-4 sm:pl-5",
              )}
              style={
                {
                  gap: `${PAPER_SURFACE_LAYOUT.eplBlockStackGapRem}rem`,
                } satisfies CSSProperties
              }
            >
              {node.children.map((child) => (
                <EducationalAstNodeRenderer
                  key={child.id}
                  node={child}
                  nested
                  onFigureDecodeFailed={onFigureDecodeFailed}
                />
              ))}
            </div>
          ) : null}
        </section>
      );
    }

    case "subquestion": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      if (!hasBody) return null;
      return (
        <div
          className={cn(
            "math-paper-render-subquestion clear-both text-[14.5px] leading-[1.8] tracking-[0.01em]",
            compositionClassNames(node.layoutHints),
          )}
          style={subquestionIndentStyle(node.type)}
          data-cognitive-group={node.layoutHints?.cognitiveGroupId}
        >
          <EducationalSegmentList
            segments={node.segments}
            labelPrefix={`${node.labelDisplay} `}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        </div>
      );
    }

    case "question_stem": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      if (!hasBody) return null;
      const gapRem = PAPER_SURFACE_LAYOUT.stemToSubquestionGapRem;
      return (
        <div
          className={cn(
            "math-paper-render-stem text-[15px] leading-[1.85] tracking-[0.01em]",
            PAPER_SURFACE_LAYOUT.stemShowBottomBorder && "border-b border-border/50",
          )}
          style={{
            marginBottom: `${gapRem}rem`,
            paddingBottom: PAPER_SURFACE_LAYOUT.stemShowBottomBorder ? `${gapRem}rem` : 0,
          }}
        >
          <EducationalSegmentList
            segments={node.segments}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        </div>
      );
    }

    case "forensic_banner": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      if (!hasBody) return null;
      return (
        <div className="math-paper-render-forensic text-xs text-muted-foreground/90 font-mono leading-relaxed">
          <EducationalSegmentList
            segments={node.segments}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        </div>
      );
    }

    case "paragraph": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      if (!hasBody) return null;
      return (
        <div className="math-paper-render-paragraph text-[15px] leading-[1.8]">
          <EducationalSegmentList
            segments={node.segments}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        </div>
      );
    }

    default:
      return null;
  }
}
