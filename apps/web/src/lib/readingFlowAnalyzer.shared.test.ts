import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { buildEducationalRenderableDocument } from "@/lib/educationalPresentation.shared";
import {
  analyzeReadingFlowFromAst,
  emitReadingFlowDiagnosticFacts,
} from "@/lib/readingFlowAnalyzer.shared";

describe("readingFlowAnalyzer P2.4.4", () => {
  it("PASS when question_with_figure binds ① and 图②", () => {
    const ast = buildEducationalAstFromCanonical(
      `（II）平移
① 如图②，求 S
② 当 t 变化
![图②](/f2.png)`,
    );
    const diag = analyzeReadingFlowFromAst(ast);
    expect(diag.replay_mutation).toBe("none");
    expect(diag.rollup.questionWithFigureCount).toBeGreaterThanOrEqual(1);
    expect(diag.verdict).toBe("PASS");
  });

  it("WARN when 如图 cue without cognitive bind", () => {
    const ast = buildEducationalAstFromCanonical(
      `（II）平移
① 如图②，求 S（无图块）
② 当 t 变化`,
    );
    const diag = analyzeReadingFlowFromAst(ast);
    expect(diag.verdict).toBe("WARN");
    expect(
      diag.groups.some((g) => g.findings.includes("FIGURE_CUE_WITHOUT_COGNITIVE_BIND")),
    ).toBe(true);
  });

  it("emits reading telemetry facts on renderable document", () => {
    const doc = buildEducationalRenderableDocument({
      canonicalText: "（I）求 ∠EFO",
    });
    expect(doc.reading_flow_diagnostics.verdict).toBeDefined();
    const facts = emitReadingFlowDiagnosticFacts(doc.reading_flow_diagnostics);
    expect(facts.some((f) => f.key === "reading.verdict")).toBe(true);
  });
});
