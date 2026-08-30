import { describe, expect, it } from "vitest";
import {
  compareClassesByGradeAsc,
  nextClassGradeId,
  gradeLevelSortIndex,
} from "@/lib/classroomClass.shared";

describe("classroomClass.shared grade progression", () => {
  it("gradeLevelSortIndex 小学早于初中早于高中", () => {
    expect(gradeLevelSortIndex("pri_g1_s1")).toBeLessThan(gradeLevelSortIndex("pri_g4_s2"));
    expect(gradeLevelSortIndex("pri_g6_s2")).toBeLessThan(gradeLevelSortIndex("jhs_g1_s1"));
    expect(gradeLevelSortIndex("jhs_g3_s2")).toBeLessThan(gradeLevelSortIndex("hs_g1_s1"));
  });

  it("compareClassesByGradeAsc 按年级再按名称", () => {
    const rows = [
      { grade_id: "jhs_g1_s1", name: "B班" },
      { grade_id: "pri_g4_s1", name: "Z班" },
      { grade_id: "pri_g4_s1", name: "A班" },
    ];
    const sorted = [...rows].sort(compareClassesByGradeAsc);
    expect(sorted.map((r) => `${r.grade_id}:${r.name}`)).toEqual([
      "pri_g4_s1:A班",
      "pri_g4_s1:Z班",
      "jhs_g1_s1:B班",
    ]);
  });

  it("nextClassGradeId：上→同学年下；下→下一学年上", () => {
    expect(nextClassGradeId("pri_g4_s1")).toBe("pri_g4_s2");
    expect(nextClassGradeId("pri_g4_s2")).toBe("pri_g5_s1");
    expect(nextClassGradeId("pri_g6_s1")).toBe("pri_g6_s2");
    expect(nextClassGradeId("pri_g6_s2")).toBe("jhs_g1_s1");
    expect(nextClassGradeId("jhs_g3_s1")).toBe("jhs_g3_s2");
    expect(nextClassGradeId("jhs_g3_s2")).toBe("hs_g1_s1");
    expect(nextClassGradeId("hs_g3_s1")).toBe("hs_g3_s2");
    expect(nextClassGradeId("hs_g3_s2")).toBeNull();
    expect(nextClassGradeId("not_a_grade")).toBeNull();
  });
});
