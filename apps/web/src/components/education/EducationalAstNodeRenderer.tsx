"use client";

import { MathContent } from "@/components/MathContent";
import { EducationalFigureBlock } from "@/components/education/EducationalFigureBlock";
import { EducationalSegmentList } from "@/components/education/EducationalSegmentList";
import type { EducationalAstNodeV1 } from "@/lib/educationalAst.shared";
import { compositionClassNames } from "@/lib/educationalCompositionConstraint.shared";
import { segmentPlainText } from "@/lib/educationalAstMathSegments.shared";
import { cn } from "@/lib/utils";

function depthIndentClass(depth: 0 | 1 | 2, type: EducationalAstNodeV1["type"]): string {
  if (type === "figure") return "";
  if (depth === 1) return "";
  if (depth === 2) return "pl-6 sm:pl-8";
  return "";
}

type NodeRowProps = {
  node: EducationalAstNodeV1;
  onFigureDecodeFailed?: () => void;
  nested?: boolean;
};

/**
 * EPL renderer — 仅按 `node.type` 分支（禁止 startsWith 式第二套 heuristic）。
 */
export function EducationalAstNodeRenderer({
  node,
  onFigureDecodeFailed,
  nested = false,
}: NodeRowProps) {
  switch (node.type) {
    case "figure": {
      return (
        <EducationalFigureBlock
          label={node.label}
          src={node.src}
          alt={node.alt}
          layoutKind={node.layoutKind}
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
        <div
          className={cn(
            "math-paper-render-math-block my-2 rounded-md bg-muted/30 px-3 py-2",
            depthIndentClass(node.depth, node.type),
          )}
        >
          <MathContent onFigureDecodeFailed={onFigureDecodeFailed}>{node.latex}</MathContent>
        </div>
      );

    case "section": {
      const hasBody = node.segments.some((s) => segmentPlainText(s).trim());
      const hasChildren = node.children.length > 0;
      if (!hasBody && !hasChildren) return null;
      return (
        <section
          className={cn(
            "math-paper-render-section-group",
            !nested && "mt-4 first:mt-0",
            depthIndentClass(node.depth, node.type),
          )}
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
                "math-paper-render-section-children mt-2.5 space-y-3.5",
                "border-l-2 border-primary/20 pl-4 sm:pl-5",
              )}
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
            depthIndentClass(node.depth, node.type),
          )}
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
      return (
        <div className="math-paper-render-stem mb-3 border-b border-border/50 pb-3 text-[15px] leading-[1.85] tracking-[0.01em]">
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
        <div
          className={cn(
            "math-paper-render-paragraph text-[15px] leading-[1.8]",
            depthIndentClass(node.depth, node.type),
          )}
        >
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
