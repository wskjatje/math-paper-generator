import { describe, expect, it } from "vitest";

import {
  applyImportQuestionStructureAutocorrect,
  autocorrectMisclassifiedImportQuestion,
  mcqOptionsLookFabricated,
  stemLooksLikeSubjectiveAnswerQuestion,
} from "@/lib/importQuestionStructureAutocorrect.shared";
import { applyImportSectionContextToParsedQuestions } from "@/lib/importSectionContext.shared";

describe("importQuestionStructureAutocorrect", () => {
  it("detects subjective stems and fabricated meter options", () => {
    const stem =
      "（22）（本小题 10 分）综合与实践活动中, 计算拱顶距离水面的坚直高度 EF（结果取整数）.";
    expect(stemLooksLikeSubjectiveAnswerQuestion(stem)).toBe(true);
    expect(
      mcqOptionsLookFabricated(["15 m", "16 m", "17 m", "18 m"], stem),
    ).toBe(true);
  });

  it("downgrades bridge height MCQ to short_answer and infers numeric answer", () => {
    const raw = `三、解答题（本大题共 7 小题，共 66 分）\n(22) 海河拱桥`;
    const q = {
      type: "multiple_choice",
      content:
        "（22）（本小题 10 分）综合与实践, 计算拱顶 EF（结果取整数）. 参考 tan 22°≈0.4",
      options: ["15 m", "16 m", "17 m", "18 m"],
      answer: "A",
      solution_steps: [
        {
          step: 1,
          description: "列方程",
          reasoning: "得 EF 约为 17 m",
        },
        { step: 2, description: "验算", reasoning: "故约为 17" },
      ],
    };
    const out = autocorrectMisclassifiedImportQuestion(q, {
      fullSourceText: raw,
      questionIndex: 0,
    });
    expect(out.type).toBe("short_answer");
    expect(out.options).toBeNull();
    expect(out.answer).toBe("17");
  });

  it("applyImportSectionContext strips MCQ under 解答题 section", () => {
    const full = `三、解答题（本大题共 7 小题，共 66 分）\n(22) 计算高度`;
    const qs = [
      {
        type: "multiple_choice",
        points: 10,
        content: "(22) 计算 EF",
        answer: "A",
        options: ["15 m", "16 m", "17 m", "18 m"],
        solution_steps: [],
      },
    ];
    const out = applyImportSectionContextToParsedQuestions(qs, full, null);
    expect(out[0]!.type).toBe("short_answer");
    expect(out[0]!.options).toBeNull();
  });

  it("applyImportQuestionStructureAutocorrect keeps real 选择题", () => {
    const full = `一、选择题（本大题共 12 小题，每小题 3 分）\n(3) 科学记数法`;
    const qs = [
      {
        type: "multiple_choice",
        content: "(3) 将数据 50000 用科学记数法表示应为",
        options: ["0.05×10^6", "0.5×10^5", "5×10^4", "50×10^3"],
        answer: "C",
        solution_steps: [{ step: 1, description: "选 C" }],
      },
    ];
    const out = applyImportQuestionStructureAutocorrect(qs, full, null);
    expect(out[0]!.type).toBe("multiple_choice");
    expect(out[0]!.options).toHaveLength(4);
  });
});
