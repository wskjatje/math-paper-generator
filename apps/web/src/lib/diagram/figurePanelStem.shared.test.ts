import { describe, expect, it } from "vitest";
import {
  pickFigureIndexForPanel,
  splitContentByFigurePanels,
} from "./figurePanelStem.shared";
import { checkFigureRequirementForQuestion } from "./figureRequireGate.shared";
import {
  extractStemPointLabels,
  tryProcessMathGeometryScene,
} from "./mathGeometry.shared";

const MULTI_PANEL_CONTENT = [
  "在平面直角坐标系中，$O$ 为原点，直角 $\\triangle AOB$ 的顶点 $A(0, 5)$，$B(5\\sqrt{3}, 0)$，等边 $\\triangle DEF$ 的顶点 $E(0,3)$，$F(-\\sqrt{3}, 0)$，顶点 $D$ 在第二象限.",
  "（Ⅰ）填空：如图①，$\\angle EFO$ 的度数为 ________，点 $D$ 的坐标为 ________；",
  "（Ⅱ）将等边 $\\triangle DEF$沿水平方向向右平移，得到等边 $\\triangle D'E'F'$，点 $D, E, F$ 的对应点分别为 $D', E', F'$，设 $EE'=t$，等边 $\\triangle D'E'F'$ 与直角三角形 $AOB$ 的重叠部分的面积为 $S$.",
  "① 如图②，若边 $D'F'$ 与边 $OA$ 相交于点 $G$，当 $\\triangle D'E'F'$ 与 $\\triangle AOB$ 重叠部分为四边形 $EE'F'G$ 时，试用含有 $t$ 的式子表示 $S$。",
].join("\n");

const scene1 = {
  version: 1,
  pack: "math.geometry",
  elements: [
    { type: "point", id: "O", x: 0, y: 0, label: "O" },
    { type: "point", id: "A", x: 0, y: 5, label: "A" },
    { type: "point", id: "B", x: 8.66, y: 0, label: "B" },
    { type: "point", id: "E", x: 0, y: 3, label: "E" },
    { type: "point", id: "F", x: -1.732, y: 0, label: "F" },
    { type: "point", id: "D", x: -3.464, y: 3, label: "D" },
    { type: "segment", from: "O", to: "A" },
    { type: "segment", from: "O", to: "B" },
    { type: "segment", from: "A", to: "B" },
    { type: "segment", from: "D", to: "E" },
    { type: "segment", from: "D", to: "F" },
    { type: "segment", from: "E", to: "F" },
  ],
};

const scene2 = {
  version: 1,
  pack: "math.geometry",
  elements: [
    { type: "point", id: "O", x: 0, y: 0, label: "O" },
    { type: "point", id: "A", x: 0, y: 5, label: "A" },
    { type: "point", id: "B", x: 8.66, y: 0, label: "B" },
    { type: "point", id: "E", x: 0, y: 3, label: "E" },
    { type: "point", id: "E'", x: 3, y: 3, label: "E'" },
    { type: "point", id: "F'", x: 1.268, y: 0, label: "F'" },
    { type: "point", id: "D'", x: -0.464, y: 3, label: "D'" },
    { type: "point", id: "G", x: 0, y: 2.196, label: "G" },
    { type: "segment", from: "O", to: "A" },
    { type: "segment", from: "O", to: "B" },
    { type: "segment", from: "A", to: "B" },
    { type: "segment", from: "D'", to: "E'" },
    { type: "segment", from: "D'", to: "F'" },
    { type: "segment", from: "E'", to: "F'" },
  ],
};

describe("figurePanelStem", () => {
  it("splits 如图①/② into two panels with required≠full stem", () => {
    const panels = splitContentByFigurePanels(MULTI_PANEL_CONTENT);
    expect(panels.map((p) => p.key)).toEqual(["1", "2"]);
    expect(panels[0]!.requiredStem).toContain("如图①");
    expect(panels[0]!.requiredStem).not.toContain("如图②");
    expect(panels[1]!.requiredStem).toContain("如图②");
    expect(panels[0]!.stemForAlign).toContain("平面直角坐标系");
    expect(panels[1]!.stemForAlign).toContain("平面直角坐标系");
  });

  it("picks attachment by alt 图① before order fallback", () => {
    const used = new Set<number>();
    const figures = [
      { alt: "图②：平移后" },
      { alt: "图①：初始位置" },
    ];
    expect(pickFigureIndexForPanel(figures, "1", used)).toBe(1);
    used.add(1);
    expect(pickFigureIndexForPanel(figures, "2", used)).toBe(0);
  });
});

describe("primed point labels", () => {
  it("extracts D' E' F' from stem", () => {
    const labels = extractStemPointLabels(
      "得到等边 $\\triangle D'E'F'$，对应点 $D'$、$E'$、$F'$，点 $G$。",
    );
    expect(labels).toEqual(expect.arrayContaining(["D'", "E'", "F'", "G"]));
  });
});

describe("multi-panel figure gate (选项甲)", () => {
  it("passes when each panel scene aligns to its own section", () => {
    const panels = splitContentByFigurePanels(MULTI_PANEL_CONTENT);
    expect(panels).toHaveLength(2);
    const r1 = tryProcessMathGeometryScene(scene1, panels[0]!.stemForAlign, {
      requiredContent: panels[0]!.requiredStem,
    });
    const r2 = tryProcessMathGeometryScene(scene2, panels[1]!.stemForAlign, {
      requiredContent: panels[1]!.requiredStem,
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const gate = checkFigureRequirementForQuestion(
      MULTI_PANEL_CONTENT,
      [
        {
          kind: "figure",
          uri: "pending://figure",
          alt: "图①：初始",
          figure_scene: scene1,
        },
        {
          kind: "figure",
          uri: "pending://figure",
          alt: "图②：平移后",
          figure_scene: scene2,
        },
      ],
      "math",
    );
    expect(gate).toEqual({ ok: true });
  });

  it("fails when only one panel scene is provided", () => {
    const gate = checkFigureRequirementForQuestion(
      MULTI_PANEL_CONTENT,
      [
        {
          kind: "figure",
          uri: "pending://figure",
          alt: "图①",
          figure_scene: scene1,
        },
      ],
      "math",
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toMatch(/图2/);
  });

  it("passes via source_figure URI even if scenes would fail full-stem align", () => {
    const gate = checkFigureRequirementForQuestion(
      MULTI_PANEL_CONTENT,
      [
        {
          kind: "image",
          uri: "/imports/fixture/page.png",
          alt: "原卷图",
        },
      ],
      "math",
    );
    expect(gate).toEqual({ ok: true });
  });
});
