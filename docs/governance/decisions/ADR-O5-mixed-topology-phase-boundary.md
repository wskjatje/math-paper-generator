# ADR-O5: Mixed-Topology as Phase-2 Complexity Step

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

`redraw_only_fallback` 将同时触及 artifact / semantic / runtime 平面，不是普通新 class。

## Decision

- **Mixed-topology** = 多平面（artifact / semantic / runtime）并存的 archetype；属 **Phase-2 复杂度阶跃**，非 foundation 扩展。
- L3 须声明各平面 `expected_canonical_signals` 子集；禁止单一 `supply_state` 掩盖纠缠。
- `redraw_only_fallback` 为 **第一条 formal mixed-topology 候选**；legitimacy 见 ADR-O15（Defer）。

## Consequences

- Review 期间不新增 mixed-topology L3。
- Category collapse 禁止：不得与 `markdown_reconcile_gap` / `no_materialization` 等合并表述（RFC-0001 §8.4）。

## References

- RFC-0001 §7, §8.4
