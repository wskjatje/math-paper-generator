/**
 * P3.4 observational — cognitive packing / projection leak signals（非 authority）。
 */
import type { EducationalRenderableDocumentV1 } from "@/lib/educationalRenderableDocument.shared";

export type CognitivePackingObservabilityV1 = {
  end_fallback_figure_count: number;
  standalone_figure_group_count: number;
  question_with_figure_count: number;
  /** 同 section 内 standalone 紧跟在 QWF 之后（attention hijack 风险） */
  standalone_after_qwf_count: number;
  figure_detachment_risk_max: number;
  findings: string[];
};

export function assessCognitivePackingObservability(
  document: EducationalRenderableDocumentV1,
): CognitivePackingObservabilityV1 {
  const layout = document.cognitive_layout;
  const end_fallback_figure_count = document.ast.nodes.filter(
    (n) => n.type === "figure" && n.placement === "end_fallback",
  ).length;

  const groups = layout.groups;
  const question_with_figure_count = groups.filter((g) => g.role === "question_with_figure").length;
  const standalone_figure_group_count = groups.filter((g) => g.role === "standalone_figure").length;

  let standalone_after_qwf_count = 0;
  const sectionLabels = [...new Set(groups.map((g) => g.sectionLabel).filter(Boolean))];
  for (const label of sectionLabels) {
    const inSection = groups.filter((g) => g.sectionLabel === label);
    for (let i = 0; i < inSection.length - 1; i++) {
      if (
        inSection[i]!.role === "question_with_figure" &&
        inSection[i + 1]!.role === "standalone_figure"
      ) {
        standalone_after_qwf_count += 1;
      }
    }
  }

  const diag = document.reading_flow_diagnostics;
  const figure_detachment_risk_max = Math.max(
    0,
    ...diag.groups.map((g) => g.figureDetachmentRisk),
  );

  const findings: string[] = [];
  if (end_fallback_figure_count > 0) {
    findings.push("REGISTRY_END_FALLBACK_FIGURES");
  }
  if (standalone_after_qwf_count > 0) {
    findings.push("STANDALONE_FIGURE_AFTER_QWF");
  }
  if (standalone_figure_group_count >= 2) {
    findings.push("MULTIPLE_STANDALONE_FIGURE_CLUSTERS");
  }
  if (figure_detachment_risk_max >= 70) {
    findings.push("FIGURE_DETACHMENT_RISK_HIGH");
  }

  return {
    end_fallback_figure_count,
    standalone_figure_group_count,
    question_with_figure_count,
    standalone_after_qwf_count,
    figure_detachment_risk_max,
    findings,
  };
}
