import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { mergeLocalPersistedFigureMissingIntoRollup } from "@/lib/importParseQuality.shared";
import {
  localImportFigureFileMissingOnDisk,
  resolveLocalImportFiguresPublicFsPath,
  scrubMissingLocalImportFiguresBeforePersist,
  stripMarkdownImagesForUrls,
} from "@/lib/importPersistedFigureScrub.server";
import type { Exam, Question } from "@/lib/types";

function minimalExam(over: Partial<Exam> = {}): Exam {
  return {
    id: "e1",
    title: "t",
    subtitle: null,
    subjects: ["数学"],
    difficulty: "intermediate",
    duration_min: 60,
    total_score: 100,
    source: "imported",
    is_featured: false,
    description: null,
    created_at: new Date().toISOString(),
    generation_duration_sec: null,
    import_parse_quality: null,
    ...over,
  };
}

describe("importPersistedFigureScrub", () => {
  it("resolveLocalImportFiguresPublicFsPath maps /import-figures/ to public tree", () => {
    const root = "/repo";
    expect(resolveLocalImportFiguresPublicFsPath("/import-figures/b/0.png", root)).toBe(
      join(root, "apps", "web", "public", "import-figures", "b", "0.png"),
    );
    expect(
      resolveLocalImportFiguresPublicFsPath("https://x.test/import-figures/b/0.png", root),
    ).toBe(join(root, "apps", "web", "public", "import-figures", "b", "0.png"));
    expect(resolveLocalImportFiguresPublicFsPath("/assets/foo.png", root)).toBeNull();
  });

  it("stripMarkdownImagesForUrls removes matching markdown images", () => {
    const rm = new Set(["/import-figures/a.png"]);
    expect(stripMarkdownImagesForUrls("前![]( /import-figures/a.png )后", rm)).toBe("前后");
    expect(stripMarkdownImagesForUrls("![](/import-figures/b.png)", rm)).toBe(
      "![](/import-figures/b.png)",
    );
  });

  it("localImportFigureFileMissingOnDisk reflects filesystem", () => {
    const root = mkdtempSync(join(tmpdir(), "mpg-fig-"));
    try {
      const rel = join("apps", "web", "public", "import-figures", "t-batch");
      mkdirSync(join(root, rel), { recursive: true });
      writeFileSync(join(root, rel, "ok.png"), "x");
      expect(localImportFigureFileMissingOnDisk("/import-figures/t-batch/ok.png", root)).toBe(
        false,
      );
      expect(localImportFigureFileMissingOnDisk("/import-figures/t-batch/nope.png", root)).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scrubMissingLocalImportFiguresBeforePersist strips ghost local paths and tags rollup", () => {
    const root = mkdtempSync(join(tmpdir(), "mpg-scrub-"));
    try {
      const q: Question = {
        id: "q1",
        exam_id: "e1",
        order_index: 0,
        type: "multiple_choice",
        subject: "数学",
        content: "计算![]( /import-figures/ghost/m.png )",
        options: ["A", "B", "C", "D"],
        answer: "A",
        solution_steps: [],
        knowledge_tags: [],
        points: 3,
      };
      const out = scrubMissingLocalImportFiguresBeforePersist(
        { exam: minimalExam(), questions: [q], examples: [] },
        root,
      );
      expect(out.bundle.questions[0]?.content ?? "").not.toContain("import-figures");
      expect(out.scrubbedImportFigureUrlCount).toBeGreaterThanOrEqual(1);
      const rollup = out.bundle.exam.import_parse_quality as { questions: { signals: string[] }[] };
      expect(rollup.questions[0]?.signals).toContain("local_persisted_import_raster_file_missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("mergeLocalPersistedFigureMissingIntoRollup", () => {
  it("upgrades tier and summary when only local file missing signal applies", () => {
    const base = {
      version: 1 as const,
      generated_at: "t",
      rollup_tier: "green" as const,
      red_count: 0,
      yellow_count: 0,
      green_count: 1,
      questions: [{ order_index: 0, tier: "green" as const, signals: [] as const }],
      summary_lines: [] as string[],
    };
    const merged = mergeLocalPersistedFigureMissingIntoRollup(
      base,
      new Map([[0, ["/import-figures/x.png"]]]),
    );
    expect(merged.rollup_tier).toBe("red");
    expect(merged.red_count).toBe(1);
    expect(merged.questions[0]?.signals).toContain("local_persisted_import_raster_file_missing");
    expect(merged.summary_lines.some((l) => l.includes("磁盘"))).toBe(true);
  });
});
