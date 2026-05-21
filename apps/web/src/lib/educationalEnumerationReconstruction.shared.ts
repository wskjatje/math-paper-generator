/**
 * Enumeration semantic reconstruction — 共图大题 (1)(2) 塌平 → （I）（II）①②。
 * Deterministic；不调用模型。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

const ROMAN_I = "（I）";
const ROMAN_II = "（II）";

export function shouldApplyEnumerationReconstruction(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  const hasFigPair = /图[①②]/.test(t) || /图\s*[（(]\s*[12]\s*[）)]/.test(t);
  const hasRepeatedFlatEnum =
    /[（(]\s*1\s*[）)][\s\S]{8,}?[（(]\s*2\s*[）)][\s\S]{8,}?[（(]\s*1\s*[）)]/.test(t);
  const coordinate = stemLooksLikeCoordinatePlaneExam(t);
  return (coordinate && hasFigPair) || (hasFigPair && hasRepeatedFlatEnum);
}

/**
 * 在 （II）段之后，将第二次出现的 (1)(2) 降为 ①②。
 */
function rejoinSubpartsUnderSectionII(text: string): string {
  const iiIdx = text.indexOf(ROMAN_II);
  if (iiIdx < 0) return text;
  const head = text.slice(0, iiIdx + ROMAN_II.length);
  let tail = text.slice(iiIdx + ROMAN_II.length);
  tail = tail.replace(/[（(]\s*1\s*[）)]\s*(如图②)/, "① $1");
  tail = tail.replace(/[（(]\s*1\s*[）)]\s*(如\s*图\s*②)/, "① $1");
  tail = tail.replace(/[（(]\s*2\s*[）)]\s*(当)/, "② $1");
  tail = tail.replace(/[（(]\s*2\s*[）)]\s*(求)/, "② $1");
  return head + tail;
}

/**
 * 首次 (1) 填空 / (2) 将… → （I）（II）。
 */
function promoteFirstLevelSections(text: string): string {
  let s = text;
  if (!s.includes(ROMAN_I) && /[（(]\s*1\s*[）)]\s*填空/.test(s)) {
    s = s.replace(/[（(]\s*1\s*[）)]\s*(填空)/, `${ROMAN_I}$1`);
  }
  if (!s.includes(ROMAN_II) && /[（(]\s*2\s*[）)]\s*将/.test(s)) {
    s = s.replace(/[（(]\s*2\s*[）)]\s*(将)/, `${ROMAN_II}$1`);
  }
  return s;
}

/** 行首孤立的 图① 图② 保留；正文内引用不动 */
export function runEnumerationSemanticReconstruction(raw: string): string {
  const text = String(raw ?? "");
  if (!shouldApplyEnumerationReconstruction(text)) return text;
  let s = promoteFirstLevelSections(text);
  s = rejoinSubpartsUnderSectionII(s);
  return s;
}
