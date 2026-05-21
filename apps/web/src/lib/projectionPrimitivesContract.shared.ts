/**
 * P3.3 — Projection primitives constitution（realization substrate；零 authority）。
 *
 * Primitives 不得长成 hidden negotiation runtime。
 */
export const PROJECTION_PRIMITIVES_CONTRACT_VERSION = "v1" as const;

/** 确定性 realization 原语（无 cognition 拓扑变更权） */
export const PROJECTION_PRIMITIVE_ALLOWED = [
  "baseline_solver",
  "glyph_packer",
  "glyph_placement",
  "vector_rasterizer",
  "line_box_realization",
  "bezier_emission",
  "deterministic_coordinates",
  "color_space_conversion",
  "canvas_batch_emit",
] as const;

/** primitives 层禁止（即 hidden negotiation / layout intelligence） */
export const PROJECTION_PRIMITIVE_FORBIDDEN = [
  "semantic_regroup",
  "adaptive_reorder",
  "hidden_figure_relocation",
  "cognition_aware_overflow",
  "implicit_defer",
  "split_question_cluster",
  "negotiatePhysicalPagination",
  "paginateEducationalDocument",
  "composeEducationalDocument",
] as const;

export const PROJECTION_PRIMITIVE_FORBIDDEN_RE = new RegExp(
  PROJECTION_PRIMITIVE_FORBIDDEN.join("|"),
);
