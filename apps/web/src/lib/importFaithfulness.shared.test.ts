import { describe, expect, it } from "vitest";
import {
  compareSourceAndPublished,
  hasUnresolvedBlockers,
} from "@/lib/importFaithfulness.shared";

describe("importFaithfulness.shared", () => {
  it("根式被改写时产生 blocker", () => {
    const findings = compareSourceAndPublished({
      questionIndex: 1,
      sourceText: "已知 B(5√3,0)，F(-√3,0)，且 △ABC 为等边三角形。",
      publishedText: "已知 B(5√2,0)，F(-√3,0)，且 △ABC 为等边三角形。",
      sourceFigureCount: 2,
      publishedFigureCount: 2,
    });
    expect(findings.some((f) => f.code === "formula_mismatch" && f.severity === "blocker")).toBe(
      true,
    );
  });

  it("数值丢失时产生 blocker", () => {
    const findings = compareSourceAndPublished({
      questionIndex: 2,
      sourceText: "点 A(0,5)，B(3,4)，C(6,0)。求长度。",
      publishedText: "点 A(0,5)，B(3,4)。求长度。",
      sourceFigureCount: 0,
      publishedFigureCount: 0,
    });
    expect(findings.some((f) => f.code === "numeric_mismatch")).toBe(true);
  });

  it("题图数量不足产生 blocker", () => {
    const findings = compareSourceAndPublished({
      questionIndex: 3,
      sourceText: "如图①②所示。",
      publishedText: "如图①②所示。",
      sourceFigureCount: 2,
      publishedFigureCount: 1,
    });
    expect(findings.some((f) => f.code === "figure_count_mismatch")).toBe(true);
    expect(hasUnresolvedBlockers(findings)).toBe(true);
  });

  it("小问数量不一致产生 blocker", () => {
    const findings = compareSourceAndPublished({
      questionIndex: 4,
      sourceText: "（Ⅰ）求面积；（Ⅱ）求周长；① ②",
      publishedText: "（Ⅰ）求面积；①",
      sourceFigureCount: 0,
      publishedFigureCount: 0,
    });
    expect(findings.some((f) => f.code === "subquestion_mismatch")).toBe(true);
  });

  it("忠实转录时无 blocker", () => {
    const text =
      "已知 B(5√3,0)，F(-√3,0)。（Ⅰ）求面积；（Ⅱ）求周长。";
    const findings = compareSourceAndPublished({
      questionIndex: 1,
      sourceText: text,
      publishedText: text,
      sourceFigureCount: 2,
      publishedFigureCount: 2,
    });
    expect(hasUnresolvedBlockers(findings)).toBe(false);
  });
});
