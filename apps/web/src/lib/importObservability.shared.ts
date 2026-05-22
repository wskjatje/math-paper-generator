/**
 * 导入可观测性：离散「降级/不可信原因」（工程事实与规则），与模型概率无关。
 * 供 `ImportChainV1`、`Question.import_quality` 共用，避免 types ↔ importParseQuality 循环依赖。
 */
export type ImportDegradationReason =
  | "layout_missing"
  | "layout_parse_failed"
  | "question_anchor_ambiguous"
  | "single_pass_fallback"
  | "section_parse_missing"
  | "missing_expected_raster"
  | "local_import_figure_missing"
  | "runtime_raster_decode_failed"
  | "diagram_schema_suppressed"
  /** P3-3：附图中心纵坐标落在多个题区重叠带内，几何规则已用「最近底边」消解，仍标记可观测 */
  | "figure_ownership_ambiguous"
  /** P3-3：附图几何中心落在所有 QuestionRegion 垂直区间之外（已用最近区间吸附） */
  | "figure_outside_question_regions"
  /** P3-3 PR3：卷级 rollup 判定附图挂接语义降级，且本题含持久化裁剪图 URL（策略输入，非逐图 mechanics） */
  | "figure_attach_semantics_degraded";

export type QuestionImportQualityV1 = {
  version: 1;
  degradation_reasons: ImportDegradationReason[];
};
