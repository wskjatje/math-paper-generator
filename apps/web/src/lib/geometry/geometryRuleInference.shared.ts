/**
 * 题干 → 先试规则解析 + 约束布局；失败则由调用方回退 LLM。
 */
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

import { buildAngleCopyDiagramSchema } from "@/lib/geometry/geometryAngleCopyLayout.shared";
import {
  stemLooksLikeRotationTriangleProblem,
  tryRotationTriangleDiagramSchema,
} from "@/lib/geometry/geometryRotationTriangle.shared";
import {
  stemLooksLikeSquareChainProblem,
  trySquareChainDiagramSchema,
} from "@/lib/geometry/geometrySquareChain.shared";
import { tryCartesianPlaneDiagramSchema } from "@/lib/geometry/geometryCartesianPlane.shared";
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";
import {
  parseOptionalSegmentLengths,
  parseTriangleVertices,
  stemLooksLikeAngleCopyConstruction,
} from "@/lib/geometry/geometryStemRuleParse.shared";

export function tryRuleBasedDiagramSchema(stem: string): GeometryDiagramSchemaV1 | null {
  const raw = stem.trim();
  if (!raw) return null;

  const cartesian = tryCartesianPlaneDiagramSchema(raw);
  if (cartesian) return cartesian;

  /** 坐标系卷：禁止尺规/正方形链模板顶替（即使坐标解析未凑满 3 点） */
  if (stemLooksLikeCoordinatePlaneExam(raw)) return null;

  if (stemLooksLikeAngleCopyConstruction(raw)) {
    const tri = parseTriangleVertices(raw);
    if (tri) {
      const lengths = parseOptionalSegmentLengths(raw);
      const angle = buildAngleCopyDiagramSchema(tri, lengths);
      if (angle) return angle;
    }
  }

  if (stemLooksLikeRotationTriangleProblem(raw)) {
    const rot = tryRotationTriangleDiagramSchema(raw);
    if (rot) return rot;
  }

  if (stemLooksLikeSquareChainProblem(raw)) {
    const sq = trySquareChainDiagramSchema(raw);
    if (sq) return sq;
  }

  return null;
}
