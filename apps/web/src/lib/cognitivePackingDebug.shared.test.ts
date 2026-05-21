import { describe, expect, it } from "vitest";

import {
  formatPackingTransformsAttr,
  isPackingDebugEnabled,
  packingDebugDensityFromTransforms,
} from "@/lib/cognitivePackingDebug.shared";

describe("cognitivePackingDebug stabilization", () => {
  it("enables only in dev or explicit search flag", () => {
    expect(isPackingDebugEnabled({ dev: false, searchFlag: false })).toBe(false);
    expect(isPackingDebugEnabled({ dev: true })).toBe(true);
    expect(isPackingDebugEnabled({ searchFlag: true })).toBe(true);
  });

  it("formats transform footprint for DOM", () => {
    expect(formatPackingTransformsAttr(["adjacency_tightening", "supportive_compaction"])).toBe(
      "adjacency_tightening,supportive_compaction",
    );
  });

  it("derives density label from transforms", () => {
    expect(
      packingDebugDensityFromTransforms(["adjacency_tightening"], { suppressRender: false }),
    ).toBe("tight");
    expect(
      packingDebugDensityFromTransforms(["transient_collapse"], { suppressRender: true }),
    ).toBe("suppressed");
  });
});
