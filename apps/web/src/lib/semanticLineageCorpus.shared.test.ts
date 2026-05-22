import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SEMANTIC_LINEAGE_CI_CORPUS_REL,
  loadSemanticLineageCorpusInputs,
} from "@/lib/semanticLineageCorpus.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { computeSemanticRate } from "@/lib/semanticLineageRate.shared";

describe("semantic lineage frozen corpus", () => {
  it("loads CI corpus with observable materialization and bind cohorts", async () => {
    const corpusDir = path.join(resolveProjectRoot(), SEMANTIC_LINEAGE_CI_CORPUS_REL);
    const inputs = await loadSemanticLineageCorpusInputs(corpusDir);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const mat = computeSemanticRate(inputs, "materialization_success_rate");
    expect(mat.denominator).toBeGreaterThan(0);
    const bind = computeSemanticRate(inputs, "bind_refusal_rate");
    expect(bind.denominator).toBeGreaterThan(0);
  });
});
