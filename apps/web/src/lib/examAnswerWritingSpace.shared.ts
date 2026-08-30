/**
 * 卷面非选择题书写区高度：按 type / type_label 形态表驱动匹配，跨学科共用。
 * 禁止按题号或单卷硬编码。
 *
 * 默认策略：选择题 / 填空不留大块空档；其余题型命中 rules 或走 defaultMinHeightRem。
 */
import {
  PAPER_SURFACE_LAYOUT,
  type AnswerWritingSpaceConfig,
} from "@/config/examDomain";

function matchesAny(text: string, patterns: readonly string[] | undefined): boolean {
  const t = String(text ?? "");
  if (!t.trim() || !patterns?.length) return false;
  for (const raw of patterns) {
    const src = String(raw ?? "").trim();
    if (!src) continue;
    try {
      if (new RegExp(src, "i").test(t)) return true;
    } catch {
      /* 跳过非法正则 */
    }
  }
  return false;
}

/**
 * 解析书写区最小高度（rem）。0 = 不渲染留白。
 */
export function resolveAnswerWritingSpaceMinHeightRem(
  q: {
    type?: string | null;
    type_label?: string | null;
    options?: readonly string[] | null;
  },
  cfg: AnswerWritingSpaceConfig = PAPER_SURFACE_LAYOUT.answerWritingSpace,
): number {
  if (!cfg?.enabled) return 0;
  const opts = q.options;
  if (
    cfg.skipWhenHasChoiceOptions &&
    Array.isArray(opts) &&
    opts.some((o) => String(o ?? "").trim())
  ) {
    return 0;
  }
  const typeId = String(q.type ?? "");
  const typeLabel = String(q.type_label ?? "");
  if (
    matchesAny(typeId, cfg.excludeTypeIdPatterns) ||
    matchesAny(typeLabel, cfg.excludeTypeLabelPatterns)
  ) {
    return 0;
  }
  for (const rule of cfg.rules ?? []) {
    const minH = Number(rule.minHeightRem);
    if (!Number.isFinite(minH) || minH <= 0) continue;
    const hitType = matchesAny(typeId, rule.typeIdPatterns);
    const hitLabel = matchesAny(typeLabel, rule.typeLabelPatterns);
    if (hitType || hitLabel) return minH;
  }
  const fallback = Number(cfg.defaultMinHeightRem);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}
