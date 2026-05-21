/**
 * P3.4-2 Train 3 — Cognitive packing runtime（topology-preserving spatial realization only）。
 *
 * 只产出 projection spatial hints（classNames / maxHeight / suppressRender）。
 * 禁止：regroup · reorder · adaptivePresentation · readingSemantics · continuity mutation。
 *
 * @see docs/governance/COGNITIVE-PACKING-FIDELITY-v1.md § Train 3
 */
import type { CognitiveGroupV1, EducationalCognitiveLayoutV1 } from "@/lib/educationalCognitiveGroup.shared";
import {
  figureSemanticsById,
  type FigureCognitiveSemanticsRuntimeV1,
  type FigureCognitiveRoleV1,
} from "@/lib/figureCognitiveSemantics.shared";

export const COGNITIVE_PACKING_RUNTIME_VERSION = "cognitive_packing_runtime_v1" as const;

export type PackingTransformAppliedV1 =
  | "adjacency_tightening"
  | "supportive_compaction"
  | "inline_persistence_tuning"
  | "transient_collapse";

export type GroupPackingSpatialHintV1 = {
  groupId: string;
  classNames: string;
  transforms: PackingTransformAppliedV1[];
};

export type FigurePackingSpatialHintV1 = {
  figureId: string;
  classNames: string;
  maxHeightClass?: string;
  /** 主阅读流内不渲染（projection；不改变 cognitive group 拓扑） */
  suppressRender?: boolean;
  transforms: PackingTransformAppliedV1[];
};

export type CognitivePackingRuntimeV1 = {
  version: typeof COGNITIVE_PACKING_RUNTIME_VERSION;
  replay_mutation: "none";
  groupHints: GroupPackingSpatialHintV1[];
  figureHints: FigurePackingSpatialHintV1[];
};

function joinClasses(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

function figureRole(
  semantics: FigureCognitiveSemanticsRuntimeV1,
  figureId: string,
): FigureCognitiveRoleV1 | undefined {
  return figureSemanticsById(semantics).get(figureId)?.role;
}

function sectionGroupSequence(layout: EducationalCognitiveLayoutV1, sectionLabel: string): CognitiveGroupV1[] {
  return layout.groups.filter((g) => g.sectionLabel === sectionLabel);
}

/**
 * 派生 packing hints（只读 document；不 mutate ast / cognitive_layout / readingSemantics）。
 */
export function buildCognitivePackingRuntime(
  layout: EducationalCognitiveLayoutV1,
  figureSemantics: FigureCognitiveSemanticsRuntimeV1,
): CognitivePackingRuntimeV1 {
  const groupHints: GroupPackingSpatialHintV1[] = [];
  const figureHintsById = new Map<string, FigurePackingSpatialHintV1>();

  const pushFigureHint = (hint: FigurePackingSpatialHintV1) => {
    const prev = figureHintsById.get(hint.figureId);
    if (!prev) {
      figureHintsById.set(hint.figureId, hint);
      return;
    }
    figureHintsById.set(hint.figureId, {
      figureId: hint.figureId,
      classNames: joinClasses([prev.classNames, hint.classNames]),
      maxHeightClass: hint.maxHeightClass ?? prev.maxHeightClass,
      suppressRender: prev.suppressRender || hint.suppressRender,
      transforms: [...new Set([...prev.transforms, ...hint.transforms])],
    });
  };

  const sectionLabels = [...new Set(layout.groups.map((g) => g.sectionLabel).filter(Boolean))];
  for (const label of sectionLabels) {
    const inSection = sectionGroupSequence(layout, label);
    for (let i = 0; i < inSection.length; i++) {
      const group = inSection[i]!;
      const prev = i > 0 ? inSection[i - 1] : undefined;
      const afterQwf = prev?.role === "question_with_figure";

      if (group.role === "question_with_figure") {
        const transforms: PackingTransformAppliedV1[] = ["adjacency_tightening"];
        const classes = ["my-1.5", "sm:my-2", "py-2", "sm:py-2.5"];
        if (group.readingSemantics.adaptivePresentation === "inline_figure_right") {
          transforms.push("inline_persistence_tuning");
          classes.push("math-paper-packing-inline-tight");
        }
        groupHints.push({
          groupId: group.id,
          classNames: joinClasses(classes),
          transforms,
        });
      }

      if (group.role === "subquestion_cluster") {
        const transforms: PackingTransformAppliedV1[] = ["adjacency_tightening"];
        const classes = afterQwf
          ? ["my-0.5", "mt-0.5", "pl-3", "sm:pl-4"]
          : ["my-1", "pl-3", "sm:pl-4"];
        groupHints.push({ groupId: group.id, classNames: joinClasses(classes), transforms });
      }

      if (group.role === "standalone_figure") {
        const fig = group.members.find((m) => m.type === "figure");
        if (fig?.type === "figure") {
          const role = figureRole(figureSemantics, fig.id);
          if (role === "transient" || role === "appendix_only") {
            groupHints.push({
              groupId: group.id,
              classNames: "hidden",
              transforms: ["transient_collapse"],
            });
            pushFigureHint({
              figureId: fig.id,
              classNames: "",
              suppressRender: true,
              transforms: ["transient_collapse"],
            });
          } else if (afterQwf) {
            groupHints.push({
              groupId: group.id,
              classNames: "my-0.5",
              transforms: ["adjacency_tightening"],
            });
          }
        }
      }
    }
  }

  for (const entry of figureSemantics.entries) {
    if (entry.role === "supportive") {
      pushFigureHint({
        figureId: entry.figureId,
        classNames: "my-1 opacity-95",
        maxHeightClass: "max-h-[min(22vh,168px)]",
        transforms: ["supportive_compaction"],
      });
      continue;
    }
    if (entry.role === "appendix_only") {
      pushFigureHint({
        figureId: entry.figureId,
        classNames: "",
        suppressRender: true,
        transforms: ["transient_collapse"],
      });
    }
  }

  return {
    version: COGNITIVE_PACKING_RUNTIME_VERSION,
    replay_mutation: "none",
    groupHints,
    figureHints: [...figureHintsById.values()],
  };
}

export function packingHintForGroup(
  runtime: CognitivePackingRuntimeV1 | undefined,
  groupId: string,
): GroupPackingSpatialHintV1 | undefined {
  return runtime?.groupHints.find((h) => h.groupId === groupId);
}

export function packingHintForFigure(
  runtime: CognitivePackingRuntimeV1 | undefined,
  figureId: string,
): FigurePackingSpatialHintV1 | undefined {
  return runtime?.figureHints.find((h) => h.figureId === figureId);
}
