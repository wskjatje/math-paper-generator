import { describe, expect, it } from "vitest";

import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";

function baseExam(over: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
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

describe("applyDeterministicFigureLinkAppendPass（经 sanitize）", () => {
  it("question_local_registry + registry.labels 时写入 figure_refs.labels 与 rollup traces", () => {
    const url = "https://cdn/import/p1-图①.png";
    const q: Question = {
      id: "qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq",
      exam_id: "exam-1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "（24）如图①求值",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [url], by_option: {} },
    };
    const snap: SessionExamSnapshot = { exam: baseExam(), questions: [q], examples: [] };
    const out = sanitizeImportedSnapshotForPersist(snap);
    const ref = out.questions[0]?.figure_refs?.[0];
    expect(ref?.labels).toEqual(["图①"]);
    const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
    expect(rollup?.figure_link_traces_v1?.length).toBeGreaterThan(0);
    const bound = rollup?.figure_link_traces_v1?.filter((t) => t.outcome === "bound");
    expect(bound?.length).toBeGreaterThan(0);
  });

  it("exam_global_registry 档不写 labels（降级不绑定）", () => {
    const urlA = "https://cdn/a-图①.png";
    const q1: Question = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      exam_id: "exam-1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "题1",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [urlA], by_option: {} },
    };
    const q2: Question = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      exam_id: "exam-1",
      order_index: 1,
      type: "short_answer",
      subject: "数学",
      content: "如图①",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 10,
      raster_figures: { version: 1, stem: [], by_option: {} },
    };
    const snap: SessionExamSnapshot = { exam: baseExam(), questions: [q1, q2], examples: [] };
    const out = sanitizeImportedSnapshotForPersist(snap);
    const q2out = out.questions.find((x) => x.id === q2.id);
    expect(q2out?.figure_refs?.some((r) => (r.labels?.length ?? 0) > 0)).toBeFalsy();
    const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
    const degraded = rollup?.figure_link_traces_v1?.filter((t) => t.outcome === "skipped_degraded_pool");
    expect(degraded?.some((t) => t.question_id === q2.id)).toBe(true);
  });
});
