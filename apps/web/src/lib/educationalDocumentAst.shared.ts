/**
 * @deprecated 请使用 {@link buildEducationalAstFromCanonical} + `EducationalDocumentAstV1`。
 * 本模块保留 legacy block 形状供旧测试/调用方过渡。
 */
import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
import { prettifyForEducationalRender } from "@/lib/educationalPresentationPrettify.shared";
import { segmentPlainText } from "@/lib/parseMathInlineNode.shared";

export { insertEnumerationLineBreaks } from "@/lib/buildEducationalAstFromCanonical.shared";

export const EDUCATIONAL_DOCUMENT_AST_VERSION = 1 as const;

export type EducationalBlockKindV1 =
  | "stem"
  | "section"
  | "subpart"
  | "paragraph"
  | "figure"
  | "figure_labels";

export type EducationalDocumentBlockV1 = {
  kind: EducationalBlockKindV1;
  depth: 0 | 1 | 2;
  label?: string;
  text: string;
  figureSrc?: string;
  figureAlt?: string;
};

export type EducationalDocumentV1 = {
  version: typeof EDUCATIONAL_DOCUMENT_AST_VERSION;
  blocks: EducationalDocumentBlockV1[];
};

function astNodeToLegacyBlock(node: EducationalDocumentAstV1["nodes"][number]): EducationalDocumentBlockV1[] {
  if (node.type === "section") {
    const head: EducationalDocumentBlockV1 = {
      kind: "section",
      depth: node.depth,
      label: node.labelDisplay,
      text: node.segments.map((s) => s.value).join(""),
    };
    const nested = node.children.flatMap((c) => astNodeToLegacyBlock(c));
    return [head, ...nested];
  }
  if (node.type === "figure") {
    return [
      {
        kind: "figure",
        depth: node.depth,
        label: node.label,
        text: node.label,
        figureSrc: node.src,
        figureAlt: node.alt,
      },
    ];
  }
  if (node.type === "math_block") {
    return [{ kind: "paragraph", depth: node.depth, text: node.latex }];
  }
  if (node.type === "forensic_banner") {
    return [];
  }
  const text =
    node.type === "section"
      ? `${node.labelDisplay} ${node.segments.map((s) => segmentPlainText(s)).join("")}`
      : node.type === "subquestion"
        ? `${node.labelDisplay} ${node.segments.map((s) => segmentPlainText(s)).join("")}`
        : node.segments.map((s) => segmentPlainText(s)).join("");
  const kind =
    node.type === "section"
      ? "section"
      : node.type === "subquestion"
        ? "subpart"
        : node.type === "question_stem"
          ? "stem"
          : "paragraph";
  return [
    {
      kind,
      depth: node.depth,
      label: "labelDisplay" in node ? node.labelDisplay : undefined,
      text,
    },
  ];
}

export function parseEducationalDocumentFromCanonical(
  canonicalText: string,
): EducationalDocumentV1 {
  const ast = buildEducationalAstFromCanonical(canonicalText);
  const blocks = ast.nodes.flatMap(astNodeToLegacyBlock);
  return { version: EDUCATIONAL_DOCUMENT_AST_VERSION, blocks };
}

export function renderBlockText(block: EducationalDocumentBlockV1): string {
  const prefix =
    block.label && block.kind !== "paragraph" && block.kind !== "stem"
      ? `${block.label} `
      : "";
  return prettifyForEducationalRender(`${prefix}${block.text}`.trim());
}

export type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
export { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
