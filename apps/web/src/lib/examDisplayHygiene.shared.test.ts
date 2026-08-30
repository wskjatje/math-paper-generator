import { describe, expect, it } from "vitest";
import {
  formulaRedundantWithProse,
  healDisplayHygieneQuestion,
  healDisplayHygieneText,
  repairBareEqDebris,
  repairDisplayCodeFence,
  repairDisplayLatexDelimiters,
  repairDisplayMarkupDebris,
  repairEscapedDollarInMath,
  repairNewlineCommands,
  repairOrphanLatexParenDelimiters,
  restoreBrokenInequalityCommands,
  scanDisplayHygieneIssues,
  wrapPlainFractionsOutsideMath,
} from "@/lib/examDisplayHygiene.shared";
import { repairExamMathCanonicalSync } from "@/lib/sanitizeExamMathDisplay";

describe("examDisplayHygiene", () => {
  it("repairs isolated $$ fill blanks and mismatched $…$$", () => {
    const raw = "边长为 1，则对角线长度为 **$$**。";
    const healed = repairDisplayLatexDelimiters(raw);
    expect(healed).toMatch(/____/);
    expect(healed).not.toMatch(/\$\$/);

    const paren = "$(x=1$$ 且 y=2";
    expect(repairDisplayLatexDelimiters(paren)).toContain("$x=1$");
  });

  it("repairs eq / newline / ihinspace debris without harming \\geq", () => {
    const raw = "故 n eq 2\\newline 且 a\\thinspace b 与 cihinspace d";
    const out = repairDisplayMarkupDebris(raw);
    expect(out).toMatch(/\\neq/);
    expect(out).not.toMatch(/\\newline/i);
    expect(out).not.toMatch(/ihinspace/);
    expect(out).not.toMatch(/\\thinspace/);

    expect(repairBareEqDebris("91eq2")).toContain("\\neq");
    expect(healDisplayHygieneText("x+y\\geq 2")).toContain("\\geq");
    expect(healDisplayHygieneText("x+y\\geq 2")).not.toMatch(/\\g\s+\\neq|\\g\\neq/);
    expect(repairExamMathCanonicalSync("\\frac{x}{y}+\\frac{y}{x}\\geq 2")).toContain("\\geq");
  });

  it("restores previously corrupted \\g \\neq / \\l\\n\\neq back to inequalities", () => {
    expect(restoreBrokenInequalityCommands("a \\g \\neq b")).toBe("a \\geq b");
    expect(restoreBrokenInequalityCommands("a \\l\\n\\neq b")).toBe("a \\leq b");
    expect(restoreBrokenInequalityCommands("a \\l\\neq b")).toBe("a \\leq b");
    expect(healDisplayHygieneText("a^2+b^2+c^2 \\g \\neq a+b+c")).toContain("\\geq");
    expect(repairExamMathCanonicalSync("其中 a \\l \\n \\neq b")).toContain("\\leq");
    expect(repairExamMathCanonicalSync("其中 a \\l\\neq b")).toContain("\\leq");
  });

  it("repairs H\\_2O style chemistry underscores", () => {
    const out = healDisplayHygieneText("水的分子式为 H\\_2O，$M(H\\_2O)$");
    expect(out).toContain("H_2O");
    expect(out).not.toMatch(/H\\_2O/);
  });

  it("fences programming answers stuck as italic prose", () => {
    const raw =
      ", python\ndefis_prime(n):\n    ifn<=1:returnFalse\n    fornuminrange(2,n):\n        if n%num==0:return False\n    return True";
    const fenced = repairDisplayCodeFence(raw, "programming");
    expect(fenced).toMatch(/^```python/);
    expect(fenced).toContain("def is_prime");
    expect(fenced).toContain("in range");
  });

  it("does not translate True/False or tear apart identifiers in programming", () => {
    expect(repairExamMathCanonicalSync("return True")).toContain("True");
    expect(repairExamMathCanonicalSync("return True")).not.toContain("成立");
    expect(repairExamMathCanonicalSync("def is_prime(n):\n    return True")).toContain("is_prime");
    const healed = healDisplayHygieneQuestion({
      type: "programming",
      content: "写素数",
      answer: ", python\ndefis_prime(n):\n    return True",
    });
    expect(String(healed.answer)).toContain("return True");
    expect(String(healed.answer)).toContain("is_prime");
    expect(String(healed.answer)).not.toContain("成立");
  });

  it("heal question + scan leaves no delimiter issues when fixed", () => {
    const q = {
      type: "fill_blank",
      content: "若 x**$$**，则…",
      answer: "1",
      options: null,
      solution_steps: [{ description: "由 formula 得 n eq 2\\newline" }],
    };
    const healed = healDisplayHygieneQuestion(q);
    expect(String(healed.content)).toMatch(/____/);
    expect(String((healed.solution_steps as { description: string }[])[0]!.description)).toMatch(
      /公式/,
    );
    expect(String((healed.solution_steps as { description: string }[])[0]!.description)).toMatch(
      /\\neq/,
    );
    const residual = scanDisplayHygieneIssues(healed, 1);
    expect(residual.filter((i) => i.kind === "latex_delimiter")).toHaveLength(0);
    expect(residual.filter((i) => i.kind === "markup_debris")).toHaveLength(0);
  });

  it("scan flags unhealed code fence", () => {
    const issues = scanDisplayHygieneIssues(
      {
        type: "programming",
        content: "写素数判定",
        answer: "defis_prime(n):returnFalse",
      },
      2,
    );
    expect(issues.some((i) => i.issueCode === "display.code_fence")).toBe(true);
  });

  it("heals chemistry \$ / H\\_ / bare \\text units via canonical", () => {
    const raw =
      "计算 $M(H\\_2O)$。$M(H\\_2O) = 2 \\times 1 + 16 = \\$18 \\text{ g/mol}$。生成了 36 \\text{ g} 的 H_2O。";
    const out = repairExamMathCanonicalSync(raw);
    expect(out).toContain("H_2O");
    expect(out).not.toMatch(/H\\_2O/);
    expect(out).not.toMatch(/\\\$18/);
    expect(out).toMatch(/\$36\s*\\text\{\s*g\s*\}\$/);
  });

  it("heals \\newline inside math and orphan \\( after equation labels", () => {
    const nl = repairNewlineCommands("$m = 1 kg\\newline F = 2.5 N$");
    expect(nl).toContain("\\\\");
    expect(nl).not.toMatch(/\\newline/);
    const joined = repairOrphanLatexParenDelimiters(
      "x + y = 12(1)\\(10y + x) - (10x + y) = 18(2)",
    );
    expect(joined).not.toMatch(/\\\(/);
    expect(joined).toMatch(/\(1\)/);
  });

  it("wraps plain fractions and detects redundant formula lines", () => {
    const frac = wrapPlainFractionsOutsideMath("每小时偷走 1/3，则剩余 2/3。剩余黄金 = M × (2/3)^n");
    expect(frac).toContain("$1/3$");
    expect(frac).toContain("$(2/3)^n$");
    expect(
      formulaRedundantWithProse(
        "所以 B = N - R - Y = N/6。所以 B 可能是 1, 2, 3。",
        "",
        "$B = N - R - Y = N/6$",
      ),
    ).toBe(true);
  });

  it("strips escaped dollars inside math spans", () => {
    expect(repairEscapedDollarInMath("$x = \\$18$")).toBe("$x = 18$");
  });
});
