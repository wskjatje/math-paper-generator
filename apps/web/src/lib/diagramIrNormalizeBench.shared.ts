/**
 * P6-4 · Normalize drift bench：同一 corpus 上 `diagram_schema → IR → SVG` 与 baseline 对拍，输出可聚合的漂移标记。
 *
 * baseline 为 **comparison artifact**（expected.*.json / svg），不写回业务持久化。
 */

import type { DiagramIrNormalizeDiagnostics, DiagramIrV1 } from "@/lib/diagramIr.shared";
import { diagramSchemaToIrWithDiagnostics, parseDiagramIrV1 } from "@/lib/diagramIr.shared";
import {
  diffDiagramIr,
  diagramIrTopologyWarnings,
  type DiagramIrDiffResultV1,
} from "@/lib/diagramIrDiff.shared";
import { renderDiagramIrToSvg } from "@/lib/diagramIrRenderSvg.shared";
import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";

export interface DiagramNormalizeDriftCaseResultV1 {
  fixture: string;
  /** multiset 指纹差分非空（primitive 集合语义漂移）。 */
  irMultisetDrift: boolean;
  /** 等长同序下逐位指纹不同（顺序/逐元变化）。 */
  irPositionalDrift: boolean;
  /** 两侧均有 viewport 且 dw/dh 非零，或单侧 viewport 与 baseline 不一致。 */
  viewportDrift: boolean;
  /** {@link DiagramIrNormalizeDiagnostics} 稳定序列化后与 baseline 不一致。 */
  diagnosticsDrift: boolean;
  /** 线段端点 unresolved 等拓扑告警集合（去 tag 前缀）相对 baseline 变化。 */
  topologyDrift: boolean;
  /** `null`：未提供 expected.svg；否则为实际 SVG 与 baseline 全文是否一致。 */
  svgChanged: boolean | null;
  irDiff: DiagramIrDiffResultV1;
  /** 人类可读，如 `line: +1` `point: -2`。 */
  primitiveDeltaSummary: string;
  diagnosticsExpectedSerialized: string;
  diagnosticsActualSerialized: string;
  topologySignatureExpected: string;
  topologySignatureActual: string;
}

export interface DiagramNormalizeDriftAggregateV1 {
  version: 1;
  benchEngine: "diagram_normalize_drift_v1";
  generatedAt: string;
  corpusDir: string;
  totals: {
    fixtures: number;
    irMultisetDrift: number;
    irPositionalDrift: number;
    viewportDrift: number;
    diagnosticsDrift: number;
    topologyDrift: number;
    svgChanged: number;
    svgSkipped: number;
  };
  cases: DiagramNormalizeDriftCaseResultV1[];
}

/** 用于 baseline 文件与 bench 比较的稳定序列化（键序固定）。 */
export function stableSerializeDiagnostics(d: DiagramIrNormalizeDiagnostics): string {
  const primitiveCounts: Record<string, number> = {};
  for (const k of Object.keys(d.primitiveCounts).sort((a, b) => a.localeCompare(b))) {
    primitiveCounts[k] = d.primitiveCounts[k]!;
  }
  const payload: Record<string, unknown> = {
    omittedKinds: [...d.omittedKinds].sort((a, b) => a.localeCompare(b)),
    invalidReferences: d.invalidReferences,
    primitiveCounts,
  };
  if (d.unknownTopLevelKeys !== undefined) {
    payload.unknownTopLevelKeys = [...d.unknownTopLevelKeys].sort((a, b) => a.localeCompare(b));
  }
  return JSON.stringify(payload);
}

export function parseExpectedDiagnosticsJson(raw: string): DiagramIrNormalizeDiagnostics {
  const o = JSON.parse(raw) as unknown;
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    throw new Error("expected diagnostics: root must be object");
  }
  const rec = o as Record<string, unknown>;
  const omittedKinds = rec.omittedKinds;
  if (!Array.isArray(omittedKinds) || !omittedKinds.every((x) => typeof x === "string")) {
    throw new Error("expected diagnostics: omittedKinds must be string[]");
  }
  const invalidReferences = rec.invalidReferences;
  if (typeof invalidReferences !== "number" || !Number.isFinite(invalidReferences)) {
    throw new Error("expected diagnostics: invalidReferences must be number");
  }
  const primitiveCounts = rec.primitiveCounts;
  if (!primitiveCounts || typeof primitiveCounts !== "object" || Array.isArray(primitiveCounts)) {
    throw new Error("expected diagnostics: primitiveCounts must be object");
  }
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(primitiveCounts as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) counts[k] = v;
  }
  let unknownTopLevelKeys: string[] | undefined;
  if (rec.unknownTopLevelKeys !== undefined) {
    if (
      !Array.isArray(rec.unknownTopLevelKeys) ||
      !rec.unknownTopLevelKeys.every((x) => typeof x === "string")
    ) {
      throw new Error("expected diagnostics: unknownTopLevelKeys must be string[]");
    }
    unknownTopLevelKeys = rec.unknownTopLevelKeys as string[];
  }
  return {
    omittedKinds: omittedKinds as string[],
    invalidReferences,
    primitiveCounts: counts,
    ...(unknownTopLevelKeys !== undefined ? { unknownTopLevelKeys } : {}),
  };
}

function topologySignature(ir: DiagramIrV1 | null): string {
  const tag = "IR";
  return JSON.stringify(
    diagramIrTopologyWarnings(ir, tag)
      .map((s) => s.replace(/^\[[^\]]+\]\s*/, ""))
      .sort((a, b) => a.localeCompare(b)),
  );
}

function formatPrimitiveDelta(delta: Record<string, number>): string {
  const parts = Object.keys(delta)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => {
      const d = delta[k]!;
      const sign = d > 0 ? "+" : "";
      return `${k}: ${sign}${d}`;
    });
  return parts.length ? parts.join(", ") : "(none)";
}

function viewportDriftFromDiff(
  expected: DiagramIrV1 | null,
  actual: DiagramIrV1 | null,
  irDiff: DiagramIrDiffResultV1,
): boolean {
  const ve = expected?.viewport;
  const va = actual?.viewport;
  if (!!ve !== !!va) return true;
  const d = irDiff.viewportDelta;
  if (d !== undefined && (d.dw !== 0 || d.dh !== 0)) return true;
  return false;
}

export interface DiagramNormalizeDriftCaseInputV1 {
  fixture: string;
  schema: GeometryDiagramSchemaV1;
  expectedIr: DiagramIrV1 | null;
  expectedDiagnostics: DiagramIrNormalizeDiagnostics;
  /** 若缺省则不比对 SVG，仅 `svgChanged: null`。 */
  expectedSvg?: string;
}

/**
 * 单次 fixture：当前 normalizer 输出 vs baseline（IR / diagnostics / 可选 SVG）。
 */
export function evaluateNormalizeDriftCase(
  input: DiagramNormalizeDriftCaseInputV1,
): DiagramNormalizeDriftCaseResultV1 {
  const { fixture, schema, expectedIr, expectedDiagnostics, expectedSvg } = input;
  const { ir: actualIr, diagnostics: actualDiagnostics } = diagramSchemaToIrWithDiagnostics(schema);
  const irDiff = diffDiagramIr(expectedIr, actualIr);

  const irMultisetDrift = irDiff.addedPrimitives.length > 0 || irDiff.removedPrimitives.length > 0;
  const irPositionalDrift = irDiff.changedPrimitives.length > 0;
  const viewportDrift = viewportDriftFromDiff(expectedIr, actualIr, irDiff);
  const diagnosticsExpectedSerialized = stableSerializeDiagnostics(expectedDiagnostics);
  const diagnosticsActualSerialized = stableSerializeDiagnostics(actualDiagnostics);
  const diagnosticsDrift = diagnosticsExpectedSerialized !== diagnosticsActualSerialized;

  const topologySignatureExpected = topologySignature(expectedIr);
  const topologySignatureActual = topologySignature(actualIr);
  const topologyDrift = topologySignatureExpected !== topologySignatureActual;

  let svgChanged: boolean | null = null;
  if (expectedSvg !== undefined) {
    if (actualIr == null) {
      svgChanged = expectedSvg.trim().length > 0;
    } else {
      const actualSvg = renderDiagramIrToSvg(actualIr).replace(/\r\n/g, "\n").trim();
      const exp = expectedSvg.replace(/\r\n/g, "\n").trim();
      svgChanged = actualSvg !== exp;
    }
  }

  return {
    fixture,
    irMultisetDrift,
    irPositionalDrift,
    viewportDrift,
    diagnosticsDrift,
    topologyDrift,
    svgChanged,
    irDiff,
    primitiveDeltaSummary: formatPrimitiveDelta(irDiff.primitiveCountDelta),
    diagnosticsExpectedSerialized,
    diagnosticsActualSerialized,
    topologySignatureExpected,
    topologySignatureActual,
  };
}

export function aggregateNormalizeDriftReport(
  corpusDir: string,
  cases: DiagramNormalizeDriftCaseResultV1[],
): DiagramNormalizeDriftAggregateV1 {
  const totals = {
    fixtures: cases.length,
    irMultisetDrift: cases.filter((c) => c.irMultisetDrift).length,
    irPositionalDrift: cases.filter((c) => c.irPositionalDrift).length,
    viewportDrift: cases.filter((c) => c.viewportDrift).length,
    diagnosticsDrift: cases.filter((c) => c.diagnosticsDrift).length,
    topologyDrift: cases.filter((c) => c.topologyDrift).length,
    svgChanged: cases.filter((c) => c.svgChanged === true).length,
    svgSkipped: cases.filter((c) => c.svgChanged === null).length,
  };
  return {
    version: 1,
    benchEngine: "diagram_normalize_drift_v1",
    generatedAt: new Date().toISOString(),
    corpusDir,
    totals,
    cases,
  };
}

/** 从 `*.expected.ir.json` 解析 baseline IR（文件为 JSON `null` 时表示期望无 IR）。 */
export function parseExpectedIrJsonFile(raw: string): DiagramIrV1 | null {
  const rawParsed: unknown = JSON.parse(raw);
  if (rawParsed === null) return null;
  const ir = parseDiagramIrV1(rawParsed);
  if (!ir) throw new Error("expected.ir.json: parseDiagramIrV1 failed");
  return ir;
}
