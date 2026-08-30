import { describe, expect, it } from "vitest";
import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { segmentPlainText } from "@/lib/educationalAstMathSegments.shared";
import { sanitizeExamMathDisplay } from "@/lib/sanitizeExamMathDisplay";

describe("孤行公式 / 编程题密度（跨 EPL 与 MathContent）", () => {
  it("EPL 拆段前合并 ODE 公式，不再单独 paragraph", () => {
    const chem = `在某温度下成正比，即满足一阶微分方程：

$$\\frac{dC(t)}{dt} = -kC(t)$$

其中 $k > 0$ 为反应速率常数。
（1）求解该微分方程。
（2）求 $k$。`;
    const ast = buildEducationalAstFromCanonical(chem);
    const paras = ast.nodes.filter((n) => n.type === "paragraph");
    const joined = paras.map((n) =>
      n.type === "paragraph" ? n.segments.map(segmentPlainText).join("") : "",
    );
    expect(joined.some((t) => /微分方程：/.test(t) && /dC\(t\)/.test(t) && /其中/.test(t))).toBe(
      true,
    );
    expect(joined.every((t) => !/^\$/.test(t.trim()))).toBe(true);
  });

  it("编程题 sanitize：方程并入句中且样例 fence 保留", () => {
    const prog = `求满足方程：

$$\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{N}$$

的正整数解组数。

**输入格式**:

一个正整数 $N$。

**样例输入**:

\`\`\`
12
\`\`\`
`;
    const out = sanitizeExamMathDisplay(prog);
    expect(out).toMatch(/方程：\$\\frac\{1\}\{x\}/);
    expect(out).toContain("```\n12\n```");
    expect(out).not.toMatch(/\n{2,}\*\*/);
  });
});
