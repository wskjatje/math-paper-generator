/**
 * 导入保真：来源文本与发布文本的确定性一致性校验。
 * 不做语义猜测；只比对可抽取的数值、根式、点名、小问编号与题图数量。
 */
import type { ImportReviewFinding } from "@/lib/documentExtraction.shared";
import { randomUUID } from "node:crypto";

const RADICAL_NUM = /\d*\s*√\s*\d+|\d*\\sqrt\{?\d+\}?/g;
const PLAIN_NUM = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;
const POINT_LABEL = /(?:点|顶点|角)\s*\$?([A-Z])\$?|\$([A-Z])\(/g;
const SUBQ = /[（(]\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ1-9①②③④⑤⑥⑦⑧⑨]|[0-9]+)\s*[）)]/g;

function normalizeMathNoise(s: string): string {
  return s
    .replace(/\\sqrt\s*\{?\s*(\d+)\s*\}?/g, "√$1")
    .replace(/\s+/g, "")
    .replace(/\$/g, "");
}

function extractRadicals(s: string): string[] {
  const n = normalizeMathNoise(s);
  const out: string[] = [];
  for (const m of n.matchAll(RADICAL_NUM)) {
    out.push(m[0]!.replace(/\s+/g, ""));
  }
  return out.sort();
}

function extractNumbers(s: string): string[] {
  const n = normalizeMathNoise(s);
  // 去掉已计入根式的数字片段，减少重复
  const withoutRad = n.replace(RADICAL_NUM, " ");
  const out: string[] = [];
  for (const m of withoutRad.matchAll(PLAIN_NUM)) {
    out.push(m[0]!);
  }
  return out.sort();
}

function extractPointLabels(s: string): string[] {
  const found = new Set<string>();
  for (const m of s.matchAll(POINT_LABEL)) {
    const lab = (m[1] || m[2] || "").trim();
    if (lab) found.add(lab);
  }
  // $A(0,5)$ 形式
  for (const m of s.matchAll(/\$([A-Z])\s*\(/g)) {
    found.add(m[1]!);
  }
  return [...found].sort();
}

function extractSubquestionMarkers(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(SUBQ)) {
    out.push(m[1]!.trim());
  }
  return out;
}

function multisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export type FaithfulnessCompareInput = {
  questionIndex: number;
  sourceText: string;
  publishedText: string;
  sourceFigureCount: number;
  publishedFigureCount: number;
  regionIds?: string[];
};

/**
 * 对比来源 OCR/布局文本与发布题干；差异写入 findings（blocker 阻断确认入库）。
 */
export function compareSourceAndPublished(
  input: FaithfulnessCompareInput,
): ImportReviewFinding[] {
  const findings: ImportReviewFinding[] = [];
  const push = (
    code: ImportReviewFinding["code"],
    severity: ImportReviewFinding["severity"],
    summary: string,
    sourceSnippet?: string,
    publishedSnippet?: string,
  ) => {
    findings.push({
      id: randomUUID(),
      questionIndex: input.questionIndex,
      fieldPath: "content",
      severity,
      code,
      summary,
      sourceSnippet,
      publishedSnippet,
      regionIds: input.regionIds,
      resolved: false,
    });
  };

  const srcRad = extractRadicals(input.sourceText);
  const pubRad = extractRadicals(input.publishedText);
  if (!multisetEqual(srcRad, pubRad)) {
    push(
      "formula_mismatch",
      "blocker",
      `根式不一致：来源 [${srcRad.join(", ")}] vs 发布 [${pubRad.join(", ")}]`,
      srcRad.join(" "),
      pubRad.join(" "),
    );
  }

  const srcNums = extractNumbers(input.sourceText);
  const pubNums = extractNumbers(input.publishedText);
  // 仅当来源有明确数值且发布缺少或改写时报警（允许发布补写答案区数字）
  const missing = srcNums.filter((n) => !pubNums.includes(n));
  if (missing.length > 0 && srcNums.length >= 2) {
    push(
      "numeric_mismatch",
      "blocker",
      `发布题干缺少来源数值：${missing.slice(0, 8).join(", ")}`,
      missing.join(" "),
      pubNums.slice(0, 12).join(" "),
    );
  }

  const srcPts = extractPointLabels(input.sourceText);
  const pubPts = extractPointLabels(input.publishedText);
  const missingPts = srcPts.filter((p) => !pubPts.includes(p));
  if (missingPts.length > 0) {
    push(
      "point_label_mismatch",
      "warning",
      `发布题干可能丢失点名：${missingPts.join(", ")}`,
      srcPts.join(""),
      pubPts.join(""),
    );
  }

  const srcSub = extractSubquestionMarkers(input.sourceText);
  const pubSub = extractSubquestionMarkers(input.publishedText);
  if (srcSub.length > 0 && pubSub.length > 0 && srcSub.length !== pubSub.length) {
    push(
      "subquestion_mismatch",
      "blocker",
      `小问数量不一致：来源 ${srcSub.length} vs 发布 ${pubSub.length}`,
      srcSub.join(" "),
      pubSub.join(" "),
    );
  }

  if (
    input.sourceFigureCount > 0 &&
    input.publishedFigureCount < input.sourceFigureCount
  ) {
    push(
      "figure_count_mismatch",
      "blocker",
      `题图数量不足：来源检测到 ${input.sourceFigureCount} 幅，发布仅 ${input.publishedFigureCount} 幅`,
      String(input.sourceFigureCount),
      String(input.publishedFigureCount),
    );
  }

  return findings;
}

export function hasUnresolvedBlockers(findings: ImportReviewFinding[]): boolean {
  return findings.some((f) => f.severity === "blocker" && !f.resolved);
}
