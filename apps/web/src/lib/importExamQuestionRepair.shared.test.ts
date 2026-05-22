import { describe, expect, it } from "vitest";
import {
  applyImportExamQuestionMinimalRepair,
  inferSingleMcqLetterFromAnalysisText,
} from "@/lib/importExamQuestionRepair.shared";

describe("importExamQuestionRepair.shared", () => {
  it("infers letter from 故选 / 答案 patterns", () => {
    expect(inferSingleMcqLetterFromAnalysisText("由上可知故选 C。")).toBe("C");
    expect(inferSingleMcqLetterFromAnalysisText("答案：B\n验算略。")).toBe("B");
  });

  it("fills empty answer and pads solution_steps for import gate", () => {
    const out = applyImportExamQuestionMinimalRepair([
      {
        type: "multiple_choice",
        content: "下列正确的是",
        answer: "",
        options: ["1", "2", "3", "4"],
        solution_steps: [],
      },
    ]);
    expect(out[0]!.answer.length).toBeGreaterThan(0);
    const steps = out[0]!.solution_steps as { step: number; description: string }[];
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it("infers answer from solution text when answer empty", () => {
    const out = applyImportExamQuestionMinimalRepair([
      {
        type: "multiple_choice",
        content: "x=?",
        answer: "",
        options: ["0", "1", "2", "3"],
        solution_steps: [
          { step: 1, description: "代入验算", reasoning: "故选 A。" },
          { step: 2, description: "结论", reasoning: "略" },
        ],
      },
    ]);
    expect(out[0]!.answer).toBe("A");
  });
});
