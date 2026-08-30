import { describe, expect, it } from "vitest";
import {
  collapseOverEscapedLatex,
  normalizeSpacedMathDelimiters,
  normalizeExplicitMultiplyDisplay,
  repairExamMathCanonicalSync,
  repairLatexJsonTabCorruption,
  sanitizeExamMathDisplay,
  unwrapOverEscapedMarkdown,
  normalizeEmptyMarkdownFences,
  demoteEmbeddedDisplayMath,
  joinOrphanMathLines,
  tightenStemBlankLines,
  unwrapMathSymbolsMistakenlyInTextCommand,
  wrapBareLatexFragment,
  wrapBareSubscriptIdentifiers,
  wrapLatexEnvironmentBlocks,
} from "@/lib/sanitizeExamMathDisplay";
import { TEXT_NORMALIZATION } from "@/config/examDomain";

describe("wrapLatexEnvironmentBlocks（回归：aligned 环境卷面显示原始 LaTeX 源码）", () => {
  it("裸 \\begin{aligned}…\\end{aligned} 整块包 $$，不被混排切分拆散", () => {
    // 实测卷 formula（2026-07-18 截图）：环境内混有中文与 \text{…}
    const raw =
      "\\begin{aligned} &\\text{当 } x_0 = 0 \\text{ 时，切点为 }(0, 0)，斜率 k = -6，\\text{切线方程为 } 6x + y = 0 \\\\ &\\text{当 } x_0 = \\frac{3}{2} \\end{aligned}";
    const out = sanitizeExamMathDisplay(raw);
    const beginAt = out.indexOf("\\begin{aligned}");
    const endAt = out.indexOf("\\end{aligned}");
    expect(beginAt).toBeGreaterThan(-1);
    expect(endAt).toBeGreaterThan(beginAt);
    // \begin 与 \end 必须位于同一个 $$…$$ 块内
    const before = out.slice(0, beginAt);
    const between = out.slice(beginAt, endAt);
    expect(before).toMatch(/\$\$\s*$/);
    expect(between).not.toContain("$");
    expect(out.slice(endAt)).toMatch(/^\\end\{aligned\}\s*\$\$/);
  });

  it("已在 $ 定界内的环境不重复包裹", () => {
    const already = "$$\\begin{cases} x=1 \\\\ y=2 \\end{cases}$$";
    expect(wrapLatexEnvironmentBlocks(already)).toBe(already);
  });

  it("无 \\begin 时原样返回", () => {
    expect(wrapLatexEnvironmentBlocks("普通文本 $x^2$")).toBe("普通文本 $x^2$");
  });
});

describe("填空空位 \\underline{\\quad…}（回归：导入卷填空线消失）", () => {
  it("$\\underline{\\quad\\quad}$ 整段空位 → 明文填空线", () => {
    // 实测导入卷（2026-07-19）：\quad 被符号表换成空格后空位不可见
    const raw =
      "（1）填空：如图，$\\angle EFO$ 的度数为 $\\underline{\\quad\\quad}$，点 $E$ 的坐标为 $\\underline{\\quad\\quad}$；";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toContain("度数为________，");
    expect(out).toContain("坐标为________；");
    expect(out).not.toContain("\\underline");
  });

  it("空位嵌在更大公式内 → KaTeX 可渲染的水平线", () => {
    const out = sanitizeExamMathDisplay("$S = \\underline{\\qquad} + 1$");
    expect(out).toContain("\\rule[-0.2em]{3em}{0.4pt}");
    expect(out).not.toContain("\\underline");
  });

  it("\\underline{真实内容} 不受影响", () => {
    const out = sanitizeExamMathDisplay("$\\underline{AB}$ 是直径");
    expect(out).toContain("\\underline{AB}");
  });

  it("\\underline{\\hspace{2cm}} 同样转为填空线", () => {
    const out = sanitizeExamMathDisplay("结果为 $\\underline{\\hspace{2cm}}$。");
    expect(out).toContain("________");
    expect(out).not.toContain("\\underline");
  });
});

describe("化学 \\ce 宏（mhchem）不被修复链破坏", () => {
  it("\\ce{A -> B} 经清洗后展开为普通 KaTeX 箭头（不依赖 mhchem）", () => {
    const out = sanitizeExamMathDisplay("某一级化学反应 $\\ce{A -> B}$ 的反应速率");
    expect(out).toMatch(/A\s*(\\rightarrow|→)\s*B/);
    expect(out).not.toContain("\\ce{");
  });

  it("漏写花括号的 \\ceA -> B 补全并定界后展开", () => {
    const raw =
      "某一一级化学反应 \\ceA -> B 的反应速率与反应物 \\ceA 的瞬时浓度成正比，满足微分方程 $ \\frac{dC(t)}{dt} = -kC(t) $。";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toMatch(/A\s*(\\rightarrow|→)\s*B/);
    expect(out).toMatch(/\$A\$/);
    expect(out).toMatch(/\$\\frac\{dC\(t\)\}\{dt\} = -kC\(t\)\$/);
    expect(out).not.toMatch(/\$\s+\\frac/);
    expect(out).not.toContain("\\ce{");
  });

  it("正文裸 \\ce{…} 与已定界单位混排时补 $…$ 并展开，且不把分子拆进内层 $", () => {
    const raw =
      "已知 $2 \\text{ mol}$ 的 \\ce{H2} 和 $1 \\text{ mol}$ 的 \\ce{O2} 反应生成 \\ce{H2O}。如果生成了 $36 \\text{ g}$ 的 \\ce{H2O}，那么反应前 \\ce{H2} 和 \\ce{O2} 的总质量是多少？（\\ce{H} 的相对原子质量为 $1$，\\ce{O} 的相对原子质量为 $16$）";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toMatch(/\$H_\{?2\}?\$/);
    expect(out).toMatch(/\$O_\{?2\}?\$/);
    expect(out).toMatch(/\$H_\{?2\}?O\$/);
    expect(out).toContain("$H$");
    expect(out).toContain("$O$");
    expect(out).toContain("$36 \\text{ g}$");
    expect(out).not.toContain("\\ce{");
  });

  it("修复 \\ce{$H_2O$} 误伤，且不下标拆开 \\ce{H_2O}", () => {
    expect(wrapBareSubscriptIdentifiers("生成\\ce{H_2O}与a_n")).toBe("生成\\ce{H_2O}与$a_n$");
    const corrupted = "反应生成\\ce{$H_2O$}。如果生成了 36 \\text{ g}的\\ce{$H_2O$}";
    const out = sanitizeExamMathDisplay(corrupted);
    expect(out).toMatch(/\$H_\{?2\}?O\$/);
    expect(out).toContain("$36 \\text{ g}$");
    expect(out).not.toContain("\\ce{");
    expect(out.replace(/\$[^$]*\$/g, "")).not.toMatch(/\\text\{/);
  });

  it("答案推导：\\ce 定界后 wrapBare 相邻不产生 $a$$b$（卷面红字露源码）", () => {
    const formula = String.raw`M(\ce{H_2O}) = 2 \times 1 + 16 = 18 \text{ g/mol}`;
    const out = sanitizeExamMathDisplay(formula);
    expect(out).not.toMatch(/\$\$/);
    expect(out).not.toContain("\\ce{");
    expect(out).toMatch(/\$[^$]*H_\{?2\}?O[^$]*\\text\{ g\/mol\}\$/);
    expect(out.replace(/\$[^$]*\$/g, "")).not.toMatch(/\\text\{/);
  });

  it("答案推导：畸形 $M(\\ce{…}$$)$ 收成合法行内公式", () => {
    const raw = String.raw`计算\ce{H_2O}的摩尔质量$M(\ce{H_2O}$$)$。`;
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toMatch(/\$\$/);
    expect(out).not.toContain("\\ce{");
    expect(out).toMatch(/\$H_\{?2\}?O\$/);
    expect(out).toMatch(/\$M\(H_\{?2\}?O\)\$/);
  });

  it("答案混排句：化学方程式与 M(\\ce{…}) 全部展开且无红字源码", () => {
    const raw =
      String.raw`化学方程式为 2H2 + O2 → 2\ce{H_2O}。计算\ce{H_2O}的摩尔质量$M(\ce{H_2O})$。`;
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toContain("\\ce{");
    expect(out).toMatch(/\$H_\{?2\}?O\$/);
    expect(out).toMatch(/\$M\(H_\{?2\}?O\)\$/);
    expect(out.replace(/\$[^$]*\$/g, "")).not.toMatch(/\\ce\{/);
  });

  it("误包进 \\text 的计量式剥出（\\text 内 _ 不会成下标）", () => {
    const raw =
      String.raw`化学方程式为 $2H_2 + O_2 \to 2\text{H_2O}$。计算$H_2O$的摩尔质量$M(\text{H\_2O})$。$M(\text{H_2O}) = 18 \text{ g/mol}$。$n(\text{H_2O}) = 2$`;
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toMatch(/\\text\{H/);
    expect(out).not.toMatch(/H\\_/);
    expect(out).toMatch(/2H_\{?2\}?O|2H_2O/);
    expect(out).toMatch(/M\(H_\{?2\}?O\)/);
    expect(out).toMatch(/n\(H_\{?2\}?O\)/);
    expect(out).toContain("\\text{ g/mol}");
  });

  it("裸计量式带系数一次定界（2H_2O / n(H_2O)，不做多次补丁）", () => {
    const raw =
      "化学方程式为 2H_2 + O_2 → 2H_2O。计算 H_2O 的摩尔质量 M(H_2O)。生成 n(H_2O) = 2 mol";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toMatch(/(?:^|[^$])2H_2(?:O)?(?:[^$]|$)/);
    expect(out).toMatch(/\$2H_2\$/);
    expect(out).toMatch(/\$2H_2O\$/);
    expect(out).toMatch(/\$H_2O\$/);
    expect(out).toMatch(/\$M\(H_2O\)\$/);
    expect(out).toMatch(/\$n\(H_2O\)\$/);
    expect(out).not.toContain("n($H_2O$)");
    expect(out).not.toContain("M($H_2O$)");
  });

  it("多重转义 H\\\\_2 压成数学下标", () => {
    const raw = "$M(H\\\\_2O)$ 与 H\\\\_2O";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toMatch(/H\\+_/);
    expect(out).toMatch(/H_2O/);
  });
});

describe("normalizeSpacedMathDelimiters", () => {
  it("收紧 $ … $ 缘空白", () => {
    expect(normalizeSpacedMathDelimiters("$ \\frac{a}{b} $")).toBe("$\\frac{a}{b}$");
  });
});

describe("unwrapOverEscapedMarkdown", () => {
  it("还原 \\*\\* 与 \\`\\`\\`", () => {
    expect(unwrapOverEscapedMarkdown("\\**输入格式\\**")).toBe("**输入格式**");
    expect(unwrapOverEscapedMarkdown("前\\`\\`\\`cpp\\n12\\n\\`\\`\\`后")).toContain("```cpp");
  });
});

describe("normalizeEmptyMarkdownFences", () => {
  it("空围栏夹样例正文 → 收拢为合法 fence", () => {
    const raw = "**样例输入**:\n```\n```\n12\n```\n```\n**样例输出**:\n```\n```\n15\n```\n```";
    const out = normalizeEmptyMarkdownFences(raw);
    expect(out).toContain("```\n12\n```");
    expect(out).toContain("```\n15\n```");
    expect(out).not.toMatch(/```\n```/);
  });

  it("单独空围栏删除", () => {
    expect(normalizeEmptyMarkdownFences("前\n```\n```\n后")).toBe("前\n\n后");
  });

  it("合法单行样例 fence 保留", () => {
    expect(normalizeEmptyMarkdownFences("```\n12\n```")).toBe("```\n12\n```");
  });
});

describe("demoteEmbeddedDisplayMath", () => {
  it("句中短 $$ 公式降为行内，避免拆开题干", () => {
    const raw =
      "求满足方程：\n$$\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{N}$$\n的正整数解 $(x, y)$ 的组数。";
    const out = demoteEmbeddedDisplayMath(raw);
    expect(out).toContain("$\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{N}$");
    expect(out).not.toContain("$$");
  });

  it("保留 aligned 等多行环境", () => {
    const raw = "$$\n\\begin{aligned}\nx&=1\\\\\ny&=2\n\\end{aligned}\n$$";
    expect(demoteEmbeddedDisplayMath(raw)).toContain("$$");
  });
});

describe("joinOrphanMathLines + tightenStemBlankLines", () => {
  it("孤行公式并入前后正文", () => {
    const raw =
      "即满足一阶微分方程：\n\n$\\frac{dC(t)}{dt} = -kC(t)$\n\n其中 $k > 0$ 为常数。";
    const out = joinOrphanMathLines(raw);
    expect(out).toContain("微分方程：$\\frac{dC(t)}{dt} = -kC(t)$其中");
    expect(out.split("\n").some((l) => /^\$\\frac/.test(l.trim()))).toBe(false);
  });

  it("sanitize 端到端：丢番图方程不再独占行", () => {
    const raw =
      "求满足方程：\n\n$$\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{N}$$\n\n的正整数解 $(x, y)$ 的组数。";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toMatch(/方程：\$\\frac\{1\}\{x\}/);
    expect(out).toMatch(/\{N\}\$的正整数解/);
  });

  it("编程题标签后空行收紧且不破坏样例 fence", () => {
    const raw =
      "**输入格式**:\n\n一个正整数 $N$。\n\n**样例输入**:\n\n```\n12\n```\n\n**样例输出**:\n\n```\n15\n```";
    const out = tightenStemBlankLines(raw);
    expect(out).toContain("**输入格式**:\n一个正整数");
    expect(out).toContain("```\n12\n```");
    expect(out).toContain("```\n15\n```");
    expect(out).not.toMatch(/\n{2,}/);
  });
});

describe("collapseOverEscapedLatex", () => {
  it("folds double-backslash LaTeX commands from over-escaped JSON", () => {
    const raw =
      "若 $\\\\triangle AOD$ 面积为 $4\\\\text{ cm}^2$，$AD \\\\parallel BC$";
    expect(collapseOverEscapedLatex(raw)).toBe(
      "若 $\\triangle AOD$ 面积为 $4\\text{ cm}^2$，$AD \\parallel BC$",
    );
  });

  it("is applied inside repairLatexJsonTabCorruption", () => {
    const fixed = repairLatexJsonTabCorruption("$100\\\\text{ cm}^2$");
    expect(fixed).toContain("\\text{");
    expect(fixed).not.toContain("\\\\text");
  });
});

describe("repair does not re-double existing commands", () => {
  it("keeps single \\Rightarrow after collapse (regression: was \\⇒ on paper)", () => {
    // 实测卷 formula：× 已正确、Rightarrow 被双重转义
    const raw = "S = 4 \\times 9 = 36\\text{ cm}^2 \\\\Rightarrow L_{正} = 6\\text{ cm}";
    const repaired = repairExamMathCanonicalSync(raw);
    expect(repaired).toContain("\\Rightarrow");
    expect(repaired).not.toMatch(/\\\\Rightarrow/);
    expect(repaired).toContain("_{\\text{正}}");

    const shown = sanitizeExamMathDisplay(raw);
    expect(shown).toContain("⇒");
    expect(shown).not.toContain("\\⇒");
    expect(shown).not.toMatch(/\\⇒/);
  });

  it("does not turn bare Rightarrow fix into double slash when already escaped", () => {
    expect(repairLatexJsonTabCorruption("A \\Rightarrow B")).toBe("A \\Rightarrow B");
    expect(repairLatexJsonTabCorruption("A Rightarrow B")).toBe("A \\Rightarrow B");
  });
});

describe("sanitizeExamMathDisplay writing norms", () => {
  it("keeps unit \\text{ cm} inside math instead of stripping to italicizable letters", () => {
    const shown = sanitizeExamMathDisplay("面积为 $100\\text{ cm}^2$");
    expect(shown).toContain("\\text{ cm}");
    expect(shown).not.toBe("面积为 $100 cm^2$");
  });

  it("unwraps math symbols wrongly placed in \\text{…}（回归：电阻 \\Omega 卷面红字）", () => {
    const raw = "电阻为 $10\\text{ \\Omega}$，且 $R=10\\text{\\Omega}$";
    const fixed = unwrapMathSymbolsMistakenlyInTextCommand(raw);
    expect(fixed).toBe("电阻为 $10\\,\\Omega$，且 $R=10\\,\\Omega$");
    expect(fixed).not.toMatch(/\\text\{\s*\\Omega/);
    // 合法单位/汉字不受影响
    expect(unwrapMathSymbolsMistakenlyInTextCommand("$4\\text{ cm}$")).toBe("$4\\text{ cm}$");
    expect(unwrapMathSymbolsMistakenlyInTextCommand("$\\text{当 }$")).toBe("$\\text{当 }$");
    const shown = sanitizeExamMathDisplay(raw);
    expect(shown).toContain("\\Omega");
    expect(shown).not.toMatch(/\\text\{\s*\\Omega/);
  });

  it("only unwraps fill-in underscore \\text{___}", () => {
    expect(sanitizeExamMathDisplay("填 $\\text{____}$")).toContain("____");
  });

  it("wraps bare formula fragments that contain LaTeX commands", () => {
    expect(wrapBareLatexFragment("\\triangle ABE \\cong \\triangle FCE")).toBe(
      "$\\triangle ABE \\cong \\triangle FCE$",
    );
    expect(wrapBareLatexFragment("x + y = 10")).toBe("x + y = 10");
    expect(wrapBareLatexFragment("$a_n$")).toBe("$a_n$");
  });

  it("renders bare triangle formula via sanitize with math delimiters", () => {
    const shown = sanitizeExamMathDisplay(
      "\\triangle ABE \\cong \\triangle FCE \\text{ (AAS)}",
    );
    expect(shown.startsWith("$")).toBe(true);
    expect(shown).toMatch(/\\triangle|△/);
    expect(shown).toContain("\\text{ (AAS)}");
  });

  it("wraps bare subscripts a_n / V_A in options and prose", () => {
    expect(wrapBareSubscriptIdentifiers("设 a_1 = 4，a_2 = 7")).toBe(
      "设 $a_1$ = 4，$a_2$ = 7",
    );
    expect(wrapBareSubscriptIdentifiers("在 $t = 2$ 时 V_A = 6")).toBe(
      "在 $t = 2$ 时 $V_A$ = 6",
    );
    expect(wrapBareSubscriptIdentifiers("已有 $a_n$ 不变")).toBe("已有 $a_n$ 不变");
    expect(wrapBareSubscriptIdentifiers("填 ______")).toBe("填 ______");
    expect(wrapBareLatexFragment("a_n = 3n + 1")).toBe("$a_n = 3n + 1$");
    expect(sanitizeExamMathDisplay("a_n = 3n + 1")).toBe("$a_n = 3n + 1$");
    expect(sanitizeExamMathDisplay("选项 C：a_n = 3n + 1")).toContain("$a_n$");
    expect(sanitizeExamMathDisplay("(1) V_A = 12 - 3t")).toContain("$V_A$");
  });
});

describe("mixed CJK prose with bare LaTeX (regression: whole proof rendered as one math block)", () => {
  // 实测卷证明题 answer：全文无 $，含 \frac 等命令 —— 旧逻辑整段包 $$…$$，
  // KaTeX 把中文证明渲染成单行不可换行公式，卷面横向溢出。
  const proof =
    "(2) 证明：因为 OE ∥ AB ∥ CD 且 O, E 分别是 BC, AD 的中点。\n" +
    "根据中位线公式，OE = \\frac{AB + CD}{2}。\n" +
    "又因为 BC 为 ⊙O 的直径，所以 BC = 2OE = AB + CD。";

  it("wraps only the math runs, never the whole CJK text", () => {
    const out = wrapBareLatexFragment(proof);
    expect(out.startsWith("$$")).toBe(false);
    expect(out.startsWith("$")).toBe(false);
    expect(out).toContain("证明：因为 OE");
    expect(out).toContain("$OE = \\frac{AB + CD}{2}$");
    // 中文不得进入数学定界
    expect(out).not.toMatch(/\$[^$]*[\u4e00-\u9fff][^$]*\$/);
  });

  it("sanitizeExamMathDisplay keeps CJK prose out of math mode end to end", () => {
    const shown = sanitizeExamMathDisplay(proof);
    expect(shown.startsWith("$$")).toBe(false);
    expect(shown).not.toMatch(/\$[^$]*[\u4e00-\u9fff][^$]*\$/);
    expect(shown).toContain("\\frac{AB + CD}{2}");
  });

  it("still wraps pure LaTeX text-only fragments as before", () => {
    expect(wrapBareLatexFragment("\\angle D = 90^\\circ")).toBe("$\\angle D = 90^\\circ$");
  });
});

describe("bare exponent expressions (regression: y = 3^2 - 4 × 3 + 5 = 2 shown as plain caret)", () => {
  it("wraps a bare formula containing ^ without braces", () => {
    expect(wrapBareLatexFragment("y = 3^2 - 4 × 3 + 5 = 2")).toBe(
      "$y = 3^2 - 4 × 3 + 5 = 2$",
    );
    expect(wrapBareLatexFragment("(a+b)^2 = a^2 + 2ab + b^2")).toBe(
      "$(a+b)^2 = a^2 + 2ab + b^2$",
    );
  });

  it("sanitizeExamMathDisplay wraps the solution-step formula end to end", () => {
    const shown = sanitizeExamMathDisplay("y = 3^2 - 4 \\times 3 + 5 = 2");
    expect(shown.startsWith("$")).toBe(true);
    expect(shown.endsWith("$")).toBe(true);
    expect(shown).toContain("3^2");
  });

  it("wraps only the math run when CJK prose surrounds the exponent", () => {
    const out = sanitizeExamMathDisplay("代入得 y = 3^2 - 4 \\times 3 + 5 = 2，验算无误。");
    expect(out).toContain("代入得");
    expect(out).toMatch(/\$[^$]*3\^2[^$]*\$/);
    expect(out).not.toMatch(/\$[^$]*[\u4e00-\u9fff][^$]*\$/);
  });

  it("leaves plain text and fill-in underscores untouched", () => {
    expect(wrapBareLatexFragment("答案填在横线上 ______")).toBe("答案填在横线上 ______");
    expect(wrapBareLatexFragment("x + y = 10")).toBe("x + y = 10");
  });
});

describe("explicitMultiplyDisplay + latexTabEaten（配置驱动，非单题硬编码）", () => {
  it("默认 times：标量 \\cdot / · → ×，水合物保留 ·", () => {
    expect(TEXT_NORMALIZATION.explicitMultiplyDisplay).toBe("times");
    const trig = normalizeExplicitMultiplyDisplay(
      "$\\sin(10^\\circ)\\cdot\\cos(20^\\circ)+\\cos(10^\\circ)\\cdot\\sin(20^\\circ)$",
    );
    expect(trig).toContain("\\times");
    expect(trig).not.toMatch(/\\cdot/);
    expect(normalizeExplicitMultiplyDisplay("CuSO_4\\cdot5H_2O")).toContain("\\cdot5H");
    const shown = sanitizeExamMathDisplay(
      "求解 $\\sin(10^\\circ)\\cdot\\cos(20^\\circ)$ 的值。",
    );
    expect(shown).toContain("×");
    expect(shown).not.toContain("·");
  });

  it("Tab 吞噬 \\triangle → 修复 ( riangle ABC)", () => {
    expect(
      TEXT_NORMALIZATION.latexTabEatenCommandRepairs.some((r) => r.eatenTail === "riangle"),
    ).toBe(true);
    const spaced = repairLatexJsonTabCorruption("如图，( riangle ABC) 中");
    expect(spaced).toMatch(/\\triangle\s*ABC/);
    expect(spaced).not.toMatch(/\briangle\b/);
    expect(repairLatexJsonTabCorruption(`如图，${"\t"}riangle ABC 中`)).toContain("\\triangle");
    const shown = sanitizeExamMathDisplay("在 ( riangle ABC) 中，$\\angle A=30^\\circ$");
    expect(shown).toMatch(/\\triangle|△/);
    expect(shown).not.toMatch(/\briangle\b/);
  });

  it("\\t+imes 仍还原为 \\times", () => {
    expect(repairLatexJsonTabCorruption(`2${"\t"}imes3`)).toContain("\\times");
  });
});

describe("bareLatexCommandRepairs + numbered equations + prompt leakage（表驱动）", () => {
  it("数学定界内补回裸 cdot / sqrt{ / leq", () => {
    expect(
      TEXT_NORMALIZATION.bareLatexCommandRepairs.some((r) => r.bare === "cdot"),
    ).toBe(true);
    const cdot = sanitizeExamMathDisplay(
      "设 $x$ 满足 $3^x + 4^x = 2 cdot 5^x$。",
    );
    expect(cdot).toMatch(/2\s*[×\\times]/);
    expect(cdot).not.toMatch(/\bcdot\b/);

    const sqrt = sanitizeExamMathDisplay(
      "求 $sqrt{a} + sqrt{b}$ 的最大值。",
    );
    expect(sqrt).toContain("\\sqrt{a}");
    expect(sqrt).toContain("\\sqrt{b}");
    expect(sqrt).not.toMatch(/(?<![\\a-zA-Z])sqrt\{/);

    const leq = sanitizeExamMathDisplay(
      "其中 $a leq b$，输出质数。",
    );
    expect(leq).toMatch(/a\s*[≤\\leq]/);
    expect(leq).not.toMatch(/\bleq\b/);
  });

  it("触发词后编号明文方程收成 cases", () => {
    expect(TEXT_NORMALIZATION.numberedPlainEquationListToCases.enabled).toBe(true);
    const raw = `解方程组：

1. x + y = 7
2. 2x - y = 3`;
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toContain("\\begin{cases}");
    expect(out).toContain("x + y = 7");
    expect(out).toContain("2x - y = 3");
    expect(out).toContain("\\end{cases}");
    expect(out).not.toMatch(/^\s*1\.\s*x \+ y = 7/m);
  });

  it("剥离 **(e.g. …)** 提示词泄漏", () => {
    const raw = "解：关于x的不等式**(e.g. 如图)** x + 1 > 2";
    const out = sanitizeExamMathDisplay(raw);
    expect(out).not.toMatch(/e\.g\./i);
    expect(out).toContain("x + 1");
  });

  it("选择题作答空括号前补间距（跨学科，不碰 f(x)）", () => {
    const out = sanitizeExamMathDisplay("那么 $x=$（   ）。");
    expect(out).toMatch(/\$\s+（[ 　]+）/);
    expect(out).not.toMatch(/=\$（/);
    const fx = sanitizeExamMathDisplay("已知函数 $f(x)=x^2$。");
    expect(fx).toContain("f(x)");
  });
});

describe("normalizeLatexDelimitersToDollar + malformed images（卷面特殊字符）", () => {
  it("多行 $$\\begin{cases}$$ 压平后仍整块在定界内，EPL 按行拆不会露出裸 begin", () => {
    const raw = `已知方程组：
$$
\\begin{cases}
x \\cos \\alpha - y \\sin \\alpha = 1 \\\\
x \\sin \\alpha + y \\cos \\alpha = \\sqrt{3}
\\end{cases}
$$
其中 $\\alpha$ 为锐角。`;
    const out = sanitizeExamMathDisplay(raw);
    expect(out).toContain("\\begin{cases}");
    expect(out).toContain("\\end{cases}");
    const math = out.match(/\$\$([^$]+)\$\$/);
    expect(math?.[1]).toBeTruthy();
    expect(math![1]).not.toMatch(/\n/);
    expect(math![1]).toContain("\\begin{cases}");
    expect(math![1]).toContain("\\end{cases}");
  });

  it("\\[\\triangle\\] / \\(\\triangle\\) → 不残留 TeX 定界符", () => {
    const bracket = sanitizeExamMathDisplay(
      String.raw`在 \[\triangle ABC\] 中，如果 $\angle A = 30^\circ$`,
    );
    expect(bracket).not.toMatch(/\\[\[\]]/);
    expect(bracket).toMatch(/△\s*ABC/);
    const paren = sanitizeExamMathDisplay(String.raw`在 \(\triangle DEF\) 中`);
    expect(paren).not.toContain("\\(");
    expect(paren).not.toContain("\\)");
    expect(paren).toMatch(/△\s*DEF/);
  });

  it("假 import-figures 图链展示层剥离；真实 UUID batch 保留", () => {
    const phantom = sanitizeExamMathDisplay("选角。(![/import-figures/3.png])");
    expect(phantom).not.toContain("import-figures/3.png");
    expect(phantom).not.toMatch(/\(\s*!\[/);
    const uuid = "06803f4e-d427-4807-9dac-a3aa90915e0a";
    const real = sanitizeExamMathDisplay(`如图![](/import-figures/${uuid}/p0.png)`);
    expect(real).toContain(`![](/import-figures/${uuid}/p0.png)`);
  });
});
