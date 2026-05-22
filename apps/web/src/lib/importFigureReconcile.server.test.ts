import { describe, expect, it } from "vitest";

import { reconcileSubmitExamPayloadWithImportFigures } from "@/lib/importFigureReconcile.server";

describe("reconcileSubmitExamPayloadWithImportFigures", () => {
  it("shares a single full-page figure across multiple stem segments that need diagrams", () => {
    const url = "https://example.com/import-figures/batch/p0-page.png";
    const merged = `\n\n<<< 文件: scan.jpg >>>\n\n(1) 右图是由正方体组成的立体图形\n(2) 下列图形是中心对称图形的是\n\n![](${url})\n`;

    const parsed = {
      questions: [
        {
          content: "(1) 右图是由正方体组成的立体图形",
          type: "multiple_choice",
          options: ["A", "B", "C", "D"],
          points: 3,
        },
        {
          content: "(2) 下列图形是中心对称图形的是",
          type: "short_answer",
          points: 10,
          options: null,
        },
      ],
    };

    const out = reconcileSubmitExamPayloadWithImportFigures(merged, parsed).payload as {
      questions: Array<{ content: string }>;
    };
    expect(out.questions[0]!.content).toContain(url);
    expect(out.questions[1]!.content).toContain(url);
  });

  it("shares one page image when (1)(2) are not line-initial", () => {
    const url = "https://example.com/import-figures/batch/p0-page.png";
    const merged = `\n\n<<< 文件: scan.jpg >>>\n\n时新(1) 右图是由正方体\n(2) 下列图形\n\n![](${url})\n`;
    const parsed = {
      questions: [
        {
          content: "(1) 右图是由正方体",
          type: "multiple_choice",
          options: ["A", "B", "C", "D"],
          points: 3,
        },
        {
          content: "(2) 下列图形",
          type: "multiple_choice",
          options: ["A", "B", "C", "D"],
          points: 3,
        },
      ],
    };
    const out = reconcileSubmitExamPayloadWithImportFigures(merged, parsed).payload as {
      questions: Array<{ content: string }>;
    };
    expect(out.questions[0]!.content).toContain(url);
    expect(out.questions[1]!.content).toContain(url);
  });

  it("prefers geometry ownership over URL question index when diagram bbox lies in another strip", () => {
    const url = "https://example.com/import-figures/batch/p0-q2-diag.png";
    const merged = `卷头说明若干字以满足最小长度要求\n\n(1) 第一题题干无图\n(2) 第二题题干\n\n<<< 文件: scan.jpg >>>\n\n![](${url})\n`;
    const parsed = {
      questions: [
        {
          content: "(1) 第一题题干无图",
          type: "short_answer",
          options: null,
          points: 3,
        },
        {
          content: "(2) 第二题题干",
          type: "short_answer",
          options: null,
          points: 3,
        },
      ],
    };
    const structured = {
      version: "1" as const,
      plainText: merged,
      blocks: [],
      diagramLinks: [
        {
          questionIndex: 2,
          diagramId: "diag",
          bbox: [0, 0.08, 1, 0.14] as [number, number, number, number],
        },
      ],
    };
    const questionRegions = [
      {
        questionNumber: 1,
        page: 0,
        bbox: [0, 0, 1, 0.5] as const,
        text: "(1)…",
        readingOrder: 0,
        startIndexInJoined: 0,
        source: "heuristic" as const,
        sectionHint: null,
      },
      {
        questionNumber: 2,
        page: 0,
        bbox: [0, 0.5, 1, 0.5] as const,
        text: "(2)…",
        readingOrder: 1,
        startIndexInJoined: 20,
        source: "heuristic" as const,
        sectionHint: null,
      },
    ];
    const { payload: out, figureAttachQuality } = reconcileSubmitExamPayloadWithImportFigures(
      merged,
      parsed,
      {
        questionRegions,
        structured,
      },
    );
    expect(figureAttachQuality?.figure_attach_quality).toBeDefined();
    expect(out.questions[0]!.content).toContain(url);
    expect(out.questions[1]!.content).not.toContain(url);
  });
});
