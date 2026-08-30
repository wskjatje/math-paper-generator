import { describe, expect, it } from "vitest";
import seed from "@/config/curriculum-catalog.json";
import { resolveCoursewareSlice } from "@/lib/coursewareSlice.shared";
import {
  editionsForSubjectFromPayload,
  subjectsAllowedForGradeAndPaperKindFromPayload,
} from "@/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "@/lib/curriculumCatalog.types";
import {
  defaultCompositionForSubject,
  scopesForGradeAndSubject,
} from "@/lib/generateCatalog";

const payload = seed as CurriculumCatalogPayload;

describe("courseware slice gate", () => {
  it("resolves regular / entrance / contest tracks when slices enabled", () => {
    const regular = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "regular_final",
      gradeId: "jhs_g2_s1",
      subjectId: "math",
      editionId: "pep",
    });
    expect(regular?.track).toBe("grade_term");
    expect(regular?.editionId).toBe("pep");

    const entrance = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "entrance_junior_senior",
      gradeId: "jhs_g3_s2",
      subjectId: "math",
      editionId: "bnup",
    });
    expect(entrance?.track).toBe("entrance_outline");

    const contest = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "olympiad",
      gradeId: "hs_g2_s1",
      subjectId: "math",
      editionId: "pep",
    });
    expect(contest?.track).toBe("contest_outline");
  });

  it("blocks when edition missing", () => {
    const hit = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "regular_daily",
      gradeId: "pri_g3_s1",
      subjectId: "math",
      editionId: "",
    });
    expect(hit).toBeNull();
  });

  it("blocks when edition not allowed for subject", () => {
    const hit = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "regular_daily",
      gradeId: "jhs_g2_s1",
      subjectId: "english",
      editionId: "xiangjiao",
    });
    expect(hit).toBeNull();
  });

  it("blocks when track disabled", () => {
    const disabled: CurriculumCatalogPayload = {
      ...payload,
      slices: {
        ...payload.slices,
        grade_term: { enabled: false, requireEdition: true },
      },
    };
    const hit = resolveCoursewareSlice({
      payload: disabled,
      curriculumVersionId: "v1",
      paperKindId: "regular_daily",
      gradeId: "pri_g3_s1",
      subjectId: "math",
      editionId: "pep",
    });
    expect(hit).toBeNull();
  });

  it("blocks subject not allowed for entrance kind", () => {
    const hit = resolveCoursewareSlice({
      payload,
      curriculumVersionId: "v1",
      paperKindId: "entrance_primary_junior",
      gradeId: "pri_g6_s2",
      subjectId: "physics",
      editionId: "pep",
    });
    expect(hit).toBeNull();
  });
});

describe("catalog helpers from seed", () => {
  it("keeps entrance subject filter", () => {
    expect(
      subjectsAllowedForGradeAndPaperKindFromPayload(
        payload,
        "pri_g6_s2",
        "entrance_primary_junior",
      ),
    ).not.toContain("physics");
  });

  it("filters primary math scopes", () => {
    const ids = scopesForGradeAndSubject("pri_g2_s1", "math").map((s) => s.id);
    expect(ids).toContain("math_num");
    expect(ids).not.toContain("math_analytic");
  });

  it("builds default composition", () => {
    const c = defaultCompositionForSubject("math", "jhs_g2_s1");
    expect(c.multiple_choice).toBeGreaterThan(0);
  });

  it("lists editions for math including 人教版", () => {
    const eds = editionsForSubjectFromPayload(payload, "math");
    expect(eds.some((e) => e.id === "pep" && e.label === "人教版")).toBe(true);
  });
});
