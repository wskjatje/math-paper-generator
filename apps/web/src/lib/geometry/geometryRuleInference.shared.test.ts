import { describe, expect, it } from "vitest";

import { tryRuleBasedDiagramSchema } from "@/lib/geometry/geometryRuleInference.shared";

const Q24_LIKE =
  "（24）在平面直角坐标系中，O为原点，直角△AOB的顶点A(0,5)，B(5√3,0)，等边△DEF的顶点E(0,3)，F(-√3,0)。" +
  "(1)如图(1)，∠EFO的度数为____。(2)将△DEF沿水平方向向右平移，得到△D'E'F'。" +
  "若边D'F'与边OA相交于点G，当重叠部分为四边形EE'F'G时，求S。";

describe("geometryRuleInference", () => {
  it("coordinate plane stem does not fall through to angle-copy template", () => {
    const schema = tryRuleBasedDiagramSchema(Q24_LIKE);
    const engine = schema?.meta?.layout_engine ?? "";
    expect(engine).not.toMatch(/^angle_copy/);
    expect(engine).not.toBe("square_chain_constraints_v1");
    expect(schema?.meta?.layout_engine).toBe("cartesian_coordinate_constraints_v1");
  });
});
