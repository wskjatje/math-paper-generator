"use client";

import { EducationalAstNodeRenderer } from "@/components/education/EducationalAstNodeRenderer";
import type { FigureNodeV1, SubquestionNodeV1 } from "@/lib/educationalAst.shared";
import type { SectionNodeV1 } from "@/lib/educationalAst.shared";
import type { CognitiveGroupV1 } from "@/lib/educationalCognitiveGroup.shared";
import { compositionClassNames } from "@/lib/educationalCompositionConstraint.shared";
import type { AdaptivePresentationV1 } from "@/lib/readingFlowSemantics.shared";
import {
  packingHintForGroup,
  type CognitivePackingRuntimeV1,
} from "@/lib/cognitivePackingRuntime.shared";
import type { FigureCognitiveSemanticsRuntimeV1 } from "@/lib/figureCognitiveSemantics.shared";
import { cn } from "@/lib/utils";

type Props = {
  group: CognitiveGroupV1;
  /** Composition runtime 解析后的 viewport lowering（优先于 readingSemantics） */
  effectiveAdaptivePresentation?: AdaptivePresentationV1;
  extraCompositionClassNames?: string;
  section?: SectionNodeV1;
  figureSemantics?: FigureCognitiveSemanticsRuntimeV1;
  cognitivePacking?: CognitivePackingRuntimeV1;
  onFigureDecodeFailed?: () => void;
};

function renderMember(
  member: SubquestionNodeV1 | FigureNodeV1,
  figureSemantics: FigureCognitiveSemanticsRuntimeV1 | undefined,
  cognitivePacking: CognitivePackingRuntimeV1 | undefined,
  onFigureDecodeFailed?: () => void,
) {
  if (member.type === "figure") {
    return (
      <EducationalAstNodeRenderer
        node={{ ...member, placement: "inline_with_subquestion", layoutKind: "compact" }}
        figureSemantics={figureSemantics}
        cognitivePacking={cognitivePacking}
        onFigureDecodeFailed={onFigureDecodeFailed}
      />
    );
  }
  return (
    <EducationalAstNodeRenderer
      node={member}
      figureSemantics={figureSemantics}
      cognitivePacking={cognitivePacking}
      nested
      onFigureDecodeFailed={onFigureDecodeFailed}
    />
  );
}

/**
 * P2.4.2–3 — compose(cognitiveGroup) 按 readingSemantics.steps 编排（非 DOM 邻接）。
 */
export function EducationalCognitiveGroupRenderer({
  group,
  effectiveAdaptivePresentation,
  extraCompositionClassNames,
  section,
  figureSemantics,
  cognitivePacking,
  onFigureDecodeFailed,
}: Props) {
  const sem = group.readingSemantics;
  const packing = packingHintForGroup(cognitivePacking, group.id);
  const hintClass = cn(
    compositionClassNames(group.layoutHints),
    extraCompositionClassNames,
    packing?.classNames,
  );
  const presentation =
    effectiveAdaptivePresentation ?? sem.adaptivePresentation;
  const inlineFigure = presentation === "inline_figure_right";
  const inlineTight = packing?.transforms.includes("inline_persistence_tuning") === true;

  if (group.role === "section_preamble" && section) {
    return (
      <div
        className={cn("math-paper-section-preamble", hintClass)}
        data-cognitive-group={group.id}
        data-cognitive-role={group.role}
        data-attention-priority={sem.attentionPriority}
        data-interruption-cost={sem.interruptionCost}
      >
        <EducationalAstNodeRenderer
          node={{ ...section, children: [] }}
          onFigureDecodeFailed={onFigureDecodeFailed}
        />
      </div>
    );
  }

  if (group.role === "question_with_figure") {
    return (
      <div
        className={cn(
          "math-paper-question-cluster",
          "rounded-md border border-border/40 bg-card/50 px-3 sm:px-4",
          !packing?.classNames.includes("my-") && "my-3 py-3",
          hintClass,
        )}
        data-cognitive-group={group.id}
        data-cognitive-role={group.role}
        data-reading-flow={group.readingFlow}
        data-adaptive-presentation={presentation}
        data-reading-adaptive-presentation={sem.adaptivePresentation}
        data-attention-priority={sem.attentionPriority}
        data-continuity-weight={sem.continuityWeight}
        data-question-anchor={group.questionAnchor}
        data-figure-anchor={group.figureAnchor}
      >
        <div
          className={cn(
            "math-paper-reading-flow",
            inlineFigure
              ? cn(
                  "flex flex-col sm:flex-row sm:items-start",
                  inlineTight ? "gap-2 sm:gap-2" : "gap-3 sm:gap-4",
                )
              : cn("flex flex-col", inlineTight ? "gap-2" : "gap-3"),
          )}
        >
          {sem.steps.map((step) => {
            const member = group.members.find((m) => m.id === step.nodeId);
            if (!member) return null;
            const isQuestion = step.kind === "question";
            return (
              <div
                key={step.nodeId}
                className={cn(
                  isQuestion
                    ? "min-w-0 flex-1"
                    : cn(
                        "w-full shrink-0",
                        inlineTight
                          ? "sm:max-w-[min(38%,260px)]"
                          : "sm:max-w-[min(42%,300px)]",
                      ),
                )}
                data-reading-step={step.kind}
                data-attention-priority={step.attentionPriority}
              >
                {renderMember(member, figureSemantics, cognitivePacking, onFigureDecodeFailed)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (group.role === "subquestion_cluster" || group.role === "standalone_figure") {
    const member = group.members[0];
    if (!member) return null;
    return (
      <div
        className={cn(
          group.role === "subquestion_cluster"
            ? "math-paper-subquestion-cluster my-2.5 pl-4 sm:pl-5"
            : "math-paper-figure-cluster my-2",
          hintClass,
        )}
        data-cognitive-group={group.id}
        data-cognitive-role={group.role}
        data-attention-priority={sem.attentionPriority}
      >
        {renderMember(member, figureSemantics, cognitivePacking, onFigureDecodeFailed)}
      </div>
    );
  }

  return null;
}
