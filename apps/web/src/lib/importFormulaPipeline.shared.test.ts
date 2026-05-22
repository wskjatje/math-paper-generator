import { describe, expect, it } from "vitest";

import { normalizeImportPipelineLatexResidue } from "@/lib/importLatexOcrNormalize.shared";
import { runDefaultImportFormulaPipelineInRepo } from "@/lib/importFormulaPipeline.shared";

describe("runDefaultImportFormulaPipelineInRepo", () => {
  it("delegates to deterministic LaTeX normalize in repo", () => {
    const s = String.raw`$10^{\wedge}4$`;
    expect(runDefaultImportFormulaPipelineInRepo(s)).toBe(normalizeImportPipelineLatexResidue(s));
  });
});
