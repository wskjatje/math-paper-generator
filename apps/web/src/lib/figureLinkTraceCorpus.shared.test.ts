/**
 * P7-2A：Figure link trace **golden corpus**（`tests/fixtures/figure-link-traces/corpus/`）。
 * 比对剥离随机 `figure_id` 后的稳定投影，供 CI / 漂移检测；更新 golden 请改对应 `expected.trace-golden.json`。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { SessionExamSnapshot } from "@/lib/examSession";
import { applyDeterministicFigureLinkAppendPass } from "@/lib/figureOwnershipLinkerApply.shared";
import type { FigureLinkTraceV1 } from "@/lib/figureOwnershipLinkerPolicy.shared";
import { parseImportParseQualityRollup } from "@/lib/importParseQuality.shared";
import { sanitizeImportedSnapshotForPersist } from "@/lib/questionImportSanitize.shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusRoot = path.join(__dirname, "../../tests/fixtures/figure-link-traces/corpus");

export type FigureLinkTraceGoldenRowV1 = {
  order_index: number;
  anchor_raw: string;
  token: string;
  pool_tier: string;
  match: string;
  outcome: string;
  candidate_count: number;
};

function loadSnapshotJson(rel: string): SessionExamSnapshot {
  const raw = readFileSync(path.join(corpusRoot, rel), "utf8");
  return JSON.parse(raw) as SessionExamSnapshot;
}

function loadGolden(rel: string): FigureLinkTraceGoldenRowV1[] {
  const raw = readFileSync(path.join(corpusRoot, rel), "utf8");
  return JSON.parse(raw) as FigureLinkTraceGoldenRowV1[];
}

function projectTraces(traces: FigureLinkTraceV1[] | undefined): FigureLinkTraceGoldenRowV1[] {
  const rows = (traces ?? []).map((t) => ({
    order_index: t.order_index,
    anchor_raw: t.anchor_raw,
    token: t.token,
    pool_tier: t.pool_tier,
    match: t.match,
    outcome: t.outcome,
    candidate_count: t.candidate_figure_ids.length,
  }));
  return rows.sort((a, b) => {
    const d = a.order_index - b.order_index;
    if (d !== 0) return d;
    const c = a.token.localeCompare(b.token, "zh");
    if (c !== 0) return c;
    return `${a.anchor_raw}|${a.outcome}`.localeCompare(`${b.anchor_raw}|${b.outcome}`, "zh");
  });
}

function tracesAfterSanitize(snap: SessionExamSnapshot): FigureLinkTraceV1[] {
  const out = sanitizeImportedSnapshotForPersist(snap);
  const rollup = parseImportParseQualityRollup(out.exam.import_parse_quality ?? null);
  return rollup?.figure_link_traces_v1 ?? [];
}

describe("P7-2A figure link trace corpus (golden)", () => {
  it("unique-bind-01", () => {
    const snap = loadSnapshotJson("unique-bind-01/input.snapshot.json");
    const golden = loadGolden("unique-bind-01/expected.trace-golden.json");
    expect(projectTraces(tracesAfterSanitize(snap))).toEqual(golden);
    const out = sanitizeImportedSnapshotForPersist(snap);
    expect(out.questions[0]?.figure_refs?.[0]?.labels).toEqual(["图①"]);
  });

  it("ambiguous-01", () => {
    const snap = loadSnapshotJson("ambiguous-01/input.snapshot.json");
    const golden = loadGolden("ambiguous-01/expected.trace-golden.json");
    expect(projectTraces(tracesAfterSanitize(snap))).toEqual(golden);
  });

  it("degraded-global-01", () => {
    const snap = loadSnapshotJson("degraded-global-01/input.snapshot.json");
    const golden = loadGolden("degraded-global-01/expected.trace-golden.json");
    expect(projectTraces(tracesAfterSanitize(snap))).toEqual(golden);
  });

  it("replay：第二遍仅 linker 幂等 → skipped_already_bound", () => {
    const snap = loadSnapshotJson("unique-bind-01/input.snapshot.json");
    const once = sanitizeImportedSnapshotForPersist(snap);
    const twice = applyDeterministicFigureLinkAppendPass(once);
    const rollup = parseImportParseQualityRollup(twice.exam.import_parse_quality ?? null);
    const rows = rollup?.figure_link_traces_v1 ?? [];
    expect(rows.some((t) => t.outcome === "skipped_already_bound")).toBe(true);
  });

  it("label conflict：已有人为 labels 时不再覆盖", () => {
    const snap = loadSnapshotJson("unique-bind-01/input.snapshot.json");
    const once = sanitizeImportedSnapshotForPersist(snap);
    const q = once.questions[0]!;
    const refs = [...(q.figure_refs ?? [])];
    expect(refs.length).toBeGreaterThan(0);
    refs[0] = { ...refs[0]!, labels: ["图②"] };
    const tampered: SessionExamSnapshot = { ...once, questions: [{ ...q, figure_refs: refs }] };
    const twice = applyDeterministicFigureLinkAppendPass(tampered);
    const rollup = parseImportParseQualityRollup(twice.exam.import_parse_quality ?? null);
    expect(rollup?.figure_link_traces_v1?.some((t) => t.outcome === "skipped_ref_label_conflict")).toBe(
      true,
    );
    expect(twice.questions[0]?.figure_refs?.[0]?.labels).toEqual(["图②"]);
  });
});
