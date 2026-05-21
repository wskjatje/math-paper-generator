/**
 * EPL / ECM forbidden semantic APIs — executable anti-regression registry.
 * Consumed by check-epl-ast-contract.mjs (semantic governance, not style lint).
 *
 * severity:
 *   ERROR      — fail CI / exit 1
 *   WARN       — print; exit 1 only with --strict
 *   DEPRECATED — print migration hint; exit 0 unless --strict
 */

/** @typedef {"ERROR" | "WARN" | "DEPRECATED"} ForbiddenSeverity */
/** @typedef {"renderer" | "epl_consumer" | "presentation_lib" | "pdf_lowering" | "projection_lib"} ForbiddenScope */

/** @type {Record<ForbiddenScope, { dirs: string[] }>} */
export const FORBIDDEN_PRESENTATION_SCOPES = {
  /** 仅消费 AST；禁止 canonical 结构解析 */
  renderer: { dirs: ["src/components/education"] },
  /** 卷面 / 导入等 EPL 调用方：须经 buildEducationalRenderableDocument */
  epl_consumer: { dirs: ["src/routes", "src/components"] },
  /** presentation 库：允许 builder，禁止二次 parse 入口暴露给 UI */
  presentation_lib: { dirs: ["src/lib"] },
  /** PDF/export lowering：仅消费 ComposedEducationalDocumentV1 */
  /** 仅 export 路径；compose/paginate 工厂见 educationalPdfLowering.shared.ts（允许） */
  pdf_lowering: { dirs: ["src/lib/downloadExamPdf.ts"] },
  /** P3.3 — 工厂边界文件；lower* 函数禁止 cognition authority */
  projection_lib: { dirs: ["src/lib/educationalPdfLowering.shared.ts"] },
};

/**
 * @type {Array<{
 *   id: string;
 *   pattern: string;
 *   flags?: string;
 *   severity: ForbiddenSeverity;
 *   scopes: ForbiddenScope[];
 *   hint: string;
 *   rationale: string;
 *   adr: string;
 *   replacement: string;
 *   excludePathRe?: string;
 * }>}
 */
export const FORBIDDEN_PRESENTATION_APIS = [
  {
    id: "import-canonical-builder",
    pattern: "buildEducationalAstFromCanonical",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "violates_ast_render_contract",
    adr: "ADR-O16",
    replacement: "buildEducationalRenderableDocument({ canonicalText, exam?, question? })",
    hint: "renderer 禁止直接 canonical→AST",
  },
  {
    id: "prop-canonical-text",
    pattern: "canonicalText\\s*[:=]",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "violates_presentation_semantic_abi",
    adr: "ADR-O16",
    replacement: "document: EducationalRenderableDocumentV1",
    hint: "renderer 禁止 canonicalText prop",
  },
  {
    id: "insert-enumeration-breaks",
    pattern: "insertEnumerationLineBreaks",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "semantic_re_parsing_fork",
    adr: "ADR-O16",
    replacement: "消费 AST section / subquestion 节点",
    hint: "enumeration lowering 仅在 lib/buildEducationalAst*",
  },
  {
    id: "split-lines-structure",
    pattern: "\\.split\\s*\\(\\s*[\"']\\\\n[\"']\\s*\\)",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "semantic_re_parsing_fork",
    adr: "ADR-O16",
    replacement: "EducationalRenderableDocumentV1.ast.nodes",
    hint: "禁止在 renderer 按行拆 canonical 结构",
  },
  {
    id: "starts-with-section-heuristic",
    pattern: "startsWith\\s*\\(\\s*[\"'`]（[IV]",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "semantic_re_parsing_fork",
    adr: "ADR-O16",
    replacement: "node.type === \"section\"",
    hint: "禁止 startsWith 猜 section",
  },
  {
    id: "includes-enumeration-heuristic",
    pattern: "\\.includes\\s*\\(\\s*[\"'`]\\([IⅠⅡ]",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "presentation_heuristic_resurrection",
    adr: "ADR-O16",
    replacement: "AST section / subquestion nodes",
    hint: "禁止 includes('(I)') 猜小问",
  },
  {
    id: "figure-markdown-in-renderer",
    pattern: "!\\[[^\\]]*\\]\\(",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "figure_authority_must_be_ast",
    adr: "ADR-O16",
    replacement: "FigureNode from buildEducationalRenderableDocument",
    hint: "renderer 禁止解析 markdown 图",
  },
  {
    id: "parse-math-in-renderer",
    pattern: "parseMathInlineNode\\(|splitEducationalMathSegments\\(",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "math_lowering_outside_builder",
    adr: "ADR-O16",
    replacement: "MathInlineNode on AST segments",
    hint: "math parse 仅在 lib/build*",
  },
  {
    id: "consumer-direct-ast-builder",
    pattern: "buildEducationalAstFromCanonical",
    severity: "WARN",
    scopes: ["epl_consumer"],
    rationale: "bypass_presentation_boundary",
    adr: "ADR-O16",
    replacement: "buildEducationalRenderableDocument(...)",
    excludePathRe: "education/|educational",
    hint: "EPL 调用方请用 buildEducationalRenderableDocument",
  },
  {
    id: "legacy-parse-educational-document",
    pattern: "parseEducationalDocumentFromCanonical",
    severity: "DEPRECATED",
    scopes: ["epl_consumer"],
    rationale: "legacy_block_parser_resurrection",
    adr: "ADR-O16",
    replacement: "buildEducationalRenderableDocument(...)",
    excludePathRe: "\\.test\\.|educationalDocumentAst\\.shared",
    hint: "legacy block 解析已废弃",
  },
  {
    id: "nest-educational-in-consumer",
    pattern: "nestEducationalAstNodes",
    severity: "WARN",
    scopes: ["epl_consumer"],
    rationale: "ast_mutation_outside_builder",
    adr: "ADR-O16",
    replacement: "buildEducationalAstForQuestion (lib 边界)",
    hint: "AST nest 仅在 build 边界",
  },
  {
    id: "pdf-parse-canonical",
    pattern: "buildEducationalAstFromCanonical|parseEducationalDocumentFromCanonical",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_dual_cognition_runtime",
    adr: "ADR-O16",
    replacement: "composeEducationalDocumentForPdf(renderableDocument)",
    hint: "PDF 禁止 parse canonical",
  },
  {
    id: "pdf-rebuild-cognitive-groups",
    pattern: "buildEducationalCognitiveGroups\\(",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_dual_cognition_runtime",
    adr: "ADR-O16",
    replacement: "composeEducationalDocument(renderableDocument)",
    hint: "PDF 禁止 rebuild groups",
  },
  {
    id: "pdf-detect-figure-binding-heuristic",
    pattern: "detectFigureBinding|parseCanonical",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_heuristic_cognition_fork",
    adr: "ADR-O16",
    replacement: "composed.positioned_groups",
    hint: "PDF 禁止启发式 figure binding",
  },
  {
    id: "pdf-implicit-pagination",
    pattern: "paginateEducationalDocument|buildPaginatedDocumentForPdf|composeEducationalDocument",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_implicit_pagination_fork",
    adr: "ADR-O17",
    replacement: "lowerNegotiatedDocumentToPdfModel(negotiated) 仅消费上游冻结分页",
    hint: "downloadExamPdf 禁止内嵌 compose/paginate",
  },
  {
    id: "pdf-implicit-negotiation",
    pattern: "negotiatePhysicalPagination|buildNegotiatedDocumentForPdf",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_second_negotiation_authority",
    adr: "ADR-O17",
    replacement: "assertPdfLoweringInput(negotiated) + lowerNegotiatedDocumentToPdfModel",
    hint: "PDF export 禁止内嵌 negotiate；工厂仅在 educationalPdfLowering 边界",
  },
  {
    id: "pdf-heuristic-page-break",
    pattern: "remainingHeight|printableHeight|heightLeft\\s*>|imageHeight.*newPage|\\.addPage\\s*\\(",
    severity: "ERROR",
    scopes: ["pdf_lowering"],
    rationale: "pdf_renderer_cognition_authority",
    adr: "ADR-O18",
    replacement: "消费 NegotiatedPaginatedDocumentV1.physical_pages",
    hint: "禁止 raster/overflow 启发式分页；P3.3 迁至 negotiated projection",
  },
  {
    id: "renderer-implicit-negotiation",
    pattern: "negotiatePhysicalPagination|paginateEducationalDocument",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "medium_hidden_cognition_runtime",
    adr: "ADR-O18",
    replacement: "composeEducationalDocument only; negotiate 在 governance 管道",
    hint: "Web/mobile renderer 禁止 negotiate/paginate",
  },
  {
    id: "renderer-regroup-cognitive",
    pattern: "buildEducationalCognitiveGroups\\(|regroupCognitive|mergeCognitiveGroups|reorderFigure",
    severity: "ERROR",
    scopes: ["renderer"],
    rationale: "reinterpretation_drift_authority",
    adr: "ADR-O18",
    replacement: "消费 composed.positioned_groups",
    hint: "禁止 renderer 侧 regroup / figure reorder",
  },
  {
    id: "projection-lib-lowering-cognition",
    pattern:
      "negotiatePhysicalPagination\\s*\\(|paginateEducationalDocument\\s*\\(|composeEducationalDocument\\s*\\(",
    severity: "ERROR",
    scopes: ["projection_lib"],
    rationale: "projection_surface_dual_runtime",
    adr: "ADR-O18",
    replacement: "仅 buildNegotiatedDocumentForPdf 工厂允许；lower* 只读 negotiated",
    hint: "lowerNegotiatedDocumentToPdfModel 禁止 cognition",
  },
  {
    id: "projection-lib-heuristic-page",
    pattern: "remainingHeight|printableHeight|\\.addPage\\s*\\(|newPage\\s*\\(",
    severity: "ERROR",
    scopes: ["projection_lib"],
    rationale: "projection_heuristic_pagination",
    adr: "ADR-O18",
    replacement: "negotiated.physical_pages",
    hint: "projection adapter 禁止启发式分页",
  },
  {
    id: "projection-hidden-renegotiation",
    pattern:
      "repositionFigure|relocateFigure|reorderFigure|splitCognitive|hiddenDefer|defer_group_to_next|reinterpretContinuity",
    severity: "ERROR",
    scopes: ["projection_lib", "pdf_lowering"],
    rationale: "projection_completeness_not_authority",
    adr: "ADR-O18",
    replacement: "仅 typography/bezier/glyph；拓扑变更回 negotiate plane",
    hint: "裁切/避裁禁止演变为 hidden renegotiation",
  },
];
