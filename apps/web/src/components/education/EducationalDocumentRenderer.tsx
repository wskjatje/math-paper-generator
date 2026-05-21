"use client";

import { useMemo } from "react";

import { EducationalAstNodeRenderer } from "@/components/education/EducationalAstNodeRenderer";
import { EducationalSectionCompositor } from "@/components/education/EducationalSectionCompositor";
import {
  composeEducationalDocument,
  composedGroupsForSection,
  type CompositionViewportProfileV1,
} from "@/lib/educationalCompositionRuntime.shared";
import type { EducationalRenderableDocumentV1 } from "@/lib/educationalRenderableDocument.shared";
import { cn } from "@/lib/utils";

type Props = {
  /** P2.1：唯一合法输入；禁止传入 canonical 字符串 */
  document: EducationalRenderableDocumentV1;
  className?: string;
  showForensic?: boolean;
  /** Composition runtime viewport（Web 默认 desktop_paper） */
  viewportProfile?: CompositionViewportProfileV1;
  onFigureDecodeFailed?: () => void;
};

/**
 * EPL compositor 入口：ast → cognitive_layout → compose（非平铺 token render）。
 */
export function EducationalDocumentRenderer({
  document,
  className,
  showForensic = false,
  viewportProfile = "desktop_paper",
  onFigureDecodeFailed,
}: Props) {
  const composed = useMemo(
    () => composeEducationalDocument(document, { viewportProfile }),
    [document, viewportProfile],
  );
  const ast = document.ast;
  const layout = document.cognitive_layout;
  const prov = document.presentation_provenance;
  const visibleNodes = showForensic
    ? ast.nodes
    : ast.nodes.filter((n) => n.type !== "forensic_banner");

  return (
    <div
      className={cn(
        "math-paper-render rounded-lg border border-border/80 bg-card px-4 py-4 shadow-sm",
        "font-serif max-w-none space-y-3",
        className,
      )}
      data-epl-runtime={ast.runtime}
      data-epl-schema={ast.version}
      data-epl-derived-from={ast.derived_from}
      data-ecgr-version={layout.version}
      data-ecgr-replay-mutation={layout.replay_mutation}
      data-reading-flow-runtime={layout.reading_flow_runtime}
      data-reading-verdict={document.reading_flow_diagnostics.verdict}
      data-epl-presentation-authority={prov.presentation_authority}
      data-epl-composition-runtime={prov.composition_runtime}
      data-epl-layout-strategy={prov.layout_strategy}
      data-composition-runtime={composed.version}
      data-composition-profile={composed.viewport_profile}
      data-figure-semantics-runtime={document.figure_cognitive_semantics.version}
    >
      {visibleNodes.map((node) => {
        if (node.type === "section") {
          return (
            <EducationalSectionCompositor
              key={node.id}
              section={node}
              composedGroups={composedGroupsForSection(composed, node.label)}
              figureSemantics={document.figure_cognitive_semantics}
              onFigureDecodeFailed={onFigureDecodeFailed}
            />
          );
        }
        return (
          <EducationalAstNodeRenderer
            key={node.id}
            node={node}
            figureSemantics={document.figure_cognitive_semantics}
            onFigureDecodeFailed={onFigureDecodeFailed}
          />
        );
      })}
    </div>
  );
}
