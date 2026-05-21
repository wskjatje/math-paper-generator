"use client";

import { MathContent } from "@/components/MathContent";
import type { MathInlineNodeV1, MathKindV1 } from "@/lib/educationalAst.shared";
import { cn } from "@/lib/utils";

const KIND_CLASS: Record<MathKindV1, string> = {
  geometry_triangle: "math-paper-unit math-paper-geometry-triangle",
  geometry_angle: "math-paper-unit math-paper-geometry-angle",
  coordinate_expr: "math-paper-unit math-paper-coordinate-expr",
  algebra_inline: "math-paper-unit math-paper-algebra-inline",
  radical_expr: "math-paper-unit math-paper-radical-expr",
};

type Props = {
  node: MathInlineNodeV1;
  onFigureDecodeFailed?: () => void;
};

/**
 * P2.3.1 — math-native typography runtime（消费 MathInlineNode，不拼 markdown）。
 */
export function EducationalMathInlineRenderer({ node, onFigureDecodeFailed }: Props) {
  const h = node.typographyHints;
  const showTokens =
    node.mathKind === "geometry_triangle" ||
    node.mathKind === "geometry_angle" ||
    node.mathKind === "coordinate_expr";

  return (
    <span
      className={cn(
        KIND_CLASS[node.mathKind],
        h.keepTogether && "math-paper-keep-together",
        h.tightTracking && "math-paper-tight-tracking",
        h.elevateSymbol && "math-paper-elevate-symbol",
        h.compactRadical && "math-paper-compact-radical",
        h.coordinateTight && "math-paper-coordinate-tight",
      )}
      data-math-kind={node.mathKind}
    >
      {showTokens && node.semanticTokens.length > 1 ? (
        <span className="math-paper-token-row" aria-label={node.raw}>
          {node.semanticTokens.map((tok, i) => (
            <span
              key={`${node.mathKind}-${i}-${tok}`}
              className={cn(
                "math-paper-token",
                i === 0 && (node.mathKind === "geometry_triangle" || node.mathKind === "geometry_angle")
                  ? "math-paper-token-symbol"
                  : "math-paper-token-ident",
              )}
            >
              {tok}
            </span>
          ))}
        </span>
      ) : (
        <MathContent
          className="inline prose-p:my-0 prose-p:leading-[1.35] text-[1em]"
          onFigureDecodeFailed={onFigureDecodeFailed}
        >
          {node.latex}
        </MathContent>
      )}
    </span>
  );
}
