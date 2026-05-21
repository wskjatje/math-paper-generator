import { describe, expect, it } from "vitest";

import { buildEducationalAstFromCanonical } from "@/lib/buildEducationalAstFromCanonical.shared";
import { splitEducationalMathSegments } from "@/lib/educationalAstMathSegments.shared";
import { splitSubpartsFromSectionBody } from "@/lib/nestEducationalAst.shared";
import { repairPresentationMathLatex } from "@/lib/educationalPresentationMathRepair.shared";

describe("buildEducationalAstFromCanonical", () => {
  it("emits nested section children for subquestions and anchored figures", () => {
    const canonical = `题干
（I）填空部分
（II）将等边△DEF平移
① 如图②，求面积
② 当 t 变化
![图①](/f1.png)
![图②](/f2.png)`;
    const ast = buildEducationalAstFromCanonical(canonical);
    expect(ast.runtime).toBe("educational_presentation_runtime_v1");
    expect(ast.replay_mutation).toBe("none");
    const sectionI = ast.nodes.find((n) => n.type === "section" && n.label === "I");
    const sectionII = ast.nodes.find((n) => n.type === "section" && n.label === "II");
    expect(sectionI?.type).toBe("section");
    expect(sectionII?.type).toBe("section");
    if (sectionII?.type === "section") {
      const sub = sectionII.children.find((c) => c.type === "subquestion" && c.label === "①");
      expect(sub).toBeDefined();
      const fig = sectionII.children.find((c) => c.type === "figure");
      expect(fig?.type).toBe("figure");
      if (fig?.type === "figure") {
        expect(fig.layoutKind).toBe("compact");
        expect(fig.anchor).toBe("enumeration:①");
      }
    }
    expect(ast.nodes.some((n) => n.type === "subquestion")).toBe(false);
  });

  it("splits embedded ①② inside section body into children", () => {
    const ast = buildEducationalAstFromCanonical(
      "（II）将等边△DEF平移① 如图②求 S② 当 t 变化",
    );
    const sec = ast.nodes.find((n) => n.type === "section" && n.label === "II");
    expect(sec?.type).toBe("section");
    if (sec?.type === "section") {
      expect(sec.children.filter((c) => c.type === "subquestion").map((c) => c.label)).toEqual([
        "①",
        "②",
      ]);
    }
  });

  it("routes <<< 文件 provenance to forensic_banner", () => {
    const ast = buildEducationalAstFromCanonical(
      "<<< 文件: test.jpg （网关 OCR · got） >>>\n（I）填空",
    );
    expect(ast.nodes.some((n) => n.type === "forensic_banner")).toBe(true);
    expect(ast.nodes.some((n) => n.type === "question_stem")).toBe(false);
  });

  it("splits math_inline segments in section body", () => {
    const ast = buildEducationalAstFromCanonical("（I）求 ∠EFO 与 △AOB");
    const sec = ast.nodes.find((n) => n.type === "section");
    expect(sec?.type).toBe("section");
    if (sec?.type === "section") {
      expect(
        sec.segments.some(
          (s) => s.kind === "math_inline" && s.mathKind === "geometry_angle" && /EFO/.test(s.raw),
        ),
      ).toBe(true);
    }
  });
});

describe("splitSubpartsFromSectionBody", () => {
  it("extracts ①② blocks from inline section text", () => {
    const { preamble, items } = splitSubpartsFromSectionBody(
      "将等边△DEF平移① 如图②② 当 t 变化",
    );
    expect(preamble).toContain("平移");
    expect(items.map((i) => i.label)).toEqual(["①", "②"]);
  });
});

describe("splitEducationalMathSegments", () => {
  it("isolates triangle and angle tokens", () => {
    const segs = splitEducationalMathSegments("直角△AOB 的 ∠EFO");
    expect(segs.some((s) => s.kind === "math_inline" && s.raw.includes("△AOB"))).toBe(true);
  });
});

describe("repairPresentationMathLatex", () => {
  it("unwraps broken backslash frac and wraps as inline math", () => {
    const out = repairPresentationMathLatex(
      "(\\backslash frac\\{\\backslash sqrt\\{3\\}\\}\\{2\\} \\leqslant slant t)",
    );
    expect(out).toContain("$");
    expect(out).toContain("\\frac");
    expect(out).not.toContain("backslash frac");
  });
});
