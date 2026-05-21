/**
 * ADR-O18 — Projection purity executable contract（Completeness ≠ Authority）。
 */
export const PROJECTION_PURITY_CONTRACT_VERSION = "v1" as const;

/** lowering 允许：媒介/字形/几何投影（不改动 cognition 拓扑） */
export const PROJECTION_ALLOWED_CAPABILITIES = [
  "typography",
  "glyph_placement",
  "baseline_alignment",
  "bezier_paths",
  "vectorization",
  "canvas_batching",
  "color_space_conversion",
  "deterministic_coordinates",
] as const;

/** lowering 禁止：reinterpretation / hidden renegotiation（constitutional mutation） */
export const PROJECTION_FORBIDDEN_AUTHORITY_PATTERNS = [
  "negotiatePhysicalPagination",
  "paginateEducationalDocument",
  "composeEducationalDocument",
  "buildEducationalCognitiveGroups",
  "regroupCognitive",
  "mergeCognitiveGroups",
  "reorderFigure",
  "repositionFigure",
  "relocateFigure",
  "splitCognitive",
  "split_question_cluster",
  "defer_group",
  "hiddenDefer",
  "reinterpretContinuity",
] as const;

export const PROJECTION_FORBIDDEN_AUTHORITY_RE = new RegExp(
  PROJECTION_FORBIDDEN_AUTHORITY_PATTERNS.join("|"),
);

export const PROJECTION_HEURISTIC_PAGINATION_RE =
  /remainingHeight|printableHeight|heightLeft\s*>|\.addPage\s*\(|newPage\s*\(/;

/** 文档化原则（非 runtime 字符串匹配 truth） */
export const PROJECTION_COMPLETENESS_NOT_AUTHORITY =
  "Projection Completeness ≠ Projection Authority" as const;
