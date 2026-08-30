import { describe, expect, it } from "vitest";
import { LEARNING_STRATEGY_HINTS } from "@/lib/generationLearning.shared";
import { composePromptWithApprovedExamLearningHints } from "@/lib/generationLearning.server";

describe("composePromptWithApprovedExamLearningHints", () => {
  it("保留 base 前缀，并追加已审批 exam 策略（若 state 中有匹配规则）", () => {
    const base = "【导入学习】示例前缀";
    const out = composePromptWithApprovedExamLearningHints(base, "math");
    expect(out.startsWith(base)).toBe(true);
    // data/generation-learning/state.json 含 math + require_valid_figure_scene 已批准规则
    expect(out).toContain(LEARNING_STRATEGY_HINTS.require_valid_figure_scene);
  });

  it("无 base 时仅输出已审批 hints（可为空字符串）", () => {
    const out = composePromptWithApprovedExamLearningHints("", "math");
    expect(typeof out).toBe("string");
  });
});
