/**
 * 可审计学习层的纯数据模型。
 *
 * 安全边界：
 * - 运行时只能从稳定 issue code 生成候选；
 * - 批准后的规则只能引用白名单策略，不允许任意正则、脚本或源码片段；
 * - 原始题干、答案、API Key 不进入学习事件；
 * - subject 与 pack 必须同族，禁止「物理 + math.geometry」类串科注入；
 * - ops_advisory 仅进改进建议面板，禁止注入命题 prompt。
 */

import { GENERATION_LEARNING, type GenerationLearningConfig } from "@/config/examDomain";
import { diagramPackMatchesSubject } from "./diagram/diagramPackRegistry.shared";

export const LEARNING_SCHEMA_VERSION = 1 as const;

export type LearningScope = {
  subject?: string;
  pack?: string;
  stage: "exam" | "figure" | "text";
};

export type LearningIssueCode =
  | "question.content.empty"
  | "question.answer.empty"
  | "mcq.options.too_few"
  | "mcq.options.blank"
  | "mcq.options.duplicate"
  | "mcq.count_option_suspicious"
  | "mcq.multi_answer_invalid"
  | "answer.multipart.missing"
  | "answer.equation.invalid"
  | "solution.answer_conflict"
  | "alignment.grade_track_conflict"
  | "domain.physics_dimension"
  | "domain.mass_fraction"
  | "figure.scene.missing"
  | "figure.scene.invalid"
  | "figure.scene.parse_failed"
  | "figure.render.failed"
  | "generation.count.mismatch"
  | "generation.parse.failed"
  | "generation.other"
  | "runtime.api_incompatible"
  | "runtime.fetch_failed"
  | "display.latex_delimiter"
  | "display.markup_debris"
  | "display.code_fence";

export type LearningEventOutcome = "observed" | "repaired" | "passed" | "failed";

export type GenerationLearningEvent = {
  id: string;
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  runId: string;
  examId?: string;
  questionIndex?: number;
  scope: LearningScope;
  issueCode: LearningIssueCode;
  outcome: LearningEventOutcome;
  /** 已脱敏、截断的诊断摘要；不得写入完整题干/答案。 */
  summary: string;
  evidenceHash: string;
  repairStrategy?: string;
  model?: string;
  promptPolicyVersion?: string;
  validatorVersion: string;
  createdAt: string;
};

export type LearningRuleKind = "prompt_policy" | "ops_advisory";

export type LearningCandidateStatus = "pending" | "approved" | "rejected" | "disabled";

/**
 * 白名单策略 ID。新增策略必须在代码中实现并有测试，不能由模型自由拼接。
 */
export type LearningStrategyId =
  | "require_nonempty_fields"
  | "require_mcq_options"
  | "require_distinct_mcq_options"
  | "require_count_mcq_option_range"
  | "require_multi_select_letter_validity"
  | "require_multipart_answers"
  | "verify_equations"
  | "require_solution_answer_consistency"
  | "require_grade_track_alignment"
  | "verify_physics_dimension"
  | "verify_mass_fraction"
  | "require_valid_figure_scene"
  | "require_pure_json_figure_scene"
  | "require_expected_question_count"
  | "prefer_openai_compat_model"
  | "check_ai_endpoint_connectivity"
  | "require_display_latex_delimiters"
  | "require_display_markup_clean"
  | "require_display_code_fence";

export type GenerationLearningCandidate = {
  id: string;
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  issueCode: LearningIssueCode;
  scope: LearningScope;
  strategyId: LearningStrategyId;
  kind: LearningRuleKind;
  status: LearningCandidateStatus;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceHashes: string[];
  /** 仅保存脱敏摘要，最多三条。 */
  summaries: string[];
  approvedAt?: string;
  approvedBy?: string;
  /** 证据未达阈值时由管理员显式强制批准；会写入审计。 */
  forceApproved?: boolean;
  rejectedAt?: string;
  rejectedBy?: string;
  disabledAt?: string;
  disabledBy?: string;
  supersedesRuleId?: string;
};

export type ApprovedGenerationLearningRule = GenerationLearningCandidate & {
  status: "approved";
  approvedAt: string;
  approvedBy: string;
};

export type GenerationLearningSnapshot = {
  schemaVersion: typeof LEARNING_SCHEMA_VERSION;
  candidates: GenerationLearningCandidate[];
  updatedAt: string;
};

export const LEARNING_CANDIDATE_MIN_EVIDENCE = 3;

/** 自动同意配置（缺省读 exam-domain.json；可单测注入） */
export function resolveLearningAutoAgreeConfig(
  cfg: GenerationLearningConfig["autoAgree"] | undefined = GENERATION_LEARNING.autoAgree,
): {
  enabled: boolean;
  minEvidence: number;
  kinds: ReadonlySet<LearningRuleKind>;
  actor: string;
  reevaluateOnRecord: boolean;
  reevaluateOnRead: boolean;
} {
  const kinds = cfg?.kinds?.length
    ? cfg.kinds
    : (["prompt_policy", "ops_advisory"] as const);
  return {
    enabled: cfg?.enabled === true,
    minEvidence: Math.max(1, cfg?.minEvidence ?? LEARNING_CANDIDATE_MIN_EVIDENCE),
    kinds: new Set(kinds),
    actor: (cfg?.actor?.trim() || "auto-agree").slice(0, 64),
    reevaluateOnRecord: cfg?.reevaluateOnRecord !== false,
    reevaluateOnRead: cfg?.reevaluateOnRead !== false,
  };
}

/**
 * 候选是否可被自动同意（配置驱动；不含 IO）。
 * - 须 pending
 * - kind 在允许列表
 * - 证据达阈值
 * - 学科/图类一致（串科禁止）
 */
export function isCandidateEligibleForAutoAgree(
  candidate: GenerationLearningCandidate,
  cfg: GenerationLearningConfig["autoAgree"] | undefined = GENERATION_LEARNING.autoAgree,
): boolean {
  const resolved = resolveLearningAutoAgreeConfig(cfg);
  if (!resolved.enabled) return false;
  if (candidate.status !== "pending") return false;
  if (!resolved.kinds.has(candidate.kind)) return false;
  if (candidate.evidenceCount < resolved.minEvidence) return false;
  if (!isLearningScopePackSubjectConsistent(candidate.scope)) return false;
  return true;
}

/** 对快照中全部 eligible pending 应用自动同意；返回新快照与变更数 */
export function applyAutoAgreeToSnapshot(
  snapshot: GenerationLearningSnapshot,
  nowIso: string,
  cfg: GenerationLearningConfig["autoAgree"] | undefined = GENERATION_LEARNING.autoAgree,
): { snapshot: GenerationLearningSnapshot; approvedIds: string[] } {
  const resolved = resolveLearningAutoAgreeConfig(cfg);
  if (!resolved.enabled) return { snapshot, approvedIds: [] };
  const approvedIds: string[] = [];
  const candidates = snapshot.candidates.map((candidate) => {
    if (!isCandidateEligibleForAutoAgree(candidate, cfg)) return candidate;
    approvedIds.push(candidate.id);
    return {
      ...candidate,
      status: "approved" as const,
      approvedAt: nowIso,
      approvedBy: resolved.actor,
      forceApproved: undefined,
      rejectedAt: undefined,
      rejectedBy: undefined,
      disabledAt: undefined,
      disabledBy: undefined,
    };
  });
  if (approvedIds.length === 0) return { snapshot, approvedIds: [] };
  return {
    snapshot: {
      ...snapshot,
      candidates,
      updatedAt: nowIso,
    },
    approvedIds,
  };
}

const RUNTIME_ISSUE_CODES = new Set(
  GENERATION_LEARNING.runtimeIssueRules.map((r) => r.issueCode),
);

const RUNTIME_STRATEGY_IDS = new Set(
  GENERATION_LEARNING.runtimeIssueRules.map((r) => r.strategyId),
);

function isLearningIssueCode(v: string): v is LearningIssueCode {
  return (
    RUNTIME_ISSUE_CODES.has(v) ||
    [
      "question.content.empty",
      "question.answer.empty",
      "mcq.options.too_few",
      "mcq.options.blank",
      "mcq.options.duplicate",
      "mcq.count_option_suspicious",
      "mcq.multi_answer_invalid",
      "answer.multipart.missing",
      "answer.equation.invalid",
      "solution.answer_conflict",
      "alignment.grade_track_conflict",
      "domain.physics_dimension",
      "domain.mass_fraction",
      "figure.scene.missing",
      "figure.scene.invalid",
      "figure.scene.parse_failed",
      "figure.render.failed",
      "generation.count.mismatch",
      "generation.parse.failed",
      "generation.other",
      "runtime.api_incompatible",
      "runtime.fetch_failed",
      "display.latex_delimiter",
      "display.markup_debris",
      "display.code_fence",
    ].includes(v)
  );
}

function isLearningStrategyId(v: string): v is LearningStrategyId {
  return (
    RUNTIME_STRATEGY_IDS.has(v) ||
    v in LEARNING_STRATEGY_HINTS ||
    v === "prefer_openai_compat_model" ||
    v === "check_ai_endpoint_connectivity"
  );
}

function matchRuntimeRule(message: string) {
  for (const rule of GENERATION_LEARNING.runtimeIssueRules) {
    const src = String(rule.match ?? "").trim();
    if (!src) continue;
    try {
      if (new RegExp(src, "i").test(message)) return rule;
    } catch {
      /* skip bad pattern */
    }
  }
  return null;
}

export const LEARNING_STRATEGY_HINTS: Record<LearningStrategyId, string> = {
  require_nonempty_fields:
    "提交前逐题确认 content 与 answer 均为非空完整字符串；不要用占位符或省略答案。",
  require_mcq_options:
    "选择题与多选题的 options 必须是至少 4 个非空字符串的数组，禁止把全部选项合并进题干。",
  require_distinct_mcq_options:
    "选择题与多选题的 options 必须两两语义互异：禁止同文重复、仅差全角/半角或零宽空白的重复项；改写或换掉重复选项后再提交。",
  require_count_mcq_option_range:
    "计数类「有多少/共几种」选择题：options 数值须覆盖合理计数范围，禁止仅用 0–3 等过小整数糊弄；无法覆盖时改为填空或解答。",
  require_multi_select_letter_validity:
    "多选题 answer 须用已有选项字母；题干要求「哪些/正确的有」时须给出至少两个正确字母。",
  require_multipart_answers:
    "题干含（1）（2）等小问时，answer 必须使用相同编号逐问给出结论，不能只回答最后一问。",
  verify_equations:
    "方程、方程组和可数值验证的结论必须代回原条件逐项验算，答案与推导保持一致。",
  require_solution_answer_consistency:
    "solution_steps 的最终结论必须与 answer 一致：解析写无解/0 种时，answer 不得写成正数或单选项字母。",
  require_grade_track_alignment:
    "年级学段、试卷场景与竞赛侧重标签必须一致：小学不得绑定国家集训队/联赛一二试/CMO·IMO 等超阶标签。",
  verify_physics_dimension:
    "物理受力：重力以 N 给出时不得把该数值直接当质量；须按 m=G/g 再算合外力。",
  verify_mass_fraction:
    "溶液质量分数：溶质质量守恒；加水/蒸发后按溶质/(最终溶液质量) 计算，并与 answer 百分比一致。",
  require_valid_figure_scene:
    "依赖配图的题必须提供当前学科已启用 Diagram Pack 的结构化 scene；提交前检查引用、坐标、表达式和题干事实一致性。无法构造可信 scene 时应改为不依赖配图的题，禁止猜图。",
  require_pure_json_figure_scene:
    "figure_scene 必须是一个可被 JSON.parse 的纯 JSON 对象：禁止 Markdown 代码围栏、注释、解释文字或多个对象，禁止尾随逗号，所有键与字符串都用双引号。",
  require_expected_question_count:
    "提交前核对题目总数及每个题型数量与题型组成完全一致，保持既定顺序。",
  /** ops：不注入命题 prompt */
  prefer_openai_compat_model: "",
  check_ai_endpoint_connectivity: "",
  require_display_latex_delimiters:
    "数学定界须成对：禁止孤立 $$、题干填空位写成 $$、以及 $…$$ / $(…$$ 混用；填空用 ____ 或规范 $…$。",
  require_display_markup_clean:
    "禁止输出未渲染残片：勿把 \\neq 写成 eq、勿字面保留 \\newline / ihinspace；化学计量用 H_2O 而非 H\\_2O。",
  require_display_code_fence:
    "programming 题的 answer / 解析中的代码必须放在 Markdown 围栏（```python … ```），禁止粘连关键字或把代码当公式斜体展示。",
};

export function ruleKindForIssueCode(code: LearningIssueCode): LearningRuleKind {
  for (const rule of GENERATION_LEARNING.runtimeIssueRules) {
    if (rule.issueCode === code) {
      return rule.kind === "ops_advisory" ? "ops_advisory" : "prompt_policy";
    }
  }
  return "prompt_policy";
}

export function strategyForIssueCode(
  code: LearningIssueCode,
): LearningStrategyId | null {
  for (const rule of GENERATION_LEARNING.runtimeIssueRules) {
    if (rule.issueCode === code && isLearningStrategyId(rule.strategyId)) {
      return rule.strategyId;
    }
  }
  if (code === "question.content.empty" || code === "question.answer.empty") {
    return "require_nonempty_fields";
  }
  if (code === "mcq.options.too_few" || code === "mcq.options.blank") {
    return "require_mcq_options";
  }
  if (code === "mcq.options.duplicate") return "require_distinct_mcq_options";
  if (code === "mcq.count_option_suspicious") return "require_count_mcq_option_range";
  if (code === "mcq.multi_answer_invalid") return "require_multi_select_letter_validity";
  if (code === "answer.multipart.missing") return "require_multipart_answers";
  if (code === "answer.equation.invalid") return "verify_equations";
  if (code === "solution.answer_conflict") return "require_solution_answer_consistency";
  if (code === "alignment.grade_track_conflict") return "require_grade_track_alignment";
  if (code === "domain.physics_dimension") return "verify_physics_dimension";
  if (code === "domain.mass_fraction") return "verify_mass_fraction";
  if (code === "figure.scene.parse_failed") return "require_pure_json_figure_scene";
  if (
    code === "figure.scene.missing" ||
    code === "figure.scene.invalid" ||
    code === "figure.render.failed"
  ) {
    return "require_valid_figure_scene";
  }
  if (code === "generation.count.mismatch") return "require_expected_question_count";
  if (code === "display.latex_delimiter") return "require_display_latex_delimiters";
  if (code === "display.markup_debris") return "require_display_markup_clean";
  if (code === "display.code_fence") return "require_display_code_fence";
  return null;
}

export function classifyLearningIssue(message: string): LearningIssueCode {
  const runtime = matchRuntimeRule(message);
  if (runtime && isLearningIssueCode(runtime.issueCode)) {
    return runtime.issueCode;
  }

  if (/LaTeX 定界不规范|孤立 \$\$/.test(message)) return "display.latex_delimiter";
  if (/LaTeX\/排版残片|ihinspace|\\\\newline|\beq\b/.test(message)) {
    return "display.markup_debris";
  }
  if (/代码未使用规范 Markdown|仍粘连/.test(message)) return "display.code_fence";
  if (/题干（content）为空/.test(message)) return "question.content.empty";
  if (/答案（answer）为空/.test(message)) return "question.answer.empty";
  if (/options 须至少 4 项|options 须至少 2 项/.test(message)) return "mcq.options.too_few";
  if (/options 每项均须为非空/.test(message)) return "mcq.options.blank";
  if (/options 存在重复项/.test(message)) return "mcq.options.duplicate";
  if (/计数类选择题选项为过小整数|未覆盖真实计数范围/.test(message)) {
    return "mcq.count_option_suspicious";
  }
  if (/多选题答案字母|选出多项时/.test(message)) return "mcq.multi_answer_invalid";
  if (/多问|逐问|编号.*缺|缺少.*（\d+）/.test(message)) {
    return "answer.multipart.missing";
  }
  if (/方程|代入|验算|根.*不|答案.*矛盾/.test(message) && !/解析断言/.test(message)) {
    return "answer.equation.invalid";
  }
  if (/解析断言无解|解析.*与答案/.test(message) || /规则 zero_methods/.test(message)) {
    return "solution.answer_conflict";
  }
  if (/年级学段与竞赛定位冲突|整卷定位/.test(message)) {
    return "alignment.grade_track_conflict";
  }
  if (/把重力数值当作质量|量纲错误/.test(message)) return "domain.physics_dimension";
  if (/溶液质量分数与题干可推算/.test(message)) return "domain.mass_fraction";
  if (/figure_scene.*缺少|缺少可校验的 figure_scene|配图项缺少/.test(message)) {
    return "figure.scene.missing";
  }
  if (
    /未返回 figure_scene JSON|figure_scene JSON 解析失败|figure_scene 无效|figure_scene 不是对象|不是可解析的 JSON/.test(
      message,
    )
  ) {
    return "figure.scene.parse_failed";
  }
  if (/figure_scene|math\.geometry|math\.function|配图/.test(message)) {
    return "figure.scene.invalid";
  }
  if (/题目数量|须恰好.*道题|当前.*道/.test(message)) {
    return "generation.count.mismatch";
  }
  if (/JSON|解析|tool_calls|submit_exam/.test(message)) {
    return "generation.parse.failed";
  }
  return "generation.other";
}

/** 运行时规则表中的脱敏摘要（若匹配） */
export function runtimeIssueSummary(message: string): string | null {
  const rule = matchRuntimeRule(message);
  return rule?.summary?.trim() || null;
}

export function isLearningScopePackSubjectConsistent(scope: LearningScope): boolean {
  return diagramPackMatchesSubject(scope.pack, scope.subject);
}

export function buildApprovedLearningHints(
  rules: ApprovedGenerationLearningRule[],
  scope: LearningScope,
): string {
  // 请求 scope 若已声明 pack+subject 但不一致，不注入任何 hints（防误用）
  if (!isLearningScopePackSubjectConsistent(scope)) return "";

  const applicable = rules.filter((rule) => {
    if (rule.kind === "ops_advisory") return false;
    if (!isLearningScopePackSubjectConsistent(rule.scope)) return false;
    if (rule.scope.stage !== scope.stage) return false;
    if (rule.scope.subject && scope.subject && rule.scope.subject !== scope.subject) {
      return false;
    }
    if (rule.scope.pack && scope.pack && rule.scope.pack !== scope.pack) return false;
    // 规则带 pack、请求带 subject：再验一次同族（规则 subject 可空）
    if (rule.scope.pack && scope.subject && !diagramPackMatchesSubject(rule.scope.pack, scope.subject)) {
      return false;
    }
    if (scope.pack && rule.scope.subject && !diagramPackMatchesSubject(scope.pack, rule.scope.subject)) {
      return false;
    }
    return true;
  });
  const hints = [
    ...new Set(
      applicable
        .map((rule) => LEARNING_STRATEGY_HINTS[rule.strategyId])
        .filter((h) => String(h ?? "").trim().length > 0),
    ),
  ];
  if (hints.length === 0) return "";
  return [
    "【已审批学习策略】以下策略来自可审计失败证据并已由管理员批准；仅作为生成约束，不得覆盖题干事实：",
    ...hints.map((hint) => `- ${hint}`),
  ].join("\n");
}
