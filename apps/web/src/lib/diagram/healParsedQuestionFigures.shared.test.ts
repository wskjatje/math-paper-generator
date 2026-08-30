import { describe, expect, it } from "vitest";
import { checkFigureRequirementForQuestion } from "./figureRequireGate.shared";
import { healParsedQuestionFigureAttachments } from "./healParsedQuestionFigures.shared";

describe("healParsedQuestionFigureAttachments", () => {
  it("keeps valid figure_scene", () => {
    const scene = {
      pack: "math.geometry",
      version: 1,
      elements: [
        { type: "point", id: "A", x: 10, y: 10, label: "A" },
        { type: "point", id: "B", x: 80, y: 10, label: "B" },
        { type: "segment", from: "A", to: "B" },
      ],
    };
    const [healed] = healParsedQuestionFigureAttachments([
      {
        content: "如图，线段 $AB$。",
        attachments: [{ kind: "figure", uri: "pending://figure", figure_scene: scene }],
      },
    ]);
    const gate = checkFigureRequirementForQuestion(
      String(healed!.content),
      healed!.attachments as never,
    );
    expect(gate.ok).toBe(true);
  });

  it("accepts figure_scene serialized as JSON string (tool-call quirk)", () => {
    const scene = {
      pack: "math.geometry",
      version: 1,
      elements: [
        { type: "point", id: "A", x: 10, y: 10, label: "A" },
        { type: "point", id: "B", x: 80, y: 10, label: "B" },
        { type: "segment", from: "A", to: "B" },
      ],
    };
    const [healed] = healParsedQuestionFigureAttachments([
      {
        content: "如图，线段 $AB$。",
        attachments: [
          { kind: "figure", uri: "pending://figure", figure_scene: JSON.stringify(scene) },
        ],
      },
    ]);
    const gate = checkFigureRequirementForQuestion(
      "如图，线段 $AB$。",
      healed!.attachments as never,
    );
    expect(gate.ok).toBe(true);
  });

  it("accepts whole attachments serialized as JSON string", () => {
    const attachments = JSON.stringify([
      {
        kind: "figure",
        uri: "pending://figure",
        figure_scene: {
          pack: "math.geometry",
          version: 1,
          elements: [
            { type: "point", id: "A", x: 10, y: 10, label: "A" },
            { type: "point", id: "B", x: 80, y: 10, label: "B" },
            { type: "segment", from: "A", to: "B" },
          ],
        },
      },
    ]);
    const [healed] = healParsedQuestionFigureAttachments([
      { content: "如图，线段 $AB$。", attachments },
    ]);
    expect(Array.isArray(healed!.attachments)).toBe(true);
    const gate = checkFigureRequirementForQuestion(
      "如图，线段 $AB$。",
      healed!.attachments as never,
    );
    expect(gate.ok).toBe(true);
  });

  it("accepts real-world model payload: type suffix junk + coordinates/start/end/radius aliases", () => {
    // 取自线上失败日志：type 带乱码后缀、point 用 coordinates 数组、segment 用 start/end、circle 用 radius+坐标 center
    const content =
      "如图，在 $\\triangle ABC$ 中，$AB = 8$，$\\triangle ABC$ 的外接圆半径 $R = \\sqrt{17}$。过点 $C$ 作 $CD \\perp AB$ 于点 $D$。";
    const attachments = [
      {
        alt: "在圆O中，三角形ABC内接于圆，CD垂直于AB于D。",
        uri: "pending://figure",
        kind: "figure",
        figure_scene: {
          version: 1,
          pack: "math.geometry",
          elements: [
            { label: "A", coordinates: [-4, 0], id: "A", type: "point遮罩隐藏" },
            { type: "point遮罩隐藏", id: "B", label: "B", coordinates: [4, 0] },
            { type: "point遮罩隐藏", id: "C", label: "C", coordinates: [-1, 3] },
            { coordinates: [-1, 0], label: "D", type: "point遮罩隐藏", id: "D" },
            { id: "O", type: "point遮罩隐藏", coordinates: [0, -1], label: "O" },
            { type: "circle", radius: 4.123, center: [0, -1] },
            { type: "segment", start: "A", end: "B" },
            { type: "segment", start: "B", end: "C" },
            { start: "A", end: "C", type: "segment" },
            { type: "segment", end: "D", start: "C" },
          ],
        },
      },
    ];
    const [healed] = healParsedQuestionFigureAttachments([{ content, attachments }]);
    const gate = checkFigureRequirementForQuestion(content, healed!.attachments as never);
    expect(gate.ok).toBe(true);
  });

  it("rejects hollow math.function payload with per-element errors (real-world log)", () => {
    // 取自线上失败日志：axes x/y 为 0、domain 为 0、point 用 coor 占位——信息不足，必须拒绝且报出具体元素错误
    const content =
      "如图，在平面直角坐标系中，二次函数 $y = -x^2 + 2x + 3$ 的图象与 $x$ 轴交于 $A, B$ 两点。";
    const gate = checkFigureRequirementForQuestion(content, [
      {
        uri: "pending://figure",
        kind: "figure",
        figure_scene: {
          version: 1,
          pack: "math.function",
          elements: [
            { id: "axes_1", x: 0, type: "axes", axes: "axes_1", y: 0 },
            {
              domain: 0,
              axes: "axes_1",
              type: "sampled_curve",
              id: "curve_1",
              expr: "-x^2 + 2*x + 3",
            },
            { axes: "axes_1", label: "A", coor: 0, id: "pt_A", type: "point" },
          ],
        },
      },
    ]);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain("math.function 解析失败");
      expect(gate.reason).toContain("元素#1(axes)");
    }
  });

  it("gate failure reason carries diagnosis detail", () => {
    const gate = checkFigureRequirementForQuestion("如图，某抽象关系成立。", [
      { kind: "figure", uri: "pending://figure" },
    ]);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain("配图项缺少 figure_scene 字段");
    }
  });

  it("does not invent scene when stem has no geometry facts", () => {
    const [healed] = healParsedQuestionFigureAttachments([
      {
        content: "如图，某抽象关系成立。",
        attachments: [{ kind: "figure", uri: "pending://figure" }],
      },
    ]);
    const gate = checkFigureRequirementForQuestion(
      String(healed!.content),
      healed!.attachments as never,
    );
    expect(gate.ok).toBe(false);
  });

  it("ignores non-如图 stems", () => {
    const [healed] = healParsedQuestionFigureAttachments([
      { content: "计算 1+1。", attachments: [] },
    ]);
    expect(healed!.attachments).toEqual([]);
  });

  it("heals sample-exam style stem via geometry facts (no template)", () => {
    const content =
      "如图，在平行四边形 $ABCD$ 中，过对角线 $AC$ 上一点 $O$ 作两组平行线分别平行于两组对边，将平行四边形分成四个小平行四边形。";
    const [healed] = healParsedQuestionFigureAttachments([
      {
        content,
        attachments: [{ kind: "figure", uri: "pending://figure", alt: "平行四边形分割" }],
      },
    ]);
    const gate = checkFigureRequirementForQuestion(
      content,
      healed!.attachments as never,
    );
    expect(gate.ok).toBe(true);
    const fig = (healed!.attachments as Array<{ figure_scene?: unknown }>)[0];
    expect(fig?.figure_scene).toBeTruthy();
  });
});
