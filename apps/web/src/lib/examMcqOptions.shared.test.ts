import { describe, expect, it } from "vitest";
import {
  dedupeMcqOptionsKeepFirst,
  mcqOptionsHaveDuplicates,
  optionDedupKey,
  resolveMcqOptionsForDisplay,
  resolveMcqPaperDisplay,
} from "@/lib/examMcqOptions.shared";
import { normalizeTextForOptionCompare } from "@/lib/examTextNormalization.shared";
import { collectParsedQuestionsIssues } from "@/lib/examQuestionValidation";
import {
  classifyLearningIssue,
  strategyForIssueCode,
} from "@/lib/generationLearning.shared";

describe("examMcqOptions + textNormalization", () => {
  it("去重键忽略字母前缀、空白与大小写", () => {
    expect(optionDedupKey("A.  Hello")).toBe(optionDedupKey("hello"));
  });

  it("全角/半角与零宽在比对键中归一", () => {
    const a = "A. 答案，一";
    const b = "B. 答案\u200b,一";
    expect(optionDedupKey(a)).toBe(optionDedupKey(b));
    expect(normalizeTextForOptionCompare("（1）")).toContain("(");
  });

  it("dedupe 保留首次", () => {
    expect(dedupeMcqOptionsKeepFirst(["A. 同", "B. 异", "C. 同", "D. 另"])).toEqual([
      "A. 同",
      "B. 异",
      "D. 另",
    ]);
  });

  it("校验拒绝重复选项", () => {
    const issues = collectParsedQuestionsIssues([
      {
        type: "multiple_choice",
        content: "题干",
        answer: "A",
        options: ["A. 1", "B. 2", "C. 1", "D. 3"],
      },
    ]);
    expect(issues.some((m) => /存在重复项/.test(m))).toBe(true);
  });

  it("学习层识别 duplicate → distinct 策略", () => {
    expect(classifyLearningIssue("第 1 题（选择题）：options 存在重复项")).toBe(
      "mcq.options.duplicate",
    );
    expect(strategyForIssueCode("mcq.options.duplicate")).toBe(
      "require_distinct_mcq_options",
    );
  });

  it("dedupeOnDisplay", () => {
    expect(
      resolveMcqOptionsForDisplay(["A. 同", "B. 异", "C. 同", "D. 另"]),
    ).toEqual(["A. 同", "B. 异", "D. 另"]);
  });

  it("resolveMcqPaperDisplay strips duplicate option block from stem", () => {
    const { stem, options } = resolveMcqPaperDisplay({
      type: "multiple_choice",
      content:
        "关于 $P(x)$，下列正确的是\nA. 无实根\nB. 正方形\nC. 可分解\nD. 模之和",
      options: ["无实根", "正方形", "可分解", "模之和"],
    });
    expect(stem).toBe("关于 $P(x)$，下列正确的是");
    expect(options).toHaveLength(4);
  });
});
