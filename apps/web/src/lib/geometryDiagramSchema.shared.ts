/**
 * 学科示意图结构化描述（题干驱动 AI 推断 → SVG 重绘，不依赖扫描裁剪）。
 * v1：以点、线段、圆、圆弧为主——适用于数学平面几何，也可近似表达物理受力/光路、简单电路节点、化学装置示意等（复杂实景仍以附图 Markdown 为准）。
 */
import { zJson } from "@/lib/jsonZod.shared";
import { z } from "zod";

export const GeometryDiagramSchemaV1 = z.object({
  version: z.literal("1"),
  /** 逻辑画布：坐标系 0–100，便于模型输出稳定数值 */
  canvas: z
    .object({
      width: z.number().min(10).max(200).default(100),
      height: z.number().min(10).max(200).default(100),
    })
    .optional(),
  /** 生成来源：规则约束布局 vs 模型直接输出坐标 */
  meta: z
    .object({
      layout_engine: z
        .enum([
          "ai_coordinates",
          "angle_copy_constraints_v1",
          "angle_copy_constraints_v2",
          /** 正方形边界链 + 截线 EF + 轴对齐矩形 PMDN（程序求解，见 geometrySquareChain.shared.ts） */
          "square_chain_constraints_v1",
          /** 等腰三角形绕顶点旋转，且旋转后顶点落在边上（见 geometryRotationTriangle.shared.ts） */
          "rotation_triangle_constraints_v1",
          /** 平面直角坐标系 + 顶点坐标（见 geometryCartesianPlane.shared.ts） */
          "cartesian_coordinate_constraints_v1",
        ])
        .optional(),
      /** 母图模板标识，便于调试与扩展 */
      layout_template_id: z.string().max(80).optional(),
      /** 窄域约束快照（如 square_chain_v1），供调试与后续求解器对接 */
      constraint_dsl: zJson.optional(),
    })
    .optional(),
  /** 圆规弧（圆心 + 端点 id）；渲染为圆弧而非整圆 */
  arcs: z
    .array(
      z.object({
        center: z.string().min(1).max(16),
        from: z.string().min(1).max(16),
        to: z.string().min(1).max(16),
      }),
    )
    .optional(),
  points: z.array(
    z.object({
      id: z.string().min(1).max(16),
      x: z.number().min(-5).max(105),
      y: z.number().min(-5).max(105),
      label: z.string().max(8).optional(),
    }),
  ),
  segments: z.array(z.tuple([z.string().min(1).max(16), z.string().min(1).max(16)])),
  /** 辅助/裁掉部分等用虚线绘制（如实卷「截角」后 EB、BF） */
  segments_dashed: z
    .array(z.tuple([z.string().min(1).max(16), z.string().min(1).max(16)]))
    .optional(),
  circles: z
    .array(
      z.object({
        center: z.string().min(1).max(16),
        /** 与 canvas 同单位的半径；与 through 二选一优先 radius */
        radius: z.number().min(0.5).max(90).optional(),
        /** 圆经过的点 id，用于推算半径 */
        through: z.string().min(1).max(16).optional(),
      }),
    )
    .optional(),
});

export type GeometryDiagramSchemaV1 = z.infer<typeof GeometryDiagramSchemaV1>;

export function safeParseGeometryDiagramSchema(raw: unknown): GeometryDiagramSchemaV1 | null {
  const r = GeometryDiagramSchemaV1.safeParse(raw);
  return r.success ? r.data : null;
}

/** 从 AI 题目对象上兼容 snake_case / camelCase */
export function parseDiagramSchemaFromQuestionRecord(
  raw: Record<string, unknown>,
): GeometryDiagramSchemaV1 | null {
  const ds = raw.diagram_schema ?? raw.diagramSchema;
  if (ds == null || typeof ds !== "object") return null;
  return safeParseGeometryDiagramSchema(ds);
}
