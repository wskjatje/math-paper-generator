import { describe, expect, it } from "vitest";

import {
  extractResolvableRasterUrlsFromMarkdown,
  isPlaceholderRasterAssetUrl,
  isResolvableRasterAssetUrl,
  resolveStemRasterSupplyState,
} from "@/lib/rasterAssetUrl.shared";

describe("rasterAssetUrl (materialization gate)", () => {
  it("isPlaceholderRasterAssetUrl：URL / 空 / #", () => {
    expect(isPlaceholderRasterAssetUrl("URL")).toBe(true);
    expect(isPlaceholderRasterAssetUrl("url")).toBe(true);
    expect(isPlaceholderRasterAssetUrl("")).toBe(true);
    expect(isPlaceholderRasterAssetUrl("###")).toBe(true);
  });

  it("isResolvableRasterAssetUrl：import-figures 与 https 有效", () => {
    expect(isResolvableRasterAssetUrl("/import-figures/batch/q1.png")).toBe(true);
    expect(isResolvableRasterAssetUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isResolvableRasterAssetUrl("http://example.com/offline-import/figure.png")).toBe(
      false,
    );
    expect(isResolvableRasterAssetUrl("URL")).toBe(false);
    expect(isResolvableRasterAssetUrl("blob:abc")).toBe(false);
  });

  it("extractResolvableRasterUrlsFromMarkdown：忽略占位符", () => {
    const s = "如图![](URL) 与 ![x](/import-figures/b/q.png)";
    expect(extractResolvableRasterUrlsFromMarkdown(s)).toEqual(["/import-figures/b/q.png"]);
  });

  it("resolveStemRasterSupplyState：placeholder vs materialized", () => {
    expect(
      resolveStemRasterSupplyState("如图![](URL)", [], false, undefined),
    ).toBe("placeholder");
    expect(
      resolveStemRasterSupplyState(
        "如图",
        ["/import-figures/x/a.png"],
        false,
        undefined,
      ),
    ).toBe("materialized");
    expect(resolveStemRasterSupplyState("如图", [], false, { runtimeRasterLoadFailed: true })).toBe(
      "broken",
    );
    expect(
      resolveStemRasterSupplyState(
        "如图①",
        [],
        true,
        undefined,
        ["/import-figures/batch/0.jpg"],
      ),
    ).toBe("materialized");
    expect(resolveStemRasterSupplyState("如图①", [], true, undefined, [])).toBe("broken");
  });
});
