import { describe, expect, it } from "vitest";

import {
  fillHeuristicRasterBboxNormsIfNeeded,
  materializeQuestionRasterFigures,
  parseQuestionRasterFiguresV1,
} from "@/lib/importRasterFigures.shared";
import type { Question } from "@/lib/types";

describe("fillHeuristicRasterBboxNormsIfNeeded", () => {
  it("assigns vertical strip bboxes aligned with stem URL count", () => {
    const rf = fillHeuristicRasterBboxNormsIfNeeded({
      version: 1,
      stem: ["/import-figures/a.png", "/import-figures/b.png"],
      by_option: {},
    });
    expect(rf.stem_bbox_norm).toHaveLength(2);
    expect(rf.stem_bbox_norm![0]).toEqual([0, 0, 1, 0.5]);
    expect(rf.stem_bbox_norm![1]).toEqual([0, 0.5, 1, 0.5]);
  });
});

describe("parseQuestionRasterFiguresV1", () => {
  it("round-trips optional bbox fields", () => {
    const raw = {
      version: 1,
      stem: ["/import-figures/x.png"],
      by_option: {},
      stem_bbox_norm: [[0, 0, 1, 1]],
    };
    const p = parseQuestionRasterFiguresV1(raw);
    expect(p?.stem_bbox_norm).toEqual([[0, 0, 1, 1]]);
  });
});

describe("materializeQuestionRasterFigures", () => {
  it("fills bbox when content has two import figure markdown URLs", () => {
    const q: Question = {
      id: "q1",
      exam_id: "e1",
      order_index: 1,
      type: "multiple_choice",
      subject: "math",
      content:
        "题干 ![](https://example.com/import-figures/p0-q1-a.png)\n![](https://example.com/import-figures/p0-q1-b.png)",
      options: ["A", "B", "C", "D"],
      answer: "A",
      solution_steps: [],
      knowledge_tags: [],
      points: 3,
    };
    const out = materializeQuestionRasterFigures(q);
    expect(out.raster_figures?.stem?.length).toBe(2);
    expect(out.raster_figures?.stem_bbox_norm?.length).toBe(2);
  });
});
