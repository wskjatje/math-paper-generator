import { z } from "zod";

/** 二维点（数学坐标系：x 向右、y 向上，渲染层可自行翻转） */
export const Point2Schema = z.object({
  x: z.number(),
  y: z.number(),
});

export const GeometryElementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("point"),
    id: z.string(),
    at: Point2Schema,
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("segment"),
    id: z.string(),
    a: z.string(),
    b: z.string(),
  }),
  z.object({
    kind: z.literal("line"),
    id: z.string(),
    through: z.tuple([z.string(), z.string()]),
  }),
  z.object({
    kind: z.literal("circle"),
    id: z.string(),
    center: z.string(),
    radius: z.number().positive(),
  }),
  z.object({
    kind: z.literal("polygon"),
    id: z.string(),
    vertices: z.array(z.string()).min(3),
  }),
  z.object({
    kind: z.literal("angle"),
    id: z.string(),
    vertex: z.string(),
    p1: z.string(),
    p2: z.string(),
  }),
]);

export const GeometryGraphSchema = z.object({
  type: z.literal("geometry"),
  elements: z.array(GeometryElementSchema),
});

/** 函数图像：用采样点折线近似；解析式仅作元数据 */
export const FunctionPlotGraphSchema = z.object({
  type: z.literal("function_plot"),
  domain: z.tuple([z.number(), z.number()]),
  expression: z.string().optional(),
  samples: z.array(Point2Schema).min(2),
  axis_labels: z.object({ x: z.string().optional(), y: z.string().optional() }).optional(),
});

export const CircuitComponentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resistor"),
    id: z.string(),
    a: z.string(),
    b: z.string(),
    ohms: z.number().optional(),
  }),
  z.object({
    kind: z.literal("capacitor"),
    id: z.string(),
    a: z.string(),
    b: z.string(),
    farads: z.number().optional(),
  }),
  z.object({
    kind: z.literal("inductor"),
    id: z.string(),
    a: z.string(),
    b: z.string(),
    henries: z.number().optional(),
  }),
  z.object({
    kind: z.literal("voltage_source"),
    id: z.string(),
    positive: z.string(),
    negative: z.string(),
    volts: z.number().optional(),
  }),
  z.object({
    kind: z.literal("wire"),
    id: z.string(),
    a: z.string(),
    b: z.string(),
  }),
]);

export const CircuitGraphSchema = z.object({
  type: z.literal("circuit"),
  nodes: z.array(z.object({ id: z.string(), label: z.string().optional() })).min(1),
  components: z.array(CircuitComponentSchema),
});

export const ChemLabDeviceSchema = z.object({
  id: z.string(),
  role: z.enum(["flask", "beaker", "burner", "tube", "stand", "other"]),
  label: z.string().optional(),
  position: Point2Schema.optional(),
});

export const ChemLabGraphSchema = z.object({
  type: z.literal("chem_lab"),
  devices: z.array(ChemLabDeviceSchema),
  connections: z
    .array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
    .optional(),
});

export const BioStructureSchema = z.object({
  id: z.string(),
  name: z.string(),
  shape: z.enum(["ellipse", "rect", "polygon"]),
  points: z.array(Point2Schema).optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});

export const BioGraphSchema = z.object({
  type: z.literal("bio"),
  structures: z.array(BioStructureSchema).min(1),
  labels: z.array(z.object({ text: z.string(), at: Point2Schema })).optional(),
});

export const GraphDslSchema = z.discriminatedUnion("type", [
  GeometryGraphSchema,
  FunctionPlotGraphSchema,
  CircuitGraphSchema,
  ChemLabGraphSchema,
  BioGraphSchema,
]);

export type GraphDsl = z.infer<typeof GraphDslSchema>;
export type GeometryGraph = z.infer<typeof GeometryGraphSchema>;
export type FunctionPlotGraph = z.infer<typeof FunctionPlotGraphSchema>;
export type CircuitGraph = z.infer<typeof CircuitGraphSchema>;
export type ChemLabGraph = z.infer<typeof ChemLabGraphSchema>;
export type BioGraph = z.infer<typeof BioGraphSchema>;
