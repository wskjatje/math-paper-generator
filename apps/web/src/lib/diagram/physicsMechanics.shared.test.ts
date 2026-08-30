import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { tryProcessDiagramScene } from "./diagramProcess.shared";
import {
  extractMechanicsStemForceLabels,
  extractMechanicsStemPointLabels,
  parsePhysicsMechanicsScene,
  tryProcessPhysicsMechanicsScene,
  validatePhysicsMechanicsScene,
} from "./physicsMechanics.shared";
import physicsMechanicsLayout from "./physicsMechanics.layout.json";

const leverScene = {
  pack: "physics.mechanics",
  version: 1,
  elements: [
    { type: "point", id: "A", x: 0, y: 80, label: "A" },
    { type: "point", id: "O", x: 40, y: 80, label: "O" },
    { type: "point", id: "B", x: 100, y: 80, label: "B" },
    { type: "segment", from: "A", to: "B" },
    { type: "force", from: [0, 80], to: [0, 120], label: "G" },
    { type: "force", from: [100, 80], to: [100, 40], label: "F" },
  ],
};

const leverStem =
  "如图所示，杠杆 AB 长 $1\\text{ m}$，支点为 O，$OA = 0.4\\text{ m}$。在 A 端挂 $100\\text{ N}$ 物体。若垂直杠杆于 B 端作用拉力 $F$ 使其水平平衡。";

describe("physics.mechanics scene", () => {
  it("parse / reject incomplete", () => {
    expect(parsePhysicsMechanicsScene(leverScene)).not.toBeNull();
    expect(
      parsePhysicsMechanicsScene({ pack: "physics.mechanics", version: 1, elements: [] }),
    ).toBeNull();
    expect(
      parsePhysicsMechanicsScene({
        pack: "math.geometry",
        version: 1,
        elements: leverScene.elements,
      }),
    ).toBeNull();
  });

  it("force 必须有 label", () => {
    const bad = {
      pack: "physics.mechanics",
      version: 1,
      elements: [
        { type: "rect", x: 0, y: 0, width: 10, height: 10 },
        { type: "force", from: [0, 0], to: [10, 0] },
      ],
    };
    expect(parsePhysicsMechanicsScene(bad)).toBeNull();
  });

  it("tryProcess 杠杆题干对齐并通过渲染", () => {
    const r = tryProcessPhysicsMechanicsScene(leverScene, leverStem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.svg).toContain("<svg");
    expect(validatePhysicsMechanicsScene(r.scene).ok).toBe(true);
  });

  it("diagramProcess 分发 physics.mechanics", () => {
    const r = tryProcessDiagramScene(leverScene, leverStem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack).toBe("physics.mechanics");
  });

  it("extract 点名 / 力名（确定性模式）", () => {
    expect(extractMechanicsStemPointLabels(leverStem).sort()).toEqual(["A", "B", "O"]);
    const forces = extractMechanicsStemForceLabels(leverStem);
    expect(forces.has("F")).toBe(true);
    expect(forces.has("G")).toBe(true);
  });

  it("拒绝题干未出现的 force 标签", () => {
    const r = tryProcessPhysicsMechanicsScene(
      {
        ...leverScene,
        elements: [
          ...leverScene.elements.filter((e) => e.type !== "force"),
          { type: "force", from: [0, 80], to: [0, 120], label: "Q" },
        ],
      },
      leverStem,
    );
    expect(r.ok).toBe(false);
  });

  it("斜面：标注不压斜边、h 不被裁切、物块脱出填充", () => {
    const inclineStem =
      "如图，斜面长 $s = 5\\text{ m}$，高 $h = 3\\text{ m}$。用 $100\\text{ N}$ 的拉力 $F$，将重 $120\\text{ N}$ 的物体匀速拉到顶端。";
    const inclineScene = {
      pack: "physics.mechanics",
      version: 1,
      elements: [
        { type: "point", id: "foot", x: 60, y: 200 },
        { type: "point", id: "base", x: 220, y: 200 },
        { type: "point", id: "apex", x: 60, y: 80 },
        { type: "polygon", points: ["foot", "base", "apex"], fill: "#f1f5f9" },
        { type: "segment", from: "foot", to: "base" },
        { type: "segment", from: "base", to: "apex" },
        { type: "segment", from: "apex", to: "foot" },
        { type: "point", id: "mid_h", x: 60, y: 140 },
        { type: "point", id: "mid_s", x: 140, y: 140 },
        { type: "label", at: "mid_h", text: "h=3 m", dx: -48, dy: 6 },
        { type: "label", at: "mid_s", text: "s=5 m", dx: 16, dy: 18 },
        { type: "rect", x: 126, y: 116, width: 28, height: 22, fill: "#cbd5e1" },
        { type: "force", from: [140, 127], to: [176, 100], label: "F" },
        { type: "force", from: [140, 138], to: [140, 171], label: "G" },
      ],
    };
    const r = tryProcessPhysicsMechanicsScene(inclineScene, inclineStem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const vb = r.svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number) ?? [];
    const [minX = 0, , ,] = vb;
    // h=3 m 起始约 mid_h.x+dx；取景须覆盖完整「h」
    expect(minX).toBeLessThan(12);
    expect(r.svg).toContain("h=3 m");
    expect(r.svg).toContain("s=5 m");
    // s 标注应离开斜边 mid_s(140,140)：解析 text 坐标
    const sMatch = r.svg.match(/<text[^>]*x="([^"]+)" y="([^"]+)"[^>]*>s=5 m<\/text>/);
    expect(sMatch).toBeTruthy();
    const sx = Number(sMatch![1]);
    const sy = Number(sMatch![2]);
    // 到斜边 base–apex 的距离应 ≥ 约 12
    const ax = 60;
    const ay = 80;
    const bx = 220;
    const by = 200;
    const abx = bx - ax;
    const aby = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((sx - ax) * abx + (sy - ay) * aby) / (abx * abx + aby * aby)),
    );
    const dist = Math.hypot(sx - (ax + t * abx), sy - (ay + t * aby));
    expect(dist).toBeGreaterThanOrEqual(physicsMechanicsLayout.edgeMinClearance - 1);
    // 物块贴合斜边：须有非零转角，且底边方向与斜边一致
    const rect = r.scene.elements.find((e) => e.type === "rect");
    expect(rect && rect.type === "rect").toBe(true);
    if (rect && rect.type === "rect") {
      expect(Math.abs(rect.rotationDeg ?? 0)).toBeGreaterThan(12);
      expect(Math.abs(rect.rotationDeg ?? 0)).toBeLessThan(78);
      // 3-4-5 斜面 atan2(3,4)≈36.87°
      expect(Math.abs((rect.rotationDeg ?? 0) - (Math.atan2(3, 4) * 180) / Math.PI)).toBeLessThan(
        1.5,
      );
    }
    expect(r.svg).toMatch(/rotate\(/);
    // 拉力应平行斜边（上坡方向）
    const from = r.scene.elements.find((e) => e.type === "point" && e.id.includes("_pm_from_0"));
    const to = r.scene.elements.find((e) => e.type === "point" && e.id.includes("_pm_to_0"));
    if (from && to && from.type === "point" && to.type === "point") {
      const fx = to.x - from.x;
      const fy = to.y - from.y;
      const fl = Math.hypot(fx, fy) || 1;
      const edge = { x: 0.8, y: 0.6 }; // 3-4-5 斜面向下
      expect(Math.abs((-fx / fl) * edge.x + (-fy / fl) * edge.y)).toBeGreaterThan(0.95);
    }
  });

  it("尺寸标注避让具名点：圆点不压数字、两标记半径一致", () => {
    const stem = "如图所示连通器，A、B 两点水的压强差为 Δp。";
    const vesselScene = {
      pack: "physics.mechanics",
      version: 1,
      elements: [
        { type: "point", id: "A", x: 80, y: 70, label: "A" },
        { type: "point", id: "B", x: 160, y: 90, label: "B" },
        { type: "segment", from: "A", to: "B", style: "dashed" },
        // 故意与点 A 重叠，复现「数字被圆点盖住」
        { type: "label", at: "A", text: "0.2 m", dx: -14, dy: 6 },
        { type: "label", at: "B", text: "0.1 m", dx: -10, dy: 12 },
      ],
    };
    const r = tryProcessPhysicsMechanicsScene(vesselScene, stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const circles = [...r.svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map(
      (m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }),
    );
    expect(circles.length).toBe(2);
    expect(circles[0]!.r).toBe(circles[1]!.r);

    const dimLabels = r.scene.elements.filter(
      (e): e is { type: "label"; at: string; text: string; dx?: number; dy?: number } =>
        e.type === "label" && !/^[A-Z]'?$/.test(e.text.trim()),
    );
    expect(dimLabels.length).toBe(2);

    const markers = r.scene.elements.filter(
      (e): e is { type: "point"; id: string; x: number; y: number } => e.type === "point",
    );
    const markerR = circles[0]!.r;
    expect(markerR).toBe(physicsMechanicsLayout.pointMarkerRadius);
    const haloHalf = physicsMechanicsLayout.labelHaloStroke / 2;
    const minClear =
      markerR + haloHalf + physicsMechanicsLayout.labelPointMinClearance;
    for (const lab of dimLabels) {
      const at = markers.find((p) => p.id === lab.at);
      expect(at).toBeTruthy();
      if (!at) continue;
      const w = Math.max(28, [...lab.text].length * 9);
      const h = 18;
      const left = at.x + (lab.dx ?? 0) - haloHalf;
      const top = at.y + (lab.dy ?? 0) - h * 0.85 - haloHalf;
      const right = at.x + (lab.dx ?? 0) + w + haloHalf;
      const bottom = at.y + (lab.dy ?? 0) + h * 0.2 + haloHalf;
      for (const m of markers) {
        const qx = Math.max(left, Math.min(right, m.x));
        const qy = Math.max(top, Math.min(bottom, m.y));
        const dist = Math.hypot(m.x - qx, m.y - qy);
        expect(dist).toBeGreaterThanOrEqual(minClear - 0.5);
      }
    }
  });

  it("连通器管壁多：尺寸标不漂离模型原偏移邻域（配置 maxWander）", () => {
    const stem = "如图所示连通器，A、B 两点水的压强差为 Δp。";
    const vesselScene = {
      pack: "physics.mechanics",
      version: 1,
      elements: [
        { type: "point", id: "L0", x: 50, y: 20 },
        { type: "point", id: "L1", x: 50, y: 150 },
        { type: "point", id: "M0", x: 110, y: 80 },
        { type: "point", id: "M1", x: 110, y: 150 },
        { type: "point", id: "N0", x: 170, y: 80 },
        { type: "point", id: "N1", x: 170, y: 150 },
        { type: "point", id: "R0", x: 230, y: 20 },
        { type: "point", id: "R1", x: 230, y: 150 },
        { type: "point", id: "A", x: 80, y: 70, label: "A" },
        { type: "point", id: "B", x: 200, y: 60, label: "B" },
        { type: "segment", from: "L0", to: "L1" },
        { type: "segment", from: "L1", to: "M1" },
        { type: "segment", from: "M1", to: "M0" },
        { type: "segment", from: "M0", to: "N0" },
        { type: "segment", from: "N0", to: "N1" },
        { type: "segment", from: "N1", to: "R1" },
        { type: "segment", from: "R1", to: "R0" },
        { type: "label", at: "A", text: "0.2 m", dx: -14, dy: 6 },
        { type: "label", at: "B", text: "0.1 m", dx: 12, dy: 8 },
      ],
    };
    const r = tryProcessPhysicsMechanicsScene(vesselScene, stem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const maxWander = Math.min(
      physicsMechanicsLayout.labelOffsetHardMaxWander,
      physicsMechanicsLayout.labelOffsetMaxWanderFromPreferred *
        Math.max(1, physicsMechanicsLayout.labelOffsetExpandWanderFactor),
    );
    const preferredByAt: Record<string, { dx: number; dy: number }> = {
      A: { dx: -14, dy: 6 },
      B: { dx: 12, dy: 8 },
    };
    for (const el of r.scene.elements) {
      if (el.type !== "label") continue;
      const pref = preferredByAt[el.at];
      expect(pref).toBeTruthy();
      if (!pref) continue;
      const wander = Math.hypot((el.dx ?? 0) - pref.dx, (el.dy ?? 0) - pref.dy);
      expect(wander).toBeLessThanOrEqual(maxWander + 0.5);
      const at = r.scene.elements.find((p) => p.type === "point" && p.id === el.at);
      if (!at || at.type !== "point") continue;
      const lx = at.x + (el.dx ?? 0);
      // 不得漂到连通器右侧空白（旧 bug：0.1 m 飞到 x≈246）
      expect(lx).toBeLessThan(240);
    }
  });
});

describe("physics.mechanics calibration set", () => {
  it("≥20 cases, positive G2–G4 pass rate ≥85%, negatives fail", () => {
    const p = path.join(
      resolveProjectRoot(),
      "examples/v1/diagram-calibration/physics-mechanics/cases.json",
    );
    const cases = JSON.parse(readFileSync(p, "utf8")) as Array<{
      id: string;
      content: string;
      figure_scene: unknown;
      expectOk: boolean;
    }>;
    expect(cases.length).toBeGreaterThanOrEqual(20);

    let pass = 0;
    let expectOkCount = 0;
    let negOk = 0;
    let negTotal = 0;
    const failures: string[] = [];
    for (const c of cases) {
      const r = tryProcessPhysicsMechanicsScene(c.figure_scene, c.content);
      if (c.expectOk) {
        expectOkCount++;
        if (r.ok) pass++;
        else failures.push(`${c.id}: ${r.errors.join("; ")}`);
      } else {
        negTotal++;
        if (!r.ok) negOk++;
        else failures.push(`${c.id}: expected fail but ok`);
      }
    }
    expect(expectOkCount).toBeGreaterThan(0);
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log(failures.join("\n"));
    }
    expect(pass / expectOkCount).toBeGreaterThanOrEqual(0.85);
    expect(negOk).toBe(negTotal);
  });
});
