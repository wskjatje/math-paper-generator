import { describe, expect, it } from "vitest";
import seed from "@/config/curriculum-catalog.json";
import {
  directorySyncCoverageFromPayload,
  enumerateDirectorySyncSlots,
  gradeEditionDirectorySyncFromPayload,
} from "@/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "@/lib/curriculumCatalog.types";

const payload = {
  id: "t",
  termId: "t",
  gradeBandLabels: { primary: "小学", junior: "初中", senior: "高中" },
  gradeBandOrder: ["primary"],
  gradeBases: [{ id: "pri_g1", label: "小学一年级", band: "primary" }],
  subjects: [
    { id: "math", label: "数学" },
    { id: "chinese", label: "语文" },
  ],
  subjectsByBand: { primary: ["math", "chinese"], junior: [], senior: [] },
  editions: [
    { id: "pep", label: "人教版" },
    { id: "bnup", label: "北师大版" },
  ],
  editionsBySubject: {
    math: ["pep", "bnup"],
    chinese: ["pep"],
  },
  textbooks: [
    {
      id: "pep-math-pri_g1-s1",
      editionId: "pep",
      subjectId: "math",
      gradeBaseId: "pri_g1",
      semester: "s1",
      title: "数学一年级上",
      units: [{ id: "u1", label: "准备课" }],
    },
  ],
  entranceSuggestedGrade: {},
  subjectsByEntrance: {},
  textbookSyncScope: { id: "textbook_sync", label: "教材同步" },
  scopesBySubject: {},
  defaultScopes: [],
  scopeFilters: [],
  notesPlaceholders: {},
  competitionFocusBySubject: {},
  defaultCompetitionFocus: [],
  questionTypesBySubject: {},
  questionTypeFilters: [],
  defaultCompositions: {},
  slices: {},
} as unknown as CurriculumCatalogPayload;

describe("gradeEditionDirectorySyncFromPayload", () => {
  it("splits 上/下 and marks synced per semester", () => {
    const rows = gradeEditionDirectorySyncFromPayload(payload);
    expect(rows.map((r) => r.grade.id)).toEqual(["pri_g1_s1", "pri_g1_s2"]);
    expect(rows[0]!.grade.label).toContain("上");
    expect(rows[1]!.grade.label).toContain("下");

    const mathS1 = rows[0]!.subjects.find((s) => s.subject.id === "math")!;
    const mathS2 = rows[1]!.subjects.find((s) => s.subject.id === "math")!;
    expect(mathS1.editions.find((e) => e.edition.id === "pep")?.synced).toBe(true);
    expect(mathS2.editions.find((e) => e.edition.id === "pep")?.synced).toBe(false);
    expect(mathS1.editions.find((e) => e.edition.id === "bnup")?.synced).toBe(false);

    const chineseS1 = rows[0]!.subjects.find((s) => s.subject.id === "chinese")!;
    expect(chineseS1.editions.find((e) => e.edition.id === "pep")?.synced).toBe(false);
    expect(chineseS1.editions.some((e) => e.edition.id === "bnup")).toBe(false);
  });
});

describe("enumerateDirectorySyncSlots", () => {
  const seedPayload = seed as CurriculumCatalogPayload;

  it("slot count matches UI gradeEditionDirectorySync denominator", () => {
    const slots = enumerateDirectorySyncSlots(seedPayload);
    const uiRows = gradeEditionDirectorySyncFromPayload(seedPayload);
    const uiExpected = uiRows.reduce(
      (n, g) => n + g.subjects.reduce((m, s) => m + s.expectedCount, 0),
      0,
    );
    expect(slots.length).toBe(uiExpected);
    expect(slots.length).toBeGreaterThan(400);
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
  });

  it("empty units do not count as synced coverage", () => {
    const slots = enumerateDirectorySyncSlots(seedPayload);
    const shellBooks = slots.map((s) => ({
      id: s.id,
      editionId: s.editionId,
      subjectId: s.subjectId,
      gradeBaseId: s.gradeBaseId,
      semester: s.semester,
      title: s.title,
      units: [] as Array<{ id: string; label: string }>,
    }));
    const coverage = directorySyncCoverageFromPayload(seedPayload, shellBooks);
    expect(coverage.expectedSlots).toBe(slots.length);
    expect(coverage.syncedSlots).toBe(0);
  });
});
