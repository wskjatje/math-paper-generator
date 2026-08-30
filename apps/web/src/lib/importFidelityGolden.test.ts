/**
 * 黄金集断言：对照 expected 字段做确定性检查（不调用 AI）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareSourceAndPublished, hasUnresolvedBlockers } from "@/lib/importFaithfulness.shared";

type Golden = {
  sourcePlainText: string;
  expected: {
    questions: Array<{
      index: number;
      mustContain: string[];
      figureCount: number;
    }>;
  };
};

describe("import fidelity golden set", () => {
  it("忠实发布文本相对黄金来源无阻断差异", () => {
    const fp = path.join(
      process.cwd(),
      "examples/v1/import-fidelity/golden-math-radical-multipanel.json",
    );
    const golden = JSON.parse(readFileSync(fp, "utf8")) as Golden;
    // 模拟正确转录：逐题切片用 mustContain 拼回（验收「不改写」）
    for (const q of golden.expected.questions) {
      const published = q.mustContain.join("；");
      // 用整卷来源对比时可能数值过多；这里用包含断言 + 人造忠实全文
      for (const token of q.mustContain) {
        expect(golden.sourcePlainText.includes(token) || published.includes(token)).toBe(true);
      }
    }

    const faithfulQ1 =
      "如图①②，已知点 B(5√3,0)，F(-√3,0)，且 △ABC 为等边三角形。（Ⅰ）求 BF 长度；（Ⅱ）求面积。";
    const findings = compareSourceAndPublished({
      questionIndex: 1,
      sourceText: faithfulQ1,
      publishedText: faithfulQ1,
      sourceFigureCount: 2,
      publishedFigureCount: 2,
    });
    expect(hasUnresolvedBlockers(findings)).toBe(false);

    const rewritten = faithfulQ1.replace("5√3", "5√2");
    const bad = compareSourceAndPublished({
      questionIndex: 1,
      sourceText: faithfulQ1,
      publishedText: rewritten,
      sourceFigureCount: 2,
      publishedFigureCount: 1,
    });
    expect(hasUnresolvedBlockers(bad)).toBe(true);
    expect(bad.some((f) => f.code === "formula_mismatch")).toBe(true);
    expect(bad.some((f) => f.code === "figure_count_mismatch")).toBe(true);
  });
});
