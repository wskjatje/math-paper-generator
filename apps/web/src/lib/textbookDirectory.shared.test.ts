import { describe, expect, it } from "vitest";
import {
  classifyTextbookCatalogRef,
  filterTextbooksForGradeId,
  formatTextbookUnitsForPrompt,
  mergeTextbookBooks,
  normalizeTextbookBook,
  normalizeTextbookCatalogRef,
  parseTextbookDirectoryFile,
} from "@/lib/textbookDirectory.shared";
import { gradeSemesterFromGradeId } from "@/lib/curriculumCatalog.shared";

describe("textbookDirectory.shared", () => {
  it("parses directory file and drops invalid rows", () => {
    const file = parseTextbookDirectoryFile({
      version: 1,
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
        { id: "bad" },
      ],
    });
    expect(file.textbooks).toHaveLength(1);
    expect(file.textbooks[0]?.units[0]?.label).toBe("准备课");
  });

  it("normalizes https and repo-relative catalog refs", () => {
    expect(normalizeTextbookCatalogRef("examples/v1/textbook-directory.sample.json")).toBe(
      "examples/v1/textbook-directory.sample.json",
    );
    expect(normalizeTextbookCatalogRef("../secret.json")).toBe("");
    expect(classifyTextbookCatalogRef("examples/v1/textbook-directory.sample.json")).toEqual({
      kind: "repo-relative",
      ref: "examples/v1/textbook-directory.sample.json",
    });
    expect(
      classifyTextbookCatalogRef("https://example.com/textbook-directory.json")?.kind,
    ).toBe("https");
  });

  it("merges by id preferring units", () => {
    const merged = mergeTextbookBooks(
      [
        {
          id: "a",
          editionId: "pep",
          subjectId: "math",
          gradeBaseId: "pri_g1",
          semester: "s1",
          title: "旧",
          units: [],
        },
      ],
      [
        {
          id: "a",
          editionId: "pep",
          subjectId: "math",
          gradeBaseId: "pri_g1",
          semester: "s1",
          title: "新",
          units: [{ id: "u1", label: "单元1" }],
        },
      ],
    );
    expect(merged[0]?.title).toBe("新");
    expect(merged[0]?.units).toHaveLength(1);
  });

  it("formats prompt block from units", () => {
    const block = formatTextbookUnitsForPrompt({
      id: "a",
      editionId: "pep",
      subjectId: "math",
      gradeBaseId: "pri_g1",
      semester: "s1",
      title: "数学一年级上",
      units: [
        { id: "u1", label: "准备课" },
        { id: "u2", label: "位置" },
      ],
    });
    expect(block).toContain("【教材目录】");
    expect(block).toContain("准备课");
    expect(block).toContain("位置");
  });

  it("rejects placeholder unit outlines", () => {
    const rejected = normalizeTextbookBook({
      id: "pep-chinese-jhs_g1-s1",
      editionId: "pep",
      subjectId: "chinese",
      gradeBaseId: "jhs_g1",
      semester: "s1",
      title: "语文七年级上",
      units: [
        { id: "u1", label: "第一单元" },
        { id: "u2", label: "第二单元" },
        { id: "u3", label: "第三单元" },
      ],
    });
    expect(rejected).toBeNull();

    const ok = normalizeTextbookBook({
      id: "pep-math-jhs_g1-s1",
      editionId: "pep",
      subjectId: "math",
      gradeBaseId: "jhs_g1",
      semester: "s1",
      title: "数学七年级上",
      units: [
        { id: "u1", label: "有理数" },
        { id: "u2", label: "整式的加减" },
      ],
    });
    expect(ok?.units).toHaveLength(2);
  });

  it("filters textbooks by grade id including year books", () => {
    const books = [
      {
        id: "a",
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g1",
        semester: "s1" as const,
        title: "上",
        units: [{ id: "u1", label: "准备课" }],
      },
      {
        id: "b",
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g1",
        semester: "s2" as const,
        title: "下",
        units: [{ id: "u1", label: "认识图形" }],
      },
      {
        id: "c",
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g1",
        semester: "year" as const,
        title: "全",
        units: [{ id: "u1", label: "综合" }],
      },
    ];
    expect(filterTextbooksForGradeId(books, "pri_g1_s2").map((b) => b.id)).toEqual(["b", "c"]);
  });
});

describe("gradeSemesterFromGradeId", () => {
  it("maps grade id suffix", () => {
    expect(gradeSemesterFromGradeId("pri_g3_s1")).toBe("s1");
    expect(gradeSemesterFromGradeId("pri_g3_s2")).toBe("s2");
    expect(gradeSemesterFromGradeId("pri_g3")).toBe("year");
  });
});
