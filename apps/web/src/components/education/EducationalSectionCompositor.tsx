"use client";

import { EducationalCognitiveGroupRenderer } from "@/components/education/EducationalCognitiveGroupRenderer";
import type { SectionNodeV1 } from "@/lib/educationalAst.shared";
import type { ComposedGroupPositionV1 } from "@/lib/educationalCompositionRuntime.shared";
import type { CognitivePackingRuntimeV1 } from "@/lib/cognitivePackingRuntime.shared";
import type { FigureCognitiveSemanticsRuntimeV1 } from "@/lib/figureCognitiveSemantics.shared";
import { cn } from "@/lib/utils";

type Props = {
  section: SectionNodeV1;
  /** Phase 1 composition ABI（非裸 CognitiveGroup 猜测布局） */
  composedGroups: ComposedGroupPositionV1[];
  figureSemantics?: FigureCognitiveSemanticsRuntimeV1;
  cognitivePacking?: CognitivePackingRuntimeV1;
  showPackingDebug?: boolean;
  onFigureDecodeFailed?: () => void;
};

/** 大问 compositor：preamble + 认知组（①+图② 等为 QuestionCluster） */
export function EducationalSectionCompositor({
  section,
  composedGroups,
  figureSemantics,
  cognitivePacking,
  showPackingDebug,
  onFigureDecodeFailed,
}: Props) {
  const preamble = composedGroups.find((g) => g.role === "section_preamble");
  const bodyGroups = composedGroups.filter((g) => g.role !== "section_preamble");

  return (
    <section
      className="math-paper-section-composite mt-4 first:mt-0"
      data-section={section.label}
    >
      {preamble ? (
        <EducationalCognitiveGroupRenderer
          group={preamble.cognitiveGroup}
          effectiveAdaptivePresentation={preamble.effectiveAdaptivePresentation}
          extraCompositionClassNames={preamble.compositionClassNames}
          section={section}
          figureSemantics={figureSemantics}
          cognitivePacking={cognitivePacking}
          showPackingDebug={showPackingDebug}
          onFigureDecodeFailed={onFigureDecodeFailed}
        />
      ) : (
        <EducationalCognitiveGroupRenderer
          group={{
            id: `cg-sec-${section.label}-header-fallback`,
            role: "section_preamble",
            sectionLabel: section.label,
            readingFlow: "vertical",
            readingOrder: [section.id],
            members: [],
            layoutHints: {},
          }}
          section={section}
          onFigureDecodeFailed={onFigureDecodeFailed}
        />
      )}
      <div
        className={cn(
          "math-paper-section-body mt-2 space-y-1",
          "border-l-2 border-primary/15 pl-3 sm:pl-4",
        )}
      >
        {bodyGroups.map((p) => (
          <EducationalCognitiveGroupRenderer
            key={p.groupId}
            group={p.cognitiveGroup}
            effectiveAdaptivePresentation={p.effectiveAdaptivePresentation}
            extraCompositionClassNames={p.compositionClassNames}
            figureSemantics={figureSemantics}
            cognitivePacking={cognitivePacking}
            showPackingDebug={showPackingDebug}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        ))}
      </div>
    </section>
  );
}
