import { describe, expect, it } from "vitest";

import {
  detectImportParentQuestionTopology,
  type ImportParentQuestionTopologyV1,
} from "@/lib/importParentQuestionTopology.shared";

const PARENT_QUESTION_SNIPPET = `(22)（本小题满分10分）在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)，顶点D在第二象限。
(1) 如图①，∠EFO的度数为____°，点D的坐标为(____,____)。
(2) 将等边△DEF沿水平方向向右平移，得到等边△D′E′F′，且顶点D与D′、E与E′、F与F′分别对应，EE′=t。
(3) 当∠ZEE'A'G时，试用含有的式子表示SS。
(4) 求8的取值范围（直接写出结果即可）。`;

describe("detectImportParentQuestionTopology", () => {
  it("detects two-digit parent + subparts", () => {
    const t = detectImportParentQuestionTopology(PARENT_QUESTION_SNIPPET);
    expect(t).toMatchObject({
      version: 1,
      question_root: "22",
      shared_figure_scope: true,
    } satisfies Partial<ImportParentQuestionTopologyV1>);
    expect(t!.subparts.length).toBeGreaterThanOrEqual(2);
    expect(t!.subparts).toContain("(1)");
    expect(t!.subparts).toContain("(2)");
    expect(t!.subparts).not.toContain("(22)");
  });

  it("detects (25) parent without hardcoding 24", () => {
    const t = detectImportParentQuestionTopology(
      `(25)（本小题满分12分）如图①，在△ABC中，∠B=90°。\n(1) 求 AB。\n(2) 求面积。`,
    );
    expect(t?.question_root).toBe("25");
    expect(t?.subparts).toEqual(expect.arrayContaining(["(1)", "(2)"]));
  });

  it("returns null for single short question", () => {
    expect(detectImportParentQuestionTopology("(1) 求 x。")).toBeNull();
  });

  it("detects (24) + roman subparts (I)(II)", () => {
    const text = `(24)（本小题10分）在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)。
(I) 填空：如图①，∠EFO的度数为____°。
(II) 将△DEF沿水平方向向右平移，EE′=t，重叠面积为S。
① 如图②，求S与t的关系。
② 求S的取值范围。`;
    const t = detectImportParentQuestionTopology(text);
    expect(t?.question_root).toBe("24");
    expect(t?.subparts).toEqual(expect.arrayContaining(["(I)", "(II)"]));
  });

  it("does not treat 如图(1) inline as subpart (1)", () => {
    const text = `(24)（本小题10分）在平面直角坐标系中，直角△AOB，等边△DEF。
填空：如图(1)，∠EFO的度数为____°。
(1) 仅行首括号才算小问
(2) 第二小问`;
    const t = detectImportParentQuestionTopology(text);
    expect(t?.subparts).toEqual(["(1)", "(2)"]);
  });
});
