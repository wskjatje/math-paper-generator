import { describe, expect, it } from "vitest";

import {
  insertEnumerationLineBreaks,
  parseEducationalDocumentFromCanonical,
} from "@/lib/educationalDocumentAst.shared";

describe("parseEducationalDocumentFromCanonical", () => {
  it("splits sections and extracts figure block", () => {
    const canonical = `题干行
（I）填空部分
（II）将等边△DEF平移
① 如图②，求面积
② 当 t 变化
图① 图②
![第1题示意图](/import-figures/x.png)`;
    const doc = parseEducationalDocumentFromCanonical(canonical);
    expect(doc.blocks.some((b) => b.kind === "section" && b.label === "（I）")).toBe(true);
    expect(doc.blocks.some((b) => b.kind === "subpart" && b.label === "①")).toBe(true);
    const figBlocks = doc.blocks.filter((b) => b.kind === "figure");
    expect(figBlocks.some((b) => b.figureSrc?.includes("x.png"))).toBe(true);
    const iIdx = doc.blocks.findIndex((b) => b.label === "（I）");
    const figAfterI = doc.blocks.findIndex(
      (b, i) => i > iIdx && b.kind === "figure" && b.label === "图①",
    );
    expect(figAfterI).toBeGreaterThan(iIdx);
  });
});

describe("insertEnumerationLineBreaks", () => {
  it("inserts breaks before enumeration markers", () => {
    const out = insertEnumerationLineBreaks("abc (1) def (2) ghi");
    expect(out).toContain("\n(1)");
  });
});
