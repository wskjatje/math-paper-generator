import { describe, expect, it } from "vitest";
import {
  applyCompetitionFocusGradeAlignment,
  competitionFocusOptionsForGrade,
  contestTargetTracksForSubject,
  defaultCompetitionFocusOptions,
  GEN_GRADE_UNBOUND_ID,
  GRADE_LEVEL_OPTIONS,
  resolveContestGradePayload,
  subjectIdForContestTargetTrack,
  targetTracksForExamTrack,
} from "./generateCatalog";

describe("contest target ↔ subject align", () => {
  it("maps contest styles to a primary subject", () => {
    expect(subjectIdForContestTargetTrack("ct_chemistry")).toBe("chemistry");
    expect(subjectIdForContestTargetTrack("ct_amc")).toBe("math");
    expect(subjectIdForContestTargetTrack("ct_kangaroo")).toBe("math");
    expect(subjectIdForContestTargetTrack("")).toBeNull();
  });

  it("filters contest styles by subject; empty subject returns all contest tracks", () => {
    const math = contestTargetTracksForSubject("math").map((t) => t.id);
    expect(math).toEqual(["ct_math_league", "ct_amc", "ct_kangaroo"]);

    const chem = contestTargetTracksForSubject("chemistry").map((t) => t.id);
    expect(chem).toEqual(["ct_chemistry"]);

    expect(contestTargetTracksForSubject("biology")).toEqual([]);
    expect(contestTargetTracksForSubject("").map((t) => t.id)).toEqual(
      targetTracksForExamTrack("contest_track").map((t) => t.id),
    );
  });

  it("resolves contest grade only from GRADE_LEVEL_OPTIONS", () => {
    const known = GRADE_LEVEL_OPTIONS[0]!.id;
    expect(resolveContestGradePayload(known)).toBe(known);
    expect(resolveContestGradePayload("")).toBe(GEN_GRADE_UNBOUND_ID);
    expect(resolveContestGradePayload(GEN_GRADE_UNBOUND_ID)).toBe(GEN_GRADE_UNBOUND_ID);
    expect(resolveContestGradePayload("not_a_real_grade")).toBe(GEN_GRADE_UNBOUND_ID);
  });

  it("stretches alignment one band: primary→junior rules, junior→senior rules", () => {
    // 小学上浮到初中规则：可选手联赛档，仍禁国家集训队（含 CMO 文案）
    const primary = competitionFocusOptionsForGrade("math", "pri_g1_s2");
    expect(primary.some((o) => o.id === "math_try1")).toBe(true);
    expect(primary.some((o) => o.id === "math_try2_nt")).toBe(true);
    expect(primary.some((o) => /国家集训队/i.test(o.label))).toBe(false);

    // 初中上浮到高中规则：高中无额外禁止 → 可选 CMO
    const junior = competitionFocusOptionsForGrade("math", "jhs_g2_s1");
    expect(junior.some((o) => o.id === "math_cmo")).toBe(true);
    expect(junior.some((o) => o.id === "math_try1")).toBe(true);

    const senior = competitionFocusOptionsForGrade("math", "hs_g2_s1");
    expect(senior.some((o) => o.id === "math_cmo")).toBe(true);

    const unbound = competitionFocusOptionsForGrade("math", GEN_GRADE_UNBOUND_ID);
    expect(unbound.some((o) => o.id === "math_try1")).toBe(true);
  });

  it("falls back to defaultCompetitionFocus when stretched alignment removes every option", () => {
    // 小学→初中规则仍禁止「国家集训队」
    const onlyForbidden = [{ id: "x", label: "国家集训队风格" }];
    const next = applyCompetitionFocusGradeAlignment(onlyForbidden, "pri_g1_s2");
    expect(next).toEqual(defaultCompetitionFocusOptions());
  });
});
