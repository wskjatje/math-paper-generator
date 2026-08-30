import { describe, expect, it } from "vitest";
import {
  detectFigureSpecFromQuestionText,
  detectFigureSpecWithConfidence,
  extractSideLengthsFromStem,
  isUnusableFigureUri,
  parseFigureSpec,
  renderFigureSvg,
  resolveTrigSideRolesForAcute,
} from "@/lib/figureSvg.shared";
import { sanitizeFigureSvg } from "@/lib/figureSvgSanitize.shared";

describe("figureSvg.shared", () => {
  it("detects number line as high confidence", () => {
    const r = detectFigureSpecWithConfidence("在数轴上表示 -1 与 3");
    expect(r?.confidence).toBe("high");
    expect(r?.spec.kind).toBe("number_line");
  });

  it("does not mistake 阶梯形 for 梯形", () => {
    const r = detectFigureSpecWithConfidence(
      "如图，将一个长方形剪成完全相同的两块阶梯形，并拼成一个正方形。",
      "长方形剪拼为正方形的几何示意图",
    );
    expect(r?.spec.kind === "trapezoid").toBeFalsy();
    // 旧 API 仅返回高置信，故应为 null（避免瞎配梯形模板）
    expect(
      detectFigureSpecFromQuestionText(
        "如图，将一个长方形剪成完全相同的两块阶梯形，并拼成一个正方形。",
      ),
    ).toBeNull();
  });

  it("marks true trapezoid with diagonals as high confidence", () => {
    const r = detectFigureSpecWithConfidence(
      "如图，在梯形 ABCD 中，对角线 AC 与 BD 相交于点 O。",
    );
    expect(r?.spec.kind).toBe("trapezoid");
    expect(r?.confidence).toBe("high");
  });

  it("detects explicit grid size as high", () => {
    const r = detectFigureSpecWithConfidence("如图，在一个 3×3 的方格网中");
    expect(r?.spec.kind).toBe("grid");
    expect(r?.confidence).toBe("high");
  });

  it("returns null for plain algebra (no guessing)", () => {
    expect(detectFigureSpecWithConfidence("解方程 2x+1=5")).toBeNull();
  });

  it("直角三角形+明确直角顶点 → 高置信，SVG 含直角记号、边长标注", () => {
    const r = detectFigureSpecWithConfidence(
      "在 $\\triangle ABC$ 中，已知 $\\angle A = 90^\\circ$，$AB = 3$，$AC = 4$。",
    );
    expect(r?.confidence).toBe("high");
    expect(r?.spec.kind).toBe("triangle");
    if (r?.spec.kind === "triangle") {
      expect(r.spec.rightAngleAt).toBe("A");
      expect(r.spec.labels).toEqual(["A", "B", "C"]);
      expect(r.spec.sideLengths).toMatchObject({ AB: 3, AC: 4 });
    }
    const svg = renderFigureSvg(r!.spec);
    expect(svg).toContain('aria-label="right-triangle"');
    expect(svg).toContain(">3<");
    expect(svg).toContain(">4<");
    expect(svg).toContain(">A<");
  });

  it("直角三角形题干含 AB/BC 边长时标注在形外", () => {
    const r = detectFigureSpecWithConfidence(
      "已知直角三角形 ABC 中，$\\angle A = 90^\\circ$ $AB = 13$, $BC = 5$，则 $AC$ 的长度为 ( )。",
    );
    expect(r?.spec.kind).toBe("triangle");
    if (r?.spec.kind === "triangle") {
      expect(r.spec.rightAngleAt).toBe("A");
      expect(r.spec.sideLengths).toMatchObject({ AB: 13, BC: 5 });
    }
    const svg = renderFigureSvg(r!.spec);
    expect(svg).toContain('aria-label="right-triangle"');
    expect(svg).toContain(">13<");
    expect(svg).toContain(">5<");
    // AB 边长标在竖边左侧（形外）
    expect(svg).toMatch(/x="24\.0"[^>]*>13</);
  });

  it("\$AB\$=\$13\$ 分段 LaTeX 也能抽出边长，且不误抽 \\\\angle A = 90", () => {
    expect(extractSideLengthsFromStem("$AB$=$13$, $BC$ = $5$")).toMatchObject({ AB: 13, BC: 5 });
    expect(extractSideLengthsFromStem("已知 $\\angle A = 90^\\circ$，$AB = 13$")).toEqual({ AB: 13 });
    expect(extractSideLengthsFromStem("已知 $\\angle A = 90^\\circ$，无边长")).toEqual({});
  });

  it("三角形仅有锐角数值 → 不猜模板（避免千题一面锐角△）", () => {
    expect(
      detectFigureSpecWithConfidence(
        "在 $\\triangle ABC$ 中，已知 $\\angle A = 30^\\circ$，$BC = 8$。",
      ),
    ).toBeNull();
  });

  it("题干 sin/cos(B) → 标 ∠B，并按课本示意标对边/邻边/斜边", () => {
    const r = detectFigureSpecWithConfidence(
      "已知 $\\angle A = 90^\\circ$，在直角三角形 ABC 中验证 $\\cos(B) = \\frac{AC}{AB}$。",
    );
    expect(r?.spec.kind).toBe("triangle");
    if (r?.spec.kind === "triangle") {
      expect(r.spec.markAngles).toContain("B");
    }
    const svg = renderFigureSvg(r!.spec);
    expect(svg).toContain(">∠B<");
    expect(svg).toContain(">对边<");
    expect(svg).toContain(">邻边<");
    expect(svg).toContain(">斜边<");
    expect(svg).not.toMatch(/>sin<|>cos</i);
  });

  it("resolveTrigSideRolesForAcute：直角 A、锐角 B → 邻AB 对AC 斜BC", () => {
    expect(resolveTrigSideRolesForAcute("A", "B", ["A", "B", "C"])).toEqual({
      adjacent: "AB",
      opposite: "AC",
      hypotenuse: "BC",
    });
  });

  it("flags placeholder URIs as unusable", () => {
    expect(
      isUnusableFigureUri("https://raw.githubusercontent.com/image_placeholder_1.png"),
    ).toBe(true);
    expect(isUnusableFigureUri("/figures/abc/q-1.svg")).toBe(false);
  });

  it("parseFigureSpec rejects unknown kind", () => {
    expect(parseFigureSpec({ kind: "made_up_shape" })).toBeNull();
    expect(parseFigureSpec({ kind: "grid", rows: 3, cols: 3, shadeTopLeft: true })).toEqual({
      kind: "grid",
      rows: 3,
      cols: 3,
      shadeTopLeft: true,
    });
  });

  it("sanitizes AI svg and strips script", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>`;
    const clean = sanitizeFigureSvg(dirty);
    expect(clean).toContain("<svg");
    expect(clean).not.toMatch(/script/i);
    expect(renderFigureSvg({ kind: "coordinate" })).toContain("<svg");
  });
});
