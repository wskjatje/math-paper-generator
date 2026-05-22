import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/types";
import {
  computeQuestionFigureDependencyV1,
  parseQuestionFigureDependencyV1,
} from "@/lib/questionFigureDependency.shared";

function q(
  partial: Pick<Question, "type" | "content" | "options">,
): Pick<Question, "type" | "content" | "options"> {
  return partial;
}

describe("questionFigureDependency.shared", () => {
  it("compute marks scan-style stem and option figures for solid geometry MCQ", () => {
    const fd = computeQuestionFigureDependencyV1(
      q({
        type: "multiple_choice",
        content: "右图是由 5 个正方体组成的立体图形，它的主视图是",
        options: ["甲", "乙", "丙", "丁"],
      }),
    );
    expect(fd.requires_figure).toBe(true);
    expect(fd.option_requires_figure).toBe(true);
    expect(fd.figure_role).toBe("both");
  });

  it("compute marks option_requires for 下列图形是", () => {
    const fd = computeQuestionFigureDependencyV1(
      q({
        type: "multiple_choice",
        content: "下列图形是中心对称图形的是",
        options: ["a", "b", "c", "d"],
      }),
    );
    expect(fd.requires_figure).toBe(true);
    expect(fd.option_requires_figure).toBe(true);
    expect(fd.figure_role).toBe("both");
  });

  it("compute none for plain scientific notation stem", () => {
    const fd = computeQuestionFigureDependencyV1(
      q({
        type: "multiple_choice",
        content: "将 50000 用科学记数法表示应为",
        options: ["(A) 1", "(B) 2", "(C) 3", "(D) 4"],
      }),
    );
    expect(fd.requires_figure).toBe(false);
    expect(fd.figure_role).toBe("none");
    expect(fd.option_requires_figure).toBe(false);
  });

  it("parseQuestionFigureDependencyV1 accepts valid v1", () => {
    expect(
      parseQuestionFigureDependencyV1({
        version: 1,
        requires_figure: true,
        figure_role: "stem",
      } as never),
    ).toBeNull();
    expect(
      parseQuestionFigureDependencyV1({
        version: 1,
        requires_figure: true,
        figure_role: "main_question",
        option_requires_figure: false,
      }),
    ).toEqual({
      version: 1,
      requires_figure: true,
      figure_role: "main_question",
      option_requires_figure: false,
    });
  });
});
