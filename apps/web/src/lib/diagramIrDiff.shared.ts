/**
 * P6-3 · Diagram IR 结构 diff（canonical 层对拍，不做 SVG 字符串比对、不做图同构对齐）。
 *
 * 用于：normalize / 模型 / OCR 升级前后的 **IR 漂移观测**；第一版仅 multiset 指纹 + 计数 + viewport + 拓扑告警。
 */

import type { DiagramIrSourceV1, DiagramIrV1, DiagramPrimitiveV1 } from "@/lib/diagramIr.shared";

export type DiagramIrPrimitiveFingerprint = string;

export interface DiagramIrPositionalMismatchV1 {
  index: number;
  /** 同序位置两侧图元指纹（仅当两 IR `primitives` 等长时填充）。 */
  fingerprintA: DiagramIrPrimitiveFingerprint;
  fingerprintB: DiagramIrPrimitiveFingerprint;
}

export interface DiagramIrDiffResultV1 {
  version: 1;
  /** 各 `type` 图元数量差：`countB[type] - countA[type]`。 */
  primitiveCountDelta: Record<string, number>;
  /** 仅当两侧均有 `viewport` 时给出 `b - a`。 */
  viewportDelta?: { dw: number; dh: number };
  /** 单侧或双侧 IR 内线段端点未解析到点 id 等（前缀 `[IR A]` / `[IR B]`）。 */
  topologyWarnings: string[];
  /**
   * 相对 multiset 而言仅在 B 侧多出的图元指纹（可重复，表示重数）。
   * 非图同构意义下的「新增」。
   */
  addedPrimitives: DiagramIrPrimitiveFingerprint[];
  /**
   * 相对 multiset 而言仅在 A 侧多出的图元指纹（可重复）。
   */
  removedPrimitives: DiagramIrPrimitiveFingerprint[];
  /**
   * 两侧 `primitives` **等长且同序**时，逐位指纹不同之索引（不做重排对齐）。
   */
  changedPrimitives: DiagramIrPositionalMismatchV1[];
  /** 扩展槽：引擎版本、来源字段等，避免把观测写回 IR 本体。 */
  diagnostics: {
    diffEngine: "diagram_ir_structural_v1";
    sourceA?: DiagramIrSourceV1;
    sourceB?: DiagramIrSourceV1;
  };
}

export function fingerprintDiagramIrPrimitive(
  p: DiagramPrimitiveV1,
): DiagramIrPrimitiveFingerprint {
  switch (p.type) {
    case "point":
      return `point:${p.id}:${p.x}:${p.y}:${p.label ?? ""}`;
    case "line":
      return `line:${p.from}:${p.to}:${p.dashed === true ? 1 : 0}`;
    case "circle":
      return `circle:${p.center}:${p.radius ?? ""}:${p.through ?? ""}`;
    case "text":
      return `text:${p.anchor}:${p.content}`;
    default: {
      const _x: never = p;
      return `unknown:${String(_x)}`;
    }
  }
}

function countPrimitivesByType(ir: DiagramIrV1 | null): Record<string, number> {
  const c: Record<string, number> = {};
  if (!ir?.primitives) return c;
  for (const p of ir.primitives) {
    c[p.type] = (c[p.type] ?? 0) + 1;
  }
  return c;
}

function primitiveCountDelta(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

function viewportDelta(
  a: DiagramIrV1 | null,
  b: DiagramIrV1 | null,
  warnings: string[],
): { dw: number; dh: number } | undefined {
  const va = a?.viewport;
  const vb = b?.viewport;
  if (!va && !vb) return undefined;
  if (!va || !vb) {
    warnings.push("[viewport] 仅一侧存在 viewport，无法计算 dw/dh");
    return undefined;
  }
  return { dw: vb.width - va.width, dh: vb.height - va.height };
}

/** 线段端点未落在同 IR 点集内的告警（供 diff 与 P6-4 bench 复用）。 */
export function diagramIrTopologyWarnings(ir: DiagramIrV1 | null, tag: string): string[] {
  if (!ir?.primitives?.length) return [];
  const pointIds = new Set(
    ir.primitives
      .filter((p): p is Extract<DiagramPrimitiveV1, { type: "point" }> => p.type === "point")
      .map((p) => p.id),
  );
  const w: string[] = [];
  for (const p of ir.primitives) {
    if (p.type !== "line") continue;
    if (!pointIds.has(p.from))
      w.push(`[${tag}] line references missing point id as from: ${p.from}`);
    if (!pointIds.has(p.to)) w.push(`[${tag}] line references missing point id as to: ${p.to}`);
  }
  return w;
}

function multisetFromPrimitives(
  ir: DiagramIrV1 | null,
): Map<DiagramIrPrimitiveFingerprint, number> {
  const m = new Map<DiagramIrPrimitiveFingerprint, number>();
  for (const p of ir?.primitives ?? []) {
    const f = fingerprintDiagramIrPrimitive(p);
    m.set(f, (m.get(f) ?? 0) + 1);
  }
  return m;
}

function multisetDiffAddedRemoved(
  ma: Map<DiagramIrPrimitiveFingerprint, number>,
  mb: Map<DiagramIrPrimitiveFingerprint, number>,
): { added: DiagramIrPrimitiveFingerprint[]; removed: DiagramIrPrimitiveFingerprint[] } {
  const added: DiagramIrPrimitiveFingerprint[] = [];
  const removed: DiagramIrPrimitiveFingerprint[] = [];
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  for (const k of keys) {
    const na = ma.get(k) ?? 0;
    const nb = mb.get(k) ?? 0;
    for (let i = 0; i < nb - na; i++) added.push(k);
    for (let i = 0; i < na - nb; i++) removed.push(k);
  }
  return { added, removed };
}

function positionalMismatches(
  a: DiagramIrV1 | null,
  b: DiagramIrV1 | null,
): DiagramIrPositionalMismatchV1[] {
  const pa = a?.primitives ?? [];
  const pb = b?.primitives ?? [];
  if (pa.length !== pb.length) return [];
  const out: DiagramIrPositionalMismatchV1[] = [];
  for (let i = 0; i < pa.length; i++) {
    const fa = fingerprintDiagramIrPrimitive(pa[i]!);
    const fb = fingerprintDiagramIrPrimitive(pb[i]!);
    if (fa !== fb) out.push({ index: i, fingerprintA: fa, fingerprintB: fb });
  }
  return out;
}

/**
 * 比较两份 {@link DiagramIrV1}（`null` 视为空 IR）。
 * 不做重排/同构匹配；`addedPrimitives` / `removedPrimitives` 为 multiset 指纹差分。
 */
export function diffDiagramIr(a: DiagramIrV1 | null, b: DiagramIrV1 | null): DiagramIrDiffResultV1 {
  const topologyWarnings = [
    ...diagramIrTopologyWarnings(a, "IR A"),
    ...diagramIrTopologyWarnings(b, "IR B"),
  ];
  const viewportD = viewportDelta(a, b, topologyWarnings);

  const ca = countPrimitivesByType(a);
  const cb = countPrimitivesByType(b);
  const pDelta = primitiveCountDelta(ca, cb);

  const ma = multisetFromPrimitives(a);
  const mb = multisetFromPrimitives(b);
  const { added, removed } = multisetDiffAddedRemoved(ma, mb);
  const changed = positionalMismatches(a, b);

  return {
    version: 1,
    primitiveCountDelta: pDelta,
    ...(viewportD !== undefined ? { viewportDelta: viewportD } : {}),
    topologyWarnings,
    addedPrimitives: added,
    removedPrimitives: removed,
    changedPrimitives: changed,
    diagnostics: {
      diffEngine: "diagram_ir_structural_v1",
      ...(a?.source !== undefined ? { sourceA: a.source } : {}),
      ...(b?.source !== undefined ? { sourceB: b.source } : {}),
    },
  };
}
