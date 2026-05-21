import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { injectRegistryFiguresIntoEducationalAst } from "@/lib/injectRegistryFiguresIntoEducationalAst.shared";
import type { ResolvedFigureResourcesV1 } from "@/lib/figureOwnership.shared";
import { isFigureNode } from "@/lib/educationalAst.shared";

function collectFigures(nodes: import("@/lib/educationalAst.shared").EducationalAstNodeV1[]) {
  const out: import("@/lib/educationalAst.shared").FigureNodeV1[] = [];
  for (const n of nodes) {
    if (isFigureNode(n)) out.push(n);
    if (n.type === "section") out.push(...collectFigures(n.children));
  }
  return out;
}

describe("injectRegistryFiguresIntoEducationalAst", () => {
  it("replaces markdown figure src with registry raster_url", () => {
    const ast = buildEducationalAstFromCanonical(
      `（I）填空\n![图①](/old.png)\n![图②](/old2.png)`,
    );
    const resolved: ResolvedFigureResourcesV1 = {
      version: 1,
      figures: [
        {
          version: 1,
          figure_id: "fid-1",
          raster_url: "/registry/图①.png",
          source: "page_crop",
          labels: ["图①"],
        },
        {
          version: 1,
          figure_id: "fid-2",
          raster_url: "/registry/图②.png",
          source: "page_crop",
          labels: ["图②"],
        },
      ],
      figureRefs: [
        { version: 1, figure_id: "fid-1", source: "page_crop", scope: "question" },
        { version: 1, figure_id: "fid-2", source: "page_crop", scope: "question" },
      ],
      rasterStemUrlsResolved: ["/registry/图①.png", "/registry/图②.png"],
      inheritedRefCount: 0,
    };

    const out = injectRegistryFiguresIntoEducationalAst(ast, resolved);
    expect(out.derived_from).toBe("canonical_text+figure_registry");
    const figs = collectFigures(out.nodes);
    expect(figs.some((f) => f.registryId === "fid-1" && f.src === "/registry/图①.png")).toBe(
      true,
    );
    expect(figs.every((f) => f.ownership === "bound")).toBe(true);
  });
});
