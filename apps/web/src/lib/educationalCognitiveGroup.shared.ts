/**
 * P2.4.1 ECGR — Educational Cognitive Grouping（reading structure，非 semantic AST 替代）。
 * P2.4.3 — 每组携带 {@link ReadingFlowSemanticsV1}（replayable derived）。
 */
import type {
  CompositionConstraintV1,
  EducationalDocumentAstV1,
  FigureNodeV1,
  SubquestionNodeV1,
} from "@/lib/educationalAst.shared";
import { compositionForAnchoredFigure, compositionForEnumeration } from "@/lib/educationalCompositionConstraint.shared";
import {
  buildReadingFlowSemantics,
  readingOrderFromSemantics,
  READING_FLOW_RUNTIME_ID,
} from "@/lib/readingFlowSemantics.shared";
import type { ReadingFlowSemanticsV1 } from "@/lib/readingFlowSemantics.shared";
import { segmentPlainText } from "@/lib/parseMathInlineNode.shared";

export const ECGR_VERSION = "ecgr-v1" as const;
export const ECGR_BUILDER_RUNTIME_ID = "ecgr_builder_v1" as const;

export type CognitiveGroupRoleV1 =
  | "stem_block"
  | "paragraph_block"
  | "section_preamble"
  | "subquestion_cluster"
  | "question_with_figure"
  | "standalone_figure";

export type ReadingFlowV1 = "vertical" | "question_figure_inline";

export type CognitiveGroupMemberV1 = SubquestionNodeV1 | FigureNodeV1;

export type CognitiveGroupV1 = {
  id: string;
  role: CognitiveGroupRoleV1;
  sectionLabel?: string;
  questionAnchor?: string;
  figureAnchor?: string;
  /** 认知流（非 CSS） */
  readingFlow: ReadingFlowV1;
  /** P2.4.3 阅读语义（compositor 主输入） */
  readingSemantics: ReadingFlowSemanticsV1;
  /** 与 readingSemantics.steps 对齐的 node id 序 */
  readingOrder: string[];
  members: CognitiveGroupMemberV1[];
  layoutHints: CompositionConstraintV1;
};

export type EducationalCognitiveLayoutV1 = {
  version: typeof ECGR_VERSION;
  builder_runtime: typeof ECGR_BUILDER_RUNTIME_ID;
  reading_flow_runtime: typeof READING_FLOW_RUNTIME_ID;
  /** immutable derived from AST（与 presentation 同律） */
  replay_mutation: "none";
  derived_from: "educational_document_ast_v1";
  groups: CognitiveGroupV1[];
};

function attachReadingSemantics(
  partial: Omit<CognitiveGroupV1, "readingSemantics" | "readingOrder"> & {
    readingSemantics?: ReadingFlowSemanticsV1;
  },
): CognitiveGroupV1 {
  const readingSemantics =
    partial.readingSemantics ??
    buildReadingFlowSemantics({
      role: partial.role,
      readingFlow: partial.readingFlow,
      members: partial.members,
      sectionLabel: partial.sectionLabel,
    });
  return {
    ...partial,
    readingSemantics,
    readingOrder: readingOrderFromSemantics(readingSemantics),
  };
}

function questionWithFigureGroup(
  sub: SubquestionNodeV1,
  fig: FigureNodeV1,
  sectionLabel: string,
  id: string,
): CognitiveGroupV1 {
  const groupId = sub.layoutHints?.cognitiveGroupId ?? `sec-${sectionLabel}-enum-${sub.label}`;
  const members: CognitiveGroupMemberV1[] = [sub, fig];
  return attachReadingSemantics({
    id,
    role: "question_with_figure",
    sectionLabel,
    questionAnchor: sub.label,
    figureAnchor: fig.label,
    readingFlow: "question_figure_inline",
    members,
    layoutHints: {
      ...compositionForEnumeration(sectionLabel, sub.label, { withFigure: true }),
      ...compositionForAnchoredFigure(groupId),
      preferInlinePlacement: true,
      keepWithFigure: true,
      keepWithNext: true,
      avoidBreakInside: true,
      readingPriority: 95,
    },
  });
}

function subquestionClusterGroup(
  sub: SubquestionNodeV1,
  sectionLabel: string,
  id: string,
): CognitiveGroupV1 {
  return attachReadingSemantics({
    id,
    role: "subquestion_cluster",
    sectionLabel,
    questionAnchor: sub.label,
    readingFlow: "vertical",
    members: [sub],
    layoutHints:
      sub.layoutHints ?? compositionForEnumeration(sectionLabel, sub.label, { withFigure: false }),
  });
}

function standaloneFigureGroup(fig: FigureNodeV1, sectionLabel: string, id: string): CognitiveGroupV1 {
  return attachReadingSemantics({
    id,
    role: "standalone_figure",
    sectionLabel,
    figureAnchor: fig.label,
    readingFlow: "vertical",
    members: [fig],
    layoutHints: fig.layoutHints ?? {
      cognitiveGroupId: `fig-${fig.id}`,
      avoidBreakInside: true,
    },
  });
}

function groupsFromSectionChildren(
  sectionLabel: string,
  children: Array<SubquestionNodeV1 | FigureNodeV1>,
  nextId: () => string,
): CognitiveGroupV1[] {
  const out: CognitiveGroupV1[] = [];
  let i = 0;
  while (i < children.length) {
    const child = children[i]!;
    if (child.type === "figure") {
      const next = children[i + 1];
      if (next?.type === "subquestion") {
        out.push(questionWithFigureGroup(next, child, sectionLabel, nextId()));
        i += 2;
        continue;
      }
      out.push(standaloneFigureGroup(child, sectionLabel, nextId()));
      i++;
      continue;
    }
    if (child.type === "subquestion") {
      const next = children[i + 1];
      if (
        next?.type === "figure" &&
        (next.anchor?.includes(child.label) ||
          next.placement === "inline_with_subquestion" ||
          child.segments.some((s) => /如图/.test(segmentPlainText(s))))
      ) {
        out.push(questionWithFigureGroup(child, next, sectionLabel, nextId()));
        i += 2;
        continue;
      }
      out.push(subquestionClusterGroup(child, sectionLabel, nextId()));
      i++;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * AST → 认知阅读组（唯一合法入口；renderer 禁止重建）。
 */
export function buildEducationalCognitiveGroups(
  ast: EducationalDocumentAstV1,
): EducationalCognitiveLayoutV1 {
  const groups: CognitiveGroupV1[] = [];
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `cg-${prefix}-${seq}`;
  };

  for (const node of ast.nodes) {
    if (node.type === "section") {
      if (node.segments.length > 0) {
        groups.push(
          attachReadingSemantics({
            id: nextId(`sec-${node.label}-preamble`),
            role: "section_preamble",
            sectionLabel: node.label,
            readingFlow: "vertical",
            members: [],
            layoutHints: {
              cognitiveGroupId: `sec-${node.label}-preamble`,
              readingPriority: 60,
            },
          }),
        );
      }
      groups.push(...groupsFromSectionChildren(node.label, node.children, () => nextId(node.label)));
      continue;
    }
    if (node.type === "question_stem") {
      groups.push(
        attachReadingSemantics({
          id: nextId("stem"),
          role: "stem_block",
          readingFlow: "vertical",
          members: [],
          layoutHints: { readingPriority: 100 },
        }),
      );
      continue;
    }
    if (node.type === "paragraph") {
      groups.push(
        attachReadingSemantics({
          id: nextId("para"),
          role: "paragraph_block",
          readingFlow: "vertical",
          members: [],
          layoutHints: { readingPriority: 50 },
        }),
      );
    }
  }

  return {
    version: ECGR_VERSION,
    builder_runtime: ECGR_BUILDER_RUNTIME_ID,
    reading_flow_runtime: READING_FLOW_RUNTIME_ID,
    replay_mutation: "none",
    derived_from: "educational_document_ast_v1",
    groups,
  };
}

export function cognitiveGroupsForSection(
  layout: EducationalCognitiveLayoutV1,
  sectionLabel: string,
): CognitiveGroupV1[] {
  return layout.groups.filter((g) => g.sectionLabel === sectionLabel);
}

export type { ReadingFlowSemanticsV1 } from "@/lib/readingFlowSemantics.shared";
