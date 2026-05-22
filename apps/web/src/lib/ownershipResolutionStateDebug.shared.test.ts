import { describe, expect, it } from "vitest";

import {
  computeOwnershipResolutionStateDebug,
  deriveResolverMetadataForCandidatePoolTier,
  scanOwnershipDebugFigureAnchors,
  scanQuestionPartLabelsHeuristic,
} from "@/lib/ownershipResolutionStateDebug.shared";
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
    ...over,
  };
}

function minimalQuestion(over: Partial<Question> = {}): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "short_answer",
    subject: "数学",
    content: "",
    options: null,
    answer: "",
    solution_steps: [],
    knowledge_tags: [],
    points: 10,
    ...over,
  };
}

describe("ownershipResolutionStateDebug", () => {
  it("scanQuestionPartLabelsHeuristic：识别 (I)(II) 与 (1)", () => {
    const s = "（I）如图①。\n（II）① 如图②。\n（1）填空。";
    expect(scanQuestionPartLabelsHeuristic(s)).toEqual(["(I)", "(II)", "(1)"]);
  });

  it("scanOwnershipDebugFigureAnchors：含 下图 / 见图", () => {
    const s = "如图①，下图所示。";
    expect(scanOwnershipDebugFigureAnchors(s)).toEqual(["如图①", "下图"]);
  });

  it("scanOwnershipDebugFigureAnchors：STEP 2B 字母图名", () => {
    expect(scanOwnershipDebugFigureAnchors("如图O，见图。")).toEqual(["如图O", "见图"]);
  });

  it("computeOwnershipResolutionStateDebug：无 refs 时 anchors 全部未解析", () => {
    const q = minimalQuestion({
      content: "（I）如图①\n（II）如图②",
      raster_figures: {
        version: 1,
        stem: ["https://x/a.png", "https://x/b.png"],
        by_option: {},
      },
    });
    const st = computeOwnershipResolutionStateDebug(q, minimalExam());
    expect(st.parts_detected).toBe(2);
    expect(st.parts_labels).toEqual(["(I)", "(II)"]);
    expect(st.anchors_detected).toContain("如图①");
    expect(st.anchors_detected).toContain("如图②");
    expect(st.figures_available).toBe(2);
    expect(st.ownership_bound).toEqual([]);
    expect(st.unresolved_anchors).toEqual(expect.arrayContaining(["如图①", "如图②"]));
    expect(st.unresolved_anchors.length).toBeGreaterThanOrEqual(2);
    expect(st.ownership_candidates.length).toBeGreaterThanOrEqual(2);
    expect(st.candidate_pool_tier).toBe("raw_stem_url");
    expect(st.resolver_mode).toBe("heuristic_v0");
    expect(st.resolver_confidence).toBeNull();
    expect(st.selection_disabled_reason).toBeNull();
    for (const row of st.ownership_candidates) {
      expect(row.candidate_figures).toEqual([
        { id: "https://x/a.png", source: "raw_stem_url" },
        { id: "https://x/b.png", source: "raw_stem_url" },
      ]);
      expect(row.selected).toBeNull();
    }
  });

  it("computeOwnershipResolutionStateDebug：refs + labels 时从未解析中剔除已标锚点", () => {
    const fid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const q = minimalQuestion({
      content: "（I）如图①",
      raster_figures: { version: 1, stem: ["https://x/a.png"], by_option: {} },
      figure_refs: [
        {
          version: 1 as const,
          figure_id: fid,
          source: "page_crop" as const,
          scope: "question" as const,
          labels: ["图①"],
        },
      ],
    });
    const ex = minimalExam({
      figure_registry: [
        {
          version: 1 as const,
          figure_id: fid,
          raster_url: "https://x/a.png",
          source: "page_crop" as const,
        },
      ],
    });
    const st = computeOwnershipResolutionStateDebug(q, ex);
    expect(st.ownership_bound).toHaveLength(1);
    expect(st.ownership_bound[0]?.part).toBe("图①");
    expect(st.unresolved_anchors).not.toContain("如图①");
    const row = st.ownership_candidates.find((c) => c.anchor === "如图①");
    expect(row?.selected).toBe(fid);
    expect(st.candidate_pool_tier).toBe("question_local_registry");
    expect(st.resolver_confidence).toBeNull();
    expect(st.selection_disabled_reason).toBeNull();
    expect(row?.candidate_figures).toEqual([{ id: fid, source: "question_local_registry" }]);
  });

  it("computeCandidateFigurePoolWithProvenance：stem 与 registry 不对齐时退回 exam_global_registry", () => {
    const q = minimalQuestion({
      content: "见图",
      raster_figures: { version: 1, stem: ["https://only-local.png"], by_option: {} },
    });
    const ex = minimalExam({
      figure_registry: [
        {
          version: 1 as const,
          figure_id: "aaaa",
          raster_url: "https://other.png",
          source: "page_crop" as const,
        },
        {
          version: 1 as const,
          figure_id: "bbbb",
          raster_url: "https://x.png",
          source: "page_crop" as const,
        },
      ],
    });
    const st = computeOwnershipResolutionStateDebug(q, ex);
    expect(st.candidate_pool_tier).toBe("exam_global_registry");
    expect(st.resolver_confidence).toBe(0.1);
    expect(st.selection_disabled_reason).toBe("global_pool_only");
    expect(st.ownership_candidates[0]?.candidate_figures).toEqual([
      { id: "aaaa", source: "exam_global_registry" },
      { id: "bbbb", source: "exam_global_registry" },
    ]);
  });

  it("deriveResolverMetadataForCandidatePoolTier：分档元数据", () => {
    expect(deriveResolverMetadataForCandidatePoolTier("exam_global_registry")).toEqual({
      resolver_confidence: 0.1,
      selection_disabled_reason: "global_pool_only",
    });
    expect(deriveResolverMetadataForCandidatePoolTier("empty")).toEqual({
      resolver_confidence: 0,
      selection_disabled_reason: "empty_candidate_pool",
    });
    expect(deriveResolverMetadataForCandidatePoolTier("question_local_registry")).toEqual({
      resolver_confidence: null,
      selection_disabled_reason: null,
    });
    expect(deriveResolverMetadataForCandidatePoolTier("raw_stem_url")).toEqual({
      resolver_confidence: null,
      selection_disabled_reason: null,
    });
  });
});
