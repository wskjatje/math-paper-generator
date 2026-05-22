import { describe, expect, it } from "vitest";

import {
  analyzeImportBundleSignals,
  buildImportAutonomousLearningHints,
  countMarkdownImageLines,
  defaultStoredImportLearning,
} from "@/lib/importLearning.shared";
import type { Exam } from "@/lib/types";

describe("importLearning.shared", () => {
  it("counts markdown images", () => {
    expect(countMarkdownImageLines("无图")).toBe(0);
    expect(countMarkdownImageLines("![a](/import-figures/x.png)")).toBe(1);
  });

  it("buildImportAutonomousLearningHints respects disabled flag", () => {
    const h = buildImportAutonomousLearningHints({
      ...defaultStoredImportLearning(),
      autonomousLearningEnabled: false,
    });
    expect(h).toBe("");
  });

  it("analyzeImportBundleSignals detects mcq weak options", () => {
    const exam: Exam = {
      id: "e",
      title: "t",
      subtitle: null,
      subjects: ["math"],
      difficulty: "intermediate",
      duration_min: 60,
      total_score: 100,
      source: "imported",
      is_featured: false,
      description: null,
      created_at: new Date().toISOString(),
    };
    const bundle = {
      exam,
      questions: [
        {
          id: "q1",
          exam_id: "e",
          order_index: 0,
          type: "multiple_choice" as const,
          subject: "math",
          content: "题",
          options: ["A", "B"],
          answer: "A",
          solution_steps: [{ step: 1, description: "一步", reasoning: "r" }],
          knowledge_tags: [],
          points: 10,
        },
      ],
      examples: [],
    };
    const sig = analyzeImportBundleSignals("", bundle);
    expect(sig.mcqOptionsWeakCount).toBeGreaterThanOrEqual(1);
  });
});
