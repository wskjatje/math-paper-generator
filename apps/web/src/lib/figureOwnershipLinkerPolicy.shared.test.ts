import { describe, expect, it } from "vitest";

import type { FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import {
  candidateFigureIdsForExactLabelToken,
  extractLinkerTokensFromTextAnchor,
  matchRegistryByExactLabelToken,
  poolTierAllowsAuthoritativeFigureBind,
} from "@/lib/figureOwnershipLinkerPolicy.shared";

describe("figureOwnershipLinkerPolicy (STEP 2 契约)", () => {
  it("poolTierAllowsAuthoritativeFigureBind：仅 question_local_registry 为 true", () => {
    expect(poolTierAllowsAuthoritativeFigureBind("question_local_registry")).toBe(true);
    expect(poolTierAllowsAuthoritativeFigureBind("exam_global_registry")).toBe(false);
    expect(poolTierAllowsAuthoritativeFigureBind("raw_stem_url")).toBe(false);
    expect(poolTierAllowsAuthoritativeFigureBind("empty")).toBe(false);
  });

  it("matchRegistryByExactLabelToken：唯一命中", () => {
    const reg: FigureRegistryItemV1[] = [
      {
        version: 1,
        figure_id: "a",
        source: "page_crop",
        labels: ["图②", "②"],
      },
      {
        version: 1,
        figure_id: "b",
        source: "page_crop",
        labels: ["图①", "①"],
      },
    ];
    expect(matchRegistryByExactLabelToken("图①", reg)).toEqual({
      kind: "unique",
      figure_id: "b",
    });
    const regBothOne: FigureRegistryItemV1[] = [
      { version: 1, figure_id: "p", source: "page_crop", labels: ["图①", "①"] },
      { version: 1, figure_id: "q", source: "page_crop", labels: ["①", "其它"] },
    ];
    expect(matchRegistryByExactLabelToken("①", regBothOne)).toEqual({ kind: "ambiguous" });
  });

  it("matchRegistryByExactLabelToken：OCR 图(1) 别名命中 图①", () => {
    const reg: FigureRegistryItemV1[] = [
      { version: 1, figure_id: "a", source: "page_crop", labels: ["图①", "①"] },
    ];
    expect(matchRegistryByExactLabelToken("图(1)", reg)).toEqual({
      kind: "unique",
      figure_id: "a",
    });
  });

  it("matchRegistryByExactLabelToken：无命中", () => {
    const reg: FigureRegistryItemV1[] = [
      { version: 1, figure_id: "a", source: "page_crop", labels: ["图①"] },
    ];
    expect(matchRegistryByExactLabelToken("图③", reg)).toEqual({ kind: "none" });
    expect(matchRegistryByExactLabelToken("", reg)).toEqual({ kind: "none" });
  });

  it("extractLinkerTokensFromTextAnchor / candidateFigureIdsForExactLabelToken", () => {
    expect(extractLinkerTokensFromTextAnchor("如图①及Fig. 2")).toEqual(["图①", "Fig.2"]);
    expect(extractLinkerTokensFromTextAnchor("如图O")).toEqual(["图O"]);
    expect(extractLinkerTokensFromTextAnchor("图ABC")).toEqual(["图ABC"]);
    expect(extractLinkerTokensFromTextAnchor("如图O及图B")).toEqual(["图O", "图B"]);
    const reg: FigureRegistryItemV1[] = [
      { version: 1, figure_id: "z", source: "page_crop", labels: ["图①"] },
    ];
    expect(candidateFigureIdsForExactLabelToken("图①", reg)).toEqual(["z"]);
  });

  it("matchRegistryByExactLabelToken：多项含同一 token → ambiguous", () => {
    const reg: FigureRegistryItemV1[] = [
      { version: 1, figure_id: "x", source: "page_crop", labels: ["图①"] },
      { version: 1, figure_id: "y", source: "page_crop", labels: ["图①", "备用"] },
    ];
    expect(matchRegistryByExactLabelToken("图①", reg)).toEqual({ kind: "ambiguous" });
  });
});
