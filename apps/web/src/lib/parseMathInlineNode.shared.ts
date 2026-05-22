/**
 * P2.3.1 — transport token → MathInlineNode（math-native AST；非 markdown string）。
 */
import type {
  MathInlineNodeV1,
  MathKindV1,
  MathTypographyHintsV1,
} from "@/lib/educationalAst.shared";
import { repairPresentationMathLatex } from "@/lib/educationalPresentationMathRepair.shared";

function tokenizeMathRaw(raw: string, mathKind: MathKindV1): string[] {
  const t = raw.trim();
  if (mathKind === "geometry_triangle") {
    const m = t.match(/^(△)([A-Z][A-Z0-9'′]{0,4})$/);
    if (m) return [m[1]!, m[2]!];
    return [t];
  }
  if (mathKind === "geometry_angle") {
    const m = t.match(/^(∠)([A-Z]{2,6})$/);
    if (m) return [m[1]!, m[2]!];
    return [t];
  }
  if (mathKind === "coordinate_expr") {
    return t.match(/[A-Z][A-Z0-9'′]?|\(|\)|\d+|√\d+|\.|,|-/g) ?? [t];
  }
  if (mathKind === "radical_expr") {
    return t.match(/\d+|√\d+|\.|-/g) ?? [t];
  }
  return [t];
}

function typographyForKind(mathKind: MathKindV1): MathTypographyHintsV1 {
  switch (mathKind) {
    case "geometry_triangle":
      return { keepTogether: true, tightTracking: true, elevateSymbol: true };
    case "geometry_angle":
      return { keepTogether: true, tightTracking: true, elevateSymbol: true };
    case "coordinate_expr":
      return { keepTogether: true, coordinateTight: true, tightTracking: true };
    case "radical_expr":
      return { keepTogether: true, compactRadical: true };
    default:
      return { keepTogether: true };
  }
}

function inferMathKind(raw: string): MathKindV1 {
  const t = raw.trim();
  if (/^△[A-Z]/.test(t)) return "geometry_triangle";
  if (/^∠[A-Z]{2,}/.test(t)) return "geometry_angle";
  if (/^[A-Z][A-Z0-9'′]?\(/.test(t) || /^\(\s*-?\d+\s*,/.test(t)) return "coordinate_expr";
  if (/√/.test(t)) return "radical_expr";
  if (/^\$/.test(t) || /^\\\(/.test(t)) return "algebra_inline";
  return "algebra_inline";
}

/** 由 OCR/canonical 片段构建 MathInlineNode（唯一 math lowering 入口）。 */
export function parseMathInlineNode(raw: string): MathInlineNodeV1 {
  const mathKind = inferMathKind(raw);
  const latex = repairPresentationMathLatex(raw);
  return {
    kind: "math_inline",
    mathKind,
    raw: raw.trim(),
    latex,
    semanticTokens: tokenizeMathRaw(raw, mathKind),
    typographyHints: typographyForKind(mathKind),
  };
}

export function isMathInlineSegment(
  s: import("@/lib/educationalAst.shared").EducationalTextSegmentV1,
): s is MathInlineNodeV1 {
  return s.kind === "math_inline";
}

export function segmentPlainText(
  s: import("@/lib/educationalAst.shared").EducationalTextSegmentV1,
): string {
  return s.kind === "text" ? s.value : s.raw;
}
