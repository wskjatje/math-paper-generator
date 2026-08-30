import { describe, expect, it } from "vitest";
import { EXAM_DETAIL_UI } from "@/config/examDomain";
import {
  examDetailAppendixLoadErrorLabel,
  examDetailForensicsEnabled,
  examDetailShowOfflineImportFigureCrops,
  examDetailShowPerOptionMissingFigureHint,
} from "@/lib/examDetailUi.shared";
import type { Question } from "@/lib/types";

describe("examDetailUi", () => {
  it("loads examDetailUi from exam-domain.json", () => {
    expect(EXAM_DETAIL_UI.forensicsAndFigureOwnership.requireImported).toBe(true);
    expect(EXAM_DETAIL_UI.forensicsAndFigureOwnership.enableInDevWithoutFlag).toBe(false);
    expect(EXAM_DETAIL_UI.missingFigureHints.showPerOptionMissingWhenQuestionCallout).toBe(
      false,
    );
    expect(EXAM_DETAIL_UI.missingFigureHints.showQuestionCallout).toBe(false);
    expect(EXAM_DETAIL_UI.importParseBanner.enabled).toBe(false);
    expect(examDetailAppendixLoadErrorLabel().length).toBeGreaterThan(0);
  });

  it("forensics defaults off even in DEV unless figures_debug", () => {
    expect(
      examDetailForensicsEnabled({
        source: "imported",
        figuresDebugSearch: false,
        isDev: true,
      }),
    ).toBe(false);
    expect(
      examDetailForensicsEnabled({
        source: "imported",
        figuresDebugSearch: true,
        isDev: false,
      }),
    ).toBe(true);
    expect(
      examDetailForensicsEnabled({
        source: "generated",
        figuresDebugSearch: true,
        isDev: true,
      }),
    ).toBe(false);
  });

  it("offline import crops follow config / figures_debug", () => {
    expect(
      examDetailShowOfflineImportFigureCrops({
        hasMedia: true,
        figuresDebugSearch: false,
        isDev: true,
      }),
    ).toBe(false);
    expect(
      examDetailShowOfflineImportFigureCrops({
        hasMedia: true,
        figuresDebugSearch: true,
        isDev: false,
      }),
    ).toBe(true);
  });

  it("hides per-option missing hint when showPerOptionMissing is false", () => {
    const q = {
      id: "q1",
      exam_id: "e",
      order_index: 0,
      type: "multiple_choice",
      subject: "数学",
      content: "如图，主视图是",
      options: ["A", "B", "C", "D"],
      answer: "A",
      solution_steps: [],
      knowledge_tags: [],
      points: 3,
      figure_dependency: {
        version: 1,
        stem_requires_figure: true,
        option_requires_figure: true,
      },
      raster_figures: { stem: [], by_option: {} },
    } as Question;
    expect(examDetailShowPerOptionMissingFigureHint(q)).toBe(false);
  });
});
