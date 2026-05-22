import { describe, expect, it } from "vitest";

import { parseFigureRegistryV1 } from "@/lib/figureOwnership.shared";

describe("parseFigureRegistryV1", () => {
  it("解析 P7-1B registry.labels", () => {
    const raw = [
      {
        version: 1,
        figure_id: "fid",
        raster_url: "https://x/a.png",
        source: "page_crop",
        labels: ["  图① ", "①", ""],
      },
    ];
    const out = parseFigureRegistryV1(raw);
    expect(out?.[0]?.labels).toEqual(["图①", "①"]);
  });
});
