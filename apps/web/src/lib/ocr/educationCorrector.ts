/**
 * 教育场景 OCR 纠错：复用线下卷 normalize 规则，并按块细化。
 * 后续可接云端纠错模型，接口保持不变。
 */
import { normalizeMathExamOcrText } from "@/lib/offlineExamOcrNormalize.shared";
import {
  dropCoordinatePlaneOcrGibberishLines,
  lineLooksLikeCoordinatePlaneOcrGibberish,
  stemLooksLikeCoordinatePlaneExam,
} from "@/lib/offlineExamCoordinateOcrNormalize.shared";

import { applyEducationSymbolLexicon } from "./educationSymbolLexicon";
import type { StructuredExamOcrDocument } from "./types";

function sanitizeGatewayOcrBlockText(text: string): string {
  const lex = applyEducationSymbolLexicon(text);
  const normalized = normalizeMathExamOcrText(lex);
  if (lineLooksLikeCoordinatePlaneOcrGibberish(normalized)) return "";
  if (!stemLooksLikeCoordinatePlaneExam(normalized)) return normalized;
  return dropCoordinatePlaneOcrGibberishLines(
    normalized
      .split(/\r?\n/)
      .filter((line) => !lineLooksLikeCoordinatePlaneOcrGibberish(line))
      .join("\n"),
  );
}

export function correctEducationOcr(doc: StructuredExamOcrDocument): StructuredExamOcrDocument {
  const blocks = doc.blocks.map((b) => {
    if (b.role === "diagram") return b;
    const text = sanitizeGatewayOcrBlockText(b.text);
    const formulaLatex =
      b.formulaLatex && b.role === "formula" ? b.formulaLatex.trim() : b.formulaLatex;
    return { ...b, text, formulaLatex };
  });

  const plainFromBlocks = blocks
    .filter((b) => b.role !== "diagram" && b.text.trim())
    .map((b) => b.text.trim())
    .join("\n");

  const correctedBlocksPlain = normalizeMathExamOcrText(plainFromBlocks);
  const beforeLen = doc.plainText.replace(/\s+/g, "").length;
  const afterLen = correctedBlocksPlain.replace(/\s+/g, "").length;
  const plainText =
    afterLen === 0
      ? doc.plainText
      : beforeLen > 40 && afterLen < Math.max(30, Math.floor(beforeLen * 0.2))
        ? normalizeMathExamOcrText(applyEducationSymbolLexicon(doc.plainText))
        : correctedBlocksPlain;

  const questions = doc.questions.map((q) => ({
    ...q,
    stem: sanitizeGatewayOcrBlockText(q.stem),
  }));

  return { ...doc, blocks, plainText, questions };
}
