/**
 * P2.2.1 — presentation lineage / composition provenance（derived only）。
 */
import type {
  DerivedFromSubstratesV1,
  EducationalAstNodeV1,
  EducationalDocumentAstV1,
} from "@/lib/educationalAst.shared";
import type { EducationalCognitiveLayoutV1 } from "@/lib/educationalCognitiveGroup.shared";
import { EPL_RUNTIME_ID, isFigureNode } from "@/lib/educationalAst.shared";
import { createSemanticFact, SemanticFactKey } from "@/lib/semanticLineageFactOntology.shared";
import type { SemanticLineageFactV1 } from "@/lib/semanticLineageReplayModel.shared";

export type { DerivedFromSubstratesV1 };

export const ECM_RUNTIME_ID = "ecm-v0" as const;
export const EPL_LAYOUT_STRATEGY_V1 = "float-right-compact-v1" as const;

/** 呈现权威级别（epistemically honest；preview 可与 persist 不同） */
export type PresentationAuthorityV1 = "fallback" | "partial" | "registry-backed";

export type PresentationProvenanceV1 = {
  presentation_runtime: typeof EPL_RUNTIME_ID;
  composition_runtime: typeof ECM_RUNTIME_ID;
  layout_strategy: typeof EPL_LAYOUT_STRATEGY_V1;
  presentation_authority: PresentationAuthorityV1;
  derived_from_substrates: DerivedFromSubstratesV1;
  derived_from: EducationalDocumentAstV1["derived_from"];
  replay_mutation: "none";
  /** P2.4.3 cognitive layout lineage（replayable derived） */
  cognitive_runtime?: EducationalCognitiveLayoutV1["version"];
  cognitive_group_count?: number;
  question_with_figure_count?: number;
};

function collectFigureNodes(nodes: EducationalAstNodeV1[]): import("@/lib/educationalAst.shared").FigureNodeV1[] {
  const out: import("@/lib/educationalAst.shared").FigureNodeV1[] = [];
  for (const n of nodes) {
    if (isFigureNode(n)) out.push(n);
    if (n.type === "section") out.push(...collectFigureNodes(n.children));
  }
  return out;
}

export function derivePresentationAuthority(
  ast: EducationalDocumentAstV1,
  opts: { registryInputProvided: boolean },
): PresentationAuthorityV1 {
  if (!opts.registryInputProvided) return "fallback";

  const figs = collectFigureNodes(ast.nodes);
  if (figs.length === 0) return "partial";

  const withRegistry = figs.filter((f) => f.registryId && f.ownership !== "markdown_fallback");
  if (withRegistry.length === figs.length && figs.length > 0) return "registry-backed";
  if (withRegistry.length > 0) return "partial";
  return "fallback";
}

export function buildPresentationProvenance(
  ast: EducationalDocumentAstV1,
  opts: {
    registryInputProvided: boolean;
    cognitive_layout?: EducationalCognitiveLayoutV1;
  },
): PresentationProvenanceV1 {
  const layout = opts.cognitive_layout;
  return {
    presentation_runtime: EPL_RUNTIME_ID,
    composition_runtime: ECM_RUNTIME_ID,
    layout_strategy: EPL_LAYOUT_STRATEGY_V1,
    presentation_authority: derivePresentationAuthority(ast, opts),
    derived_from_substrates: ast.derived_from_substrates,
    derived_from: ast.derived_from,
    replay_mutation: "none",
    cognitive_runtime: layout?.version,
    cognitive_group_count: layout?.groups.length,
    question_with_figure_count: layout?.groups.filter((g) => g.role === "question_with_figure")
      .length,
  };
}

/** presentation lineage → telemetry ontology（`--find presentation.authority.level`） */
export function emitPresentationLineageFacts(
  provenance: PresentationProvenanceV1,
): SemanticLineageFactV1[] {
  const phase = "presentation" as const;
  const substrates = Object.entries(provenance.derived_from_substrates)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join("+");

  return [
    createSemanticFact(phase, SemanticFactKey.presentation.runtime, provenance.presentation_runtime, [
      "presentation_runtime",
    ]),
    createSemanticFact(
      phase,
      SemanticFactKey.presentation.compositionRuntime,
      provenance.composition_runtime,
      ["composition_runtime"],
    ),
    createSemanticFact(
      phase,
      SemanticFactKey.presentation.layoutStrategy,
      provenance.layout_strategy,
      ["layout_strategy"],
    ),
    createSemanticFact(
      phase,
      SemanticFactKey.presentation.authority.level,
      provenance.presentation_authority,
      ["presentation_authority", "presentation.authority.level"],
    ),
    createSemanticFact(phase, SemanticFactKey.presentation.derivedFrom, provenance.derived_from, [
      "derived_from",
    ]),
    createSemanticFact(phase, "presentation.derived_from_substrates", substrates || "canonical_text", [
      "derived_from_substrates",
    ]),
  ];
}

/** cognitive_layout → telemetry（与 semantic lineage 并列） */
export function emitCognitiveLayoutFacts(
  layout: EducationalCognitiveLayoutV1,
): SemanticLineageFactV1[] {
  const phase = "presentation" as const;
  const qwf = layout.groups.filter((g) => g.role === "question_with_figure").length;
  return [
    createSemanticFact(phase, "presentation.cognitive.runtime", layout.version, ["cognitive_runtime"]),
    createSemanticFact(phase, "presentation.cognitive.group_count", String(layout.groups.length), [
      "cognitive_group_count",
    ]),
    createSemanticFact(phase, "presentation.cognitive.question_with_figure_count", String(qwf), [
      "question_with_figure_count",
    ]),
    createSemanticFact(phase, "presentation.cognitive.replay_mutation", layout.replay_mutation, [
      "cognitive_replay_mutation",
    ]),
  ];
}
