import { describe, expect, it } from "vitest";
import {
  collectAlignmentIssues,
  collectCountMcqSuspiciousOptionIssues,
  collectMassFractionIssues,
  collectMultiSelectAnswerLetterIssues,
  collectPhysicsWeightAsMassTrapIssues,
  collectSemanticGateIssues,
  collectSolutionAnswerConflictIssues,
} from "@/lib/examGenerationSemanticGates.shared";
import { collectParsedQuestionsIssues } from "@/lib/examQuestionValidation";
import {
  classifyLearningIssue,
  strategyForIssueCode,
} from "@/lib/generationLearning.shared";

describe("examGenerationSemanticGates", () => {
  it("定位对齐：小学 + 国家集训队标签拒存", () => {
    const issues = collectAlignmentIssues(
      {
        gradeId: "pri_g4",
        gradeLabel: "小学四年级",
        title: "小学四年级奥数",
        competitionFocusLabels: ["CMO·国家集训队"],
        subjectTags: ["年级:小学四年级", "竞赛侧重:联赛二试"],
      },
      [],
    );
    expect(issues.some((m) => /年级学段与竞赛定位冲突/.test(m))).toBe(true);
  });

  it("解析断言无解但答案为正数 → 冲突", () => {
    const issues = collectSolutionAnswerConflictIssues([
      {
        type: "fill_blank",
        content: "5 盒每盒至少 1 球，仅有 3 球。",
        answer: "1",
        solution_steps: [
          { step: 1, description: "条件矛盾", reasoning: "没有放置方法，共 0 种" },
        ],
      },
    ]);
    expect(issues.some((m) => /解析断言无解/.test(m))).toBe(true);
  });

  it("计数类选择题选项 0–3 → 可疑", () => {
    const issues = collectCountMcqSuspiciousOptionIssues([
      {
        type: "multiple_choice",
        content: "满足条件的四位数有多少个？",
        answer: "B",
        options: ["A. 0", "B. 1", "C. 2", "D. 3"],
      },
    ]);
    expect(issues.some((m) => /计数类选择题/.test(m))).toBe(true);
  });

  it("计数类选项覆盖大范围则放行", () => {
    const issues = collectCountMcqSuspiciousOptionIssues([
      {
        type: "multiple_choice",
        content: "满足条件的四位数有多少个？",
        answer: "C",
        options: ["A. 45", "B. 72", "C. 93", "D. 120"],
      },
    ]);
    expect(issues).toEqual([]);
  });

  it("多选：题干「哪些」但只答一字母 → 拒", () => {
    const issues = collectMultiSelectAnswerLetterIssues([
      {
        type: "multiple_choice_multi",
        content: "下列哪些说法正确？",
        answer: "A",
        options: ["A. 一", "B. 二", "C. 三", "D. 四"],
      },
    ]);
    expect(issues.some((m) => /至少两个/.test(m))).toBe(true);
  });

  it("物理：把重力当质量的陷阱答案拒存", () => {
    const issues = collectPhysicsWeightAsMassTrapIssues([
      {
        type: "calculation",
        content:
          "一个重 $10 \\text{ N}$ 的物体，摩擦力是 $2 \\text{ N}$。若要以 $0.5 \\text{ m/s}^2$ 的加速度水平运动，求推力。",
        answer: "$7 \\text{ N}$",
      },
    ]);
    expect(issues.some((m) => /重力数值当作质量/.test(m))).toBe(true);
  });

  it("溶液质量分数与可推算值不一致 → 拒", () => {
    const issues = collectMassFractionIssues([
      {
        type: "calculation",
        content:
          "在 $200 \\text{ g}$ 质量分数为 $10\\%$ 的氯化钠溶液中，加入 $50 \\text{ g}$ 水，然后蒸发掉 $20 \\text{ g}$ 水。此时溶液的质量分数是多少？",
        answer: "$11.43\\%$",
      },
    ]);
    expect(issues.some((m) => /质量分数与题干可推算/.test(m))).toBe(true);
  });

  it("溶液质量分数正确则放行", () => {
    const issues = collectMassFractionIssues([
      {
        type: "calculation",
        content:
          "在 $200 \\text{ g}$ 质量分数为 $10\\%$ 的氯化钠溶液中，加入 $50 \\text{ g}$ 水，然后蒸发掉 $20 \\text{ g}$ 水。此时溶液的质量分数是多少？",
        answer: "$8.70\\%$",
      },
    ]);
    expect(issues).toEqual([]);
  });

  it("collectParsedQuestionsIssues 合并语义闸门", () => {
    const issues = collectParsedQuestionsIssues(
      [
        {
          type: "multiple_choice",
          content: "一共有多少种放法？",
          answer: "A",
          options: ["A. 0", "B. 1", "C. 2", "D. 3"],
        },
      ],
      { gradeId: "pri_g4", competitionFocusLabels: ["国家集训队"] },
    );
    expect(issues.some((m) => /计数类选择题/.test(m))).toBe(true);
    expect(issues.some((m) => /年级学段与竞赛定位冲突/.test(m))).toBe(true);
  });

  it("learning 分类映射到策略", () => {
    expect(classifyLearningIssue("整卷定位：年级学段与竞赛定位冲突")).toBe(
      "alignment.grade_track_conflict",
    );
    expect(strategyForIssueCode("alignment.grade_track_conflict")).toBe(
      "require_grade_track_alignment",
    );
    expect(classifyLearningIssue("第 1 题：解析断言无解/0 种，但答案为非零")).toBe(
      "solution.answer_conflict",
    );
    expect(classifyLearningIssue("第 1 题：计数类选择题选项为过小整数序列")).toBe(
      "mcq.count_option_suspicious",
    );
  });

  it("语义闸门汇总入口", () => {
    const all = collectSemanticGateIssues(
      [
        {
          type: "fill_blank",
          content: "无",
          answer: "1",
          solution_steps: [{ step: 1, description: "无解" }],
        },
      ],
      { gradeId: "pri_g1", subjectTags: ["CMO"] },
    );
    expect(all.length).toBeGreaterThan(0);
  });
});
