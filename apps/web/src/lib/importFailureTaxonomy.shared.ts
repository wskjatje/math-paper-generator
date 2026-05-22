/**
 * 导入失败 taxonomy：机器可读 canonical_signal + 人读 symptoms。
 * 定义见 `tests/fixtures/import-pipeline/failure-taxonomy.v1.json`。
 */
import type { FigureLifecyclePhaseKindV1 } from "@/lib/figureLifecycleTimeline.shared";
import type { ImportPipelineBenchGoldenV1 } from "@/lib/importPipelineBench.shared";
import type { ImportParseQualityRollupV1 } from "@/lib/importParseQuality.shared";

export type FailureTaxonomySeverityV1 = "blocking" | "degraded" | "cosmetic";

export type FailureTaxonomyClassV1 = {
  severity: FailureTaxonomySeverityV1;
  symptoms: string[];
  canonical_signal: string[];
  root_cause_layer: string;
  expected_fix_stage: string;
  priority?: number;
};

export type ImportFailureTaxonomyV1 = {
  version: 1;
  classes: Record<string, FailureTaxonomyClassV1>;
};

export type ImportPipelineCaseMetaV1 = {
  version: 1;
  case_id: string;
  taxonomy: string;
  intentional_drift?: boolean;
  notes?: string;
  /** L3 真实卷：允许 ontology 指定信号子集（避免 tangled failure 污染 class） */
  l3_real_world?: boolean;
  expected_canonical_signals?: string[];
  /** 入库后 detectImportFailureTaxonomy 可能并列命中的 class（仅文档/审阅） */
  detected_taxonomy_also?: string[];
};

export type ImportFailureSignalContextV1 = {
  bench: ImportPipelineBenchGoldenV1;
  rollup: ImportParseQualityRollupV1;
  /** phase → 是否存在任一时间线条目 ok=false */
  timeline_phase_failed: Partial<Record<FigureLifecyclePhaseKindV1, boolean>>;
  /** phase → 是否存在任一时间线条目 ok=true */
  timeline_phase_ok_any: Partial<Record<FigureLifecyclePhaseKindV1, boolean>>;
};

export function parseImportFailureTaxonomyV1(raw: unknown): ImportFailureTaxonomyV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as ImportFailureTaxonomyV1;
  if (o.version !== 1 || !o.classes || typeof o.classes !== "object") return null;
  return o;
}

export function parseImportPipelineCaseMetaV1(raw: unknown): ImportPipelineCaseMetaV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as ImportPipelineCaseMetaV1;
  if (o.version !== 1 || typeof o.case_id !== "string" || typeof o.taxonomy !== "string") return null;
  return o;
}

export function buildImportFailureSignalContext(
  bench: ImportPipelineBenchGoldenV1,
  rollup: ImportParseQualityRollupV1,
): ImportFailureSignalContextV1 {
  const timeline_phase_failed: Partial<Record<FigureLifecyclePhaseKindV1, boolean>> = {};
  const timeline_phase_ok_any: Partial<Record<FigureLifecyclePhaseKindV1, boolean>> = {};
  for (const tl of rollup.figure_lifecycle_timelines_v1 ?? []) {
    for (const p of tl.phases) {
      if (p.ok) timeline_phase_ok_any[p.phase] = true;
      else timeline_phase_failed[p.phase] = true;
    }
  }
  return { bench, rollup, timeline_phase_failed, timeline_phase_ok_any };
}

function countLinkerOutcome(
  rollup: ImportParseQualityRollupV1,
  outcome: string,
): number {
  let n = 0;
  for (const t of rollup.figure_link_traces_v1 ?? []) {
    if (t.outcome === outcome) n += 1;
  }
  return n;
}

function parseNumericCompare(
  signal: string,
): { field: string; op: "=" | ">" | "<" | ">=" | "<="; value: number } | null {
  const m = signal.match(/^([a-z_.]+)(=|>=|<=|>|<)(-?\d+)$/);
  if (!m) return null;
  return {
    field: m[1]!,
    op: m[2] as "=" | ">" | "<" | ">=" | "<=",
    value: Number(m[3]),
  };
}

function compareNum(actual: number, op: string, expected: number): boolean {
  switch (op) {
    case "=":
      return actual === expected;
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
    default:
      return false;
  }
}

function benchNumericField(ctx: ImportFailureSignalContextV1, field: string): number | null {
  const b = ctx.bench;
  switch (field) {
    case "materialized_rate_bps":
      return b.materialized_rate_bps;
    case "registry_entries":
      return b.registry_entries;
    case "refs_bound_total":
      return b.refs_bound_total;
    case "linker_bound":
      return b.linker_bound;
    case "linker_skipped_already_bound":
      return b.linker_skipped_already_bound;
    case "provenance_artifacts":
      return b.provenance_artifacts;
    case "questions_total":
      return b.questions_total;
    case "producer.crops_persisted":
      return b.producer_crops_persisted ?? 0;
    case "producer.crop_jobs_emitted":
      return b.producer_crop_jobs_emitted ?? 0;
    case "linker_skipped_degraded_pool":
      return countLinkerOutcome(ctx.rollup, "skipped_degraded_pool");
    case "ocr_frontend.topology_confidence_bps": {
      const c = ctx.rollup.ocr_frontend?.topology_confidence;
      return c != null ? Math.round(c * 10_000) : null;
    }
    default:
      return null;
  }
}

/** 单条 canonical_signal 是否成立 */
export function evaluateCanonicalSignal(
  signal: string,
  ctx: ImportFailureSignalContextV1,
): boolean {
  const trimmed = signal.trim();
  if (!trimmed) return false;

  const supplyOnly = trimmed.match(/^supply_state\.([a-z_]+)$/);
  if (supplyOnly) {
    const state = supplyOnly[1]!;
    return (ctx.bench.supply_state_counts[state as keyof typeof ctx.bench.supply_state_counts] ?? 0) > 0;
  }

  const timelineBool = trimmed.match(/^timeline\.([a-z_]+)=(true|false)$/);
  if (timelineBool) {
    const phase = timelineBool[1] as FigureLifecyclePhaseKindV1;
    const wantOk = timelineBool[2] === "true";
    if (wantOk) return ctx.timeline_phase_ok_any[phase] === true;
    return ctx.timeline_phase_failed[phase] === true;
  }

  const numCmp = parseNumericCompare(trimmed);
  if (numCmp) {
    const actual = benchNumericField(ctx, numCmp.field);
    if (actual == null) return false;
    return compareNum(actual, numCmp.op, numCmp.value);
  }

  const ocrFe = ctx.rollup.ocr_frontend;
  if (trimmed === "ocr_frontend.bbox_support=false") {
    return ocrFe != null && ocrFe.topology.bbox_support === false;
  }
  if (trimmed === "ocr_frontend.diagram_links_support=false") {
    return ocrFe != null && ocrFe.topology.diagram_links_support === false;
  }
  if (trimmed === "ocr_frontend.role=experimental") {
    return ocrFe?.role === "experimental";
  }
  if (trimmed === "ocr_frontend.role=canonical") {
    return ocrFe?.role === "canonical";
  }
  const symptomMatch = trimmed.match(/^ocr_frontend\.symptom=([a-z_]+)$/);
  if (symptomMatch) {
    const s = symptomMatch[1]!;
    return ocrFe?.adapter_symptoms?.includes(s as never) === true;
  }

  return false;
}

export function evaluateCanonicalSignals(
  signals: string[],
  ctx: ImportFailureSignalContextV1,
): { ok: boolean; fired: string[]; missing: string[] } {
  const fired: string[] = [];
  const missing: string[] = [];
  for (const s of signals) {
    if (evaluateCanonicalSignal(s, ctx)) fired.push(s);
    else missing.push(s);
  }
  return { ok: missing.length === 0, fired, missing };
}

/** 检测最匹配的 taxonomy class（全部 canonical_signal 成立；priority 高者优先） */
export function detectImportFailureTaxonomy(
  taxonomy: ImportFailureTaxonomyV1,
  ctx: ImportFailureSignalContextV1,
): string | null {
  let best: { id: string; priority: number } | null = null;
  for (const [id, cls] of Object.entries(taxonomy.classes)) {
    const { ok } = evaluateCanonicalSignals(cls.canonical_signal, ctx);
    if (!ok) continue;
    const priority = cls.priority ?? 0;
    if (!best || priority > best.priority) best = { id, priority };
  }
  return best?.id ?? null;
}

/** 解析 corpus case 应校验的 canonical_signal 列表 */
export function resolveCaseCanonicalSignals(
  meta: ImportPipelineCaseMetaV1,
  taxonomy: ImportFailureTaxonomyV1,
): string[] {
  if (meta.expected_canonical_signals?.length) return meta.expected_canonical_signals;
  return taxonomy.classes[meta.taxonomy]?.canonical_signal ?? [];
}

export function verifyCaseTaxonomySignals(
  taxonomy: ImportFailureTaxonomyV1,
  meta: ImportPipelineCaseMetaV1,
  ctx: ImportFailureSignalContextV1,
): ReturnType<typeof verifyExpectedTaxonomySignals> {
  const signals = resolveCaseCanonicalSignals(meta, taxonomy);
  const cls = taxonomy.classes[meta.taxonomy];
  const ev = evaluateCanonicalSignals(signals, ctx);
  return {
    ok: ev.ok,
    severity: cls?.severity ?? null,
    fired: ev.fired,
    missing: ev.missing,
    expected_fix_stage: cls?.expected_fix_stage ?? null,
  };
}

export function verifyExpectedTaxonomySignals(
  taxonomy: ImportFailureTaxonomyV1,
  expectedClassId: string,
  ctx: ImportFailureSignalContextV1,
): {
  ok: boolean;
  severity: FailureTaxonomySeverityV1 | null;
  fired: string[];
  missing: string[];
  expected_fix_stage: string | null;
} {
  const cls = taxonomy.classes[expectedClassId];
  if (!cls) {
    return {
      ok: false,
      severity: null,
      fired: [],
      missing: [`unknown taxonomy class: ${expectedClassId}`],
      expected_fix_stage: null,
    };
  }
  const ev = evaluateCanonicalSignals(cls.canonical_signal, ctx);
  return {
    ok: ev.ok,
    severity: cls.severity,
    fired: ev.fired,
    missing: ev.missing,
    expected_fix_stage: cls.expected_fix_stage,
  };
}

export type ImportPipelineGovernanceVerdictV1 = {
  exit_code: 0 | 1;
  advisories: string[];
  warnings: string[];
  failures: string[];
};

/**
 * severity → CI gate；`intentional_drift` = controlled degradation approval。
 * - golden 漂移：一律 fail（除非 intentional）
 * - taxonomy signal 漂移：按 severity（blocking fail / degraded warn / cosmetic advisory）
 */
export function evaluateImportPipelineGovernanceGate(input: {
  golden_ok: boolean;
  taxonomy_signals_ok: boolean | null;
  severity: FailureTaxonomySeverityV1 | null;
  intentional_drift?: boolean;
  case_id: string;
}): ImportPipelineGovernanceVerdictV1 {
  const advisories: string[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const intentional = input.intentional_drift === true;

  if (!input.golden_ok) {
    const msg = `${input.case_id}: projection golden drift`;
    if (intentional) warnings.push(`[intentional] ${msg}`);
    else failures.push(msg);
  }

  if (input.taxonomy_signals_ok === false) {
    const msg = `${input.case_id}: canonical_signal mismatch (${input.severity ?? "unknown"})`;
    if (intentional) warnings.push(`[intentional] ${msg}`);
    else if (input.severity === "blocking") failures.push(msg);
    else if (input.severity === "degraded") warnings.push(msg);
    else advisories.push(msg);
  }

  return {
    exit_code: failures.length > 0 ? 1 : 0,
    advisories,
    warnings,
    failures,
  };
}

/** 按 taxonomy class 聚合（供 bench CLI / drift review） */
export function summarizeTaxonomyByClass(
  entries: Array<{ case_id: string; taxonomy: string; severity: FailureTaxonomySeverityV1 | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    out[e.taxonomy] = (out[e.taxonomy] ?? 0) + 1;
  }
  return out;
}
