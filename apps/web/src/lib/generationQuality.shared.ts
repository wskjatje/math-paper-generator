/**
 * 校验失败分类与生成「质量补强」文案（前后端均可引用，无 IO）。
 */

export type GenerationErrorCategory =
  | "mcq_options"
  | "multipart_answer"
  | "equation_verify"
  | "empty_field"
  | "other";

/** 展示用（设置页、调试） */
export const GENERATION_ERROR_CATEGORY_LABELS: Record<GenerationErrorCategory, string> = {
  mcq_options: "选择题 options",
  multipart_answer: "多问 answer 编号",
  equation_verify: "方程数值/代入验算",
  empty_field: "空题干或空答案",
  other: "其它格式",
};

/** 从单条校验文案推断类别（用于统计习惯） */
export function categorizeValidationIssue(issue: string): GenerationErrorCategory {
  const s = issue;
  if (/options|选择题|多选题/.test(s)) return "mcq_options";
  if (/（1）|多问|逐问/.test(s)) return "multipart_answer";
  if (/方程|代入|根|矛盾/.test(s)) return "equation_verify";
  if (/为空/.test(s)) return "empty_field";
  return "other";
}

/** 将多次失败类别汇总为给模型的简短提醒（与具体错题无关的通用补强） */
export function buildHabitQualityHints(categoryCounts: Record<string, number>): string {
  const entries = Object.entries(categoryCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (entries.length === 0) return "";

  const lines: string[] = [
    "【习惯统计】根据您近期命题记录，请重点避免下列问题（不必复述统计数字）：",
  ];
  for (const [key, n] of entries) {
    const cat = key as GenerationErrorCategory;
    const label = GENERATION_ERROR_CATEGORY_LABELS[cat] ?? cat;
    lines.push(`- ${label}：曾反复出现（约 ${n} 次相关），本次务必自检。`);
  }
  lines.push(
    "选择题：options 必须为至少 4 个独立字符串；可把选项写在题干末尾每行 A. B. C. D.。",
    "多问：题干有（1）（2）时 answer 须写齐编号。",
    "计算题：结论须与方程自洽。",
  );
  return lines.join("\n");
}

/**
 * 自主学习补强：结合累计成败比、连续成功与残留薄弱类别，动态调整提示强度（无外部上传）。
 */
export function buildAutonomousLearningHints(input: {
  categoryCounts: Record<string, number>;
  successCount: number;
  failCount: number;
  consecutiveSuccesses: number;
}): string {
  const { successCount: sc, failCount: fc, consecutiveSuccesses: streak } = input;
  const total = sc + fc;
  const failRate = total > 0 ? fc / total : 0;
  const lines: string[] = [];

  if (total >= 4 && failRate >= 0.35) {
    lines.push(
      "【自主学习·强化】近期命题未通过校验的比例偏高：在调用 submit_exam 前请逐项自检：选择题 options 至少 4 条、多问 answer 与题干编号一致、方程类须在解析中体现代入验算。",
    );
  } else if (total >= 2 && failRate >= 0.2 && fc >= 2) {
    lines.push(
      "【自主学习】建议本题提交前对易错点做一次快速自检（选项条数、多问编号、空字段）。",
    );
  }

  if (streak >= 6) {
    lines.push(
      `【自主学习·稳定】在当前年级/学科场景下已连续 ${streak} 次命题成功，保持 options 与答案一致性即可；若更换学段或学科，系统会重新校准提示强度。`,
    );
  } else if (streak >= 3 && streak < 6) {
    lines.push("【自主学习】最近几次命题均通过校验，可适当精简篇幅但仍须满足 schema。");
  }

  const top = Object.entries(input.categoryCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const label = GENERATION_ERROR_CATEGORY_LABELS[top[0] as GenerationErrorCategory] ?? top[0];
    lines.push(`【自主学习·聚焦】统计上「${label}」仍较易出现，本题对该类题型请加倍核对。`);
  }

  return lines.join("\n");
}

/** 服务端：根据本轮校验问题生成重试专用补强（含具体题号） */
export function buildRetryQualityHintsFromIssues(issues: string[]): string {
  if (issues.length === 0) return "";
  const lines = issues.slice(0, 10).map((s) => `• ${s}`);
  return [
    "【紧急修正】以下内容未通过服务端校验，本次输出必须全部修正后再提交 submit_exam：",
    ...lines,
    "选择题 multiple_choice（含 multi）须填 options 数组至少 4 条字符串；",
    "多问须在 answer 中按（1）（2）…逐问给结论；",
    "方程类答案须代入原式验算无误。",
  ].join("\n");
}
