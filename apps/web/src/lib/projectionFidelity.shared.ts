/**
 * P3.3+ — Projection Fidelity（quality metric axis；非 authority）。
 *
 * Authority vs Fidelity 双轴：
 * - Authority：constitutional gate（projection-purity / ADR-O18）
 * - Fidelity：observational quality（可自由演进，不得改变 cognition 拓扑）
 */
import type { NegotiatedPaginatedDocumentV1 } from "@/lib/educationalPhysicalNegotiationRuntime.shared";
import { PROJECTION_PURITY_CONTRACT_VERSION } from "@/lib/projectionPurityContract.shared";

export const PROJECTION_FIDELITY_REGISTRY_VERSION = "v1" as const;

export type ProjectionFidelityMetricIdV1 =
  | "glyph_fidelity"
  | "baseline_fidelity"
  | "vector_fidelity"
  | "pagination_realization_fidelity";

export type ProjectionFidelityMetricDescriptorV1 = {
  id: ProjectionFidelityMetricIdV1;
  /** 越高越好；null = 当前 backend 不可观测 */
  higher_is_better: boolean;
  population: string;
};

export const PROJECTION_FIDELITY_METRIC_REGISTRY: Record<
  ProjectionFidelityMetricIdV1,
  ProjectionFidelityMetricDescriptorV1
> = {
  glyph_fidelity: {
    id: "glyph_fidelity",
    higher_is_better: true,
    population: "rendered_glyphs",
  },
  baseline_fidelity: {
    id: "baseline_fidelity",
    higher_is_better: true,
    population: "text_baselines",
  },
  vector_fidelity: {
    id: "vector_fidelity",
    higher_is_better: true,
    population: "math_vector_paths",
  },
  pagination_realization_fidelity: {
    id: "pagination_realization_fidelity",
    higher_is_better: true,
    population: "positioned_groups_on_physical_pages",
  },
};

export type ProjectionFidelityMetricRowV1 = {
  value: number | null;
  unobservable_reason?: string;
  higher_is_better: boolean;
};

/** Authority 轴：永远由 governance gate 判定，不与 fidelity 混算 */
export type ProjectionAuthorityAxisV1 = {
  purity_contract: typeof PROJECTION_PURITY_CONTRACT_VERSION;
  /** lowering 入口是否仅消费 negotiated */
  consumes_negotiated_only: boolean;
  /** fidelity 评估不得写回 negotiation / pagination */
  replay_mutation: "none";
};

export type ProjectionFidelityReportV1 = {
  version: typeof PROJECTION_FIDELITY_REGISTRY_VERSION;
  report_kind: "projection_fidelity_observational";
  authority_axis: ProjectionAuthorityAxisV1;
  metrics: Record<ProjectionFidelityMetricIdV1, ProjectionFidelityMetricRowV1>;
  summary_lines: string[];
};

/**
 * 从 negotiated truth 评估 pagination realization（不触发二次 negotiate）。
 * glyph/baseline/vector 在 P3.3 primitives 落地前为 UNOBSERVABLE。
 */
export function assessProjectionFidelity(
  negotiated: NegotiatedPaginatedDocumentV1,
): ProjectionFidelityReportV1 {
  const groups = negotiated.paginated.composed.positioned_groups;
  const groupIds = new Set(groups.map((g) => g.groupId));
  const placed = new Set<string>();

  for (const page of negotiated.physical_pages) {
    for (const id of page.groupIds) {
      placed.add(id);
    }
  }

  let singlePageGroups = 0;
  for (const g of groups) {
    const pagesWithGroup = negotiated.physical_pages.filter((p) =>
      p.groupIds.includes(g.groupId),
    );
    if (pagesWithGroup.length === 1) singlePageGroups += 1;
  }

  const pagination_realization_fidelity =
    groups.length > 0 ? Math.round((singlePageGroups / groups.length) * 100) : null;

  const orphanCount = [...groupIds].filter((id) => !placed.has(id)).length;
  const summary_lines = [
    `authority_axis=purity_contract_${PROJECTION_PURITY_CONTRACT_VERSION}`,
    `pagination_realization=${pagination_realization_fidelity ?? "unobservable"}`,
    `orphan_groups_on_physical_pages=${orphanCount}`,
    "glyph/baseline/vector=unobservable_until_p3_3_primitives",
  ];

  return {
    version: PROJECTION_FIDELITY_REGISTRY_VERSION,
    report_kind: "projection_fidelity_observational",
    authority_axis: {
      purity_contract: PROJECTION_PURITY_CONTRACT_VERSION,
      consumes_negotiated_only: true,
      replay_mutation: "none",
    },
    metrics: {
      glyph_fidelity: {
        value: null,
        unobservable_reason: "p3_3_pdf_primitives_not_implemented",
        higher_is_better: true,
      },
      baseline_fidelity: {
        value: null,
        unobservable_reason: "p3_3_pdf_primitives_not_implemented",
        higher_is_better: true,
      },
      vector_fidelity: {
        value: null,
        unobservable_reason: "p3_3_pdf_primitives_not_implemented",
        higher_is_better: true,
      },
      pagination_realization_fidelity: {
        value: pagination_realization_fidelity,
        higher_is_better: true,
      },
    },
    summary_lines,
  };
}
