/**
 * 试卷详情卷面 chrome：调试 / 缺图提示显隐（表驱动，禁止按卷号分支）。
 */
import { EXAM_DETAIL_UI } from "@/config/examDomain";
import {
  shouldEmphasizeMissingOptionFigures,
  shouldShowMissingRasterCallout,
} from "@/lib/questionRendererPolicy.shared";
import type { Question } from "@/lib/types";
import type { QuestionRasterFigureRuntimeOpts } from "@/lib/examRasterFigureHints.shared";

export function examDetailForensicsEnabled(input: {
  source: string | undefined;
  figuresDebugSearch: boolean;
  isDev: boolean;
}): boolean {
  const cfg = EXAM_DETAIL_UI.forensicsAndFigureOwnership;
  if (cfg.requireImported && input.source !== "imported") return false;
  if (input.figuresDebugSearch) return true;
  if (cfg.enableInDevWithoutFlag && input.isDev) return true;
  return false;
}

export function examDetailShowOfflineImportFigureCrops(input: {
  hasMedia: boolean;
  figuresDebugSearch: boolean;
  isDev: boolean;
}): boolean {
  if (!input.hasMedia) return false;
  if (EXAM_DETAIL_UI.showOfflineImportFigureCrops) return true;
  return input.figuresDebugSearch || (EXAM_DETAIL_UI.forensicsAndFigureOwnership.enableInDevWithoutFlag && input.isDev);
}

export function examDetailShowImportParseBanner(enabledByRollup: boolean): boolean {
  return EXAM_DETAIL_UI.importParseBanner.enabled && enabledByRollup;
}

export function examDetailShowQuestionMissingRasterCallout(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (!EXAM_DETAIL_UI.missingFigureHints.showQuestionCallout) return false;
  return shouldShowMissingRasterCallout(q, runtime);
}

/** 题级缺图黄框已展示时，默认不再逐选项重复旁白（配置可开）。 */
export function examDetailShowPerOptionMissingFigureHint(
  q: Question,
  runtime?: QuestionRasterFigureRuntimeOpts,
): boolean {
  if (!EXAM_DETAIL_UI.missingFigureHints.showPerOptionMissing) return false;
  if (!shouldEmphasizeMissingOptionFigures(q, runtime)) return false;
  const callout = examDetailShowQuestionMissingRasterCallout(q, runtime);
  if (callout && !EXAM_DETAIL_UI.missingFigureHints.showPerOptionMissingWhenQuestionCallout) {
    return false;
  }
  return true;
}

export function examDetailAppendixLoadErrorLabel(): string {
  return EXAM_DETAIL_UI.missingFigureHints.appendixLoadErrorLabel;
}
