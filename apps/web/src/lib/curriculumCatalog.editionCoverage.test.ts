import { describe, expect, it } from "vitest";
import seed from "@/config/curriculum-catalog.json";
import {
  editionCoverageFromPayload,
  findTextbookFromPayload,
  gradeCoverageFromPayload,
  textbookBrowseCoverageFromPayload,
} from "@/lib/curriculumCatalog.shared";
import type { CurriculumCatalogPayload } from "@/lib/curriculumCatalog.types";

describe("editionCoverageFromPayload", () => {
  const payload = seed as CurriculumCatalogPayload;

  it("lists every edition with covered and missing subjects", () => {
    const rows = editionCoverageFromPayload(payload);
    expect(rows.length).toBe(payload.editions.length);
    const pep = rows.find((r) => r.edition.id === "pep");
    expect(pep).toBeTruthy();
    expect(pep!.covered.length).toBe(payload.subjects.length);
    expect(pep!.missing.length).toBe(0);
  });

  it("marks subjects without an edition as missing", () => {
    const rows = editionCoverageFromPayload(payload);
    const waiyan = rows.find((r) => r.edition.id === "waiyan");
    expect(waiyan).toBeTruthy();
    expect(waiyan!.covered.some((s) => s.id === "english")).toBe(true);
    expect(waiyan!.missing.some((s) => s.id === "math")).toBe(true);
  });
});

describe("gradeCoverageFromPayload", () => {
  const payload = seed as CurriculumCatalogPayload;

  it("lists every grade base with subjects for its band", () => {
    const rows = gradeCoverageFromPayload(payload);
    expect(rows.length).toBe(payload.gradeBases.length);
    const g1 = rows.find((r) => r.grade.id === "pri_g1");
    expect(g1).toBeTruthy();
    expect(g1!.covered.some((s) => s.id === "math")).toBe(true);
    expect(g1!.missing.some((s) => s.id === "physics")).toBe(true);
    expect(g1!.covered.find((s) => s.id === "math")?.editions.length).toBeGreaterThan(0);
  });
});

describe("textbooks", () => {
  const payload = seed as CurriculumCatalogPayload;

  it("seed has no hardcoded textbook units (remote directory is authority)", () => {
    expect(payload.textbooks?.length ?? 0).toBe(0);
    const book = findTextbookFromPayload(payload, {
      editionId: "pep",
      subjectId: "math",
      gradeBaseId: "pri_g1",
      semester: "s1",
    });
    expect(book).toBeNull();
  });

  it("browse coverage reports zero books until directory sync", () => {
    const rows = textbookBrowseCoverageFromPayload(payload);
    const pep = rows.find((r) => r.edition.id === "pep");
    expect(pep).toBeTruthy();
    expect(pep!.bookCount).toBe(0);
    expect(pep!.coveredPairs).toBe(0);
    expect(pep!.missingSlots.length).toBeGreaterThan(0);
  });
});
