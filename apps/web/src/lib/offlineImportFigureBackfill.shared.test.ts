import { describe, expect, it } from "vitest";

import type { SessionExamSnapshot } from "@/lib/examSession";
import { parseOfflineImportPersistedMedia } from "@/lib/offlineImportMedia.shared";
import {
  attachImportBatchPageFigureIfMissing,
  attachOfflineImportPageFiguresIfMissing,
  defaultPageUrlForImportFiguresBatch,
} from "@/lib/offlineImportFigureBackfill.shared";
import type { Exam, Question } from "@/lib/types";

const batch = "e021d014-96fc-4d50-b07c-f4b85a51d579";
const page = `/import-figures/${batch}/0.jpg`;

function minimalQ(order: number, content: string): Question {
  return {
    id: `q-${order}`,
    exam_id: "e1",
    order_index: order,
    type: "short_answer",
    subject: "数学",
    content,
    options: null,
    answer: "",
    solution_steps: [],
    knowledge_tags: [],
    points: 5,
  };
}

function snap(questions: Question[]): SessionExamSnapshot {
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

describe("offlineImportFigureBackfill", () => {
  it("parseOfflineImportPersistedMedia：仅 figureUrls 即可", () => {
    const m = parseOfflineImportPersistedMedia({
      figureUrls: [page],
      annotations: [],
    });
    expect(m?.figureUrls).toEqual([page]);
    expect(m?.annotations).toEqual([]);
  });

  it("attachOfflineImportPageFiguresIfMissing：如图锚点题注入整页", () => {
    const inSnap = snap([
      minimalQ(0, "(22) 直角三角形"),
      minimalQ(1, "(1) 如图O，∠EFO"),
    ]);
    const withMedia = {
      ...inSnap,
      offline_import_media: { figureUrls: [page], annotations: [] },
    };
    const out = attachOfflineImportPageFiguresIfMissing(withMedia);
    expect(out.questions[0]?.content).toContain(page);
    expect(out.questions[1]?.content).toContain(page);
  });

  it("attachImportBatchPageFigureIfMissing：无 media 时用 batchId", () => {
    const inSnap = snap([minimalQ(0, "(22) 在平面直角坐标系")]);
    const out = attachImportBatchPageFigureIfMissing(inSnap, batch);
    expect(out.questions[0]?.content).toContain(page);
    expect(defaultPageUrlForImportFiguresBatch(batch)).toBe(page);
  });
});
