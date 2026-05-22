import { describe, expect, it } from "vitest";

import {
  buildQuestionFigureLifecycleTimeline,
  formatFigureLifecycleTimelineCompact,
} from "@/lib/figureLifecycleTimeline.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";

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
    ...over,
  };
}

function minimalQuestion(over: Partial<Question> = {}): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: "",
    options: ["a", "b", "c", "d"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 5,
    ...over,
  };
}

describe("figureLifecycleTimeline (P2)", () => {
  it("placeholder：crop persist 与 raster 阶段标 ✗", () => {
    const t = buildQuestionFigureLifecycleTimeline(
      minimalQuestion({ content: "如图![](URL)" }),
      minimalExam(),
      {
        importProducer: {
          crop_jobs_emitted: 2,
          crops_persisted: 0,
          markdown_import_refs_final: 0,
        },
      },
    );
    expect(t.supply_state).toBe("placeholder");
    const persist = t.phases.find((p) => p.phase === "crop_persist");
    expect(persist?.ok).toBe(false);
    const compact = formatFigureLifecycleTimelineCompact(t);
    expect(compact).toContain("crop_persist✗");
    expect(compact).toContain("supply_state=placeholder");
  });

  it("sanitize 写入 figure_lifecycle_timelines_v1", () => {
    const snap: SessionExamSnapshot = {
      exam: minimalExam(),
      questions: [
        minimalQuestion({
          content: "右图所示![](/import-figures/b/p0-q1.png)",
          raster_figures: { version: 1, stem: ["/import-figures/b/p0-q1.png"], by_option: {} },
        }),
      ],
    };
    const out = sanitizeImportedSnapshotForPersist(snap, {
      figureMaterializationImportCtx: {
        crop_jobs_emitted: 1,
        crops_persisted: 1,
        markdown_import_refs_final: 1,
      },
    });
    const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
    expect(rollup?.figure_lifecycle_timelines_v1?.length).toBe(1);
    expect(rollup?.figure_lifecycle_timelines_v1?.[0]?.phases.length).toBeGreaterThanOrEqual(8);
  });
});
