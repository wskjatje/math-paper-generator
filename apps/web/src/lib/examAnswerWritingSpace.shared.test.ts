import { describe, expect, it } from "vitest";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import { resolveAnswerWritingSpaceMinHeightRem } from "@/lib/examAnswerWritingSpace.shared";

describe("resolveAnswerWritingSpaceMinHeightRem", () => {
  it("config enabled with rules and default fallback", () => {
    expect(PAPER_SURFACE_LAYOUT.answerWritingSpace.enabled).toBe(true);
    expect(PAPER_SURFACE_LAYOUT.answerWritingSpace.rules.length).toBeGreaterThan(0);
    expect(Number(PAPER_SURFACE_LAYOUT.answerWritingSpace.defaultMinHeightRem)).toBeGreaterThan(
      0,
    );
  });

  it("选择题有选项 → 0", () => {
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "multiple_choice",
        type_label: "单选题",
        options: ["1", "2", "3", "4"],
      }),
    ).toBe(0);
  });

  it("填空题排除 → 0", () => {
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "fill_blank",
        type_label: "填空题",
        options: null,
      }),
    ).toBe(0);
  });

  it("证明 / 解答 / 计算按形态给书写高度（非题号）", () => {
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "proof",
        type_label: "证明题",
        options: null,
      }),
    ).toBeGreaterThanOrEqual(8);
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "short_answer",
        type_label: "解答题",
        options: [],
      }),
    ).toBeGreaterThanOrEqual(6);
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "calculation",
        type_label: "计算题",
        options: null,
      }),
    ).toBeGreaterThanOrEqual(6);
  });

  it("综合 / 自定义题型走规则或 default，无需特举学科名", () => {
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "cross_math_physics",
        type_label: "数物综合题",
        options: null,
      }),
    ).toBeGreaterThanOrEqual(6);
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "custom:lab",
        type_label: "实验探究题",
        options: null,
      }),
    ).toBeGreaterThan(0);
    expect(
      resolveAnswerWritingSpaceMinHeightRem({
        type: "custom:unknown_subjective",
        type_label: "开放作答题",
        options: null,
      }),
    ).toBe(PAPER_SURFACE_LAYOUT.answerWritingSpace.defaultMinHeightRem);
  });
});
