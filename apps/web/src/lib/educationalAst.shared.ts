/**
 * EPL Runtime — 显式 Educational AST schema（presentation derived；不写回 canonical）。
 *
 * Constitutional: `replay_mutation=none`；AST 仅由 frozen canonical text（+ 可选 registry）派生。
 */
import type { FigureRefScopeV1 } from "@/lib/figureOwnership.shared";

export const EPL_AST_SCHEMA_VERSION = "v1" as const;

export type FigureOwnershipKindV1 = "bound" | "inherited" | "markdown_fallback";
export const EPL_RUNTIME_ID = "educational_presentation_runtime_v1" as const;

export type FigurePlacementV1 =
  | "after_section"
  | "before_subquestion"
  | "inline_with_subquestion"
  | "end_fallback";

export type FigureLayoutKindV1 = "block" | "compact" | "inline";

/** P2.3.1 math-native cognition kinds */
export type MathKindV1 =
  | "geometry_triangle"
  | "geometry_angle"
  | "coordinate_expr"
  | "algebra_inline"
  | "radical_expr";

export type MathTypographyHintsV1 = {
  keepTogether?: boolean;
  tightTracking?: boolean;
  elevateSymbol?: boolean;
  compactRadical?: boolean;
  coordinateTight?: boolean;
};

/** P2.3.1 — 数学认知单元（非 markdown transport string） */
export type MathInlineNodeV1 = {
  kind: "math_inline";
  mathKind: MathKindV1;
  raw: string;
  latex: string;
  semanticTokens: string[];
  typographyHints: MathTypographyHintsV1;
};

export type EducationalTextSegmentV1 = { kind: "text"; value: string } | MathInlineNodeV1;

/** P2.4 — 认知流布局约束（Web/PDF/mobile 共享语义） */
export type CompositionConstraintV1 = {
  cognitiveGroupId?: string;
  keepWithNext?: boolean;
  avoidBreakInside?: boolean;
  keepWithFigure?: boolean;
  keepEnumerationTogether?: boolean;
  avoidMathBreak?: boolean;
  readingPriority?: number;
  preferInlinePlacement?: boolean;
  minReadableWidth?: number;
};

export type EducationalAstNodeBaseV1 = {
  id: string;
  depth: 0 | 1 | 2;
};

export type QuestionStemNodeV1 = EducationalAstNodeBaseV1 & {
  type: "question_stem";
  depth: 0;
  segments: EducationalTextSegmentV1[];
};

export type SectionNodeV1 = EducationalAstNodeBaseV1 & {
  type: "section";
  depth: 1;
  /** 语义标签（非显示串） */
  label: string;
  labelDisplay: string;
  segments: EducationalTextSegmentV1[];
  /** 嵌套小问 / 锚定图（compositor 树；非字符串换行） */
  children: Array<SubquestionNodeV1 | FigureNodeV1>;
};

export type SubquestionNodeV1 = EducationalAstNodeBaseV1 & {
  type: "subquestion";
  depth: 2;
  label: string;
  labelDisplay: string;
  segments: EducationalTextSegmentV1[];
  layoutHints?: CompositionConstraintV1;
};

export type ParagraphNodeV1 = EducationalAstNodeBaseV1 & {
  type: "paragraph";
  depth: 0;
  segments: EducationalTextSegmentV1[];
};

export type FigureNodeV1 = EducationalAstNodeBaseV1 & {
  type: "figure";
  label: string;
  src: string;
  alt?: string;
  placement: FigurePlacementV1;
  layoutKind: FigureLayoutKindV1;
  /** layout runtime 锚点（如 section-I / subquestion-①） */
  layoutAnchor: string;
  /** 语义锚定（enumeration:① / section:II） */
  anchor?: string;
  /** P2.2：卷级 figure_registry 主键（有则 src 以 registry 为准） */
  registryId?: string;
  ownership?: FigureOwnershipKindV1;
  topologyScope?: FigureRefScopeV1;
  layoutHints?: CompositionConstraintV1;
};

export type ForensicBannerNodeV1 = EducationalAstNodeBaseV1 & {
  type: "forensic_banner";
  depth: 0;
  segments: EducationalTextSegmentV1[];
};

export type MathBlockNodeV1 = EducationalAstNodeBaseV1 & {
  type: "math_block";
  latex: string;
};

export type EducationalAstNodeV1 =
  | QuestionStemNodeV1
  | SectionNodeV1
  | SubquestionNodeV1
  | ParagraphNodeV1
  | FigureNodeV1
  | MathBlockNodeV1
  | ForensicBannerNodeV1;

export type DerivedFromSubstratesV1 = {
  canonical_text: true;
  figure_registry?: boolean;
  topology_runtime?: boolean;
  authority_runtime?: boolean;
};

export type EducationalDocumentAstV1 = {
  version: typeof EPL_AST_SCHEMA_VERSION;
  runtime: typeof EPL_RUNTIME_ID;
  derived_from: "canonical_text" | "canonical_text+figure_registry";
  derived_from_substrates: DerivedFromSubstratesV1;
  replay_mutation: "none";
  nodes: EducationalAstNodeV1[];
};

export function isSectionNode(n: EducationalAstNodeV1): n is SectionNodeV1 {
  return n.type === "section";
}

export function isSubquestionNode(n: EducationalAstNodeV1): n is SubquestionNodeV1 {
  return n.type === "subquestion";
}

export function isFigureNode(n: EducationalAstNodeV1): n is FigureNodeV1 {
  return n.type === "figure";
}

export function isMathInlineNode(seg: EducationalTextSegmentV1): seg is MathInlineNodeV1 {
  return seg.kind === "math_inline";
}
