import { describe, expect, it } from "vitest";

import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { repairSessionExamSnapshotForExport } from "@/lib/examMathRepairPersist.server";

function baseImportedSnap(questions: Question[]): SessionExamSnapshot {
  const exam: Exam = {
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
  };
  return { exam, questions, examples: [] };
}

describe("repairSessionExamSnapshotForExport + P7-1A", () => {
  it("导入卷 registry 为空且存在 stem URL 时补全 figure_registry / figure_refs", () => {
    const url = "https://example.com/import-figures/p1-fig1.png";
    const q: Question = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "题干",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [url], by_option: {} },
    };
    const out = repairSessionExamSnapshotForExport(baseImportedSnap([q]));
    expect(out.exam.figure_registry?.length).toBe(1);
    expect(out.questions[0]?.figure_refs?.length).toBe(1);
  });

  it("已有 figure_registry 时不重复 apply（避免每次刷新换 UUID）", () => {
    const url = "https://example.com/import-figures/p1-q1.png";
    const fid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const q: Question = {
      id: "q1",
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "题干",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [url], by_option: {} },
      figure_refs: [
        {
          version: 1 as const,
          figure_id: fid,
          source: "page_crop" as const,
          scope: "question" as const,
        },
      ],
    };
    const snap = baseImportedSnap([q]);
    snap.exam = {
      ...snap.exam,
      figure_registry: [
        {
          version: 1 as const,
          figure_id: fid,
          raster_url: url,
          source: "page_crop" as const,
        },
      ],
    };
    const out = repairSessionExamSnapshotForExport(snap);
    expect(out.exam.figure_registry?.[0]?.figure_id).toBe(fid);
  });
});
