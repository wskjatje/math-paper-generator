/**
 * 从纠错后的块构建题目列表（规则版）；后续可由 Agent / LLM 替换。
 */
import type { NormalizedOcrBlock, StructuredExamOcrDocument } from "./types";

const Q_PATTERN = /(?:^|\n)\s*(?:\(|（)?(\d{1,2})(?:\)|）)?[.、]\s*/g;

export function buildQuestionsFromPlainText(
  plainText: string,
): StructuredExamOcrDocument["questions"] {
  const joined = plainText.trim();
  if (!joined) return [];

  const matches = [...joined.matchAll(Q_PATTERN)];
  if (!matches.length) return [];

  const questions: StructuredExamOcrDocument["questions"] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : joined.length;
    const stem = joined.slice(start, end).trim();
    const idx = m[1]!;
    questions.push({
      qid: `q-${idx}`,
      index: Number.parseInt(idx, 10),
      stem,
    });
  }
  return questions;
}

/** 若网关未返回 questions，则用正文再切一遍 */
export function buildQuestionStructure(doc: StructuredExamOcrDocument): StructuredExamOcrDocument {
  if (doc.questions.length > 0) return doc;
  const questions = buildQuestionsFromPlainText(doc.plainText);
  return { ...doc, questions };
}

/** 把公式块 LaTeX 串进题干预览（可选） */
export function mergeFormulaHints(blocks: NormalizedOcrBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.role === "formula" && b.formulaLatex) {
      lines.push(`$$${b.formulaLatex}$$`);
    } else if (b.text.trim()) {
      lines.push(b.text.trim());
    }
  }
  return lines.join("\n");
}
