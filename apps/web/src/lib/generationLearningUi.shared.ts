/**
 * 审计学习：仅用于界面展示的白话文案。
 * 注入模型的技术策略仍用 generationLearning.shared 的 LEARNING_STRATEGY_HINTS，勿混用。
 */

import type {
  LearningIssueCode,
  LearningScope,
  LearningStrategyId,
  LearningEventOutcome,
} from "@/lib/generationLearning.shared";

const ISSUE_LABEL: Record<LearningIssueCode, string> = {
  "question.content.empty": "题干缺失",
  "question.answer.empty": "答案缺失",
  "mcq.options.too_few": "选择题选项不足",
  "mcq.options.blank": "选择题选项空白",
  "mcq.options.duplicate": "选择题选项重复",
  "mcq.count_option_suspicious": "计数题选项范围可疑",
  "mcq.multi_answer_invalid": "多选答案不完整",
  "answer.multipart.missing": "多问答案不完整",
  "answer.equation.invalid": "算式或验算有误",
  "solution.answer_conflict": "解析与答案冲突",
  "alignment.grade_track_conflict": "年级与竞赛定位冲突",
  "domain.physics_dimension": "物理量纲错误",
  "domain.mass_fraction": "质量分数验算不符",
  "figure.scene.missing": "需要配图但未给出可用图",
  "figure.scene.invalid": "配图与题目要求不一致",
  "figure.scene.parse_failed": "配图信息格式无法识别",
  "figure.render.failed": "配图生成失败",
  "generation.count.mismatch": "题目数量与设置不符",
  "generation.parse.failed": "试卷结构无法识别",
  "generation.other": "其他生成问题",
  "runtime.api_incompatible": "模型接口不兼容",
  "runtime.fetch_failed": "无法连接 AI 服务",
};

const STRATEGY_USER_BLURB: Record<LearningStrategyId, string> = {
  require_nonempty_fields: "题干和答案都要写全，不要留空。",
  require_mcq_options: "选择题至少 4 个完整选项。",
  require_distinct_mcq_options: "选择题选项不能重复（含全角半角仅差）。",
  require_count_mcq_option_range: "计数选择题选项要覆盖合理范围，不要只用很小的整数糊弄。",
  require_multi_select_letter_validity: "多选题答案字母要对应选项；要求多项时至少选两个。",
  require_multipart_answers: "多问题目的答案要按编号写全。",
  verify_equations: "方程类题目先代回条件核对再出答案。",
  require_solution_answer_consistency: "解析结论要和最终答案一致，不要写无解却答成有解。",
  require_grade_track_alignment: "年级学段不要绑超阶竞赛标签。",
  verify_physics_dimension: "物理题不要把重力数值直接当质量。",
  verify_mass_fraction: "溶液质量分数要按溶质守恒验算。",
  require_valid_figure_scene: "写了「如图」就要配相符的示意图；画不出就改成不看图也能做的题。",
  require_pure_json_figure_scene: "配图说明按系统格式一次提交，不要夹杂解释文字。",
  require_expected_question_count: "题目总数和各题型数量要与设定一致。",
  prefer_openai_compat_model: "请到设置更换可用模型。",
  check_ai_endpoint_connectivity: "请检查 AI 服务是否可用。",
};

const STAGE_LABEL: Record<LearningScope["stage"], string> = {
  exam: "整卷命题",
  figure: "题图配图",
  text: "文本整理",
};

const OUTCOME_LABEL: Record<LearningEventOutcome, string> = {
  observed: "已发现",
  repaired: "已自动修复",
  passed: "已通过",
  failed: "仍失败",
};

const PACK_LABEL: Record<string, string> = {
  "math.geometry": "平面几何图",
  "math.function": "函数图像",
  "physics.mechanics": "力学示意图",
  "physics.circuit": "电路图",
  "physics.optics": "光学图",
  "chemistry.apparatus": "化学仪器图",
  "chemistry.particle": "微观粒子图",
};

export function learningIssueLabel(code: LearningIssueCode | string): string {
  return ISSUE_LABEL[code as LearningIssueCode] ?? "生成问题";
}

export function learningStrategyUserBlurb(id: LearningStrategyId | string): string {
  return (
    STRATEGY_USER_BLURB[id as LearningStrategyId] ??
    "批准后用于同类命题提醒。"
  );
}

export function learningStageLabel(stage: LearningScope["stage"] | string): string {
  return STAGE_LABEL[stage as LearningScope["stage"]] ?? "命题相关";
}

export function learningOutcomeLabel(outcome: LearningEventOutcome | string): string {
  return OUTCOME_LABEL[outcome as LearningEventOutcome] ?? outcome;
}

export function learningPackLabel(pack: string | undefined): string | undefined {
  if (!pack?.trim()) return undefined;
  return PACK_LABEL[pack] ?? "示意图类型";
}

/** 范围：学科 · 环节 · 图类（白话） */
export function learningScopeUserLabel(scope: LearningScope): string {
  const parts: string[] = [];
  if (scope.subject?.trim()) parts.push(scope.subject.trim());
  parts.push(learningStageLabel(scope.stage));
  const pack = learningPackLabel(scope.pack);
  if (pack) parts.push(pack);
  return parts.join(" · ");
}

/**
 * 诊断摘要展示：去掉路径、环境变量、英文接口名等开发信息。
 */
export function sanitizeLearningSummaryForUi(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "（无详细说明）";
  s = s
    .replace(/LOVABLE_API_KEY|SUPABASE_[A-Z_]+|MPG_[A-Z0-9_]+/gi, "云端服务配置")
    .replace(/data\/[a-z0-9_./-]+/gi, "本机数据")
    .replace(/figure_scene|JSON\.parse|Markdown|pending:\/\/figure/gi, "配图信息")
    .replace(/math\.(geometry|function)|physics\.(mechanics|circuit|optics)/gi, "示意图")
    .replace(/HTTP\s*\d{3}/gi, "接口错误")
    .replace(/forceApproved|scope|pack|stage/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s.length > 160) s = `${s.slice(0, 150)}…`;
  return s || "（无详细说明）";
}
