/**
 * 导入 / LLM 整理卷的**确定性**清洗：题号尾污染、选项行尾 A B C D 等。
 * 不调用模型；读卷展示见 {@link deepRepairQuestionForDisplay}；入库前见 {@link sanitizeImportedSnapshotForPersist}。
 */

import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { shouldSuppressVectorDiagramSchemaForQuestion } from "@/lib/examRasterFigureHints.shared";
import { runDefaultImportFormulaPipelineInRepo } from "@/lib/importFormulaPipeline.shared";
import {
  materializeQuestionRasterFigures,
  stripNonResolvableMarkdownImagesFromText,
} from "@/lib/importRasterFigures.shared";
import { computeQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import type { Question } from "@/lib/types";
import {
  buildFigureMaterializationRollupBlock,
  type FigureMaterializationImportContextV1,
  type FigureMaterializationObservationalTextsV1,
} from "@/lib/figureMaterializationTelemetry.shared";
import {
  attachPerQuestionImportQualityFromRollup,
  computeImportParseQualityRollup,
  mergeFigureAttachQualityIntoRollup,
  mergeFigureArtifactProvenanceIntoRollup,
  mergeFigureLifecycleTimelinesIntoRollup,
  mergeFigureMaterializationIntoRollup,
  mergeImportChainIntoRollup,
  mergeOcrFrontendProvenanceIntoRollup,
  mergeTextCanonicalizationIntoRollup,
  mergeForensicRuntimeVersionsIntoRollup,
  mergeSemanticExecutionLineageIntoRollup,
  mergeParentQuestionTopologyIntoRollup,
  parseImportParseQualityRollup,
  type FigureAttachQualitySummaryV1,
  type ImportChainV1,
} from "@/lib/importParseQuality.shared";
import { applyImportedExamFigureOwnershipFromRaster } from "@/lib/figureOwnershipApply.shared";
import { applyDeterministicFigureLinkAppendPass } from "@/lib/figureOwnershipLinkerApply.shared";
import { attachOfflineImportPageFiguresIfMissing } from "@/lib/offlineImportFigureBackfill.shared";
import { expandImportedParentQuestionSnapshot } from "@/lib/importParentQuestionExpand.shared";
import { alignImportedParentQuestionSnapshot } from "@/lib/importParentQuestionPaperAlignment.shared";
import { applyImportStemFigureSupplyPolicy } from "@/lib/importStemFigureSupply.shared";
import type { EducationalTextCanonicalizationTraceV1 } from "@/lib/educationalTextCanonicalization.shared";
import type { OcrFrontendProvenanceV1 } from "@/lib/ocr/ocrFrontendAdapter.shared";
import type { ImportParentQuestionTopologyV1 } from "@/lib/importParentQuestionTopology.shared";
import { enrichImportParentQuestionTopologyAtPersist } from "@/lib/importParentQuestionTopology.shared";

/** 选项正文末尾误并入的阅读顺序尾噪（整段 A B C D） */
export function stripTrailingBareLetterRunFromOption(opt: string): string {
  return String(opt ?? "")
    .trim()
    .replace(/\s+[A-H](?:\s+[A-H]){3}\s*$/i, "")
    .trim();
}

/**
 * 题干末尾题号/栏标串场：如「…应为 (3)」「…是 第(1)题」「…主视图是（2）」等。
 * 仅处理**文末**；避免误删正文中的合法括号数字（保守：最多 2 位数字）。
 */
export function sanitizeImportedStemStructuralPollution(stem: string): string {
  let s = String(stem ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n*<<< 文件:[\s\S]*?>>>\s*/g, "\n")
    .replace(/^\s*<<< 文件:[\s\S]*?>>>\s*/m, "")
    .trim();
  for (let i = 0; i < 4; i++) {
    const next = s
      .replace(/\s*第\s*[（(]\s*\d{1,2}\s*[）)]\s*题\s*$/u, "")
      .replace(/\s*第[（(]\d{1,2}[）)]\s*题\s*$/u, "")
      .replace(/\s*[（(]\s*\d{1,2}\s*[）)]\s*$/u, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export function sanitizeImportedMcqOptionTails(
  options: string[] | null | undefined,
): string[] | null {
  if (!Array.isArray(options)) return options ?? null;
  return options.map((o) => stripTrailingBareLetterRunFromOption(String(o ?? "")));
}

/**
 * 单题入库前：题干/选项结构清洗 → 物化 raster_figures → 缺卷面图时剥 diagram_schema（与读卷展示策略一致）。
 */
export function sanitizeImportedQuestionForPersist(q: Question): Question {
  const optIn = Array.isArray(q.options) ? q.options.map((o) => String(o ?? "")) : null;
  const optsLeadStripped = optIn?.map((o) => stripLeadingChoiceMarker(o)) ?? null;
  const contentStripped = stripNonResolvableMarkdownImagesFromText(
    sanitizeImportedStemStructuralPollution(String(q.content ?? "")),
  );
  const contentNorm = runDefaultImportFormulaPipelineInRepo(contentStripped);
  const optionsNorm = (sanitizeImportedMcqOptionTails(optsLeadStripped) ?? q.options)?.map((o) =>
    runDefaultImportFormulaPipelineInRepo(
      stripNonResolvableMarkdownImagesFromText(String(o)),
    ),
  ) as Question["options"];
  const answerNorm = runDefaultImportFormulaPipelineInRepo(String(q.answer ?? ""));
  const stepsNorm = Array.isArray(q.solution_steps)
    ? q.solution_steps.map((step) => ({
        ...step,
        description: runDefaultImportFormulaPipelineInRepo(String(step.description ?? "")),
        reasoning:
          step.reasoning != null
            ? runDefaultImportFormulaPipelineInRepo(String(step.reasoning))
            : undefined,
        formula:
          step.formula != null
            ? runDefaultImportFormulaPipelineInRepo(String(step.formula))
            : undefined,
      }))
    : q.solution_steps;

  const cleaned: Question = {
    ...q,
    content: contentNorm,
    options: optionsNorm ?? q.options,
    answer: answerNorm,
    solution_steps: stepsNorm,
  };
  const withRaster = materializeQuestionRasterFigures(cleaned);
  const fd = computeQuestionFigureDependencyV1(withRaster);
  if (
    shouldSuppressVectorDiagramSchemaForQuestion(withRaster) &&
    withRaster.diagram_schema != null &&
    typeof withRaster.diagram_schema === "object"
  ) {
    const cleared = { ...withRaster, diagram_schema: null as null, figure_dependency: fd };
    return cleared;
  }
  return { ...withRaster, figure_dependency: fd };
}

/** 导入快照写入存储前统一清洗各题（线下/网上导入、JSON 快照入库共用）。 */
export function sanitizeImportedSnapshotForPersist(
  snap: SessionExamSnapshot,
  options?: {
    importChain?: ImportChainV1 | null;
    figureAttachQuality?: FigureAttachQualitySummaryV1 | null;
    figureMaterializationImportCtx?: FigureMaterializationImportContextV1 | null;
    ocrFrontendProvenance?: OcrFrontendProvenanceV1 | null;
    textCanonicalizationTrace?: EducationalTextCanonicalizationTraceV1 | null;
    parentQuestionTopology?: ImportParentQuestionTopologyV1 | null;
  },
): SessionExamSnapshot {
  const snapAligned = alignImportedParentQuestionSnapshot(snap);
  const snapExpanded = expandImportedParentQuestionSnapshot(snapAligned);
  const snapWithFigures = attachOfflineImportPageFiguresIfMissing(snapExpanded);
  const observationalByQuestionId = new Map<string, FigureMaterializationObservationalTextsV1>(
    snapWithFigures.questions.map((q) => [
      q.id,
      {
        content: String(q.content ?? ""),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o ?? "")) : null,
      },
    ]),
  );
  const questionsSanitized = snapWithFigures.questions.map(sanitizeImportedQuestionForPersist);
  const snapStemPolicy = applyImportStemFigureSupplyPolicy({
    ...snapWithFigures,
    questions: questionsSanitized,
  });
  let rollup = computeImportParseQualityRollup(snapStemPolicy.questions);
  rollup = mergeImportChainIntoRollup(rollup, options?.importChain ?? null);
  rollup = mergeFigureAttachQualityIntoRollup(
    rollup,
    options?.figureAttachQuality ?? null,
    snapStemPolicy.questions,
  );
  const topologyForRollup = options?.parentQuestionTopology
    ? enrichImportParentQuestionTopologyAtPersist(
        options.parentQuestionTopology,
        snapStemPolicy.questions,
      )
    : null;
  rollup = mergeParentQuestionTopologyIntoRollup(rollup, topologyForRollup);
  const questionsWithQuality = attachPerQuestionImportQualityFromRollup(
    snapStemPolicy.questions,
    rollup,
  );
  const examWithRollup = {
    ...snapStemPolicy.exam,
    import_parse_quality: rollup,
  };
  const withOwnership = applyDeterministicFigureLinkAppendPass(
    applyImportedExamFigureOwnershipFromRaster({
      ...snapStemPolicy,
      exam: examWithRollup,
      questions: questionsWithQuality,
    }),
  );
  const matBlock = buildFigureMaterializationRollupBlock(
    withOwnership.questions,
    withOwnership.exam,
    options?.figureMaterializationImportCtx ?? null,
    observationalByQuestionId,
  );
  let rollupFinal = mergeFigureMaterializationIntoRollup(
    parseImportParseQualityRollup(withOwnership.exam.import_parse_quality ?? null) ?? rollup,
    matBlock,
  );
  rollupFinal = mergeFigureLifecycleTimelinesIntoRollup(
    rollupFinal,
    withOwnership.questions,
    withOwnership.exam,
  );
  rollupFinal = mergeFigureArtifactProvenanceIntoRollup(
    rollupFinal,
    withOwnership.questions,
    withOwnership.exam,
  );
  rollupFinal = mergeOcrFrontendProvenanceIntoRollup(
    rollupFinal,
    options?.ocrFrontendProvenance ?? null,
  );
  rollupFinal = mergeTextCanonicalizationIntoRollup(
    rollupFinal,
    options?.textCanonicalizationTrace ?? null,
  );
  rollupFinal = mergeForensicRuntimeVersionsIntoRollup(rollupFinal);
  rollupFinal = mergeSemanticExecutionLineageIntoRollup(rollupFinal, withOwnership.exam.id);
  return {
    ...withOwnership,
    exam: { ...withOwnership.exam, import_parse_quality: rollupFinal },
  };
}
