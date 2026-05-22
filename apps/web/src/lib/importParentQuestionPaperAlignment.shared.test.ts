import { describe, expect, it } from "vitest";

import {
  alignImportedParentQuestionSnapshot,
  replaceNonAuthoritativeFigureUrlsInSnapshot,
} from "@/lib/importParentQuestionPaperAlignment.shared";
import { stripNonResolvableMarkdownImagesFromText } from "@/lib/importRasterFigures.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { Exam, Question } from "@/lib/types";

const batch = "06803f4e-d427-4807-9dac-a3aa90915e0a";
const page = `/import-figures/${batch}/0.jpg`;
const fig1 = `/import-figures/${batch}/p0-图①.png`;
const fig2 = `/import-figures/${batch}/p0-图②.png`;

function minimalQ(order: number, content: string, extra: Partial<Question> = {}): Question {
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
    ...extra,
  };
}

function snap(questions: Question[], registryUrls: string[] = [page]): SessionExamSnapshot {
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
    figure_registry: registryUrls.map((raster_url, i) => ({
      version: 1 as const,
      figure_id: `f${i}`,
      raster_url,
      source: "page_crop" as const,
    })),
  };
  return { exam, questions, examples: [] };
}

describe("stripNonResolvableMarkdownImagesFromText", () => {
  it("移除 ![](URL) 保留 import-figures", () => {
    const s = "如图![](URL)后 ![x](/import-figures/b/a.png)";
    expect(stripNonResolvableMarkdownImagesFromText(s)).toBe(
      "如图后 ![x](/import-figures/b/a.png)",
    );
  });
});

describe("alignImportedParentQuestionSnapshot", () => {
  it("replaceNonAuthoritativeFigureUrlsInSnapshot：example.com → 整页图", () => {
    const inSnap = snap([
      minimalQ(0, "x", {
        raster_figures: {
          version: 1,
          stem: ["http://example.com/offline-import/figure.png"],
          by_option: {},
        },
      }),
    ]);
    const out = replaceNonAuthoritativeFigureUrlsInSnapshot(inSnap, page);
    expect(out.questions[0]?.raster_figures?.stem?.[0]).toBe(page);
  });

  it("误拆卷：按拓扑保留 (1) 正文并去掉 URL 占位", () => {
    const inSnap = snap([
      minimalQ(0, "(22) 直角△ABC 等边△DEF wrong", {
        raster_figures: { version: 1, stem: [page], by_option: {} },
      }),
      minimalQ(1, "(1) 如图，![](URL) ∠EFO"),
      minimalQ(2, "(2) 向上平移"),
      minimalQ(3, "乱码", { diagram_schema: { version: 1, entities: [] } as never }),
    ]);
    const out = alignImportedParentQuestionSnapshot(inSnap);
    expect(out.questions).toHaveLength(3);
    const q1 = out.questions.find((q) => q.order_index === 1)!;
    expect(q1.content).toContain("(1)");
    expect(q1.content).toContain("∠EFO");
    expect(q1.content).not.toContain("URL");
    expect(out.questions.some((q) => String(q.content).includes("乱码"))).toBe(false);
    expect(out.questions.every((q) => q.diagram_schema == null)).toBe(true);
  });

  it("3 题卷：小问挂 batch 内图①/图② 裁图", () => {
    const inSnap = snap(
      [
        minimalQ(0, "(22) 直角△AOB 等边△DEF", {
          raster_figures: { version: 1, stem: [page], by_option: {} },
        }),
        minimalQ(1, "(1) 如图①，求角"),
        minimalQ(2, "(2) 如图②，平移与面积"),
      ],
      [page, fig1, fig2],
    );
    const out = alignImportedParentQuestionSnapshot(inSnap);
    const q1 = out.questions.find((q) => q.order_index === 1)!;
    const q2 = out.questions.find((q) => q.order_index === 2)!;
    expect(q1.raster_figures?.stem?.some((u) => u.includes("图①"))).toBe(true);
    expect(q2.raster_figures?.stem?.some((u) => u.includes("图②"))).toBe(true);
    expect(out.questions.every((q) => q.diagram_schema == null)).toBe(true);
  });
});
