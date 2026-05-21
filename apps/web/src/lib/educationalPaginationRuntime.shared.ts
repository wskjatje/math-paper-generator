/**
 * Phase 2 / Issue 3 — Cognitive Pagination Runtime v1（semantic-first；不测量像素高度）。
 *
 * 输入：ComposedEducationalDocumentV1（composition truth）
 * 输出：PaginatedEducationalDocumentV1（page cognition truth）
 */
import type { ComposedEducationalDocumentV1, ComposedGroupPositionV1 } from "@/lib/educationalCompositionRuntime.shared";
import { COMPOSITION_RUNTIME_VERSION } from "@/lib/educationalCompositionRuntime.shared";
import type { CognitiveGroupRoleV1 } from "@/lib/educationalCognitiveGroup.shared";

export const PAGINATION_RUNTIME_VERSION = "pagination_runtime_v1" as const;

export type PageBreakReasonV1 =
  | "section_boundary"
  | "avoid_interrupting_question_with_figure"
  | "respect_keep_with_next"
  | "prevent_orphan_subquestion"
  | "semantic_page_capacity"
  | "high_interruption_boundary"
  | "logical_page_start";

export type PageBreakDecisionV1 = {
  break_before_group_id: string;
  break_after_group_id?: string;
  decision_reason: PageBreakReasonV1[];
  interruption_cost: number;
  avoided_cost: number;
  continuity_preserved: boolean;
};

export type PageV1 = {
  pageIndex: number;
  groupIds: string[];
  sectionLabels: string[];
  /** Stage A logical page（非 A4 物理页） */
  logicalKind: "cognitive_logical";
};

export type PaginationGroupFindingV1 = {
  groupId: string;
  code:
    | "ORPHAN_SUBQUESTION"
    | "FIGURE_QUESTION_SPLIT_RISK"
    | "HIGH_INTERRUPTION_PAGE_BREAK"
    | "KEEP_WITH_NEXT_VIOLATED";
  message: string;
};

export type PaginationDocumentDiagnosticsV1 = {
  version: typeof PAGINATION_RUNTIME_VERSION;
  replay_mutation: "none";
  derived_from: typeof COMPOSITION_RUNTIME_VERSION;
  verdict: "PASS" | "WARN" | "UNOBSERVABLE";
  rollup: {
    pageCount: number;
    breakCount: number;
    orphanSubquestionCount: number;
    figureBreakRiskCount: number;
    highInterruptionBreakCount: number;
    keepWithNextViolationCount: number;
    continuityPreservationScore: number;
    meanInterruptionCostAtBreaks: number;
  };
  findings: PaginationGroupFindingV1[];
  summaryLines: string[];
};

export type PaginatedEducationalDocumentV1 = {
  version: typeof PAGINATION_RUNTIME_VERSION;
  pagination_runtime: typeof PAGINATION_RUNTIME_VERSION;
  replay_mutation: "none";
  derived_from: typeof COMPOSITION_RUNTIME_VERSION;
  viewport_profile: ComposedEducationalDocumentV1["viewport_profile"];
  pages: PageV1[];
  page_breaks: PageBreakDecisionV1[];
  pagination_diagnostics: PaginationDocumentDiagnosticsV1;
  /** 溯源 composed ABI（frozen） */
  composed: ComposedEducationalDocumentV1;
};

export type PaginateEducationalDocumentOptsV1 = {
  /** 抽象语义容量（非 px）；每页累计 unit 上限 */
  maxSemanticUnitsPerPage?: number;
};

const DEFAULT_MAX_SEMANTIC_UNITS = 8;

function semanticUnitsForRole(role: CognitiveGroupRoleV1): number {
  switch (role) {
    case "question_with_figure":
      return 3;
    case "standalone_figure":
      return 2;
    case "subquestion_cluster":
      return 1;
    case "section_preamble":
      return 1;
    case "stem_block":
      return 2;
    case "paragraph_block":
      return 1;
    default:
      return 1;
  }
}

function shouldKeepWithNext(
  prev: ComposedGroupPositionV1,
  curr: ComposedGroupPositionV1,
): boolean {
  const c = prev.compositionConstraint;
  if (c.keepWithNext || c.keepWithFigure) {
    if (curr.role === "subquestion_cluster" && curr.sectionLabel === prev.sectionLabel) {
      return true;
    }
    if (prev.role === "question_with_figure" && curr.role === "subquestion_cluster") {
      return true;
    }
  }
  return false;
}

function evaluateBreakBefore(
  prev: ComposedGroupPositionV1 | undefined,
  curr: ComposedGroupPositionV1,
  pageUnits: number,
  currUnits: number,
  maxUnits: number,
): PageBreakDecisionV1 | null {
  if (!prev) {
    return {
      break_before_group_id: curr.groupId,
      decision_reason: ["logical_page_start"],
      interruption_cost: 0,
      avoided_cost: curr.cognitiveGroup.readingSemantics.interruptionCost,
      continuity_preserved: true,
    };
  }

  const reasons: PageBreakReasonV1[] = [];
  let avoided = 0;
  const currInterrupt = curr.cognitiveGroup.readingSemantics.interruptionCost;
  const prevInterrupt = prev.cognitiveGroup.readingSemantics.interruptionCost;

  if (prev.sectionLabel !== curr.sectionLabel) {
    reasons.push("section_boundary");
    avoided = Math.max(avoided, prevInterrupt);
  }

  if (shouldKeepWithNext(prev, curr)) {
    return null;
  }

  if (prev.role === "question_with_figure" && pageUnits + currUnits > maxUnits) {
    reasons.push("avoid_interrupting_question_with_figure");
    avoided = Math.max(avoided, prev.cognitiveGroup.readingSemantics.continuityWeight);
  }

  if (pageUnits + currUnits > maxUnits) {
    reasons.push("semantic_page_capacity");
    avoided = Math.max(avoided, 40);
  }

  if (currInterrupt >= 85 && prevInterrupt >= 70) {
    reasons.push("high_interruption_boundary");
    avoided = Math.max(avoided, currInterrupt);
  }

  if (
    curr.role === "subquestion_cluster" &&
    prev.role !== "question_with_figure" &&
    prev.role !== "section_preamble" &&
    pageUnits >= maxUnits - 1
  ) {
    reasons.push("prevent_orphan_subquestion");
    avoided = Math.max(avoided, 55);
  }

  if (reasons.length === 0) return null;

  const interruption_cost = Math.round((prevInterrupt + currInterrupt) / 4);
  return {
    break_before_group_id: curr.groupId,
    break_after_group_id: prev.groupId,
    decision_reason: reasons,
    interruption_cost,
    avoided_cost: avoided,
    continuity_preserved: reasons.includes("respect_keep_with_next") ? false : true,
  };
}

function analyzePagination(
  pages: PageV1[],
  breaks: PageBreakDecisionV1[],
  groups: ComposedGroupPositionV1[],
): PaginationDocumentDiagnosticsV1 {
  const findings: PaginationGroupFindingV1[] = [];
  let orphanSubquestionCount = 0;
  let figureBreakRiskCount = 0;
  let keepWithNextViolationCount = 0;

  const groupById = new Map(groups.map((g) => [g.groupId, g]));

  for (const page of pages) {
    const ids = page.groupIds;
    if (ids.length === 1) {
      const g = groupById.get(ids[0]!);
      if (g?.role === "subquestion_cluster") {
        orphanSubquestionCount += 1;
        findings.push({
          groupId: g.groupId,
          code: "ORPHAN_SUBQUESTION",
          message: "subquestion_cluster alone on logical page",
        });
      }
    }
  }

  for (let i = 0; i < groups.length - 1; i++) {
    const prev = groups[i]!;
    const curr = groups[i + 1]!;
    if (shouldKeepWithNext(prev, curr)) {
      const broken = breaks.some((b) => b.break_before_group_id === curr.groupId);
      if (broken) {
        keepWithNextViolationCount += 1;
        findings.push({
          groupId: curr.groupId,
          code: "KEEP_WITH_NEXT_VIOLATED",
          message: `break before ${curr.groupId} violates keepWithNext from ${prev.groupId}`,
        });
      }
    }
    if (prev.role === "question_with_figure" && curr.role === "standalone_figure") {
      const broken = breaks.some((b) => b.break_before_group_id === curr.groupId);
      if (broken) {
        figureBreakRiskCount += 1;
        findings.push({
          groupId: curr.groupId,
          code: "FIGURE_QUESTION_SPLIT_RISK",
          message: "figure separated from question_with_figure cluster",
        });
      }
    }
  }

  const highInterruptionBreakCount = breaks.filter((b) =>
    b.decision_reason.includes("high_interruption_boundary"),
  ).length;

  const meanInterruptionCostAtBreaks =
    breaks.length > 0
      ? Math.round(
          breaks.reduce((s, b) => s + b.interruption_cost, 0) / breaks.length,
        )
      : 0;

  const continuityPreservationScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        orphanSubquestionCount * 22 -
        figureBreakRiskCount * 28 -
        keepWithNextViolationCount * 35 -
        highInterruptionBreakCount * 8,
    ),
  );

  const summaryLines: string[] = [];
  let verdict: "PASS" | "WARN" | "UNOBSERVABLE" = "PASS";
  if (groups.length === 0) {
    verdict = "UNOBSERVABLE";
    summaryLines.push("(no groups to paginate)");
  } else {
    if (orphanSubquestionCount > 0) {
      verdict = "WARN";
      summaryLines.push(`orphan_subquestion count=${orphanSubquestionCount}`);
    }
    if (figureBreakRiskCount > 0) {
      verdict = "WARN";
      summaryLines.push(`figure_break_risk count=${figureBreakRiskCount}`);
    }
    if (keepWithNextViolationCount > 0) {
      verdict = "WARN";
      summaryLines.push(`keep_with_next_violations=${keepWithNextViolationCount}`);
    }
    if (verdict === "PASS") {
      summaryLines.push(
        `pages=${pages.length} continuity_preservation_score=${continuityPreservationScore}`,
      );
    }
  }

  return {
    version: PAGINATION_RUNTIME_VERSION,
    replay_mutation: "none",
    derived_from: COMPOSITION_RUNTIME_VERSION,
    verdict,
    rollup: {
      pageCount: pages.length,
      breakCount: breaks.length,
      orphanSubquestionCount,
      figureBreakRiskCount,
      highInterruptionBreakCount,
      keepWithNextViolationCount,
      continuityPreservationScore,
      meanInterruptionCostAtBreaks,
    },
    findings,
    summaryLines,
  };
}

/**
 * Stage A — cognitive logical pagination（唯一合法入口；禁止 pixel 高度）。
 */
export function paginateEducationalDocument(
  composed: ComposedEducationalDocumentV1,
  opts?: PaginateEducationalDocumentOptsV1,
): PaginatedEducationalDocumentV1 {
  if (composed.replay_mutation !== "none") {
    throw new Error("pagination requires composed.replay_mutation=none");
  }
  const maxUnits = opts?.maxSemanticUnitsPerPage ?? DEFAULT_MAX_SEMANTIC_UNITS;
  const ordered = [...composed.positioned_groups].sort((a, b) => a.readingOrder - b.readingOrder);

  const pages: PageV1[] = [];
  const page_breaks: PageBreakDecisionV1[] = [];
  let currentIds: string[] = [];
  let currentSections = new Set<string>();
  let pageUnits = 0;

  const flushPage = () => {
    if (currentIds.length === 0) return;
    pages.push({
      pageIndex: pages.length,
      groupIds: [...currentIds],
      sectionLabels: [...currentSections],
      logicalKind: "cognitive_logical",
    });
    currentIds = [];
    currentSections = new Set();
    pageUnits = 0;
  };

  for (let i = 0; i < ordered.length; i++) {
    const curr = ordered[i]!;
    const prev = i > 0 ? ordered[i - 1] : undefined;
    const currUnits = semanticUnitsForRole(curr.role);

    const breakDecision = evaluateBreakBefore(prev, curr, pageUnits, currUnits, maxUnits);
    if (breakDecision && currentIds.length > 0) {
      page_breaks.push(breakDecision);
      flushPage();
    } else if (breakDecision && currentIds.length === 0) {
      page_breaks.push(breakDecision);
    }

    currentIds.push(curr.groupId);
    currentSections.add(curr.sectionLabel);
    pageUnits += currUnits;
  }
  flushPage();

  const pagination_diagnostics = analyzePagination(pages, page_breaks, ordered);

  return {
    version: PAGINATION_RUNTIME_VERSION,
    pagination_runtime: PAGINATION_RUNTIME_VERSION,
    replay_mutation: "none",
    derived_from: COMPOSITION_RUNTIME_VERSION,
    viewport_profile: composed.viewport_profile,
    pages,
    page_breaks,
    pagination_diagnostics,
    composed,
  };
}

export function formatPaginationDiagnosticReport(
  diag: PaginationDocumentDiagnosticsV1,
): string[] {
  return [
    `pagination_runtime=${diag.version} verdict=${diag.verdict}`,
    ...diag.summaryLines.map((l) => `  ${l}`),
    ...diag.findings.map((f) => `  [${f.groupId}] ${f.code}: ${f.message}`),
  ];
}
