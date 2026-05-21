/**
 * Educational Presentation Layer (EPL) — UI 边界：canonical → AST → renderable document。
 * Renderer 只消费 {@link EducationalRenderableDocumentV1}（见 ADR-O16 / P2.1）。
 */
import { buildEducationalAstForQuestion } from "@/lib/buildEducationalAstForQuestion.shared";
import type { BuildEducationalAstInputV1 } from "@/lib/buildEducationalAstForQuestion.shared";
import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
import {
  createEducationalRenderableDocument,
  type EducationalRenderableDocumentV1,
} from "@/lib/educationalRenderableDocument.shared";

export type { BuildEducationalAstInputV1, EducationalRenderableDocumentV1 };

/** UI / 卷面唯一合法 EPL 构建入口（含可选 registry 注入）。 */
export function buildEducationalRenderableDocument(
  input: BuildEducationalAstInputV1,
): EducationalRenderableDocumentV1 {
  const registryInputProvided = Boolean(input.exam && input.question);
  return createEducationalRenderableDocument(buildEducationalAstForQuestion(input), {
    registryInputProvided,
  });
}

export function shouldUseEducationalPresentation(
  content: string,
  opts?: { imported?: boolean },
): boolean {
  const t = String(content ?? "").trim();
  if (t.length < 80) return false;

  const hasHierarchy =
    /（[IVⅠⅡ]+）/.test(t) ||
    /^[①②③④⑤⑥⑦⑧⑨]/m.test(t) ||
    /[（(]\s*[12]\s*[）)]\s*(填空|将|如图)/m.test(t);
  const hasFigureCue = /图[①②]/.test(t);
  const imported = opts?.imported === true;

  if (imported && (hasHierarchy || (hasFigureCue && t.length > 160))) return true;
  if (hasHierarchy && hasFigureCue) return true;

  const ast = buildEducationalAstFromCanonical(t);
  return ast.nodes.filter((n) => n.type !== "figure" || n.placement !== "end_fallback").length >= 2;
}

/** @deprecated 请使用 buildEducationalRenderableDocument */
export function buildEducationalDocumentForPresentation(
  content: string,
): EducationalDocumentAstV1 {
  return buildEducationalAstForQuestion({ canonicalText: content });
}
