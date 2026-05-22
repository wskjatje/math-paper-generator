/**
 * 几何「母图」模板：先定版式朝向，再按约束插点（行业教辅常见：非自由坐标猜点）。
 * 逻辑坐标 0–100，与 SVG 一致：y 向下增大。
 */
import type { Vec2 } from "@/lib/geometry/vec2.shared";

/**
 * 三角形 · 开口朝上（底边在下方）：
 * - 第 1 个命名顶点：左下
 * - 第 2 个：上（角尖）
 * - 第 3 个：右下
 *
 * 对应题干「△ABC」书写顺序下：A 左下、B 上、C 右下，与常见试卷印刷一致。
 */
export const TEXTBOOK_TRIANGLE_UPRIGHT_100 = {
  /** 第 1 个顶点（如 A） */
  slot1: { x: 10, y: 86 } as const,
  /** 第 2 个顶点（如 B） */
  slot2: { x: 50, y: 10 } as const,
  /** 第 3 个顶点（如 C） */
  slot3: { x: 90, y: 86 } as const,
} as const;

/**
 * 题干「△XYZ」书写顺序：第 1 个字母→左下、第 2 个→上、第 3 个→右下（教辅最常见朝向）。
 * 例如 `△BAC`：B 左下、A 上、C 右下。
 */
/** @param labels 题干三角形三个顶点字母顺序（仅用于 API 对称；坐标槽位与书写顺序一一对应） */
export function uprightTriangleSlotsForLabels(_labels: [string, string, string]): {
  slot: [Vec2, Vec2, Vec2];
} {
  const t = TEXTBOOK_TRIANGLE_UPRIGHT_100;
  const slot: [Vec2, Vec2, Vec2] = [
    { x: t.slot1.x, y: t.slot1.y },
    { x: t.slot2.x, y: t.slot2.y },
    { x: t.slot3.x, y: t.slot3.y },
  ];
  return { slot };
}
