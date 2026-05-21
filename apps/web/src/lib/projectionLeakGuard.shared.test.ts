import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { injectRegistryFiguresIntoEducationalAst } from "@/lib/injectRegistryFiguresIntoEducationalAst.shared";
import type { ResolvedFigureResourcesV1 } from "@/lib/figureOwnership.shared";
import { buildEducationalAstForQuestion } from "@/lib/buildEducationalAstForQuestion.shared";
import {
  astHasRootLevelFigureOrphans,
  collectFigureSrcUrlsFromAst,
  filterRasterAppendixUrlsForEplPresentation,
  normalizeProjectedFigureUrl,
} from "@/lib/projectionLeakGuard.shared";
import { createEducationalRenderableDocument } from "@/lib/educationalRenderableDocument.shared";

describe("projectionLeakGuard P0 Train 1", () => {
  it("filterRasterAppendixUrls removes URLs already in EPL ast", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/f.png)`);
    const doc = createEducationalRenderableDocument(ast);
    const filtered = filterRasterAppendixUrlsForEplPresentation(["/f.png", "/extra.png"], doc);
    expect(filtered).toEqual(["/extra.png"]);
  });

  it("injectRegistry skips duplicate URL and avoids root orphan figures", () => {
    const ast = buildEducationalAstFromCanonical(`（II）\n① 如图②\n![图②](/same.png)`);
    const resolved: ResolvedFigureResourcesV1 = {
      version: 1,
      figures: [
        {
          version: 1,
          figure_id: "a",
          raster_url: "/same.png",
          source: "page_crop",
          labels: ["图②"],
        },
        {
          version: 1,
          figure_id: "b",
          raster_url: "/same.png",
          source: "page_crop",
          labels: ["附图1"],
        },
      ],
      figureRefs: [
        { version: 1, figure_id: "a", source: "page_crop", scope: "question" },
        { version: 1, figure_id: "b", source: "page_crop", scope: "question" },
      ],
      rasterStemUrlsResolved: ["/same.png"],
      inheritedRefCount: 0,
    };
    const out = injectRegistryFiguresIntoEducationalAst(ast, resolved);
    expect(astHasRootLevelFigureOrphans(out)).toBe(false);
    const urls = collectFigureSrcUrlsFromAst(out);
    expect(urls.has(normalizeProjectedFigureUrl("/same.png"))).toBe(true);
    expect([...urls].filter((u) => u.includes("same.png")).length).toBe(1);
  });

  it("buildEducationalAstForQuestion dedupes appendix candidates", () => {
    const ast = buildEducationalAstForQuestion({
      canonicalText: `（II）\n① 如图②\n![图②](/r.png)`,
      exam: {
        figure_registry: [
          {
            version: 1,
            figure_id: "r1",
            raster_url: "/r.png",
            source: "page_crop",
            labels: ["图②"],
          },
        ],
      },
      question: {
        id: "q1",
        figure_refs: [{ version: 1, figure_id: "r1", source: "page_crop", scope: "question" }],
      },
    });
    expect(astHasRootLevelFigureOrphans(ast)).toBe(false);
  });
});
