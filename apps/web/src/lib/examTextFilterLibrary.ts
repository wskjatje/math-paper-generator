/**
 * 试卷文本「过滤库」统一入口：卷面（MathContent）、Markdown 导出、文件下载
 * 共用同一套规范层 `applyExamTextCanonicalFilters`，再分岔为：
 * - 卷面：`sanitizeExamMathDisplay`（LaTeX → 可读符号等）
 * - 导出：`prepareExamTextForMarkdownExport`（保留数学公式 + Markdown  artifact 清理）
 *
 * 规则分层：
 * 0. `normalizeExamTextUnicodeNoise`（并入 `repairExamMathCanonicalSync` 首部：NBSP/ZWSP/全角空格等）
 * 1. `repairLatexJsonTabCorruption`（Tab/残串）
 * 2. `EXAM_MATH_BUILTIN_LIBRARY_RULES`（`examMathRepairLibrary.shared.ts`）
 * 3. 服务端/磁盘：`data/exam-math-repair-overrides.json`（仅入库与部分服务端流程）
 * 4. `stripExamUiNoiseForPlainExport`（UI 装饰）
 * 5. `collapseGluedDuplicateEquation` / `collapseDuplicateUnits` / `collapseAdjacentDuplicateRuns`
 * 6. 导出再加：`normalizeMarkdownExportArtifacts`
 *
 * 选择题选项字母与排版：`examChoiceOptions.shared.ts`（`choiceLetterFromIndex` / `stripLeadingChoiceMarker`），与数学替换链独立。
 */

export {
  choiceLetterFromIndex,
  stripLeadingChoiceMarker,
} from "@/lib/examChoiceOptions.shared";

export {
  applyExamTextCanonicalFilters,
  normalizeExamTextUnicodeNoise,
  normalizeMarkdownExportArtifacts,
  prepareExamTextForMarkdownExport,
  repairExamMathCanonicalSync,
  repairLatexJsonTabCorruption,
  repairSolutionStepsFromJsonCorruption,
  extractMarkdownFiguresOutOfDollarMath,
  sanitizeExamMathDisplay,
  stripExamUiNoiseForPlainExport,
} from "@/lib/sanitizeExamMathDisplay";

export { EXAM_MATH_BUILTIN_LIBRARY_RULES } from "@/lib/examMathRepairLibrary.shared";

/** 与 `applyExamTextCanonicalFilters` 内部顺序一致（文档用） */
export const EXAM_TEXT_CANONICAL_PIPELINE_STAGE_IDS = [
  "normalizeExamTextUnicodeNoise",
  "repairExamMathCanonicalSync",
  "stripExamUiNoiseForPlainExport",
  "collapseGluedDuplicateEquation",
  "collapseDuplicateUnits",
  "collapseAdjacentDuplicateRuns",
] as const;

export const EXAM_TEXT_MARKDOWN_EXPORT_TAIL_STAGE_IDS = ["normalizeMarkdownExportArtifacts"] as const;
