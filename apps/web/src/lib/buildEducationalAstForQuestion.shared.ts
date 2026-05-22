/**
 * EPL 边界：canonical (+ 可选 exam/question) → AST。
 * 全仓库唯一允许在 UI 之前做 canonical 结构 lowering 的聚合入口之一。
 */
import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
import { runEducationalTextCanonicalization } from "@/lib/educationalTextCanonicalization.shared";
import { injectRegistryFiguresIntoEducationalAst } from "@/lib/injectRegistryFiguresIntoEducationalAst.shared";
import { resolveFigureResources } from "@/lib/resolveFigureResources.shared";
import type { Exam, Question } from "@/lib/types";

export type BuildEducationalAstInputV1 = {
  canonicalText: string;
  exam?: Pick<Exam, "source" | "figure_registry">;
  question?: Pick<Question, "figure_refs" | "id">;
};

/**
 * 由 frozen canonical 构建 AST；若提供 exam + question 则注入 figure_registry（P2.2）。
 */
export function buildEducationalAstForQuestion(
  input: BuildEducationalAstInputV1,
): EducationalDocumentAstV1 {
  let canonicalText = String(input.canonicalText ?? "");
  if (input.exam?.source === "imported" && canonicalText.replace(/\s+/g, "").length >= 20) {
    canonicalText = runEducationalTextCanonicalization(canonicalText).text;
  }
  const ast = buildEducationalAstFromCanonical(canonicalText);
  if (!input.exam || !input.question) return ast;

  const resolved = resolveFigureResources(
    input.question as Question,
    input.exam,
  );
  return injectRegistryFiguresIntoEducationalAst(ast, resolved);
}
