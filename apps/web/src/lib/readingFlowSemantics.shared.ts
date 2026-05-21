/**
 * P2.4.3 — ReadingFlow Runtime（认知阅读语义；与 visual layout 分离）。
 */
import type { FigureNodeV1, SubquestionNodeV1 } from "@/lib/educationalAst.shared";
import type { CognitiveGroupRoleV1, ReadingFlowV1 } from "@/lib/educationalCognitiveGroup.shared";

export const READING_FLOW_RUNTIME_ID = "reading_flow_runtime_v1" as const;

export type ReadingStepKindV1 =
  | "stem"
  | "section_preamble"
  | "question"
  | "figure"
  | "paragraph";

export type ReadingStepV1 = {
  kind: ReadingStepKindV1;
  nodeId: string;
  /** 0–100：compositor 注意力排序 */
  attentionPriority: number;
};

/** 目标呈现形态（语义）；Web 用 CSS  lowering，PDF/mobile 可换实现 */
export type AdaptivePresentationV1 = "inline_figure_right" | "stacked_vertical";

export type ReadingFlowSemanticsV1 = {
  runtime: typeof READING_FLOW_RUNTIME_ID;
  /** 认知阅读步序（question → figure → …） */
  steps: ReadingStepV1[];
  /** 组级最高注意力 */
  attentionPriority: number;
  /** 打断成本：分页/插屏不应切开此组 */
  interruptionCost: number;
  /** 连续性权重：keep-together 强度 */
  continuityWeight: number;
  adaptivePresentation: AdaptivePresentationV1;
};

export function buildReadingFlowSemantics(opts: {
  role: CognitiveGroupRoleV1;
  readingFlow: ReadingFlowV1;
  members: Array<SubquestionNodeV1 | FigureNodeV1>;
  sectionLabel?: string;
}): ReadingFlowSemanticsV1 {
  const { role, readingFlow, members } = opts;

  if (role === "question_with_figure") {
    const sub = members.find((m) => m.type === "subquestion");
    const fig = members.find((m) => m.type === "figure");
    const steps: ReadingStepV1[] = [];
    if (sub) steps.push({ kind: "question", nodeId: sub.id, attentionPriority: 100 });
    if (fig) steps.push({ kind: "figure", nodeId: fig.id, attentionPriority: 88 });
    return {
      runtime: READING_FLOW_RUNTIME_ID,
      steps,
      attentionPriority: 100,
      interruptionCost: 92,
      continuityWeight: 96,
      adaptivePresentation: "inline_figure_right",
    };
  }

  if (role === "subquestion_cluster") {
    const sub = members.find((m) => m.type === "subquestion");
    const steps: ReadingStepV1[] = sub
      ? [{ kind: "question", nodeId: sub.id, attentionPriority: 82 }]
      : [];
    return {
      runtime: READING_FLOW_RUNTIME_ID,
      steps,
      attentionPriority: 82,
      interruptionCost: 72,
      continuityWeight: 78,
      adaptivePresentation: "stacked_vertical",
    };
  }

  if (role === "standalone_figure") {
    const fig = members.find((m) => m.type === "figure");
    const steps: ReadingStepV1[] = fig
      ? [{ kind: "figure", nodeId: fig.id, attentionPriority: 75 }]
      : [];
    return {
      runtime: READING_FLOW_RUNTIME_ID,
      steps,
      attentionPriority: 75,
      interruptionCost: 65,
      continuityWeight: 70,
      adaptivePresentation: "stacked_vertical",
    };
  }

  if (role === "section_preamble") {
    return {
      runtime: READING_FLOW_RUNTIME_ID,
      steps: [{ kind: "section_preamble", nodeId: "", attentionPriority: 70 }],
      attentionPriority: 70,
      interruptionCost: 55,
      continuityWeight: 60,
      adaptivePresentation: "stacked_vertical",
    };
  }

  if (role === "stem_block") {
    return {
      runtime: READING_FLOW_RUNTIME_ID,
      steps: [{ kind: "stem", nodeId: "", attentionPriority: 98 }],
      attentionPriority: 98,
      interruptionCost: 85,
      continuityWeight: 80,
      adaptivePresentation: "stacked_vertical",
    };
  }

  return {
    runtime: READING_FLOW_RUNTIME_ID,
    steps: [{ kind: "paragraph", nodeId: "", attentionPriority: 50 }],
    attentionPriority: 50,
    interruptionCost: 40,
    continuityWeight: 45,
    adaptivePresentation: "stacked_vertical",
  };
}

/** 由语义步生成 nodeId 阅读序（replay 稳定） */
export function readingOrderFromSemantics(sem: ReadingFlowSemanticsV1): string[] {
  return sem.steps.map((s) => s.nodeId).filter((id) => id.length > 0);
}
