/**
 * Phase 1 — Device-independent Educational Composition Runtime (ECR lowering ABI).
 *
 * Web / PDF / Print 均为 lowering target；禁止在本模块 parse canonical 或 rebuild AST。
 */
import type { CompositionConstraintV1, SectionNodeV1 } from "@/lib/educationalAst.shared";
import { EPL_RUNTIME_ID } from "@/lib/educationalAst.shared";
import type { CognitiveGroupV1, EducationalCognitiveLayoutV1 } from "@/lib/educationalCognitiveGroup.shared";
import { cognitiveGroupsForSection } from "@/lib/educationalCognitiveGroup.shared";
import type { EducationalRenderableDocumentV1 } from "@/lib/educationalRenderableDocument.shared";
import { compositionClassNames } from "@/lib/educationalCompositionConstraint.shared";
import type {
  AdaptivePresentationV1,
  ReadingFlowSemanticsV1,
  ReadingStepV1,
} from "@/lib/readingFlowSemantics.shared";

export const COMPOSITION_RUNTIME_VERSION = "composition_runtime_v1" as const;

/** Viewport profile → effective adaptivePresentation（cognition-preserving lowering） */
export type CompositionViewportProfileV1 =
  | "desktop_paper"
  | "mobile_vertical"
  | "pdf_a4"
  | "pdf_exam_booklet";

export type CompositionDiagnosticCodeV1 =
  | "PRESENTATION_PROFILE_OVERRIDE"
  | "MOBILE_INLINE_COLLAPSED_TO_STACK"
  | "PDF_BOOKLET_STACKED_QWF"
  | "MISSING_SECTION_FOR_GROUP";

export type CompositionDiagnosticV1 = {
  code: CompositionDiagnosticCodeV1;
  groupId?: string;
  message: string;
};

export type ComposedGroupPositionV1 = {
  groupId: string;
  sectionLabel: string;
  role: CognitiveGroupV1["role"];
  readingOrder: number;
  /** Frozen reading truth（来自 cognitive_layout） */
  cognitiveGroup: CognitiveGroupV1;
  /** Profile-resolved visual lowering */
  effectiveAdaptivePresentation: AdaptivePresentationV1;
  flowSteps: ReadingStepV1[];
  compositionConstraint: CompositionConstraintV1;
  compositionClassNames: string;
};

export type ComposedSectionFlowV1 = {
  sectionId: string;
  sectionLabel: string;
  preambleGroupId?: string;
  bodyGroupIds: string[];
};

/** Phase 2 由 pagination runtime 填充 */
export type ComposedPageSlotV1 = {
  pageIndex: number;
  groupIds: string[];
};

export type ComposedEducationalDocumentV1 = {
  version: typeof COMPOSITION_RUNTIME_VERSION;
  replay_mutation: "none";
  derived_from: "educational_renderable_document_v1";
  viewport_profile: CompositionViewportProfileV1;
  source_runtime: typeof EPL_RUNTIME_ID;
  cognitive_layout_version: EducationalCognitiveLayoutV1["version"];
  sections: ComposedSectionFlowV1[];
  flows: ComposedSectionFlowV1[];
  positioned_groups: ComposedGroupPositionV1[];
  pages: ComposedPageSlotV1[];
  composition_diagnostics: CompositionDiagnosticV1[];
};

export type ComposeEducationalDocumentOptsV1 = {
  viewportProfile?: CompositionViewportProfileV1;
};

export function resolveEffectiveAdaptivePresentation(
  semantics: ReadingFlowSemanticsV1,
  profile: CompositionViewportProfileV1,
): { effective: AdaptivePresentationV1; diagnostics: CompositionDiagnosticV1[] } {
  const diagnostics: CompositionDiagnosticV1[] = [];
  const desired = semantics.adaptivePresentation;

  if (profile === "mobile_vertical" && desired === "inline_figure_right") {
    diagnostics.push({
      code: "MOBILE_INLINE_COLLAPSED_TO_STACK",
      message: "mobile_vertical: inline_figure_right → stacked_vertical (cognition-preserving)",
    });
    return { effective: "stacked_vertical", diagnostics };
  }

  if (profile === "pdf_exam_booklet" && desired === "inline_figure_right") {
    diagnostics.push({
      code: "PDF_BOOKLET_STACKED_QWF",
      message: "pdf_exam_booklet: inline_figure_right → stacked_vertical",
    });
    return { effective: "stacked_vertical", diagnostics };
  }

  if (profile !== "desktop_paper" && desired !== semantics.adaptivePresentation) {
    /* unreachable */
  }

  if (profile === "pdf_a4" || profile === "desktop_paper") {
    return { effective: desired, diagnostics };
  }

  if (desired !== semantics.adaptivePresentation) {
    diagnostics.push({
      code: "PRESENTATION_PROFILE_OVERRIDE",
      message: `profile ${profile} kept ${desired}`,
    });
  }
  return { effective: desired, diagnostics };
}

function constraintForGroup(group: CognitiveGroupV1): CompositionConstraintV1 {
  const hint = group.layoutHints;
  return {
    cognitiveGroupId: group.id,
    keepWithNext: hint.keepWithFigure ?? group.role === "question_with_figure",
    avoidBreakInside: true,
    keepWithFigure: hint.keepWithFigure,
    readingPriority: group.readingSemantics.attentionPriority,
    keepEnumerationTogether: group.role === "subquestion_cluster",
    avoidMathBreak: true,
  };
}

/**
 * Device-independent composition：唯一合法输入为 Presentation Semantic ABI。
 */
export function composeEducationalDocument(
  document: EducationalRenderableDocumentV1,
  opts?: ComposeEducationalDocumentOptsV1,
): ComposedEducationalDocumentV1 {
  if (document.ast.replay_mutation !== "none") {
    throw new Error("EPL: compose requires ast.replay_mutation=none");
  }
  const profile = opts?.viewportProfile ?? "desktop_paper";
  const layout = document.cognitive_layout;
  const diagnostics: CompositionDiagnosticV1[] = [];
  const positioned_groups: ComposedGroupPositionV1[] = [];
  let readingOrder = 0;

  for (const group of layout.groups) {
    const { effective, diagnostics: d } = resolveEffectiveAdaptivePresentation(
      group.readingSemantics,
      profile,
    );
    for (const diag of d) {
      diagnostics.push({ ...diag, groupId: group.id });
    }
    positioned_groups.push({
      groupId: group.id,
      sectionLabel: group.sectionLabel,
      role: group.role,
      readingOrder: readingOrder++,
      cognitiveGroup: group,
      effectiveAdaptivePresentation: effective,
      flowSteps: group.readingSemantics.steps,
      compositionConstraint: constraintForGroup(group),
      compositionClassNames: compositionClassNames(constraintForGroup(group)),
    });
  }

  const sections: ComposedSectionFlowV1[] = [];
  const sectionNodes = document.ast.nodes.filter((n) => n.type === "section");
  for (const section of sectionNodes) {
    if (section.type !== "section") continue;
    const groups = cognitiveGroupsForSection(layout, section.label);
    const preamble = groups.find((g) => g.role === "section_preamble");
    const body = groups.filter((g) => g.role !== "section_preamble");
    sections.push({
      sectionId: section.id,
      sectionLabel: section.label,
      preambleGroupId: preamble?.id,
      bodyGroupIds: body.map((g) => g.id),
    });
  }

  return {
    version: COMPOSITION_RUNTIME_VERSION,
    replay_mutation: "none",
    derived_from: "educational_renderable_document_v1",
    viewport_profile: profile,
    source_runtime: document.runtime,
    cognitive_layout_version: layout.version,
    sections,
    flows: sections,
    positioned_groups,
    pages: [],
    composition_diagnostics: diagnostics,
  };
}

export function composedGroupById(
  composed: ComposedEducationalDocumentV1,
  groupId: string,
): ComposedGroupPositionV1 | undefined {
  return composed.positioned_groups.find((p) => p.groupId === groupId);
}

export function composedGroupsForSection(
  composed: ComposedEducationalDocumentV1,
  sectionLabel: string,
): ComposedGroupPositionV1[] {
  return composed.positioned_groups
    .filter((p) => p.sectionLabel === sectionLabel)
    .sort((a, b) => a.readingOrder - b.readingOrder);
}
