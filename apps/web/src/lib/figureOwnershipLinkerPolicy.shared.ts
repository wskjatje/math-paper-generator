/** Forensic replay 版本标签（linker 策略变更时递增） */
export const FIGURE_LINKER_RUNTIME_VERSION = "v1" as const;

/**
 * P7-1B STEP 2 · **视觉 linker 策略**（纯函数契约）。
 *
 * **STEP 2A**：`figureOwnershipLinkerApply.shared.ts` 的 `applyDeterministicFigureLinkAppendPass` 已挂
 * `sanitizeImportedSnapshotForPersist`；回放见 `import_parse_quality.figure_link_traces_v1`。
 *
 * 纪律（Resolver V1）：
 *
 * 1. **Exact token only**：仅 `token === label`（逐条 trim 后）；禁止 `图1≈图①`、`1≈①`、edit distance、语义相似。
 * 2. **Single deterministic target**：若 ≥2 个 registry 项的 `labels` 均含同一 token → `ambiguous` → 保持 unresolved，禁止任意择优。
 * 3. **Degraded pool 禁止 authoritative bind**：`candidate_pool_tier === "exam_global_registry"` 时即使 token 精确命中也不做权威绑定
 *    （已失本题局部作用域）；与观测层 `selection_disabled_reason: "global_pool_only"` 一致。
 * 4. **Linker 输出须 append-only**：只追加 `figure_refs` 条目，或向**尚无冲突**的既有 ref **追加 `labels[]` 元素**；
 *    不删除、不整体替换 `figure_refs` 数组。
 * 5. **Diagnostics 独立**：`linker_diagnostics` 等 trace 不得塞进 `figure_refs`；与 authoritative / observational 分层一致。
 *
 * @see {@link FigureRegistryItemV1} · `labels` 为 resource metadata，非 ownership 真值。
 */

import { expandFigureLabelTokenAliases } from "@/lib/figureDiagramLabelTokens.shared";
import type { FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import type { CandidatePoolWithProvenanceV1 } from "@/lib/ownershipResolutionStateDebug.shared";

export type FigureRegistryBindPoolTierV1 = CandidatePoolWithProvenanceV1["pool_tier"];

/**
 * 是否允许在本题上下文中执行 **authoritative** 锚点→`figure_id` 绑定。
 * `exam_global_registry` / `empty` / `raw_stem_url` 均为否（后者尚无稳定 registry 主键对齐）。
 */
export function poolTierAllowsAuthoritativeFigureBind(tier: FigureRegistryBindPoolTierV1): boolean {
  return tier === "question_local_registry";
}

export type ExactLabelRegistryMatchV1 =
  | { kind: "none" }
  | { kind: "unique"; figure_id: string }
  | { kind: "ambiguous" };

/**
 * 在 registry 中按 **精确 token** 查找 `labels` 命中项；多命中返回 `ambiguous`。
 * `token` 应为已规范化锚点（如 `图①`），与 `labels[]` 逐项 `===` 比较。
 */
export function matchRegistryByExactLabelToken(
  token: string,
  registry: FigureRegistryItemV1[],
): ExactLabelRegistryMatchV1 {
  const aliases = expandFigureLabelTokenAliases(token);
  if (aliases.length === 0) return { kind: "none" };

  const hits: string[] = [];
  for (const it of registry) {
    const labels = it.labels ?? [];
    for (const lab of labels) {
      const labTrim = String(lab ?? "").trim();
      if (aliases.includes(labTrim)) {
        hits.push(it.figure_id);
        break;
      }
    }
  }
  const uniq = [...new Set(hits)];
  if (uniq.length === 0) return { kind: "none" };
  if (uniq.length === 1) return { kind: "unique", figure_id: uniq[0]! };
  return { kind: "ambiguous" };
}

export type FigureLinkMatchKindV1 = "none" | "unique" | "ambiguous";

export type FigureLinkTraceOutcomeV1 =
  | "bound"
  | "skipped_degraded_pool"
  | "skipped_no_token"
  | "skipped_ambiguous"
  | "unresolved_none"
  | "skipped_already_bound"
  | "skipped_ref_label_conflict"
  | "skipped_no_matching_ref";

/**
 * 单次锚点→token→registry 尝试的可回放记录；**不入** `Question` 正文、**不写入** `figure_refs` JSON 字段，
 * 仅存 `import_parse_quality.figure_link_traces_v1`。
 */
export type FigureLinkTraceV1 = {
  version: 1;
  question_id: string;
  order_index: number;
  anchor_raw: string;
  token: string;
  pool_tier: FigureRegistryBindPoolTierV1;
  candidate_figure_ids: string[];
  match: FigureLinkMatchKindV1;
  outcome: FigureLinkTraceOutcomeV1;
};

export { extractLinkerTokensFromTextAnchor } from "@/lib/figureDiagramLabelTokens.shared";

export function candidateFigureIdsForExactLabelToken(
  token: string,
  registry: FigureRegistryItemV1[],
): string[] {
  const aliases = expandFigureLabelTokenAliases(token);
  if (aliases.length === 0) return [];
  const hits: string[] = [];
  for (const it of registry) {
    for (const lab of it.labels ?? []) {
      if (aliases.includes(String(lab ?? "").trim())) {
        hits.push(it.figure_id);
        break;
      }
    }
  }
  return [...new Set(hits)];
}

/** 未来 linker 独立诊断结构（不写入 `figure_refs`）；字段可扩展。 */
export type FigureLinkerDiagnosticsV1 = {
  version: 1;
  /** 参与匹配的规范化 token */
  anchor_token?: string;
  /** 绑定尝试结果（观测 / CI / golden 用） */
  outcome:
    | "skipped_degraded_pool"
    | "skipped_no_token"
    | "unresolved_none"
    | "unresolved_ambiguous"
    | "would_bind_unique";
  pool_tier?: FigureRegistryBindPoolTierV1;
};
