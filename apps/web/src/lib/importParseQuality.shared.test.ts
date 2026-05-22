import { describe, expect, it } from "vitest";

import {
  attachPerQuestionImportQualityFromRollup,
  computeImportParseQualityRollup,
  mergeFigureAttachQualityIntoRollup,
  mergeImportChainIntoRollup,
  normalizeImportChainV1,
  parseImportParseQualityRollup,
  singleChoiceAnswerLooksMultiSelect,
  type ImportChainV1,
} from "@/lib/importParseQuality.shared";
import type { Question } from "@/lib/types";

function baseQuestion(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 1,
    type: "multiple_choice",
    subject: "math",
    content: "题干",
    options: ["o1", "o2", "o3", "o4"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 3,
    ...overrides,
  };
}

describe("singleChoiceAnswerLooksMultiSelect", () => {
  it("returns false for empty or single letter", () => {
    expect(singleChoiceAnswerLooksMultiSelect("")).toBe(false);
    expect(singleChoiceAnswerLooksMultiSelect("A")).toBe(false);
    expect(singleChoiceAnswerLooksMultiSelect(" B ")).toBe(false);
  });

  it("detects A、B style", () => {
    expect(singleChoiceAnswerLooksMultiSelect("A、B")).toBe(true);
    expect(singleChoiceAnswerLooksMultiSelect("A,B")).toBe(true);
  });

  it("detects three or more letters with separators", () => {
    expect(singleChoiceAnswerLooksMultiSelect("A、B、C")).toBe(true);
  });
});

describe("computeImportParseQualityRollup", () => {
  it("marks rollup red when single-choice has multi-letter answer", () => {
    const qs = [
      baseQuestion({ id: "a", order_index: 1, answer: "A、B" }),
      baseQuestion({ id: "b", order_index: 2 }),
    ];
    const r = computeImportParseQualityRollup(qs);
    expect(r.rollup_tier).toBe("red");
    expect(r.red_count).toBeGreaterThanOrEqual(1);
    expect(r.summary_lines.length).toBeGreaterThan(0);
  });

  it("returns green for clean MCQ", () => {
    const qs = [baseQuestion({ id: "a", order_index: 1 })];
    const r = computeImportParseQualityRollup(qs);
    expect(r.rollup_tier).toBe("green");
    expect(r.red_count).toBe(0);
    expect(r.yellow_count).toBe(0);
  });

  it("flags suspicious_sqrt_v_notation when Vnn appears without sqrt", () => {
    const qs = [
      baseQuestion({
        id: "a",
        order_index: 1,
        content: "式子 V37 的值",
        options: ["1", "2", "3", "4"],
      }),
    ];
    const r = computeImportParseQualityRollup(qs);
    expect(r.questions[0]!.signals).toContain("suspicious_sqrt_v_notation");
    expect(r.rollup_tier).toBe("yellow");
  });

  it("flags stem_integer_vs_scientific_option_hint for 科学记数 + N万 vs wrong option", () => {
    const qs = [
      baseQuestion({
        id: "a",
        order_index: 1,
        content: "将 5 万用科学记数法表示为",
        answer: "A",
        options: ["$1$", "$2$", "$3$", "$4$"],
      }),
    ];
    const r = computeImportParseQualityRollup(qs);
    expect(r.questions[0]!.signals).toContain("stem_integer_vs_scientific_option_hint");
  });

  it("does not flag stem_integer when chosen option parses to N×10000", () => {
    const qs = [
      baseQuestion({
        id: "a",
        order_index: 1,
        content: "将 5 万用科学记数法表示为",
        answer: "A",
        options: [String.raw`$5 \times 10^{4}$`, "$2$", "$3$", "$4$"],
      }),
    ];
    const r = computeImportParseQualityRollup(qs);
    expect(r.questions[0]!.signals).not.toContain("stem_integer_vs_scientific_option_hint");
  });
});

describe("mergeImportChainIntoRollup", () => {
  it("raises rollup tier to red when import confidence is low", () => {
    const qs = [
      baseQuestion({ id: "a", order_index: 1 }),
      baseQuestion({ id: "b", order_index: 2 }),
    ];
    const rollup = computeImportParseQualityRollup(qs);
    expect(rollup.rollup_tier).toBe("green");
    const chain: ImportChainV1 = {
      version: 1,
      generated_at: "2026-05-13T00:00:00.000Z",
      import_path: "text",
      confidence: "low",
      chunk_count: 1,
    };
    const merged = mergeImportChainIntoRollup(rollup, chain);
    expect(merged.rollup_tier).toBe("red");
    expect(merged.import_chain?.import_path).toBe("text");
    expect(merged.summary_lines.some((l) => l.includes("导入主链"))).toBe(true);
  });
});

describe("mergeFigureAttachQualityIntoRollup", () => {
  it("merges rollup fields and flags questions that contain persisted import figure URLs when degraded", () => {
    const qs = [
      baseQuestion({
        id: "a",
        order_index: 0,
        content: "题干 ![](https://example.com/import-figures/b/p0-q1-d.png)",
        options: ["1", "2", "3", "4"],
      }),
      baseQuestion({ id: "b", order_index: 1, content: "纯文本", options: ["1", "2", "3", "4"] }),
    ];
    let rollup = computeImportParseQualityRollup(qs);
    rollup = mergeFigureAttachQualityIntoRollup(
      rollup,
      {
        figure_attach_quality: "medium",
        figure_attach_degraded: true,
        figure_attach_degradation_reasons: ["figure_ownership_ambiguous"],
      },
      qs,
    );
    expect(rollup.figure_attach_quality).toBe("medium");
    expect(rollup.figure_attach_degraded).toBe(true);
    expect(rollup.figure_attach_degradation_reasons).toContain("figure_ownership_ambiguous");
    expect(rollup.questions[0]!.signals).toContain("figure_attach_semantics_degraded");
    expect(rollup.questions[1]!.signals).not.toContain("figure_attach_semantics_degraded");
    const out = attachPerQuestionImportQualityFromRollup(qs, rollup);
    expect(out[0]?.import_quality?.degradation_reasons).toContain(
      "figure_attach_semantics_degraded",
    );
    expect(out[1]?.import_quality).toBeUndefined();
  });
});

describe("normalizeImportChainV1", () => {
  it("merges legacy layout_fallback_reason into degradation_reasons", () => {
    const chain: ImportChainV1 = {
      version: 1,
      generated_at: "t",
      import_path: "text",
      confidence: "medium",
      chunk_count: 3,
      layout_fallback_reason: "auto：structured.questions<2，改用文本锚点",
    };
    const n = normalizeImportChainV1(chain);
    expect(n.degradation_reasons).toContain("layout_missing");
    expect(n.layout_fallback_reason).toBeUndefined();
  });
});

describe("attachPerQuestionImportQualityFromRollup", () => {
  it("writes import_quality when rollup has mappable signals", () => {
    const qs = [
      baseQuestion({
        id: "a",
        order_index: 0,
        content: "右图立体",
        options: ["1", "2", "3", "4"],
      }),
    ];
    const rollup = computeImportParseQualityRollup(qs);
    const out = attachPerQuestionImportQualityFromRollup(qs, rollup);
    expect(out[0]?.import_quality?.degradation_reasons).toContain("missing_expected_raster");
  });
});

describe("parseImportParseQualityRollup", () => {
  it("parses valid JSON string", () => {
    const raw = {
      version: 1,
      rollup_tier: "yellow",
      red_count: 0,
      yellow_count: 1,
      green_count: 0,
      questions: [],
      summary_lines: ["x"],
      generated_at: "2020-01-01T00:00:00.000Z",
    };
    const parsed = parseImportParseQualityRollup(JSON.stringify(raw));
    expect(parsed?.rollup_tier).toBe("yellow");
  });

  it("returns null for invalid version", () => {
    expect(parseImportParseQualityRollup({ version: 2, rollup_tier: "green" })).toBe(null);
  });
});
