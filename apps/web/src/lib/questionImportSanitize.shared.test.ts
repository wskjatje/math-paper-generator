import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/types";
import {
  sanitizeImportedQuestionForPersist,
  sanitizeImportedStemStructuralPollution,
  stripTrailingBareLetterRunFromOption,
} from "@/lib/questionImportSanitize.shared";

function baseMcq(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    exam_id: "e1",
    order_index: 0,
    type: "multiple_choice",
    subject: "数学",
    content: "如图所示，下列说法正确的是 (2)",
    options: ["50×10^3 A B C D", "乙", "丙", "丁"],
    answer: "A",
    solution_steps: [],
    knowledge_tags: [],
    points: 5,
    ...overrides,
  };
}

describe("questionImportSanitize.shared", () => {
  it("strips offline import <<< 文件: >>> segment markers", () => {
    const raw = `<<< 文件: 微信图片.jpg >>>\n\n(24) 在平面直角坐标系中`;
    expect(sanitizeImportedStemStructuralPollution(raw)).toBe("(24) 在平面直角坐标系中");
  });

  it("strips trailing 第(1)题 and (3) style pollution", () => {
    expect(sanitizeImportedStemStructuralPollution("右图立体，它的主视图是 第(1)题")).toBe(
      "右图立体，它的主视图是",
    );
    expect(sanitizeImportedStemStructuralPollution("将 50000 表示应为 (3)")).toBe(
      "将 50000 表示应为",
    );
    expect(sanitizeImportedStemStructuralPollution("下列图形是中心对称图形的是 (2)")).toBe(
      "下列图形是中心对称图形的是",
    );
  });

  it("strips trailing A B C D from option line", () => {
    expect(stripTrailingBareLetterRunFromOption("50×10^3 A B C D")).toBe("50×10^3");
  });

  it("sanitizeImportedQuestionForPersist strips leading (A) style option labels", () => {
    const q = baseMcq({
      content: "将 50000 用科学记数法表示应为",
      options: [
        "(A) $0.05\\times 10^6$",
        "(B) $0.5\\times 10^6$",
        "(C) $5\\times 10^4$",
        "(D) $50\\times 10^3$",
      ],
    });
    const out = sanitizeImportedQuestionForPersist(q);
    expect(out.options?.[0]).toContain("0.05");
    expect(out.options?.[0]).not.toMatch(/^\(A\)/);
  });

  it("sanitizeImportedQuestionForPersist cleans stem/options and strips diagram_schema when scan MCQ lacks figures", () => {
    const q = baseMcq({
      diagram_schema: {
        version: "1",
        points: [{ id: "P", x: 1, y: 1 }],
        segments: [],
      },
    });
    const out = sanitizeImportedQuestionForPersist(q);
    expect(out.content).toBe("如图所示，下列说法正确的是");
    expect(out.options?.[0]).toBe("50×10^3");
    expect(out.diagram_schema).toBeNull();
  });

  it("sanitizeImportedQuestionForPersist keeps diagram_schema when MCQ stem and options both supply figures", () => {
    const q = baseMcq({
      content: "如图所示![](/import-figures/batch/stem.png)选正确的是",
      options: ["![](/import-figures/batch/a.png)", "乙", "丙", "丁"],
      diagram_schema: {
        version: "1",
        points: [{ id: "P", x: 1, y: 1 }],
        segments: [],
      },
    });
    const out = sanitizeImportedQuestionForPersist(q);
    expect(out.diagram_schema).not.toBeNull();
  });
});
