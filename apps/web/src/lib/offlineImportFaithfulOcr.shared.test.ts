import { describe, expect, it } from "vitest";

import {
  applyFaithfulOfflineImportOcrText,
  normalizeFaithfulOcrPreviewText,
  pickFaithfulGatewayPlainText,
} from "@/lib/offlineImportFaithfulOcr.shared";

describe("offlineImportFaithfulOcr", () => {
  it("prefers raw.text over blocks", () => {
    const out = pickFaithfulGatewayPlainText({
      text: "(24) 在平面直角坐标系中",
      blocks: [{ kind: "text", text: "块内其它文字" }],
    });
    expect(out).toBe("(24) 在平面直角坐标系中");
  });

  it("non-coordinate stem does not force triangle lexicon", () => {
    const out = normalizeFaithfulOcrPreviewText("在 A4BC 中，求面积");
    expect(out).toContain("A4BC");
    expect(out).not.toContain("△ABC");
  });

  it("coordinate stem applies educational canonicalization compiler", () => {
    const raw = `' (24) ..(本小题 10 分) \\(\\cdot\\)
在平面直角坐标系中，O为原点，直角 A408的顶点A(0,5)，B(5V3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)。
(I) 填空：如图(1)，\\(\\angle E F O\\) 的度数为 \\(\\quad \\cdot\\)°，点D的坐标为 \\(\\_\\_\\) ;`;
    const out = normalizeFaithfulOcrPreviewText(raw);
    expect(out).not.toMatch(/^\s*'/);
    expect(out).not.toContain("..(本小题");
    expect(out).not.toContain("\\(\\cdot\\)");
    expect(out).toMatch(/直角△AOB/);
    expect(out).toMatch(/5√3/);
    expect(out).toMatch(/如图①/);
    expect(out).toMatch(/度数为\s*____/);
  });

  it("keeps body when diagram label spam is absent", () => {
    const out = normalizeFaithfulOcrPreviewText("(24) 在平面直角坐标系中，点 A(0,5)");
    expect(out).toContain("(24)");
    expect(out).toContain("A(0,5)");
  });

  it("applyFaithfulOfflineImportOcrText end-to-end", () => {
    const out = applyFaithfulOfflineImportOcrText({
      text: "(24) ..(本小题 10 分)",
    });
    expect(out).toContain("(24)");
  });
});
