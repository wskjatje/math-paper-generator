import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/types";
import {
  optionsHaveConcreteFigureSupply,
  questionHasConcreteVisualGeometryEvidence,
  questionMissingExpectedRasterFigures,
  shouldSuppressVectorDiagramSchemaForQuestion,
  stemExpectsScanStyleFigure,
  stemHasConcreteFigureSupply,
} from "@/lib/examRasterFigureHints.shared";

function mcq(partial: Partial<Question>): Question {
  return {
    id: "q",
    exam_id: "e",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: "",
    options: ["a", "b", "c", "d"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 3,
    ...partial,
  };
}

describe("examRasterFigureHints.shared", () => {
  it("stemExpectsScanStyleFigure matches solid geometry / view wording", () => {
    expect(stemExpectsScanStyleFigure("右图是由 5 个正方体组成的立体图形")).toBe(true);
    expect(stemExpectsScanStyleFigure("下列图形是中心对称图形的是")).toBe(true);
    expect(stemExpectsScanStyleFigure("将 50000 用科学记数法表示")).toBe(false);
  });

  it("fill_blank：仅坐标平移用语、无「如图/阴影」等时不判缺图、不抑制矢量", () => {
    const q: Question = {
      id: "q",
      exam_id: "e",
      order_index: 1,
      type: "fill_blank",
      subject: "数学",
      content: "在平面直角坐标系中，将△DEF向右平移，求面积。",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 5,
    };
    expect(stemHasConcreteFigureSupply(q)).toBe(false);
    expect(questionHasConcreteVisualGeometryEvidence(q)).toBe(false);
    expect(questionMissingExpectedRasterFigures(q)).toBe(false);
    expect(shouldSuppressVectorDiagramSchemaForQuestion(q)).toBe(false);
  });

  it("questionMissingExpectedRasterFigures when stem implies scan figure but no concrete images", () => {
    const q = mcq({
      content: "右图立体，它的主视图是",
      options: ["(A) 甲", "(B) 乙", "(C) 丙", "(D) 丁"],
      raster_figures: null,
    });
    expect(stemHasConcreteFigureSupply(q)).toBe(false);
    expect(optionsHaveConcreteFigureSupply(q)).toBe(false);
    expect(questionHasConcreteVisualGeometryEvidence(q)).toBe(false);
    expect(questionMissingExpectedRasterFigures(q)).toBe(true);
    expect(
      shouldSuppressVectorDiagramSchemaForQuestion({
        ...q,
        diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] },
      }),
    ).toBe(true);
  });

  it("questionHasConcreteVisualGeometryEvidence：仅 persisted v1 标记、无位图也为 true", () => {
    const q: Question = {
      id: "q",
      exam_id: "e",
      order_index: 0,
      type: "fill_blank",
      subject: "数学",
      content: "在平面直角坐标系中……",
      options: null,
      answer: "",
      solution_steps: [],
      knowledge_tags: [],
      points: 5,
      visual_geometry_evidence: { version: 1, diagram_links: true },
    };
    expect(questionHasConcreteVisualGeometryEvidence(q)).toBe(true);
  });

  it("questionHasConcreteVisualGeometryEvidence：题干 Markdown 图为 true", () => {
    const q = mcq({
      content: "如图所示![](https://x/stem.png)",
      options: ["a", "b", "c", "d"],
    });
    expect(questionHasConcreteVisualGeometryEvidence(q)).toBe(true);
  });

  it("questionMissingExpectedRasterFigures true when Markdown URL present but read-time load failed (broken≈missing)", () => {
    const q = mcq({
      content: "如图所示![](https://x/stem.png)选正确的是",
      options: ["x", "y", "z", "w"],
    });
    expect(questionMissingExpectedRasterFigures(q)).toBe(false);
    expect(questionMissingExpectedRasterFigures(q, { runtimeRasterLoadFailed: true })).toBe(true);
    expect(
      shouldSuppressVectorDiagramSchemaForQuestion(
        { ...q, diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] } },
        { runtimeRasterLoadFailed: true },
      ),
    ).toBe(true);
  });

  it("占位符 ![](URL) 不算 supply；扫描题应 suppress diagram_schema", () => {
    const q = mcq({
      content: "如图所示![](URL)选正确的是",
      options: ["x", "y", "z", "w"],
      diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] },
    });
    expect(stemHasConcreteFigureSupply(q)).toBe(false);
    expect(shouldSuppressVectorDiagramSchemaForQuestion(q)).toBe(true);
    expect(questionMissingExpectedRasterFigures(q)).toBe(true);
  });

  it("import-figures URL 算 supply；不 suppress", () => {
    const q = mcq({
      content: "如图所示![](/import-figures/batch/p0-q1-d1.png)选正确的是",
      options: ["x", "y", "z", "w"],
      diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] },
    });
    expect(stemHasConcreteFigureSupply(q)).toBe(true);
    expect(shouldSuppressVectorDiagramSchemaForQuestion(q)).toBe(false);
  });

  it("questionMissingExpectedRasterFigures false when stem has full-page image even if options lack figures", () => {
    const q = mcq({
      content: "如图所示![](https://x/stem.png)选正确的是",
      options: ["x", "y", "z", "w"],
    });
    expect(questionMissingExpectedRasterFigures(q)).toBe(false);
    expect(
      shouldSuppressVectorDiagramSchemaForQuestion({
        ...q,
        diagram_schema: { version: "1", points: [{ id: "P", x: 0, y: 0 }], segments: [] },
      }),
    ).toBe(false);
  });

  it("questionMissingExpectedRasterFigures false when stem and all options reference images", () => {
    const q = mcq({
      content: "如图所示![](https://x/stem.png)选正确的是",
      options: [
        "![](https://x/a.png)",
        "![](https://x/b.png)",
        "![](https://x/c.png)",
        "![](https://x/d.png)",
      ],
    });
    expect(questionMissingExpectedRasterFigures(q)).toBe(false);
  });

  it("questionMissingExpectedRasterFigures when stem explicitly requires per-option figures", () => {
    const q = mcq({
      content: "各选项如图所示，题干![](https://x/stem.png)",
      options: ["a", "b", "c", "d"],
    });
    expect(questionMissingExpectedRasterFigures(q)).toBe(true);
  });
});
