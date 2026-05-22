/**
 * 兼容旧 import 路径（非专规逻辑）。
 * @deprecated 请改用 `@/lib/importParentQuestionPaperAlignment.shared`
 */
export {
  alignImportedParentQuestionSnapshot,
  extractImportFiguresBatchIdFromSnapshot,
  hasImportParentQuestionTopology,
  isSingleMergedParentQuestionExam,
  looksLikeMisSplitParentQuestionExam,
  replaceNonAuthoritativeFigureUrlsInSnapshot,
  stripWholePageImportRasterWhenVectorPresent,
} from "../importParentQuestionPaperAlignment.shared";
