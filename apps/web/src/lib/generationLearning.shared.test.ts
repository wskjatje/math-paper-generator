import { describe, expect, it } from "vitest";
import {
  applyAutoAgreeToSnapshot,
  buildApprovedLearningHints,
  classifyLearningIssue,
  isCandidateEligibleForAutoAgree,
  LEARNING_SCHEMA_VERSION,
  ruleKindForIssueCode,
  strategyForIssueCode,
  type ApprovedGenerationLearningRule,
} from "./generationLearning.shared";

function approvedRule(
  overrides: Partial<ApprovedGenerationLearningRule> = {},
): ApprovedGenerationLearningRule {
  return {
    id: "rule-1",
    schemaVersion: LEARNING_SCHEMA_VERSION,
    issueCode: "figure.scene.invalid",
    scope: { stage: "figure", subject: "数学", pack: "math.function" },
    strategyId: "require_valid_figure_scene",
    kind: "prompt_policy",
    status: "approved",
    evidenceCount: 3,
    firstSeenAt: "2026-07-18T00:00:00.000Z",
    lastSeenAt: "2026-07-18T01:00:00.000Z",
    evidenceHashes: ["a", "b", "c"],
    summaries: [],
    approvedAt: "2026-07-18T02:00:00.000Z",
    approvedBy: "admin",
    ...overrides,
  };
}

describe("generation learning issue classification", () => {
  it("uses stable codes instead of matching rules by full Chinese message", () => {
    expect(
      classifyLearningIssue("第 2 题（选择题）：options 须至少 4 项（当前 2 项）"),
    ).toBe("mcq.options.too_few");
    expect(
      classifyLearningIssue("第 3 题：缺少可校验的 figure_scene"),
    ).toBe("figure.scene.missing");
    expect(classifyLearningIssue("题目数量须为 10 道，当前为 8 道")).toBe(
      "generation.count.mismatch",
    );
  });

  it("classifies figure_scene JSON parse failures into a dedicated code", () => {
    expect(classifyLearningIssue("figure_scene JSON 解析失败")).toBe(
      "figure.scene.parse_failed",
    );
    expect(classifyLearningIssue("模型未返回 figure_scene JSON")).toBe(
      "figure.scene.parse_failed",
    );
    expect(
      classifyLearningIssue("figure_scene 不是对象，也不是可解析的 JSON 字符串"),
    ).toBe("figure.scene.parse_failed");
    // 结构不合法（非 JSON 格式问题）仍归 invalid
    expect(
      classifyLearningIssue("figure_scene 不是合法的 math.function"),
    ).toBe("figure.scene.invalid");
  });

  it("only maps allowlisted issue codes to strategies", () => {
    expect(strategyForIssueCode("figure.scene.invalid")).toBe(
      "require_valid_figure_scene",
    );
    expect(strategyForIssueCode("figure.scene.parse_failed")).toBe(
      "require_pure_json_figure_scene",
    );
    expect(strategyForIssueCode("generation.parse.failed")).toBeNull();
    expect(strategyForIssueCode("generation.other")).toBeNull();
  });

  it("classifies runtime AI failures from config table", () => {
    expect(
      classifyLearningIssue(
        "本地模型请求失败 400: This model only supports Interactions API.",
      ),
    ).toBe("runtime.api_incompatible");
    expect(classifyLearningIssue("第 7 题：修复失败 — fetch failed")).toBe(
      "runtime.fetch_failed",
    );
    expect(strategyForIssueCode("runtime.api_incompatible")).toBe(
      "prefer_openai_compat_model",
    );
    expect(strategyForIssueCode("runtime.fetch_failed")).toBe(
      "check_ai_endpoint_connectivity",
    );
    expect(ruleKindForIssueCode("runtime.api_incompatible")).toBe("ops_advisory");
    expect(ruleKindForIssueCode("runtime.fetch_failed")).toBe("ops_advisory");
    expect(ruleKindForIssueCode("mcq.options.too_few")).toBe("prompt_policy");
  });
});

describe("approved learning hint scope", () => {
  it("injects an approved rule only into the matching stage/subject/pack", () => {
    const rule = approvedRule();
    expect(
      buildApprovedLearningHints([rule], {
        stage: "figure",
        subject: "数学",
        pack: "math.function",
      }),
    ).toContain("结构化 scene");
    expect(
      buildApprovedLearningHints([rule], {
        stage: "exam",
        subject: "数学",
      }),
    ).toBe("");
    expect(
      buildApprovedLearningHints([rule], {
        stage: "figure",
        subject: "物理",
        pack: "physics.mechanics",
      }),
    ).toBe("");
  });

  it("supports cross-subject global rules only when scope intentionally omits subject/pack", () => {
    const global = approvedRule({
      id: "global",
      issueCode: "mcq.options.too_few",
      strategyId: "require_mcq_options",
      scope: { stage: "exam" },
    });
    expect(
      buildApprovedLearningHints([global], { stage: "exam", subject: "英语" }),
    ).toContain("options");
  });

  it("rejects dirty pack/subject pairs (e.g. 物理 + math.geometry)", () => {
    const dirty = approvedRule({
      id: "dirty",
      scope: { stage: "figure", subject: "物理", pack: "math.geometry" },
    });
    expect(
      buildApprovedLearningHints([dirty], {
        stage: "figure",
        subject: "物理",
        pack: "physics.mechanics",
      }),
    ).toBe("");
    expect(
      buildApprovedLearningHints([dirty], {
        stage: "figure",
        subject: "物理",
        pack: "math.geometry",
      }),
    ).toBe("");
  });

  it("injects physics.mechanics rule only into matching physics scope", () => {
    const rule = approvedRule({
      id: "pm",
      scope: { stage: "figure", subject: "物理", pack: "physics.mechanics" },
    });
    expect(
      buildApprovedLearningHints([rule], {
        stage: "figure",
        subject: "物理",
        pack: "physics.mechanics",
      }),
    ).toContain("结构化 scene");
    expect(
      buildApprovedLearningHints([rule], {
        stage: "figure",
        subject: "数学",
        pack: "math.function",
      }),
    ).toBe("");
  });

  it("deduplicates identical approved strategy hints", () => {
    const a = approvedRule();
    const b = approvedRule({ id: "rule-2", approvedBy: "reviewer" });
    const hints = buildApprovedLearningHints([a, b], {
      stage: "figure",
      subject: "数学",
      pack: "math.function",
    });
    expect((hints.match(/结构化 scene/g) ?? []).length).toBe(1);
  });

  it("does not inject ops_advisory rules into prompts", () => {
    const ops = approvedRule({
      id: "ops-api",
      issueCode: "runtime.api_incompatible",
      strategyId: "prefer_openai_compat_model",
      kind: "ops_advisory",
      scope: { stage: "exam", subject: "数学" },
    });
    expect(
      buildApprovedLearningHints([ops], { stage: "exam", subject: "数学" }),
    ).toBe("");
  });
});

describe("generation learning auto-agree", () => {
  it("auto-agree applies only when evidence and config allow", () => {
    const pending = {
      id: "c1",
      schemaVersion: LEARNING_SCHEMA_VERSION,
      issueCode: "mcq.options.too_few" as const,
      scope: { stage: "exam" as const, subject: "数学" },
      strategyId: "require_mcq_options" as const,
      kind: "prompt_policy" as const,
      status: "pending" as const,
      evidenceCount: 3,
      firstSeenAt: "2026-08-06T00:00:00.000Z",
      lastSeenAt: "2026-08-06T01:00:00.000Z",
      evidenceHashes: ["a", "b", "c"],
      summaries: [],
    };
    expect(
      isCandidateEligibleForAutoAgree(pending, {
        enabled: true,
        minEvidence: 3,
        kinds: ["prompt_policy"],
      }),
    ).toBe(true);
    expect(
      isCandidateEligibleForAutoAgree(
        { ...pending, evidenceCount: 2 },
        { enabled: true, minEvidence: 3, kinds: ["prompt_policy"] },
      ),
    ).toBe(false);
    expect(
      isCandidateEligibleForAutoAgree(pending, { enabled: false, minEvidence: 3 }),
    ).toBe(false);

    const { snapshot, approvedIds } = applyAutoAgreeToSnapshot(
      {
        schemaVersion: LEARNING_SCHEMA_VERSION,
        candidates: [pending],
        updatedAt: "2026-08-06T00:00:00.000Z",
      },
      "2026-08-06T02:00:00.000Z",
      { enabled: true, minEvidence: 3, kinds: ["prompt_policy"], actor: "auto-agree" },
    );
    expect(approvedIds).toEqual(["c1"]);
    expect(snapshot.candidates[0]?.status).toBe("approved");
    expect(snapshot.candidates[0]?.approvedBy).toBe("auto-agree");
  });

  it("auto-agree skips cross-subject pack mismatch", () => {
    const dirty = {
      id: "c2",
      schemaVersion: LEARNING_SCHEMA_VERSION,
      issueCode: "figure.scene.invalid" as const,
      scope: { stage: "figure" as const, subject: "物理", pack: "math.geometry" },
      strategyId: "require_valid_figure_scene" as const,
      kind: "prompt_policy" as const,
      status: "pending" as const,
      evidenceCount: 5,
      firstSeenAt: "2026-08-06T00:00:00.000Z",
      lastSeenAt: "2026-08-06T01:00:00.000Z",
      evidenceHashes: ["a", "b", "c", "d", "e"],
      summaries: [],
    };
    expect(
      isCandidateEligibleForAutoAgree(dirty, {
        enabled: true,
        minEvidence: 3,
        kinds: ["prompt_policy"],
      }),
    ).toBe(false);
  });
});
