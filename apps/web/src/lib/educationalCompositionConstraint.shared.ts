/**
 * P2.4 — cognition-preserving composition constraints（ECM v0）。
 */
import type { CompositionConstraintV1 } from "@/lib/educationalAst.shared";

export function compositionForEnumeration(
  sectionLabel: string,
  enumLabel: string,
  opts?: { withFigure?: boolean },
): CompositionConstraintV1 {
  const id = `sec-${sectionLabel}-enum-${enumLabel}`;
  return {
    cognitiveGroupId: id,
    keepWithNext: true,
    avoidBreakInside: true,
    keepEnumerationTogether: true,
    avoidMathBreak: true,
    keepWithFigure: opts?.withFigure === true,
    readingPriority: opts?.withFigure ? 90 : 70,
  };
}

export function compositionForAnchoredFigure(
  cognitiveGroupId: string,
): CompositionConstraintV1 {
  return {
    cognitiveGroupId,
    keepWithNext: true,
    avoidBreakInside: true,
    keepWithFigure: true,
    readingPriority: 85,
  };
}

export function compositionClassNames(c: CompositionConstraintV1 | undefined): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.avoidBreakInside || c.keepWithNext) parts.push("break-inside-avoid");
  if (c.avoidMathBreak) parts.push("math-paper-avoid-math-break");
  if (c.cognitiveGroupId) parts.push("math-paper-cognitive-group");
  return parts.join(" ");
}
