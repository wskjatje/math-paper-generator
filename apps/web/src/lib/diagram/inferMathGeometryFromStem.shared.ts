/**
 * 题干 → scene：仅委托「几何事实/数值约束」构图。
 * 已删除关键词套模板路径（禁止瞎猜）。
 */

import {
  buildSceneFromGeometryFacts,
  tryBuildAndRenderFromGeometryFacts,
} from "./geometryFacts.shared";
import type { MathGeometryScene } from "./mathGeometry.shared";

/** @deprecated 使用 buildSceneFromGeometryFacts */
export function inferMathGeometrySceneFromStem(
  content: string,
  alt?: string,
): MathGeometryScene | null {
  return buildSceneFromGeometryFacts(content, alt);
}

export function tryInferAndRenderMathGeometry(
  content: string,
  alt?: string,
): { ok: true; scene: MathGeometryScene; svg: string } | { ok: false; reason: string } {
  return tryBuildAndRenderFromGeometryFacts(content, alt);
}
