import { describe, expect, it } from "vitest";
import {
  curriculumOptionsForGradeAndPaperKind,
  curriculumSubjectIdsFromExamSubjects,
  examMatchesGradeFilter,
  suggestedGradeForPaperKind,
  subjectsAllowedForGradeAndPaperKind,
} from "@/lib/generateCatalog";
import { isEntrancePaperKind, PAPER_KIND_IDS } from "@/config/examDomain";

describe("entrance paper kinds", () => {
  it("registers 小升初 / 初升高 / 高升大", () => {
    expect(PAPER_KIND_IDS).toContain("entrance_primary_junior");
    expect(PAPER_KIND_IDS).toContain("entrance_junior_senior");
    expect(PAPER_KIND_IDS).toContain("entrance_senior_college");
    expect(isEntrancePaperKind("entrance_primary_junior")).toBe(true);
    expect(isEntrancePaperKind("regular_daily")).toBe(false);
  });

  it("suggests graduation grades", () => {
    expect(suggestedGradeForPaperKind("entrance_primary_junior")).toBe("pri_g6_s2");
    expect(suggestedGradeForPaperKind("entrance_junior_senior")).toBe("jhs_g3_s2");
    expect(suggestedGradeForPaperKind("entrance_senior_college")).toBe("hs_g3_s2");
  });

  it("filters subjects for entrance exams", () => {
    const primary = subjectsAllowedForGradeAndPaperKind(
      "pri_g6_s2",
      "entrance_primary_junior",
    );
    expect(primary).toEqual(
      expect.arrayContaining(["chinese", "math", "english"]),
    );
    expect(primary).not.toContain("physics");

    const gaokao = curriculumOptionsForGradeAndPaperKind(
      "hs_g3_s2",
      "entrance_senior_college",
    ).map((s) => s.id);
    expect(gaokao).toEqual(
      expect.arrayContaining(["chinese", "math", "english", "physics", "politics"]),
    );
    expect(gaokao).not.toContain("music");
  });
});

describe("examMatchesGradeFilter", () => {
  it("matches same school year across semesters", () => {
    expect(examMatchesGradeFilter(["年级:初三（下）"], "jhs_g3_s1")).toBe(true);
    expect(examMatchesGradeFilter(["年级:初三（上）"], "jhs_g3_s2")).toBe(true);
    expect(examMatchesGradeFilter(["年级:初三"], "jhs_g3_s1")).toBe(true);
  });

  it("does not match a different school year", () => {
    expect(examMatchesGradeFilter(["年级:初三（下）"], "pri_g4_s1")).toBe(false);
    expect(examMatchesGradeFilter(["年级:小学四年级（上）"], "jhs_g3_s2")).toBe(false);
  });
});

describe("curriculumSubjectIdsFromExamSubjects", () => {
  it("parses labels and ids from catalog without hardcoding names in callers", () => {
    expect(curriculumSubjectIdsFromExamSubjects(["数学", "年级:初三（下）"])).toEqual(["math"]);
    expect(curriculumSubjectIdsFromExamSubjects(["english", "语文"])).toEqual(
      expect.arrayContaining(["english", "chinese"]),
    );
    expect(curriculumSubjectIdsFromExamSubjects(["年级:初三（下）"])).toEqual([]);
  });
});
