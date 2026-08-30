import { describe, expect, it } from "vitest";
import {
  buildAutoCrawlPlan,
  buildTextbookBookId,
  listEnabledCrawl4aiJobs,
  matchCrawlJobsToGaps,
  parseCrawl4aiJobsFile,
  parseGradeKey,
  parseTocCollectionCsv,
} from "@/lib/textbookDirectoryCrawl4ai.shared";

describe("textbookDirectoryCrawl4ai.shared", () => {
  it("parseGradeKey", () => {
    expect(parseGradeKey("pri_g2_s1")).toEqual({ gradeBaseId: "pri_g2", semester: "s1" });
  });

  it("buildTextbookBookId", () => {
    expect(
      buildTextbookBookId({
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g1",
        semester: "s1",
      }),
    ).toBe("pep-math-pri_g1-s1");
  });

  it("listEnabledCrawl4aiJobs filters grade and example.com", () => {
    const file = parseCrawl4aiJobsFile({
      schemaVersion: 1,
      jobs: [
        {
          enabled: true,
          bookId: "pep-math-pri_g1-s1",
          sourceUrl: "https://authorized.example.edu/toc",
          gradeBaseId: "pri_g1",
          semester: "s1",
        },
        {
          enabled: true,
          bookId: "pep-math-pri_g2-s1",
          sourceUrl: "https://example.com/x",
          gradeBaseId: "pri_g2",
          semester: "s1",
        },
      ],
    });
    const jobs = listEnabledCrawl4aiJobs(file, { gradeId: "pri_g1_s1" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.bookId).toBe("pep-math-pri_g1-s1");
  });

  it("matchCrawlJobsToGaps", () => {
    const jobs = [
      { bookId: "a", enabled: true, sourceUrl: "https://x" },
      { bookId: "b", enabled: true, sourceUrl: "https://y" },
    ];
    const gaps = [
      {
        bookId: "b",
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g1",
        semester: "s1" as const,
        title: "t",
        gradeId: "pri_g1_s1",
      },
    ];
    expect(matchCrawlJobsToGaps(jobs, gaps).map((j) => j.bookId)).toEqual(["b"]);
  });

  it("buildAutoCrawlPlan prefers toc unitLabels", () => {
    const gaps = [
      {
        bookId: "pep-math-pri_g2-s1",
        editionId: "pep",
        subjectId: "math",
        gradeBaseId: "pri_g2",
        semester: "s1" as const,
        title: "数学二年级上",
        gradeId: "pri_g2_s1",
      },
    ];
    const csv = `bookId,unitLabels,sourceUrlOrBook,title
pep-math-pri_g2-s1,长度单位|角的初步认识,,数学二年级上`;
    const plan = buildAutoCrawlPlan(gaps, {
      jobsFile: { schemaVersion: 1, jobs: [] },
      tocRows: parseTocCollectionCsv(csv),
      smarteduItems: [],
    });
    expect(plan.directApply).toHaveLength(1);
    expect(plan.directApply[0]?.labels).toEqual(["长度单位", "角的初步认识"]);
    expect(plan.crawlJobs).toHaveLength(0);
  });

  it("buildAutoCrawlPlan uses smartedu when no toc labels", () => {
    const gaps = [
      {
        bookId: "pep-morality-pri_g1-s1",
        editionId: "pep",
        subjectId: "morality",
        gradeBaseId: "pri_g1",
        semester: "s1" as const,
        title: "道德与法治",
        gradeId: "pri_g1_s1",
      },
    ];
    const plan = buildAutoCrawlPlan(gaps, {
      jobsFile: { schemaVersion: 1, jobs: [] },
      tocRows: [],
      smarteduItems: [
        {
          detailUrl: "https://basic.smartedu.cn/tchMaterial/detail?contentId=abc",
          mapped: {
            editionId: "pep",
            subjectId: "morality",
            gradeBaseId: "pri_g1",
            semester: "s1",
          },
        },
      ],
    });
    expect(plan.crawlJobs).toHaveLength(1);
    expect(plan.crawlJobs[0]?.sourceUrl).toContain("smartedu.cn");
  });
});
