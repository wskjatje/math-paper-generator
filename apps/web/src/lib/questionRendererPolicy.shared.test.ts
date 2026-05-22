import { describe, expect, it } from "vitest";
import {
  shouldPreferVectorBeforeStemRasterAppendix,
  shouldWithholdMcqAnswerForMissingRasterFigures,
  shouldShowMissingRasterCallout,
  resolveQuestionStemDiagramRenderSource,
} from "@/lib/questionRendererPolicy.shared";
import type { Question, Exam } from "@/lib/types";
import { safeParseGeometryDiagramSchema } from "@/lib/geometryDiagramSchema.shared";

function baseMcq(over: Partial<Question>): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: "右图是由若干正方体组成的立体图形，其主视图为",
    options: ["图形 A", "图形 B", "图形 C", "图形 D"],
    answer: "A、B、D",
    solution_steps: [
      { step: 1, description: "看图猜", reasoning: "无图仍编" },
      { step: 2, description: "选答案", reasoning: "" },
    ],
    knowledge_tags: [],
    points: 3,
    ...over,
  };
}

describe("questionRendererPolicy.shared", () => {
  it("withholds MCQ answer when missing raster matches callout", () => {
    const q = baseMcq({});
    expect(shouldShowMissingRasterCallout(q)).toBe(true);
    expect(shouldWithholdMcqAnswerForMissingRasterFigures(q)).toBe(true);
  });

  it("does not withhold when题干不依赖卷面扫描图", () => {
    const q = baseMcq({
      content: "将 50000 用科学记数法表示应为",
    });
    expect(shouldShowMissingRasterCallout(q)).toBe(false);
    expect(shouldWithholdMcqAnswerForMissingRasterFigures(q)).toBe(false);
  });

  it("does not withhold for non-MCQ", () => {
    const q = baseMcq({ type: "fill_blank", options: null });
    expect(shouldWithholdMcqAnswerForMissingRasterFigures(q as Question)).toBe(false);
  });

  it("shouldPreferVectorBeforeStemRasterAppendix：命题卷有矢量则矢量优先", () => {
    const exam: Pick<Exam, "source"> = { source: "generated" };
    const schema = safeParseGeometryDiagramSchema({
      version: "1",
      points: [{ id: "A", x: 0, y: 0 }],
      segments: [],
    });
    expect(schema).not.toBeNull();
    const q = baseMcq({
      content: "已知△ABC，求证……",
      diagram_schema: schema!,
    });
    expect(shouldPreferVectorBeforeStemRasterAppendix(exam, q)).toBe(true);
  });

  it("shouldPreferVectorBeforeStemRasterAppendix：导入卷无视觉证据时有矢量仍不优先于裁图", () => {
    const exam: Pick<Exam, "source"> = { source: "imported" };
    const schema = safeParseGeometryDiagramSchema({
      version: "1",
      points: [{ id: "A", x: 0, y: 0 }],
      segments: [],
    });
    const q = baseMcq({
      content: "已知△ABC，求证……",
      diagram_schema: schema!,
      raster_figures: null,
    });
    expect(shouldPreferVectorBeforeStemRasterAppendix(exam, q)).toBe(false);
  });

  it("shouldPreferVectorBeforeStemRasterAppendix：导入卷有裁图或证据则矢量可优先", () => {
    const exam: Pick<Exam, "source"> = { source: "imported" };
    const schema = safeParseGeometryDiagramSchema({
      version: "1",
      points: [{ id: "A", x: 0, y: 0 }],
      segments: [],
    });
    const qStemImg = baseMcq({
      content: "如图所示![](https://x/f.png)再证明",
      diagram_schema: schema!,
    });
    expect(shouldPreferVectorBeforeStemRasterAppendix(exam, qStemImg)).toBe(true);

    const qVge = baseMcq({
      content: "已知△ABC",
      diagram_schema: schema!,
      visual_geometry_evidence: { version: 1, layout_ast: true },
    });
    expect(shouldPreferVectorBeforeStemRasterAppendix(exam, qVge)).toBe(true);
  });

  it("resolveQuestionStemDiagramRenderSource 粗分卷来源", () => {
    const gen: Pick<Exam, "source"> = { source: "generated" };
    const imp: Pick<Exam, "source"> = { source: "imported" };
    const schema = safeParseGeometryDiagramSchema({
      version: "1",
      points: [{ id: "P", x: 1, y: 1 }],
      segments: [],
    })!;
    expect(
      resolveQuestionStemDiagramRenderSource(
        gen,
        baseMcq({ content: "已知△ABC，求证……", diagram_schema: schema }),
      ),
    ).toBe("text_inferred_vector");
    expect(
      resolveQuestionStemDiagramRenderSource(
        imp,
        baseMcq({
          content: "已知△ABC，求证……",
          diagram_schema: schema,
          visual_geometry_evidence: { version: 1, diagram_links: true },
        }),
      ),
    ).toBe("visual_vector");
    expect(
      resolveQuestionStemDiagramRenderSource(
        imp,
        baseMcq({ content: "已知△ABC，求证……", diagram_schema: schema }),
      ),
    ).toBe("text_inferred_vector");
  });
});
