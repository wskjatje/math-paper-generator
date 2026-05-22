import { describe, expect, it } from "vitest";

import { deriveFigureRegistryLabelsFromPageCropUrl } from "@/lib/figureRegistryLabels.shared";

describe("deriveFigureRegistryLabelsFromPageCropUrl (P7-1B STEP 1)", () => {
  it("从路径中抽取 图① 与 ①", () => {
    const u = "https://cdn/x/%E5%9B%BE%E2%91%A0.png";
    const got = deriveFigureRegistryLabelsFromPageCropUrl(u);
    expect(got).toBeDefined();
    expect(new Set(got)).toEqual(new Set(["图①", "①"]));
  });

  it("抽取 ASCII 图序号", () => {
    expect(deriveFigureRegistryLabelsFromPageCropUrl("/import/p1-图2.png")).toEqual(["2", "图2"]);
  });

  it("Fig.3 英文图注", () => {
    const got = deriveFigureRegistryLabelsFromPageCropUrl("/papers/fig3-preview.png");
    expect(got).toBeDefined();
    expect(new Set(got)).toEqual(new Set(["3", "Fig.3"]));
  });

  it("裁图 slug p0-图② 写入 registry labels", () => {
    const got = deriveFigureRegistryLabelsFromPageCropUrl(
      "/import-figures/batch/p0-图②.png",
    );
    expect(got).toBeDefined();
    expect(new Set(got)).toEqual(new Set(["②", "图②"]));
  });

  it("无图注片段时返回 undefined", () => {
    expect(deriveFigureRegistryLabelsFromPageCropUrl("https://x/y.png")).toBeUndefined();
  });
});
