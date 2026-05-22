/**
 * P5 · Diagram IR（统一几何中间表示）契约层。
 *
 * - **`diagramSchemaToIr` / `diagramSchemaToIrWithDiagnostics`**：`diagram_schema` → IR 子集 normalize + **normalize diagnostics**（不进 IR 本体）。
 * - **`ocrGeometryToIr`**：占位，待 OCR 契约稳定后实现。
 *
 * 演进：`source → normalize → DiagramIrV1 →（后续）renderer / export / AI`。
 */

import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

/** 几何语义来源（可信度与降级策略由 policy 层解释，不在 IR 内硬编码业务规则）。 */
export type DiagramIrSourceV1 =
  | "ocr_primitives"
  | "rule_geometry"
  | "llm_geometry"
  | "raster_trace"
  | "manual";

export type DiagramIrConfidenceV1 = "high" | "medium" | "low";

export type PointPrimitiveV1 = {
  type: "point";
  id: string;
  x: number;
  y: number;
  label?: string;
};

export type LinePrimitiveV1 = {
  type: "line";
  /** 端点 id（与 {@link PointPrimitiveV1} id 对齐）或占位引用 */
  from: string;
  to: string;
  dashed?: boolean;
};

export type CirclePrimitiveV1 = {
  type: "circle";
  center: string;
  radius?: number;
  through?: string;
};

export type TextPrimitiveV1 = {
  type: "text";
  /** 锚点 id 或画布相对位置，由 renderer 解释 */
  anchor: string;
  content: string;
};

/** 第一版最小图元并集；后续可扩展 arc、polygon、region 等，仍保持 discriminated `type`。 */
export type DiagramPrimitiveV1 =
  | PointPrimitiveV1
  | LinePrimitiveV1
  | CirclePrimitiveV1
  | TextPrimitiveV1;

/**
 * `diagram_schema` → {@link DiagramIrV1} 子集 normalizer 的**系统级能力契约**（稳定、与单次 schema 无关）。
 *
 * - **`supportedPrimitiveKinds`**：本子集实际写入 IR 的图元种类。
 * - **`omittedGeometryKinds`**：自 `diagram_schema` 读取、但本子集**不映射**进 IR 的几何大类（能力边界）。
 *
 * 实例级「本次丢了什么」见 {@link DiagramIrNormalizeDiagnostics.omittedKinds}；勿与常量混为一谈。
 */
export const DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1 = {
  version: 1 as const,
  subsetId: "v1_subset_points_segments" as const,
  supportedPrimitiveKinds: ["point", "line"] as const,
  omittedGeometryKinds: ["circle", "arc"] as const,
} as const;

export type DiagramIrNormalizerCapabilitiesV1 = typeof DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1;

export interface DiagramIrV1 {
  version: 1;
  source: DiagramIrSourceV1;
  confidence?: DiagramIrConfidenceV1;
  primitives?: DiagramPrimitiveV1[];
  viewport?: {
    width: number;
    height: number;
  };
  /**
   * 仅放**本图实例**相关元数据（如来源 layout_engine、normalize 子集 id、能力表版本指针）。
   * **不要**在此重复写入系统级能力列表：见 {@link DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1}；
   * **不要**与 {@link DiagramIrNormalizeDiagnostics} 混用（后者为单次 normalize 观测）。
   */
  metadata?: Record<string, unknown>;
}

const IR_SOURCES: ReadonlySet<DiagramIrSourceV1> = new Set([
  "ocr_primitives",
  "rule_geometry",
  "llm_geometry",
  "raster_trace",
  "manual",
]);

const IR_CONFIDENCE: ReadonlySet<DiagramIrConfidenceV1> = new Set(["high", "medium", "low"]);

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parsePointPrimitive(o: Record<string, unknown>): PointPrimitiveV1 | null {
  if (o.type !== "point") return null;
  const id = typeof o.id === "string" && o.id.length > 0 ? o.id : null;
  if (!id || !isFiniteNum(o.x) || !isFiniteNum(o.y)) return null;
  const label = typeof o.label === "string" ? o.label : undefined;
  return { type: "point", id, x: o.x, y: o.y, ...(label !== undefined ? { label } : {}) };
}

function parseLinePrimitive(o: Record<string, unknown>): LinePrimitiveV1 | null {
  if (o.type !== "line") return null;
  const from = typeof o.from === "string" && o.from.length > 0 ? o.from : null;
  const to = typeof o.to === "string" && o.to.length > 0 ? o.to : null;
  if (!from || !to) return null;
  const dashed = o.dashed === true ? true : undefined;
  return { type: "line", from, to, ...(dashed ? { dashed: true } : {}) };
}

function parseCirclePrimitive(o: Record<string, unknown>): CirclePrimitiveV1 | null {
  if (o.type !== "circle") return null;
  const center = typeof o.center === "string" && o.center.length > 0 ? o.center : null;
  if (!center) return null;
  const radius = isFiniteNum(o.radius) ? o.radius : undefined;
  const through =
    typeof o.through === "string" && o.through.length > 0 ? o.through : undefined;
  return {
    type: "circle",
    center,
    ...(radius !== undefined ? { radius } : {}),
    ...(through !== undefined ? { through } : {}),
  };
}

function parseTextPrimitive(o: Record<string, unknown>): TextPrimitiveV1 | null {
  if (o.type !== "text") return null;
  const anchor = typeof o.anchor === "string" && o.anchor.length > 0 ? o.anchor : null;
  const content = typeof o.content === "string" ? o.content : null;
  if (!anchor || content == null) return null;
  return { type: "text", anchor, content };
}

function parsePrimitive(raw: unknown): DiagramPrimitiveV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "point":
      return parsePointPrimitive(o);
    case "line":
      return parseLinePrimitive(o);
    case "circle":
      return parseCirclePrimitive(o);
    case "text":
      return parseTextPrimitive(o);
    default:
      return null;
  }
}

function parseViewport(raw: unknown): DiagramIrV1["viewport"] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isFiniteNum(o.width) || !isFiniteNum(o.height)) return null;
  return { width: o.width, height: o.height };
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return { ...(raw as Record<string, unknown>) };
}

/**
 * 宽松校验：用于持久化 JSON / 管线边界；严格语义等价由后续 normalize 承担。
 */
export function parseDiagramIrV1(raw: unknown): DiagramIrV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const source = o.source;
  if (typeof source !== "string" || !IR_SOURCES.has(source as DiagramIrSourceV1)) return null;

  let confidence: DiagramIrConfidenceV1 | undefined;
  if (o.confidence != null) {
    if (typeof o.confidence !== "string" || !IR_CONFIDENCE.has(o.confidence as DiagramIrConfidenceV1)) {
      return null;
    }
    confidence = o.confidence as DiagramIrConfidenceV1;
  }

  let primitives: DiagramPrimitiveV1[] | undefined;
  if (o.primitives != null) {
    if (!Array.isArray(o.primitives)) return null;
    const out: DiagramPrimitiveV1[] = [];
    for (const p of o.primitives) {
      const one = parsePrimitive(p);
      if (!one) return null;
      out.push(one);
    }
    primitives = out.length ? out : undefined;
  }

  const viewport = o.viewport != null ? parseViewport(o.viewport) : null;
  if (o.viewport != null && !viewport) return null;

  const metadata = parseMetadata(o.metadata);

  return {
    version: 1,
    source: source as DiagramIrSourceV1,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(primitives !== undefined ? { primitives } : {}),
    ...(viewport ? { viewport } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function segmentKeyUndirected(a: string, b: string): string {
  return a <= b ? `${a}\0${b}` : `${b}\0${a}`;
}

function irSourceFromDiagramSchemaMeta(
  meta: GeometryDiagramSchemaV1["meta"] | undefined,
): DiagramIrSourceV1 {
  const le = meta?.layout_engine;
  if (le && le !== "ai_coordinates") return "rule_geometry";
  return "llm_geometry";
}

/**
 * `diagram_schema` → IR 的 **normalize 可观测性**（不进 {@link DiagramIrV1} 本体，避免与几何真值混写）。
 * 供单测、调试与未来 CI 门禁：追踪省略种类、非法引用、图元计数等。
 */
export interface DiagramIrNormalizeDiagnostics {
  /** 本 schema 中存在、但当前 normalize 未映射进 IR 的几何大类（如圆、弧）。 */
  omittedKinds: string[];
  /**
   * 存在于 `diagram_schema`、但未参与 IR 子集映射的字段路径（仅观测，不表示错误）。
   * 例：`meta.layout_template_id`、`meta.constraint_dsl`。
   */
  unknownTopLevelKeys?: string[];
  /** `segments` / `segments_dashed` 中端点 id 不在 `points` 内的边条数（每条边计一次）。 */
  invalidReferences: number;
  /** 输出 IR 图元按 `type` 计数。 */
  primitiveCounts: Record<string, number>;
}

function countPrimitiveTypes(primitives: DiagramPrimitiveV1[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of primitives) {
    c[p.type] = (c[p.type] ?? 0) + 1;
  }
  return c;
}

function collectUnknownTopLevelKeys(schema: GeometryDiagramSchemaV1): string[] | undefined {
  const keys: string[] = [];
  const m = schema.meta;
  if (m?.layout_template_id != null && String(m.layout_template_id).trim() !== "") {
    keys.push("meta.layout_template_id");
  }
  if (m?.constraint_dsl != null) {
    keys.push("meta.constraint_dsl");
  }
  return keys.length ? keys : undefined;
}

function collectOmittedKindsFromSchema(schema: GeometryDiagramSchemaV1): string[] {
  const out: string[] = [];
  if (schema.circles != null && schema.circles.length > 0) out.push("circle");
  if (schema.arcs != null && schema.arcs.length > 0) out.push("arc");
  return out;
}

function countInvalidSegmentReferences(
  schema: GeometryDiagramSchemaV1,
  pointIds: ReadonlySet<string>,
): number {
  let n = 0;
  const visit = (from: string, to: string) => {
    if (!pointIds.has(from) || !pointIds.has(to)) n++;
  };
  for (const [from, to] of schema.segments) visit(from, to);
  for (const [from, to] of schema.segments_dashed ?? []) visit(from, to);
  return n;
}

/**
 * `diagram_schema`（学科示意图 v1）→ Diagram IR **子集** normalize + **diagnostics**。
 *
 * 映射规则同 {@link diagramSchemaToIr}；`diagnostics` 始终返回（`schema` 为 null 时为「空观测」）。
 */
export function diagramSchemaToIrWithDiagnostics(
  schema: GeometryDiagramSchemaV1 | null | undefined,
): { ir: DiagramIrV1 | null; diagnostics: DiagramIrNormalizeDiagnostics } {
  if (!schema) {
    return {
      ir: null,
      diagnostics: {
        omittedKinds: [],
        invalidReferences: 0,
        primitiveCounts: {},
      },
    };
  }

  const pointIds = new Set(schema.points.map((p) => p.id));
  const invalidReferences = countInvalidSegmentReferences(schema, pointIds);
  const omittedKinds = collectOmittedKindsFromSchema(schema);
  const unknownTopLevelKeys = collectUnknownTopLevelKeys(schema);

  const primitives: DiagramPrimitiveV1[] = [];

  for (const p of schema.points) {
    const label =
      p.label != null && String(p.label).trim() !== ""
        ? String(p.label).slice(0, 8)
        : undefined;
    primitives.push({
      type: "point",
      id: p.id,
      x: p.x,
      y: p.y,
      ...(label !== undefined ? { label } : {}),
    });
  }

  const dashedUndirected = new Set<string>();
  for (const [a, b] of schema.segments_dashed ?? []) {
    dashedUndirected.add(segmentKeyUndirected(a, b));
  }

  const solidUndirected = new Set<string>();
  for (const [from, to] of schema.segments) {
    if (!pointIds.has(from) || !pointIds.has(to)) continue;
    solidUndirected.add(segmentKeyUndirected(from, to));
    primitives.push({
      type: "line",
      from,
      to,
      ...(dashedUndirected.has(segmentKeyUndirected(from, to)) ? { dashed: true } : {}),
    });
  }

  for (const [from, to] of schema.segments_dashed ?? []) {
    if (!pointIds.has(from) || !pointIds.has(to)) continue;
    const k = segmentKeyUndirected(from, to);
    if (solidUndirected.has(k)) continue;
    primitives.push({ type: "line", from, to, dashed: true });
  }

  const primitiveCounts = countPrimitiveTypes(primitives);

  if (primitives.length === 0) {
    return {
      ir: null,
      diagnostics: {
        omittedKinds,
        ...(unknownTopLevelKeys !== undefined ? { unknownTopLevelKeys } : {}),
        invalidReferences,
        primitiveCounts,
      },
    };
  }

  const canvas = schema.canvas;
  const viewport =
    canvas &&
    typeof canvas.width === "number" &&
    typeof canvas.height === "number" &&
    Number.isFinite(canvas.width) &&
    Number.isFinite(canvas.height)
      ? { width: canvas.width, height: canvas.height }
      : { width: 100, height: 100 };

  const ir: DiagramIrV1 = {
    version: 1,
    source: irSourceFromDiagramSchemaMeta(schema.meta),
    primitives,
    viewport,
    metadata: {
      diagram_schema_normalize: DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1.subsetId,
      diagram_schema_layout_engine: schema.meta?.layout_engine ?? null,
      /** 与 {@link DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1.version} 对齐，便于下游按版本选 capability，而非把能力写进「图实例」语义。 */
      normalizer_capabilities_version: DIAGRAM_IR_NORMALIZER_CAPABILITIES_V1.version,
    },
  };

  return {
    ir,
    diagnostics: {
      omittedKinds,
      ...(unknownTopLevelKeys !== undefined ? { unknownTopLevelKeys } : {}),
      invalidReferences,
      primitiveCounts,
    },
  };
}

/**
 * `diagram_schema`（学科示意图 v1）→ Diagram IR **子集** normalize（单向观察格式）。
 *
 * 当前仅映射：**点**、**线段**（含 `segments_dashed` 的虚线标记）、**schema 自带的点 `label`**（写在 {@link PointPrimitiveV1} 上，不另造无坐标 Text）。
 * **不映射**：圆、圆弧、其它扩展；不补全缺失端点、不推断新几何。
 * 无端点引用或无法形成任一点/线时返回 `null`。可观测细节见 {@link diagramSchemaToIrWithDiagnostics}。
 */
export function diagramSchemaToIr(schema: GeometryDiagramSchemaV1 | null | undefined): DiagramIrV1 | null {
  return diagramSchemaToIrWithDiagnostics(schema).ir;
}

/** OCR / 版面结构化几何 → Diagram IR。占位：待与网关 structured JSON 字段对齐后实现。 */
export function ocrGeometryToIr(_raw: unknown): DiagramIrV1 | null {
  return null;
}
