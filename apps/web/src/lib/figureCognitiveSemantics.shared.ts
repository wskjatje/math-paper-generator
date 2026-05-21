/**
 * P3.4-1 Train 2 — Figure cognitive role（derived visual semantics；非 canonical truth）。
 *
 * 只调制 projection prominence（max size / salience / main-flow visibility）。
 * 禁止：regroup · reorder · reinterpret · hidden defer · 修改 adaptivePresentation。
 */
import type {
  EducationalAstNodeV1,
  EducationalDocumentAstV1,
  FigureNodeV1,
} from "@/lib/educationalAst.shared";
import { isFigureNode } from "@/lib/educationalAst.shared";
import type { CognitiveGroupV1, EducationalCognitiveLayoutV1 } from "@/lib/educationalCognitiveGroup.shared";

export const FIGURE_SEMANTICS_RUNTIME_VERSION = "figure_semantics_runtime_v1" as const;

export type FigureCognitiveRoleV1 =
  | "reasoning_core"
  | "supportive"
  | "transient"
  | "appendix_only";

export type FigureProjectionModulationV1 = {
  /** observational 0–100；非 governance rate truth */
  salienceWeight: number;
  maxHeightClass: string;
  maxWidthClass: string;
  /** 是否出现在 EPL 主阅读流（appendix_only 仅附录通道） */
  renderInMainFlow: boolean;
  captionEmphasis: "normal" | "muted";
};

export type FigureCognitiveSemanticsEntryV1 = {
  figureId: string;
  label: string;
  role: FigureCognitiveRoleV1;
  modulation: FigureProjectionModulationV1;
  derivedFrom: {
    cognitiveGroupId?: string;
    cognitiveGroupRole?: CognitiveGroupV1["role"];
    placement: FigureNodeV1["placement"];
    ownership?: FigureNodeV1["ownership"];
  };
};

export type FigureCognitiveSemanticsRuntimeV1 = {
  version: typeof FIGURE_SEMANTICS_RUNTIME_VERSION;
  replay_mutation: "none";
  entries: FigureCognitiveSemanticsEntryV1[];
  role_counts: Record<FigureCognitiveRoleV1, number>;
};

function collectFigureNodesFromAst(ast: EducationalDocumentAstV1): FigureNodeV1[] {
  const out: FigureNodeV1[] = [];
  const walk = (nodes: EducationalAstNodeV1[]) => {
    for (const n of nodes) {
      if (isFigureNode(n)) out.push(n);
      if (n.type === "section") walk(n.children);
    }
  };
  walk(ast.nodes);
  return out;
}

const ROLE_MODULATION: Record<FigureCognitiveRoleV1, FigureProjectionModulationV1> = {
  reasoning_core: {
    salienceWeight: 88,
    maxHeightClass: "max-h-[min(40vh,320px)]",
    maxWidthClass: "max-w-full",
    renderInMainFlow: true,
    captionEmphasis: "normal",
  },
  supportive: {
    salienceWeight: 52,
    maxHeightClass: "max-h-[min(26vh,200px)]",
    maxWidthClass: "max-w-full",
    renderInMainFlow: true,
    captionEmphasis: "muted",
  },
  transient: {
    salienceWeight: 38,
    maxHeightClass: "max-h-[min(20vh,150px)]",
    maxWidthClass: "max-w-full",
    renderInMainFlow: true,
    captionEmphasis: "muted",
  },
  appendix_only: {
    salienceWeight: 12,
    maxHeightClass: "max-h-[min(18vh,120px)]",
    maxWidthClass: "max-w-full",
    renderInMainFlow: false,
    captionEmphasis: "muted",
  },
};

function isAppendixLabel(label: string): boolean {
  return /^附图\d*/.test(label.trim()) || /^附录图/.test(label.trim());
}

function isPrimaryFigureLabel(label: string): boolean {
  return /^图[①②③④⑤⑥⑦⑧⑨0-9]+/.test(label.trim());
}

function findCognitiveGroupForFigure(
  layout: EducationalCognitiveLayoutV1,
  figureId: string,
): CognitiveGroupV1 | undefined {
  return layout.groups.find((g) => g.members.some((m) => m.type === "figure" && m.id === figureId));
}

/**
 * 派生 role（deterministic；仅读 AST + cognitive_layout）。
 */
function figureAppendixObserved(fig: FigureNodeV1): boolean {
  return isAppendixLabel(fig.label) || (fig.alt != null && isAppendixLabel(fig.alt));
}

export function inferFigureCognitiveRole(
  fig: FigureNodeV1,
  layout: EducationalCognitiveLayoutV1,
): FigureCognitiveRoleV1 {
  if (figureAppendixObserved(fig)) return "appendix_only";
  if (fig.placement === "end_fallback" && fig.registryId && !isPrimaryFigureLabel(fig.label)) {
    return "appendix_only";
  }

  const group = findCognitiveGroupForFigure(layout, fig.id);
  if (!group) {
    return fig.placement === "end_fallback" ? "appendix_only" : "transient";
  }

  if (group.role === "standalone_figure") {
    return figureAppendixObserved(fig) ? "appendix_only" : "transient";
  }

  if (group.role === "question_with_figure") {
    const sub = group.members.find((m) => m.type === "subquestion");
    const citesFigure = sub?.segments?.some((s) => {
      const t = s.kind === "text" ? s.value : "";
      return /如图/.test(t);
    });
    if (citesFigure && isPrimaryFigureLabel(fig.label)) return "supportive";
    if (isPrimaryFigureLabel(fig.label) && !citesFigure) return "reasoning_core";
    return "supportive";
  }

  return "transient";
}

export function buildFigureCognitiveSemanticsRuntime(
  ast: EducationalDocumentAstV1,
  layout: EducationalCognitiveLayoutV1,
): FigureCognitiveSemanticsRuntimeV1 {
  const figures = collectFigureNodesFromAst(ast);
  const role_counts: Record<FigureCognitiveRoleV1, number> = {
    reasoning_core: 0,
    supportive: 0,
    transient: 0,
    appendix_only: 0,
  };

  const entries: FigureCognitiveSemanticsEntryV1[] = figures.map((fig) => {
    const role = inferFigureCognitiveRole(fig, layout);
    role_counts[role] += 1;
    const group = findCognitiveGroupForFigure(layout, fig.id);
    return {
      figureId: fig.id,
      label: fig.label,
      role,
      modulation: ROLE_MODULATION[role],
      derivedFrom: {
        cognitiveGroupId: group?.id,
        cognitiveGroupRole: group?.role,
        placement: fig.placement,
        ownership: fig.ownership,
      },
    };
  });

  return {
    version: FIGURE_SEMANTICS_RUNTIME_VERSION,
    replay_mutation: "none",
    entries,
    role_counts,
  };
}

export function figureSemanticsById(
  runtime: FigureCognitiveSemanticsRuntimeV1,
): Map<string, FigureCognitiveSemanticsEntryV1> {
  return new Map(runtime.entries.map((e) => [e.figureId, e]));
}

export function resolveFigureProjectionModulation(
  runtime: FigureCognitiveSemanticsRuntimeV1 | undefined,
  figureId: string,
  layoutKindFallback: "compact" | "block",
): FigureProjectionModulationV1 & { layoutKindFallback: "compact" | "block" } {
  const entry = runtime?.entries.find((e) => e.figureId === figureId);
  const mod = entry?.modulation ?? ROLE_MODULATION.supportive;
  return { ...mod, layoutKindFallback };
}
