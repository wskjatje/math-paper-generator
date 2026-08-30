import { describe, expect, it } from "vitest";
import {
  CHOICE_OPTIONS_LAYOUT,
  EXAM_DETAIL_UI,
  FIGURE_GENERATION,
  IMPORT_DEFAULTS,
  LISTENING_GENERATION,
  PAPER_KIND_IDS,
  PAPER_SURFACE_LAYOUT,
  paperKindLabel,
} from "@/config/examDomain";

describe("examDomain config", () => {
  it("exports paper kind ids from JSON", () => {
    expect(PAPER_KIND_IDS).toContain("regular_final");
    expect(paperKindLabel("regular_final")).toContain("期末");
    expect(PAPER_KIND_IDS).toContain("entrance_junior_senior");
    expect(paperKindLabel("entrance_junior_senior")).toBe("初升高");
  });

  it("has import defaults aligned with junior exam samples", () => {
    expect(IMPORT_DEFAULTS.duration_min).toBe(100);
    expect(IMPORT_DEFAULTS.total_score).toBe(120);
    expect(IMPORT_DEFAULTS.grade).toMatch(/^jhs_/);
  });

  it("loads choice options layout thresholds from JSON", () => {
    expect(CHOICE_OPTIONS_LAYOUT.inlineMaxWeightPerOption).toBeGreaterThan(0);
    expect(CHOICE_OPTIONS_LAYOUT.columnsMaxWeightPerOption).toBeGreaterThan(
      CHOICE_OPTIONS_LAYOUT.inlineMaxWeightPerOption,
    );
    expect(CHOICE_OPTIONS_LAYOUT.besideFigureMaxTotalWeight).toBeGreaterThan(0);
    expect(CHOICE_OPTIONS_LAYOUT.inlineMathWeight).toBeGreaterThan(0);
    expect(CHOICE_OPTIONS_LAYOUT.noBesideInlineMaxTotalWeight).toBeGreaterThanOrEqual(
      4 * CHOICE_OPTIONS_LAYOUT.inlineMathWeight,
    );
    expect(CHOICE_OPTIONS_LAYOUT.noBesideInlineDistribute).toBe(true);
  });

  it("loads paper surface layout from JSON", () => {
    expect(PAPER_SURFACE_LAYOUT.subquestionLabelTemplate).toContain("{n}");
    expect(PAPER_SURFACE_LAYOUT.stemToFigureGapRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.eplBlockStackGapRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.subquestionFigureBesideMaxWeightPerItem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.subquestionFigureBesideGapRem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.subquestionNoFigureLayout).toBe("auto");
    expect(PAPER_SURFACE_LAYOUT.subquestionNoFigureColumnsMaxWeightPerItem).toBeGreaterThan(0);
    expect(PAPER_SURFACE_LAYOUT.listeningOmittedStemShowAuthoringPolicyBanner).toBe(false);
    expect(PAPER_SURFACE_LAYOUT.listeningOmittedStemShowAuthoringStemReveal).toBe(false);
    expect(PAPER_SURFACE_LAYOUT.stemInlineCodeAppearance).toBe("plain_mono");
    expect(PAPER_SURFACE_LAYOUT.answerWritingSpace.enabled).toBe(true);
    expect(PAPER_SURFACE_LAYOUT.answerWritingSpace.rules.length).toBeGreaterThan(0);
  });

  it("loads figureGeneration optional-diagram patterns", () => {
    expect(FIGURE_GENERATION.tryOptionalDiagramOnForce).toBe(true);
    expect(FIGURE_GENERATION.requireDiagramStemPatterns.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.optionalDiagramStemPatterns.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.optionalDiagramKnowledgeTagPatterns.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.requireDiagramWhenKnowledgeTagMatches).toBe(false);
    expect(FIGURE_GENERATION.allowMediumConfidenceTemplateFallback).toBe(false);
    expect(FIGURE_GENERATION.preferHighConfidenceTemplateBeforeAi).toBe(true);
    expect(FIGURE_GENERATION.elementTypeHeal?.typeFieldAliases.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.aiScenePromptExtras?.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.triangleTemplate.rightAngleVertexPatterns.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.triangleTemplate.sideLengthPatterns.length).toBeGreaterThan(0);
    expect(FIGURE_GENERATION.triangleTemplate.defaultVertexLabels).toHaveLength(3);
    expect(FIGURE_GENERATION.triangleTemplate.markTrigSideRoles).toBe(true);
    expect(FIGURE_GENERATION.triangleTemplate.trigSideRoleLabels.hypotenuse).toBeTruthy();
  });

  it("loads listeningGeneration detect patterns", () => {
    expect(LISTENING_GENERATION.questionDetectPatterns.length).toBeGreaterThan(0);
    expect(LISTENING_GENERATION.questionDetectPatterns.some((p) => /听力/.test(p))).toBe(true);
  });

  it("loads examDetailUi forensics defaults aligned with generate surface", () => {
    expect(EXAM_DETAIL_UI.forensicsAndFigureOwnership.enableInDevWithoutFlag).toBe(false);
    expect(EXAM_DETAIL_UI.showOfflineImportFigureCrops).toBe(false);
    expect(EXAM_DETAIL_UI.missingFigureHints.showQuestionCallout).toBe(false);
    expect(EXAM_DETAIL_UI.importParseBanner.enabled).toBe(false);
  });
});
