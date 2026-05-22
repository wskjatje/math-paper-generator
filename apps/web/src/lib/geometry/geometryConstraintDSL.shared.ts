/**
 * 几何窄域约束的可序列化描述（为后续约束求解器铺路）。
 * v1：正方形环 + 顺/逆时针 + 点在边上 + 可选轴对齐矩形。
 */
import { z } from "zod";

export const PointOnSegmentV1 = z.object({
  point: z.string().min(1).max(8),
  segment: z.tuple([z.string().min(1).max(8), z.string().min(1).max(8)]),
});

export const SquareChainConstraintV1Schema = z.object({
  version: z.literal("square_chain_v1"),
  square_cycle: z.tuple([
    z.string().min(1).max(8),
    z.string().min(1).max(8),
    z.string().min(1).max(8),
    z.string().min(1).max(8),
  ]),
  winding: z.enum(["ccw", "cw"]),
  point_on_edges: z.array(PointOnSegmentV1),
  rectangle: z
    .object({
      vertices: z.tuple([
        z.string().min(1).max(8),
        z.string().min(1).max(8),
        z.string().min(1).max(8),
        z.string().min(1).max(8),
      ]),
    })
    .optional(),
});

export type SquareChainConstraintV1 = z.infer<typeof SquareChainConstraintV1Schema>;
