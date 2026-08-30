/**
 * 卷面/入库/选项比对用的文本规范化。
 * 开关与映射来自 exam-domain.json → textNormalization，禁止按题硬编码。
 */
import {
  TEXT_NORMALIZATION,
  type TextNormalizationConfig,
} from "@/config/examDomain";
import { normalizeExamTextUnicodeNoise } from "@/lib/sanitizeExamMathDisplay";

function applyFullwidthPunctMap(
  s: string,
  cfg: TextNormalizationConfig,
): string {
  const map = cfg.fullwidthPunctMap ?? {};
  let out = s;
  for (const [from, to] of Object.entries(map)) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

/** 展示/入库：零宽与 Unicode 空白（按配置） */
export function applyExamTextNormalizationForPersist(
  raw: string,
  cfg: TextNormalizationConfig = TEXT_NORMALIZATION,
): string {
  if (!raw || typeof raw !== "string") return raw;
  if (!cfg.applyUnicodeNoiseOnPersist) return raw;
  let out = raw;
  if (cfg.stripZeroWidth || cfg.normalizeUnicodeSpaces) {
    out = normalizeExamTextUnicodeNoise(out);
  }
  return out;
}

/** 展示链：与 persist 同规则时再跑一遍（幂等） */
export function applyExamTextNormalizationForDisplay(
  raw: string,
  cfg: TextNormalizationConfig = TEXT_NORMALIZATION,
): string {
  if (!raw || typeof raw !== "string") return raw;
  if (!cfg.applyUnicodeNoiseOnDisplay) return raw;
  let out = raw;
  if (cfg.stripZeroWidth || cfg.normalizeUnicodeSpaces) {
    out = normalizeExamTextUnicodeNoise(out);
  }
  return out;
}

/**
 * 选项去重/重复判定键：在 Unicode 噪声清理后，可选把配置表中的全角标点映到半角。
 * 不改写卷面展示原文。
 */
export function normalizeTextForOptionCompare(
  raw: string,
  cfg: TextNormalizationConfig = TEXT_NORMALIZATION,
): string {
  let out = String(raw ?? "");
  if (cfg.applyOnOptionDedupKey) {
    if (cfg.stripZeroWidth || cfg.normalizeUnicodeSpaces) {
      out = normalizeExamTextUnicodeNoise(out);
    }
    if (cfg.fullwidthPunctToHalfwidthForCompare) {
      out = applyFullwidthPunctMap(out, cfg);
    }
  }
  return out;
}
