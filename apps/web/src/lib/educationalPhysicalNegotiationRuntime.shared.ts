/**
 * P3.2 — Physical Negotiation Runtime（semantic ↔ physical compromise；不污染 cognitive/pagination truth）。
 *
 * Physical metrics 仅存在于 negotiation plane；禁止写回 composed / cognitive_layout / canonical。
 */
import type { ComposedGroupPositionV1 } from "@/lib/educationalCompositionRuntime.shared";
import {
  PAGINATION_RUNTIME_VERSION,
  type PaginatedEducationalDocumentV1,
  type PageV1,
} from "@/lib/educationalPaginationRuntime.shared";
import type { CognitiveGroupRoleV1 } from "@/lib/educationalCognitiveGroup.shared";

export const NEGOTIATION_RUNTIME_VERSION = "negotiation_runtime_v1" as const;

/** 抽象物理视口（非 DOM px truth；仅 negotiation 层；backend-independent） */
export type PhysicalViewportProfileIdV1 =
  | "pdf_a4"
  | "pdf_exam_booklet"
  | "mobile_print"
  /** P3.2.3 stress profiles — adversarial negotiation pressure */
  | "pdf_exam_booklet_dense"
  | "pdf_low_margin"
  | "mobile_ultra_narrow";

export type NegotiationSeverityV1 = "low" | "medium" | "high" | "catastrophic";

export type NegotiationSeverityDistributionV1 = {
  low: number;
  medium: number;
  high: number;
  catastrophic: number;
};

export const NEGOTIATION_STRESS_VIEWPORT_PROFILES: readonly PhysicalViewportProfileIdV1[] = [
  "pdf_exam_booklet_dense",
  "pdf_low_margin",
  "mobile_ultra_narrow",
] as const;

export type PhysicalViewportProfileV1 = {
  id: PhysicalViewportProfileIdV1;
  /** 抽象单位（非 governance truth 的 px） */
  pageWidthUnits: number;
  pageHeightUnits: number;
  printableArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fontMetricsProfile: string;
  figureConstraints: {
    maxHeightUnits: number;
    maxWidthUnits: number;
  };
  /** 可打印区高度（抽象 unit） */
  printableHeightUnits: number;
};

export const PHYSICAL_VIEWPORT_PRESETS: Record<
  PhysicalViewportProfileIdV1,
  PhysicalViewportProfileV1
> = {
  pdf_a4: {
    id: "pdf_a4",
    pageWidthUnits: 210,
    pageHeightUnits: 297,
    printableArea: { top: 12, right: 14, bottom: 14, left: 14 },
    fontMetricsProfile: "abstract_serif_v1",
    figureConstraints: { maxHeightUnits: 10, maxWidthUnits: 16 },
    printableHeightUnits: 24,
  },
  pdf_exam_booklet: {
    id: "pdf_exam_booklet",
    pageWidthUnits: 210,
    pageHeightUnits: 297,
    printableArea: { top: 10, right: 18, bottom: 12, left: 18 },
    fontMetricsProfile: "abstract_serif_booklet_v1",
    figureConstraints: { maxHeightUnits: 9, maxWidthUnits: 14 },
    printableHeightUnits: 20,
  },
  mobile_print: {
    id: "mobile_print",
    pageWidthUnits: 148,
    pageHeightUnits: 210,
    printableArea: { top: 8, right: 8, bottom: 8, left: 8 },
    fontMetricsProfile: "abstract_sans_mobile_v1",
    figureConstraints: { maxHeightUnits: 8, maxWidthUnits: 12 },
    printableHeightUnits: 18,
  },
  pdf_exam_booklet_dense: {
    id: "pdf_exam_booklet_dense",
    pageWidthUnits: 210,
    pageHeightUnits: 297,
    printableArea: { top: 14, right: 22, bottom: 14, left: 22 },
    fontMetricsProfile: "abstract_serif_booklet_dense_v1",
    figureConstraints: { maxHeightUnits: 8, maxWidthUnits: 12 },
    printableHeightUnits: 7,
  },
  pdf_low_margin: {
    id: "pdf_low_margin",
    pageWidthUnits: 210,
    pageHeightUnits: 297,
    printableArea: { top: 18, right: 20, bottom: 18, left: 20 },
    fontMetricsProfile: "abstract_serif_tight_v1",
    figureConstraints: { maxHeightUnits: 9, maxWidthUnits: 13 },
    printableHeightUnits: 5,
  },
  mobile_ultra_narrow: {
    id: "mobile_ultra_narrow",
    pageWidthUnits: 120,
    pageHeightUnits: 210,
    printableArea: { top: 10, right: 10, bottom: 10, left: 10 },
    fontMetricsProfile: "abstract_sans_ultra_narrow_v1",
    figureConstraints: { maxHeightUnits: 7, maxWidthUnits: 8 },
    printableHeightUnits: 6,
  },
};

export function isStressViewportProfile(id: PhysicalViewportProfileIdV1): boolean {
  return (NEGOTIATION_STRESS_VIEWPORT_PROFILES as readonly string[]).includes(id);
}

/** cognition economics — severity from compromise cost（backend-independent） */
export function classifyNegotiationSeverity(
  decision: Pick<
    NegotiationDecisionV1,
    | "continuity_loss_delta"
    | "interruption_cost_delta"
    | "semantic_integrity_preserved"
    | "negotiation_strategy"
  >,
): NegotiationSeverityV1 {
  if (!decision.semantic_integrity_preserved) return "catastrophic";
  const loss = decision.continuity_loss_delta + decision.interruption_cost_delta;
  if (loss >= 28) return "high";
  if (loss >= 14) return "medium";
  return "low";
}

export function buildNegotiationSeverityDistribution(
  decisions: NegotiationDecisionV1[],
): NegotiationSeverityDistributionV1 {
  const dist: NegotiationSeverityDistributionV1 = {
    low: 0,
    medium: 0,
    high: 0,
    catastrophic: 0,
  };
  for (const d of decisions) {
    const sev = d.severity ?? classifyNegotiationSeverity(d);
    dist[sev] += 1;
  }
  return dist;
}

export type SemanticConstraintRefV1 =
  | "keepWithFigure"
  | "avoidBreakInside"
  | "keepWithNext"
  | "continuityWeight"
  | "inline_figure_right";

export type PhysicalConflictV1 =
  | "page_overflow"
  | "image_height_exceeds_remaining_space"
  | "printable_area_insufficient"
  | "inline_figure_width_exceeds_column";

export type NegotiationStrategyV1 =
  | "honor_semantic_layout"
  | "defer_group_to_next_page"
  | "shrink_figure_placement"
  | "accept_overflow_warning";

export type RejectedNegotiationStrategyV1 =
  | "split_question_cluster"
  | "split_subquestion_from_figure"
  | "drop_keep_with_figure"
  | "ignore_avoid_break_inside";

export type NegotiationDecisionV1 = {
  target_group_id: string;
  logical_page_index: number;
  physical_page_index: number;
  semantic_constraints: SemanticConstraintRefV1[];
  physical_conflicts: PhysicalConflictV1[];
  negotiation_strategy: NegotiationStrategyV1;
  rejected_strategies: RejectedNegotiationStrategyV1[];
  continuity_loss_delta: number;
  interruption_cost_delta: number;
  semantic_integrity_preserved: boolean;
  /** negotiation-only 估算（非 cognitive truth） */
  physical_footprint_units: number;
  remaining_space_units_before: number;
  /** P3.2.3 — cognition economics tier（frozen at decision time） */
  severity: NegotiationSeverityV1;
};

export type PhysicalPageV1 = {
  physicalPageIndex: number;
  groupIds: string[];
  sourceLogicalPageIndices: number[];
  kind: "physical_negotiated";
};

export type NegotiationGroupFindingV1 = {
  groupId: string;
  code:
    | "SEMANTIC_CONSTRAINT_VIOLATION"
    | "KEEP_WITH_FIGURE_NEGOTIATED"
    | "DEFERRED_TO_NEXT_PHYSICAL_PAGE";
  message: string;
};

export type NegotiationDocumentDiagnosticsV1 = {
  version: typeof NEGOTIATION_RUNTIME_VERSION;
  replay_mutation: "none";
  derived_from: typeof PAGINATION_RUNTIME_VERSION;
  verdict: "PASS" | "WARN" | "UNOBSERVABLE";
  rollup: {
    physicalPageCount: number;
    logicalPageCount: number;
    negotiationDecisionCount: number;
    deferToNextPageCount: number;
    keepWithFigureNegotiationCount: number;
    semanticConstraintViolationCount: number;
    meanContinuityLossDelta: number;
    continuityPreservationAfterNegotiation: number;
    negotiationSeverityDistribution: NegotiationSeverityDistributionV1;
  };
  findings: NegotiationGroupFindingV1[];
  summaryLines: string[];
};

export type NegotiatedPaginatedDocumentV1 = {
  version: typeof NEGOTIATION_RUNTIME_VERSION;
  negotiation_runtime: typeof NEGOTIATION_RUNTIME_VERSION;
  replay_mutation: "none";
  derived_from: typeof PAGINATION_RUNTIME_VERSION;
  physical_viewport: PhysicalViewportProfileIdV1;
  /** frozen pagination truth（只读引用） */
  paginated: PaginatedEducationalDocumentV1;
  physical_pages: PhysicalPageV1[];
  negotiation_decisions: NegotiationDecisionV1[];
  negotiation_diagnostics: NegotiationDocumentDiagnosticsV1;
};

function semanticConstraintsForGroup(pos: ComposedGroupPositionV1): SemanticConstraintRefV1[] {
  const out: SemanticConstraintRefV1[] = [];
  const c = pos.compositionConstraint;
  if (c.keepWithFigure) out.push("keepWithFigure");
  if (c.avoidBreakInside) out.push("avoidBreakInside");
  if (c.keepWithNext) out.push("keepWithNext");
  if (pos.cognitiveGroup.readingSemantics.continuityWeight >= 85) {
    out.push("continuityWeight");
  }
  if (pos.effectiveAdaptivePresentation === "inline_figure_right") {
    out.push("inline_figure_right");
  }
  return out;
}

/** negotiation plane 内物理占位估算（abstract units） */
export function estimatePhysicalFootprintUnits(
  pos: ComposedGroupPositionV1,
  viewport: PhysicalViewportProfileV1,
): { units: number; conflicts: PhysicalConflictV1[] } {
  const conflicts: PhysicalConflictV1[] = [];
  let units: number;
  switch (pos.role) {
    case "question_with_figure": {
      const base = pos.effectiveAdaptivePresentation === "inline_figure_right" ? 10 : 12;
      units = isStressViewportProfile(viewport.id) ? base + 2 : base;
      if (units > viewport.figureConstraints.maxHeightUnits + 4) {
        conflicts.push("image_height_exceeds_remaining_space");
      }
      if (
        pos.effectiveAdaptivePresentation === "inline_figure_right" &&
        viewport.printableArea.left + viewport.figureConstraints.maxWidthUnits >
        viewport.pageWidthUnits - viewport.printableArea.right
      ) {
        conflicts.push("inline_figure_width_exceeds_column");
      }
      break;
    }
    case "standalone_figure":
      units = isStressViewportProfile(viewport.id) ? 9 : 8;
      if (units > viewport.figureConstraints.maxHeightUnits) {
        conflicts.push("image_height_exceeds_remaining_space");
      }
      break;
    case "subquestion_cluster":
      units = 3;
      break;
    case "section_preamble":
      units = 2;
      break;
    case "stem_block":
      units = 4;
      break;
    default:
      units = 2;
  }
  return { units, conflicts };
}

function finalizeNegotiationDecision(
  partial: Omit<NegotiationDecisionV1, "severity">,
): NegotiationDecisionV1 {
  return { ...partial, severity: classifyNegotiationSeverity(partial) };
}

function defaultRejectedForRole(role: CognitiveGroupRoleV1): RejectedNegotiationStrategyV1[] {
  if (role === "question_with_figure" || role === "subquestion_cluster") {
    return ["split_question_cluster", "split_subquestion_from_figure", "drop_keep_with_figure"];
  }
  return ["split_question_cluster", "ignore_avoid_break_inside"];
}

function analyzeNegotiation(
  paginated: PaginatedEducationalDocumentV1,
  decisions: NegotiationDecisionV1[],
  physicalPages: PhysicalPageV1[],
): NegotiationDocumentDiagnosticsV1 {
  const findings: NegotiationGroupFindingV1[] = [];
  let deferCount = 0;
  let keepFigNeg = 0;
  let violationCount = 0;
  let continuityLossSum = 0;

  for (const d of decisions) {
    continuityLossSum += d.continuity_loss_delta;
    if (d.negotiation_strategy === "defer_group_to_next_page") {
      deferCount += 1;
      findings.push({
        groupId: d.target_group_id,
        code: "DEFERRED_TO_NEXT_PHYSICAL_PAGE",
        message: `deferred from logical ${d.logical_page_index} → physical ${d.physical_page_index}`,
      });
    }
    if (
      d.semantic_constraints.includes("keepWithFigure") &&
      d.negotiation_strategy !== "honor_semantic_layout"
    ) {
      keepFigNeg += 1;
      findings.push({
        groupId: d.target_group_id,
        code: "KEEP_WITH_FIGURE_NEGOTIATED",
        message: `strategy=${d.negotiation_strategy}`,
      });
    }
    if (!d.semantic_integrity_preserved) {
      violationCount += 1;
      findings.push({
        groupId: d.target_group_id,
        code: "SEMANTIC_CONSTRAINT_VIOLATION",
        message: d.physical_conflicts.join(","),
      });
    }
  }

  const baseContinuity = paginated.pagination_diagnostics.rollup.continuityPreservationScore;
  const meanLoss =
    decisions.length > 0 ? Math.round(continuityLossSum / decisions.length) : 0;
  const afterNegotiation = Math.max(0, baseContinuity - Math.round(continuityLossSum / 2));
  const negotiationSeverityDistribution = buildNegotiationSeverityDistribution(decisions);

  let verdict: "PASS" | "WARN" | "UNOBSERVABLE" = "PASS";
  const summaryLines: string[] = [];
  if (paginated.pages.length === 0) {
    verdict = "UNOBSERVABLE";
    summaryLines.push("(no logical pages)");
  } else {
    if (violationCount > 0 || keepFigNeg > 0) {
      verdict = "WARN";
      summaryLines.push(
        `violations=${violationCount} keep_with_figure_negotiated=${keepFigNeg} defer=${deferCount}`,
      );
    } else {
      summaryLines.push(
        `physical_pages=${physicalPages.length} logical=${paginated.pages.length} after_negotiation_continuity=${afterNegotiation}`,
      );
    }
  }

  return {
    version: NEGOTIATION_RUNTIME_VERSION,
    replay_mutation: "none",
    derived_from: PAGINATION_RUNTIME_VERSION,
    verdict,
    rollup: {
      physicalPageCount: physicalPages.length,
      logicalPageCount: paginated.pages.length,
      negotiationDecisionCount: decisions.length,
      deferToNextPageCount: deferCount,
      keepWithFigureNegotiationCount: keepFigNeg,
      semanticConstraintViolationCount: violationCount,
      meanContinuityLossDelta: meanLoss,
      continuityPreservationAfterNegotiation: afterNegotiation,
      negotiationSeverityDistribution,
    },
    findings,
    summaryLines,
  };
}

/**
 * 将 logical pagination 协商为 physical pages（abstract physical units；可 replay）。
 */
export function negotiatePhysicalPagination(
  paginated: PaginatedEducationalDocumentV1,
  physicalViewport: PhysicalViewportProfileIdV1 = "pdf_a4",
): NegotiatedPaginatedDocumentV1 {
  if (paginated.replay_mutation !== "none") {
    throw new Error("negotiation requires paginated.replay_mutation=none");
  }

  const viewport = PHYSICAL_VIEWPORT_PRESETS[physicalViewport];
  const groupById = new Map(
    paginated.composed.positioned_groups.map((g) => [g.groupId, g]),
  );

  const physical_pages: PhysicalPageV1[] = [];
  const negotiation_decisions: NegotiationDecisionV1[] = [];

  let physicalPageIndex = 0;
  let remaining = viewport.printableHeightUnits;

  const ensurePhysicalPage = (logicalIndex: number) => {
    if (
      physical_pages.length === 0 ||
      physical_pages[physical_pages.length - 1]!.physicalPageIndex !== physicalPageIndex
    ) {
      physical_pages.push({
        physicalPageIndex,
        groupIds: [],
        sourceLogicalPageIndices: [logicalIndex],
        kind: "physical_negotiated",
      });
    }
  };

  for (const logicalPage of paginated.pages) {
    ensurePhysicalPage(logicalPage.pageIndex);

    for (const groupId of logicalPage.groupIds) {
      const pos = groupById.get(groupId);
      if (!pos) continue;

      const { units, conflicts: footprintConflicts } = estimatePhysicalFootprintUnits(
        pos,
        viewport,
      );
      const semantic_constraints = semanticConstraintsForGroup(pos);
      const rejected_strategies = defaultRejectedForRole(pos.role);

      const fits = units <= remaining;
      const pageOverflow = !fits && remaining < viewport.printableHeightUnits;

      if (fits) {
        physical_pages[physical_pages.length - 1]!.groupIds.push(groupId);
        remaining -= units;
        if (footprintConflicts.length > 0 && semantic_constraints.includes("keepWithFigure")) {
          negotiation_decisions.push(
            finalizeNegotiationDecision({
              target_group_id: groupId,
              logical_page_index: logicalPage.pageIndex,
              physical_page_index: physicalPageIndex,
              semantic_constraints,
              physical_conflicts: footprintConflicts,
              negotiation_strategy: "honor_semantic_layout",
              rejected_strategies: [...rejected_strategies, "shrink_figure_placement"],
              continuity_loss_delta: 0,
              interruption_cost_delta: 0,
              semantic_integrity_preserved: true,
              physical_footprint_units: units,
              remaining_space_units_before: remaining + units,
            }),
          );
        }
        continue;
      }

      const physical_conflicts: PhysicalConflictV1[] = [
        ...footprintConflicts,
        ...(pageOverflow ? (["page_overflow", "printable_area_insufficient"] as const) : []),
      ];
      if (remaining < units) {
        physical_conflicts.push("image_height_exceeds_remaining_space");
      }

      const stressBump = isStressViewportProfile(viewport.id) ? 8 : 0;
      const keepFig = semantic_constraints.includes("keepWithFigure");
      const continuity_loss_delta = Math.min(
        40,
        Math.round((100 - pos.cognitiveGroup.readingSemantics.continuityWeight) / 8) +
          2 +
          stressBump +
          (keepFig ? 6 : 0),
      );
      const interruption_cost_delta = Math.min(
        16,
        Math.round(pos.cognitiveGroup.readingSemantics.interruptionCost / 12) +
          (isStressViewportProfile(viewport.id) ? 4 : 0),
      );

      negotiation_decisions.push(
        finalizeNegotiationDecision({
          target_group_id: groupId,
          logical_page_index: logicalPage.pageIndex,
          physical_page_index: physicalPageIndex + 1,
          semantic_constraints,
          physical_conflicts,
          negotiation_strategy: "defer_group_to_next_page",
          rejected_strategies,
          continuity_loss_delta,
          interruption_cost_delta,
          semantic_integrity_preserved: !keepFig,
          physical_footprint_units: units,
          remaining_space_units_before: remaining,
        }),
      );

      physicalPageIndex += 1;
      remaining = viewport.printableHeightUnits;
      ensurePhysicalPage(logicalPage.pageIndex);
      const last = physical_pages[physical_pages.length - 1]!;
      if (!last.sourceLogicalPageIndices.includes(logicalPage.pageIndex)) {
        last.sourceLogicalPageIndices.push(logicalPage.pageIndex);
      }
      last.groupIds.push(groupId);
      remaining -= units;
    }

    remaining = viewport.printableHeightUnits;
    if (logicalPage.pageIndex < paginated.pages.length - 1) {
      physicalPageIndex += 1;
    }
  }

  if (physical_pages.length === 0 && paginated.pages.length > 0) {
    physical_pages.push({
      physicalPageIndex: 0,
      groupIds: paginated.pages.flatMap((p) => p.groupIds),
      sourceLogicalPageIndices: paginated.pages.map((p) => p.pageIndex),
      kind: "physical_negotiated",
    });
  }

  const negotiation_diagnostics = analyzeNegotiation(
    paginated,
    negotiation_decisions,
    physical_pages,
  );

  return {
    version: NEGOTIATION_RUNTIME_VERSION,
    negotiation_runtime: NEGOTIATION_RUNTIME_VERSION,
    replay_mutation: "none",
    derived_from: PAGINATION_RUNTIME_VERSION,
    physical_viewport: physicalViewport,
    paginated,
    physical_pages,
    negotiation_decisions,
    negotiation_diagnostics,
  };
}

export function formatNegotiationDiagnosticReport(
  diag: NegotiationDocumentDiagnosticsV1,
): string[] {
  const sev = diag.rollup.negotiationSeverityDistribution;
  return [
    `negotiation_runtime=${diag.version} verdict=${diag.verdict}`,
    `  severity_distribution low=${sev.low} medium=${sev.medium} high=${sev.high} catastrophic=${sev.catastrophic}`,
    ...diag.summaryLines.map((l) => `  ${l}`),
    ...diag.findings.slice(0, 8).map((f) => `  [${f.groupId}] ${f.code}`),
  ];
}
