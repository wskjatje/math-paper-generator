import { describe, expect, it } from "vitest";

import {
  canonicalFigureLabelToken,
  expandFigureLabelTokenAliases,
  extractLinkerTokensFromTextAnchor,
} from "@/lib/figureDiagramLabelTokens.shared";

describe("figureDiagramLabelTokens", () => {
  it("maps 图(1) to 图①", () => {
    expect(canonicalFigureLabelToken("图(1)")).toBe("图①");
    expect(canonicalFigureLabelToken("图（2）")).toBe("图②");
  });

  it("expand aliases for linker registry match", () => {
    const aliases = expandFigureLabelTokenAliases("图(1)");
    expect(aliases).toContain("图①");
    expect(aliases).toContain("①");
  });

  it("extract tokens from 如图(2) anchor", () => {
    expect(extractLinkerTokensFromTextAnchor("如图(2)")).toEqual(["图②"]);
  });
});
