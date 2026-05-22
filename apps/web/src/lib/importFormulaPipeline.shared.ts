/**
 * 仓库内**默认**公式处理管线（不依赖 Texify/Mathpix 等外接 OCR）。
 * 外接引擎落地后可在同一入口串联异步识别，再回落到确定性规则。
 */
import { normalizeImportPipelineLatexResidue } from "@/lib/importLatexOcrNormalize.shared";

export function runDefaultImportFormulaPipelineInRepo(s: string): string {
  return normalizeImportPipelineLatexResidue(s);
}
