import { describe, expect, it } from "vitest";

import { normalizeImportPipelineLatexResidue } from "@/lib/importLatexOcrNormalize.shared";

describe("normalizeImportPipelineLatexResidue", () => {
  it("repairs wedge mis-OCR in exponent braces", () => {
    expect(normalizeImportPipelineLatexResidue(String.raw`$10^{\wedge}4$`)).toContain("10^{4}");
  });

  it("repairs tan degree star OCR", () => {
    const out = normalizeImportPipelineLatexResidue("tan 60 * 的值");
    expect(out).toContain(String.raw`\tan`);
    expect(out).toContain("circ");
  });

  it("repairs unbraced wedge exponent in derivation-style text", () => {
    const out = normalizeImportPipelineLatexResidue(String.raw`$5^{\wedge}4$`);
    expect(out).toContain("^{4}");
    expect(out).not.toContain("\\wedge");
  });

  it("repairs \\heta to \\theta", () => {
    const out = normalizeImportPipelineLatexResidue(String.raw`\tan{\heta}`);
    expect(out).toContain("\\theta");
    expect(out).not.toContain("\\heta");
  });

  it("repairs GOT slant debris and bare sqrt in frac", () => {
    const out = normalizeImportPipelineLatexResidue(
      "($\\frac{sqrt3}{2} \\le slantt \\le slant \\frac{11sqrt3}{2}$)",
    );
    expect(out).toContain("\\sqrt{3}");
    expect(out).toContain("\\leqslant");
    expect(out).not.toMatch(/slantt|(^|[^\\])sqrt3/i);
  });
});
