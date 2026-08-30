import { describe, expect, it } from "vitest";
import {
  assembleQuestionCandidates,
  buildPerQuestionTranscribePayload,
} from "@/lib/importQuestionAssemble.shared";
import type { DocumentExtractionBundle } from "@/lib/documentExtraction.shared";
import { attachSourceFiguresOntoQuestions } from "@/lib/attachSourceFigures.shared";
import { countSourceFigures } from "@/lib/attachmentRoles.shared";
import type { Question } from "@/lib/types";

function sampleBundle(): DocumentExtractionBundle {
  return {
    version: 1,
    documentId: "doc-golden-001",
    createdAt: "2026-07-19T00:00:00.000Z",
    sourceFilename: "golden.pdf",
    sourceMimeType: "application/pdf",
    sourceSha256: "abc",
    sourceFilePath: "data/imports/doc-golden-001/source/golden.pdf",
    quality: "high_fidelity",
    ocrRun: {
      id: "run1",
      engine: "docling",
      startedAt: "2026-07-19T00:00:00.000Z",
      finishedAt: "2026-07-19T00:00:01.000Z",
      quality: "high_fidelity",
      warnings: [],
    },
    pages: [
      {
        id: "p0",
        pageIndex: 0,
        width: 800,
        height: 1100,
        pageImageAssetId: "asset-page",
        blocks: [
          {
            id: "b1",
            pageIndex: 0,
            readingOrder: 0,
            type: "text",
            text: "1. 已知 B(5√3,0)，F(-√3,0)。（Ⅰ）求面积；（Ⅱ）求周长。",
          },
          {
            id: "b2",
            pageIndex: 0,
            readingOrder: 1,
            type: "picture",
            assetId: "asset-fig1",
          },
          {
            id: "b3",
            pageIndex: 0,
            readingOrder: 2,
            type: "picture",
            assetId: "asset-fig2",
          },
          {
            id: "b4",
            pageIndex: 0,
            readingOrder: 3,
            type: "text",
            text: "2. 如图，等边三角形 ABC。",
          },
        ],
      },
    ],
    regions: [],
    assets: [
      {
        id: "asset-page",
        uri: "/imports/doc-golden-001/page.png",
        mimeType: "image/png",
        role: "page_image",
        pageIndex: 0,
      },
      {
        id: "asset-fig1",
        uri: "/imports/doc-golden-001/fig1.png",
        mimeType: "image/png",
        role: "source_figure",
        pageIndex: 0,
      },
      {
        id: "asset-fig2",
        uri: "/imports/doc-golden-001/fig2.png",
        mimeType: "image/png",
        role: "source_figure",
        pageIndex: 0,
      },
    ],
    plainText: "1. ...\n2. ...",
  };
}

describe("importQuestionAssemble + attachSourceFigures", () => {
  it("按阅读顺序切分候选题且不硬编码题号坐标", () => {
    const candidates = assembleQuestionCandidates(sampleBundle());
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]!.figureBlockIds).toHaveLength(2);
    expect(candidates[0]!.sourceText).toContain("5√3");
    const payload = buildPerQuestionTranscribePayload(candidates);
    expect(payload).toContain("region=");
    expect(payload).toContain("source_figure");
  });

  it("把两幅原图挂到第一题且 AI 派生图不覆盖", () => {
    const bundle = sampleBundle();
    const candidates = assembleQuestionCandidates(bundle);
    const questions: Question[] = [
      {
        id: "q1",
        exam_id: "e1",
        type: "short_answer",
        subject: "math",
        content: candidates[0]!.sourceText,
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 10,
        order_index: 0,
        attachments: [
          {
            kind: "figure",
            uri: "pending://figure",
            figure_scene: { pack: "math.geometry", version: 1, elements: [] },
          },
        ],
      },
      {
        id: "q2",
        exam_id: "e1",
        type: "short_answer",
        subject: "math",
        content: candidates[1]?.sourceText ?? "2",
        options: null,
        answer: "",
        solution_steps: [],
        knowledge_tags: [],
        points: 10,
        order_index: 1,
      },
    ];
    attachSourceFiguresOntoQuestions(questions, candidates, bundle);
    expect(countSourceFigures(questions[0]!.attachments)).toBe(2);
    expect(
      questions[0]!.attachments!.some(
        (a) => a.role === "derived_diagram" || a.figure_scene,
      ),
    ).toBe(true);
  });
});
