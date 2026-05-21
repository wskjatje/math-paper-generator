/**
 * P2.4.4 — ReadingFlow Analyzer（Cognitive Telemetry Runtime）。
 * 分析 cognitive_layout，不修改 semantic / reading truth。
 */
import type { EducationalDocumentAstV1 } from "@/lib/educationalAst.shared";
import {
  buildEducationalCognitiveGroups,
  type CognitiveGroupV1,
  type EducationalCognitiveLayoutV1,
} from "@/lib/educationalCognitiveGroup.shared";
import { createSemanticFact } from "@/lib/semanticLineageFactOntology.shared";
import { ReadingFlowFactKey } from "@/lib/readingFlowFactOntology.shared";
import type { SemanticLineageFactV1 } from "@/lib/semanticLineageReplayModel.shared";
import { segmentPlainText } from "@/lib/parseMathInlineNode.shared";

export const READING_FLOW_ANALYZER_VERSION = "reading_flow_analyzer_v1" as const;

export type CognitiveReadingVerdictV1 = "PASS" | "WARN" | "UNOBSERVABLE";

export type ReadingFlowGroupDiagnosticsV1 = {
  groupId: string;
  role: CognitiveGroupV1["role"];
  sectionLabel?: string;
  questionAnchor?: string;
  /** 步骤间注意力落差次数（>25 分） */
  attentionJumps: number;
  /** 图与题干认知脱钩风险 0–100 */
  figureDetachmentRisk: number;
  /** 阅读被打断风险 0–100 */
  interruptionRisk: number;
  /** 连续性得分 0–100 */
  continuityScore: number;
  /** 窄屏 stacked 相对 inline 的预估连续性损失 */
  mobileStackedContinuityDrop: number;
  findings: string[];
};

export type ReadingFlowDocumentDiagnosticsV1 = {
  version: typeof READING_FLOW_ANALYZER_VERSION;
  replay_mutation: "none";
  derived_from: "educational_cognitive_layout_v1";
  groups: ReadingFlowGroupDiagnosticsV1[];
  rollup: {
    groupCount: number;
    questionWithFigureCount: number;
    meanContinuityScore: number;
    maxFigureDetachmentRisk: number;
    maxInterruptionRisk: number;
    totalAttentionJumps: number;
    meanMobileStackedContinuityDrop: number;
  };
  verdict: CognitiveReadingVerdictV1;
  summaryLines: string[];
};

function countAttentionJumps(group: CognitiveGroupV1): number {
  const steps = group.readingSemantics.steps;
  let jumps = 0;
  for (let i = 1; i < steps.length; i++) {
    const drop = steps[i - 1]!.attentionPriority - steps[i]!.attentionPriority;
    if (drop > 25) jumps += 1;
  }
  return jumps;
}

function analyzeGroup(group: CognitiveGroupV1): ReadingFlowGroupDiagnosticsV1 {
  const sem = group.readingSemantics;
  const findings: string[] = [];
  let figureDetachmentRisk = 0;

  if (group.role === "question_with_figure") {
    figureDetachmentRisk = Math.max(0, Math.round(100 - sem.continuityWeight));
    if (!group.layoutHints.keepWithFigure) {
      findings.push("QUESTION_FIGURE_MISSING_KEEP_WITH_FIGURE");
      figureDetachmentRisk = Math.max(figureDetachmentRisk, 75);
    }
  } else if (group.role === "standalone_figure") {
    figureDetachmentRisk = 48;
    findings.push("STANDALONE_FIGURE_CLUSTER");
  } else if (group.role === "subquestion_cluster") {
    const sub = group.members.find((m) => m.type === "subquestion");
    const citesFigure = sub?.segments.some((s) => /如图/.test(segmentPlainText(s)));
    if (citesFigure) {
      figureDetachmentRisk = 82;
      findings.push("FIGURE_CUE_WITHOUT_COGNITIVE_BIND");
    }
  }

  const attentionJumps = countAttentionJumps(group);
  const continuityScore = Math.round(sem.continuityWeight);
  const interruptionRisk = Math.min(
    100,
    Math.round(100 - sem.interruptionCost + attentionJumps * 6),
  );

  const mobileStackedContinuityDrop =
    sem.adaptivePresentation === "inline_figure_right"
      ? Math.min(40, Math.round(10 + attentionJumps * 8 + figureDetachmentRisk * 0.15))
      : 0;

  if (mobileStackedContinuityDrop >= 28) {
    findings.push("MOBILE_STACKED_CONTINUITY_DROP_HIGH");
  }
  if (interruptionRisk >= 50 && group.role !== "section_preamble" && group.role !== "stem_block") {
    findings.push("INTERRUPTION_RISK_ELEVATED");
  }

  return {
    groupId: group.id,
    role: group.role,
    sectionLabel: group.sectionLabel,
    questionAnchor: group.questionAnchor,
    attentionJumps,
    figureDetachmentRisk,
    interruptionRisk,
    continuityScore,
    mobileStackedContinuityDrop,
    findings,
  };
}

function deriveVerdict(
  groups: ReadingFlowGroupDiagnosticsV1[],
): { verdict: CognitiveReadingVerdictV1; summaryLines: string[] } {
  if (groups.length === 0) {
    return { verdict: "UNOBSERVABLE", summaryLines: ["(no cognitive groups to analyze)"] };
  }

  const lines: string[] = [];
  let verdict: CognitiveReadingVerdictV1 = "PASS";

  const contentGroups = groups.filter(
    (g) =>
      g.role === "question_with_figure" ||
      g.role === "subquestion_cluster" ||
      g.role === "standalone_figure",
  );
  const gateGroups = contentGroups.length > 0 ? contentGroups : groups;

  const maxDetach = Math.max(0, ...gateGroups.map((g) => g.figureDetachmentRisk));
  const maxInterrupt = Math.max(0, ...gateGroups.map((g) => g.interruptionRisk));
  const meanCont =
    gateGroups.reduce((s, g) => s + g.continuityScore, 0) / Math.max(1, gateGroups.length);
  const highMobileDrop = gateGroups.filter((g) => g.mobileStackedContinuityDrop >= 28);

  if (maxDetach >= 70) {
    verdict = "WARN";
    lines.push(`figure_detachment_risk max=${maxDetach} (threshold 70)`);
  }
  if (maxInterrupt >= 45) {
    verdict = "WARN";
    lines.push(`interruption_risk max=${maxInterrupt} (threshold 45)`);
  }
  if (meanCont < 58) {
    verdict = "WARN";
    lines.push(`mean_continuity_score=${meanCont.toFixed(1)} (threshold 58)`);
  }
  if (highMobileDrop.length > 0) {
    verdict = "WARN";
    lines.push(`mobile_stacked_continuity_drop groups=${highMobileDrop.length}`);
  }

  const unbound = groups.filter((g) => g.findings.includes("FIGURE_CUE_WITHOUT_COGNITIVE_BIND"));
  if (unbound.length > 0) {
    verdict = "WARN";
    lines.push(`figure_cue_without_bind count=${unbound.length}`);
  }

  if (verdict === "PASS") {
    lines.push(
      `continuity ok mean=${meanCont.toFixed(1)} qwf=${groups.filter((g) => g.role === "question_with_figure").length}`,
    );
  }

  return { verdict, summaryLines: lines };
}

/**
 * 分析 frozen cognitive_layout（唯一入口；derived only）。
 */
export function analyzeReadingFlow(
  layout: EducationalCognitiveLayoutV1,
): ReadingFlowDocumentDiagnosticsV1 {
  const groups = layout.groups.map(analyzeGroup);
  const qwf = groups.filter((g) => g.role === "question_with_figure").length;
  const meanContinuityScore =
    groups.reduce((s, g) => s + g.continuityScore, 0) / Math.max(1, groups.length);
  const { verdict, summaryLines } = deriveVerdict(groups);

  return {
    version: READING_FLOW_ANALYZER_VERSION,
    replay_mutation: "none",
    derived_from: "educational_cognitive_layout_v1",
    groups,
    rollup: {
      groupCount: groups.length,
      questionWithFigureCount: qwf,
      meanContinuityScore: Math.round(meanContinuityScore * 10) / 10,
      maxFigureDetachmentRisk: Math.max(0, ...groups.map((g) => g.figureDetachmentRisk)),
      maxInterruptionRisk: Math.max(0, ...groups.map((g) => g.interruptionRisk)),
      totalAttentionJumps: groups.reduce((s, g) => s + g.attentionJumps, 0),
      meanMobileStackedContinuityDrop:
        Math.round(
          (groups.reduce((s, g) => s + g.mobileStackedContinuityDrop, 0) /
            Math.max(1, groups.length)) *
            10,
        ) / 10,
    },
    verdict,
    summaryLines,
  };
}

/** 从题干 AST 一步得到阅读诊断（preview / 卷面 / inspect 共用） */
export function analyzeReadingFlowFromAst(
  ast: EducationalDocumentAstV1,
  layout?: EducationalCognitiveLayoutV1,
): ReadingFlowDocumentDiagnosticsV1 {
  const lay = layout ?? buildEducationalCognitiveGroups(ast);
  return analyzeReadingFlow(lay);
}

/** Cognitive telemetry facts（`--find reading.continuity` 等） */
export function emitReadingFlowDiagnosticFacts(
  diag: ReadingFlowDocumentDiagnosticsV1,
): SemanticLineageFactV1[] {
  const phase = "presentation" as const;
  const r = diag.rollup;
  return [
    createSemanticFact(phase, ReadingFlowFactKey.analyzerVersion, diag.version, ["reading_analyzer"]),
    createSemanticFact(phase, ReadingFlowFactKey.verdict, diag.verdict, ["reading_verdict", "cognitive_gate"]),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.continuityMeanScore,
      String(r.meanContinuityScore),
      ["reading.continuity", "continuity_score"],
    ),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.figureDetachmentMaxRisk,
      String(r.maxFigureDetachmentRisk),
      ["figure_detachment_risk"],
    ),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.interruptionMaxRisk,
      String(r.maxInterruptionRisk),
      ["interruption_risk"],
    ),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.mobileStackedDropMean,
      String(r.meanMobileStackedContinuityDrop),
      ["mobile_stacked_continuity_drop"],
    ),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.attentionJumpTotal,
      String(r.totalAttentionJumps),
      ["attention_jump"],
    ),
    createSemanticFact(
      phase,
      ReadingFlowFactKey.questionWithFigureCount,
      String(r.questionWithFigureCount),
      ["question_with_figure_count"],
    ),
  ];
}

/** 供 compositor / debug 面板用的简短行 */
export function formatReadingFlowDiagnosticReport(diag: ReadingFlowDocumentDiagnosticsV1): string[] {
  const lines = [
    `reading_flow_analyzer=${diag.version} verdict=${diag.verdict}`,
    ...diag.summaryLines.map((l) => `  ${l}`),
  ];
  for (const g of diag.groups.filter((x) => x.findings.length > 0)) {
    lines.push(
      `  [${g.groupId}] role=${g.role} detach=${g.figureDetachmentRisk} cont=${g.continuityScore} mobile_drop=${g.mobileStackedContinuityDrop} ${g.findings.join(",")}`,
    );
  }
  return lines;
}
