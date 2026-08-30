import { describe, expect, it } from "vitest";
import { PAPER_SURFACE_LAYOUT } from "@/config/examDomain";
import {
  isStemLabeledSectionLabelLine,
  splitStemLabeledSections,
  stemHasLabeledSections,
} from "@/lib/examStemLabeledSections.shared";

describe("examStemLabeledSections", () => {
  it("识别粗体/短标签行（不依赖具体中文文案）", () => {
    expect(isStemLabeledSectionLabelLine("**输入格式**:")).toBe(true);
    expect(isStemLabeledSectionLabelLine("**Sample Input**：")).toBe(true);
    expect(isStemLabeledSectionLabelLine("Input Format:")).toBe(true);
    expect(isStemLabeledSectionLabelLine("一个正整数 $N$。")).toBe(false);
    expect(isStemLabeledSectionLabelLine("**粗体**在句中出现")).toBe(false);
    expect(isStemLabeledSectionLabelLine("这句话很长，不能当标签：")).toBe(false);
  });

  it("切出导语与缩进段，保留样例 fence", () => {
    const raw = `求满足方程的正整数解组数。
**输入格式**:
一个正整数 $N$。
**样例输入**:
\`\`\`
12
\`\`\`
**样例输出**:
\`\`\`
15
\`\`\``;
    const parts = splitStemLabeledSections(raw);
    expect(parts[0]?.label).toBeNull();
    expect(parts[0]?.body).toContain("求满足方程");
    expect(parts.some((p) => p.label?.includes("输入") && p.body.includes("正整数"))).toBe(
      true,
    );
    expect(parts.some((p) => p.body.includes("```\n12\n```"))).toBe(true);
    expect(stemHasLabeledSections(raw)).toBe(true);
    expect(PAPER_SURFACE_LAYOUT.stemLabeledSectionIndentRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.stemLabeledSectionBodySurface).toBe(false);
  });
});
