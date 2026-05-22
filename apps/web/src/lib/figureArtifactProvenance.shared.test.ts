import { describe, expect, it } from "vitest";

import {
  buildFigureArtifactProvenanceLedger,
  deriveProvenanceIdFromImportAssetUrl,
} from "@/lib/figureArtifactProvenance.shared";
import { applyImportedExamFigureOwnershipFromRaster } from "@/lib/figureOwnershipApply.shared";
import type { Exam, Question } from "@/lib/types";
import type { SessionExamSnapshot } from "@/lib/examSession";

describe("figureArtifactProvenance (P3)", () => {
  it("deriveProvenanceIdFromImportAssetUrl：裁图 slug 与整页", () => {
    expect(
      deriveProvenanceIdFromImportAssetUrl("/import-figures/batch/questions/p0-fig1.png"),
    ).toBe("p0-fig1");
    expect(deriveProvenanceIdFromImportAssetUrl("/import-figures/batch/0.jpg")).toBe("page_0.full");
    expect(deriveProvenanceIdFromImportAssetUrl("URL")).toBeUndefined();
  });

  it("registry 项写入 provenance_id", () => {
    const q: Question = {
      id: "q1",
      exam_id: "e1",
      order_index: 0,
      type: "short_answer",
      subject: "数学",
      content: "如图①",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 5,
      raster_figures: {
        version: 1,
        stem: ["/import-figures/batch-id/questions/p0-q1-d1.png"],
        by_option: {},
      },
    };
    const snap: SessionExamSnapshot = {
      exam: { id: "e1", source: "imported" } as Exam,
      questions: [q],
    };
    const out = applyImportedExamFigureOwnershipFromRaster(snap);
    expect(out.exam.figure_registry?.[0]?.provenance_id).toBe("p0-q1-d1");
    const ledger = buildFigureArtifactProvenanceLedger(out.exam, out.questions);
    expect(ledger.some((r) => r.provenance_id === "p0-q1-d1")).toBe(true);
    expect(ledger[0]?.bound_question_ids).toContain("q1");
  });
});
