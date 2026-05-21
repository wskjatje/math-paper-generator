"use client";

/** Train 3 — transform attribution legend（`?packing_debug=1` / DEV；非 governance telemetry） */
export function EducationalPackingDebugLegend() {
  return (
    <div className="no-print mb-3 rounded-md border border-dashed border-violet-500/50 bg-violet-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-violet-950/90 dark:text-violet-100/90">Packing debug（投影可解释性）</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        <li>
          <span className="packing-debug-swatch packing-debug-swatch--adjacency" /> adjacency_tightening
          — 琥珀边（cadence 收紧）
        </li>
        <li>
          <span className="packing-debug-swatch packing-debug-swatch--supportive" /> supportive_compaction
          — 蓝框（辅助图降 dominance）
        </li>
        <li>
          <span className="packing-debug-swatch packing-debug-swatch--inline" /> inline_persistence_tuning
          — 紫边（inline 邻接）
        </li>
        <li>
          <span className="packing-debug-swatch packing-debug-swatch--collapse" /> transient_collapse —
          灰虚线 / 折叠占位（非主 cadence）
        </li>
      </ul>
      <p className="mt-1.5 text-[10px]">
        生产环境 URL 加 <code className="rounded bg-muted px-1">?packing_debug=1</code>；不进 snapshot /
        parity。
      </p>
    </div>
  );
}
