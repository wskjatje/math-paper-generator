/**
 * 线下/网上导入「自主学习」：与命题 habits 同理念，按成功/失败与题面质量信号调整下次导入提示词。
 */
import type { SessionExamSnapshot } from "@/lib/examSession";

export const IMPORT_LEARNING_VERSION = 1 as const;

export type ImportIssueSignalKey =
  | "figure_markdown_lost"
  | "mcq_options_weak"
  | "solution_steps_thin";

export type StoredImportLearning = {
  version: typeof IMPORT_LEARNING_VERSION;
  /** 为 false 时不向导入模型注入「自主学习·导入」段 */
  autonomousLearningEnabled: boolean;
  successCount: number;
  failCount: number;
  consecutiveSuccesses: number;
  lastContextKey: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  /** 累计薄弱信号（浮点，成功时会衰减；单次导入会加权） */
  issueSignals: Partial<Record<ImportIssueSignalKey, number>>;
};

export function defaultStoredImportLearning(): StoredImportLearning {
  return {
    version: IMPORT_LEARNING_VERSION,
    autonomousLearningEnabled: true,
    successCount: 0,
    failCount: 0,
    consecutiveSuccesses: 0,
    lastContextKey: "",
    issueSignals: {},
  };
}

/** Markdown 图片行数量（与 importFigureReconcile 语义近似） */
export function countMarkdownImageLines(text: string): number {
  const re = /!\[[^\]]*\]\([^)]+\)/g;
  return [...text.matchAll(re)].length;
}

export type ImportBundleQualitySignals = {
  figureMarkdownRisk: boolean;
  mcqOptionsWeakCount: number;
  thinSolutionStepsCount: number;
};

/**
 * 对照抽取正文与入库快照：选择题选项条数、解析步数、附图是否疑似丢失。
 */
export function analyzeImportBundleSignals(
  sourcePlainText: string,
  bundle: SessionExamSnapshot,
): ImportBundleQualitySignals {
  const srcFig = countMarkdownImageLines(sourcePlainText);
  const contentJoined = bundle.questions.map((q) => q.content ?? "").join("\n");
  const bundleFig = countMarkdownImageLines(contentJoined);
  const figureMarkdownRisk = srcFig >= 2 && bundleFig < Math.max(1, srcFig - 1);

  let mcqOptionsWeakCount = 0;
  let thinSolutionStepsCount = 0;
  for (const q of bundle.questions) {
    if (
      (q.type === "multiple_choice" || q.type === "multiple_choice_multi") &&
      Array.isArray(q.options) &&
      q.options.filter((o) => String(o).trim().length > 0).length < 4
    ) {
      mcqOptionsWeakCount += 1;
    }
    const steps = Array.isArray(q.solution_steps) ? q.solution_steps : [];
    const nonempty = steps.filter((s) => String(s?.description ?? "").trim().length > 0);
    if (nonempty.length < 2) thinSolutionStepsCount += 1;
  }

  return {
    figureMarkdownRisk,
    mcqOptionsWeakCount,
    thinSolutionStepsCount,
  };
}

export function buildImportContextKey(grade?: string, subject?: string): string {
  const g = (grade ?? "").trim() || "_";
  const s = (subject ?? "").trim() || "_";
  return `${g}|${s}`;
}

/** 将 StoredImportLearning 转为导入 AI 用户提示前缀（空则不注入） */
export function buildImportAutonomousLearningHints(profile: StoredImportLearning): string {
  if (!profile.autonomousLearningEnabled) return "";

  const sc = profile.successCount;
  const fc = profile.failCount;
  const total = sc + fc;
  const failRate = total > 0 ? fc / total : 0;
  const streak = profile.consecutiveSuccesses;
  const lines: string[] = [];

  lines.push(
    "【自主学习·导入】以下为基于近期导入成功/失败与结构化质检累积的补强提示（请严格遵守附图与 schema，不必复述统计数字）：",
  );

  if (total >= 3 && failRate >= 0.35) {
    lines.push(
      "- 近期导入失败占比较高：务必保留原文全部 ![](…) 附图行；选择题 options 必须拆成至少 4 条独立字符串；每题 solution_steps 至少 2 步且含 reasoning。",
    );
  } else if (total >= 2 && failRate >= 0.22 && fc >= 2) {
    lines.push("- 建议在提交 submit_exam 前自检：附图 Markdown、选择题拆分、多问编号与解析步数。");
  }

  const sig = profile.issueSignals;
  const fig = sig.figure_markdown_lost ?? 0;
  const mcq = sig.mcq_options_weak ?? 0;
  const thin = sig.solution_steps_thin ?? 0;

  if (fig >= 2) {
    lines.push(
      `- 统计上多次出现「附图行疑似丢失」：请逐段核对原文 ![](…) ，确保每条仍出现在某一题的 content 中（可与题干同字段多行）。`,
    );
  }
  if (mcq >= 2) {
    lines.push(`- 选择题 options 数组曾多次不足 4 条：即使 OCR 粘连也请拆成四条互异选项字符串。`);
  }
  if (thin >= 2) {
    lines.push(
      `- 解析步骤曾多次偏少：每题至少两步 solution_steps，含 description 与 reasoning，公式用 LaTeX。`,
    );
  }

  if (streak >= 5 && profile.lastContextKey) {
    lines.push(
      `- 当前年级/学科上下文已连续 ${streak} 次导入成功入库：保持附图与选项拆分规范即可；若切换学科或题型混杂，仍须逐项自检。`,
    );
  } else if (streak >= 2 && streak < 5) {
    lines.push("- 近期导入较稳定：仍请勿省略附图 Markdown 行。");
  }

  return lines.join("\n");
}
