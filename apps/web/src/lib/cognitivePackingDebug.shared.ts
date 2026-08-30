/**
 * Train 3 stabilization — packing transform observability（debug-only；非 telemetry / governance）。
 * 适用于任意 EPL 题面；禁止题号/单卷专规触发。
 */
import type { PackingTransformAppliedV1 } from "@/lib/cognitivePackingRuntime.shared";
import type { FigureCognitiveRoleV1 } from "@/lib/figureCognitiveSemantics.shared";

export const PACKING_DEBUG_QUERY_PARAM = "packing_debug" as const;

export function isPackingDebugEnabled(opts?: {
  /** @deprecated 生产/DEV 均须显式 ?packing_debug=1，避免默认打扰卷面 */
  dev?: boolean;
  searchFlag?: boolean;
}): boolean {
  return opts?.searchFlag === true;
}

export function formatPackingTransformsAttr(
  transforms: readonly PackingTransformAppliedV1[],
): string {
  return transforms.join(",");
}

export type PackingDebugDensityV1 = "normal" | "tight" | "inline-tight" | "collapsed" | "suppressed";

export function packingDebugDensityFromTransforms(
  transforms: readonly PackingTransformAppliedV1[],
  opts?: { suppressRender?: boolean },
): PackingDebugDensityV1 {
  if (opts?.suppressRender) return "suppressed";
  if (transforms.includes("transient_collapse")) return "collapsed";
  if (transforms.includes("inline_persistence_tuning")) return "inline-tight";
  if (transforms.includes("adjacency_tightening")) return "tight";
  return "normal";
}

/** Debug overlay classes（仅当祖先 `data-packing-debug="1"` 时 styles.css 生效） */
export function packingDebugMarkerClass(
  transforms: readonly PackingTransformAppliedV1[],
  role?: FigureCognitiveRoleV1,
): string {
  const parts: string[] = ["packing-debug-marker"];
  for (const t of transforms) {
    parts.push(`packing-debug--${t.replace(/_/g, "-")}`);
  }
  if (role) parts.push(`packing-debug-role--${role.replace(/_/g, "-")}`);
  return parts.join(" ");
}
