import { describe, expect, it } from "vitest";
import {
  learningIssueLabel,
  learningScopeUserLabel,
  learningStrategyUserBlurb,
  sanitizeLearningSummaryForUi,
} from "./generationLearningUi.shared";

describe("generationLearningUi", () => {
  it("maps issue codes to plain Chinese", () => {
    expect(learningIssueLabel("figure.scene.invalid")).toBe("配图与题目要求不一致");
    expect(learningIssueLabel("figure.scene.parse_failed")).toBe("配图信息格式无法识别");
    expect(learningIssueLabel("runtime.api_incompatible")).toBe("模型接口不兼容");
    expect(learningIssueLabel("runtime.fetch_failed")).toBe("无法连接 AI 服务");
  });

  it("describes scope without raw pack ids", () => {
    expect(
      learningScopeUserLabel({
        stage: "figure",
        subject: "物理",
        pack: "physics.mechanics",
      }),
    ).toBe("物理 · 题图配图 · 力学示意图");
  });

  it("strategy blurbs stay non-technical", () => {
    const t = learningStrategyUserBlurb("require_valid_figure_scene");
    expect(t).not.toMatch(/scene|pack|JSON|Diagram/i);
    expect(t).toContain("如图");
  });

  it("ops advisory blurbs point to settings", () => {
    expect(learningStrategyUserBlurb("prefer_openai_compat_model")).toMatch(/设置/);
    expect(learningStrategyUserBlurb("check_ai_endpoint_connectivity")).toMatch(
      /地址|启动/,
    );
  });

  it("strips paths and env names from summaries", () => {
    const s = sanitizeLearningSummaryForUi(
      "LOVABLE_API_KEY 未配置；见 data/generation-learning/ 与 figure_scene JSON.parse",
    );
    expect(s).not.toMatch(/LOVABLE|data\/generation|JSON\.parse|figure_scene/i);
  });
});
