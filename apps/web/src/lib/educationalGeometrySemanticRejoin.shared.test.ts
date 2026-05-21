import { describe, expect, it } from "vitest";

import { runEducationalTextCanonicalization } from "@/lib/educationalTextCanonicalization.shared";
import { runGeometrySemanticRejoin } from "@/lib/educationalGeometrySemanticRejoin.shared";

const Q24_OCR_SNIPPET = String.raw`(24) (本小题 10 分)在平面直角坐标系中, \(O\) 为原点, 直角 \(\triangle A O B\) 的顶点 \(A(0,5), B(5 \sqrt{3}, 0)\), 等边 \(\triangle\) \(D E F\) 的顶点 \(E(0,3), F(-\sqrt{3}, 0)\), 顶点 \(D\) 在第二象限. (1) 填空: 如图①, \(\angle E F O\) 的度数为 ____, 点 \(D\) 的坐标为 (2) 将等边 \(\triangle D E F\) 沿水平方向向右平移, 得到等边 \(\triangle D^{\prime} E^{\prime} F^{\prime}\), 点 \(D, E, F\) 的对应点分别为 \(D^{\prime}, E^{\prime}, F^{\prime}\). 设 \(E E^{\prime}=t\), 等边 \(\triangle D^{\prime} E^{\prime} F^{\prime}\) 与直角三角形 \(A O B\) 的重叠部分的面积为 \(S\).`;

describe("runGeometrySemanticRejoin", () => {
  it("rejoins spaced LaTeX triangles and split 等边 \\triangle + DEF", () => {
    const out = runGeometrySemanticRejoin(Q24_OCR_SNIPPET);
    expect(out).toContain("直角△AOB");
    expect(out).toContain("等边△DEF");
    expect(out).not.toMatch(/\\triangle A O B/);
    expect(out).not.toMatch(/\\triangle\) \(D E F/);
  });

  it("compacts angle and sqrt in coordinate plane", () => {
    const out = runGeometrySemanticRejoin(
      String.raw`在平面直角坐标系中，如图①, \(\angle E F O\) 的度数为 ____，\(B(5 \sqrt{3}, 0)\)`,
    );
    expect(out).toMatch(/∠EFO/);
    expect(out).toMatch(/B\(5√3/);
  });

  it("compacts primed triangle names", () => {
    const out = runGeometrySemanticRejoin(
      String.raw`在平面直角坐标系中，等边 \(\triangle D^{\prime} E^{\prime} F^{\prime}\) 与 \(\triangle A O B\)`,
    );
    expect(out).toMatch(/△D'E'F'/);
    expect(out).not.toMatch(/\^\{\\prime\}/);
  });
});

describe("compiler integrates geometry_semantic_rejoin", () => {
  it("emits rejoin phase after geometry_notation_normalize", () => {
    const { trace } = runEducationalTextCanonicalization(Q24_OCR_SNIPPET);
    const ids = trace.phases.map((p) => p.phase);
    expect(ids).toContain("geometry_semantic_rejoin");
    const geoIdx = ids.indexOf("geometry_notation_normalize");
    const rejoinIdx = ids.indexOf("geometry_semantic_rejoin");
    expect(rejoinIdx).toBeGreaterThan(geoIdx);
    const rejoin = trace.phases.find((p) => p.phase === "geometry_semantic_rejoin");
    expect(rejoin?.changed).toBe(true);
  });
});
