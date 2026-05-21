import { describe, expect, it } from "vitest";

import { runEnumerationSemanticReconstruction } from "@/lib/educationalEnumerationReconstruction.shared";

const Q24_FLAT = `在平面直角坐标系中，直角△AOB 的顶点 A(0,5)。图① 图②
(1) 填空: 如图①, ∠EFO 的度数为 ____
(2) 将等边△DEF 沿水平方向向右平移, 设 EE′=t。
(1)如图②, 若边 D′F′ 与边 OA 相交
(2)当 √3/2 ≤ t ≤ 11√3/2 时, 求 S 的取值范围。`;

describe("runEnumerationSemanticReconstruction", () => {
  it("promotes (1)(2) to （I）（II） and subparts to ①②", () => {
    const out = runEnumerationSemanticReconstruction(Q24_FLAT);
    expect(out).toContain("（I）填空");
    expect(out).toContain("（II）将");
    expect(out).toMatch(/①\s*如图②/);
    expect(out).toMatch(/②\s*当/);
    expect(out).not.toMatch(/\(2\)将[\s\S]*\(1\)如图②/);
  });

  it("no-op when pattern absent", () => {
    const plain = "已知函数 f(x)=x^2，求最小值。";
    expect(runEnumerationSemanticReconstruction(plain)).toBe(plain);
  });
});
