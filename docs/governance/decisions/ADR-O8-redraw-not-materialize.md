# ADR-O8: Redraw ≠ Materialization

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

最易 semantic collapse：`diagram_schema` 存在被误读为已物化。

## Decision

- `diagram_schema` 存在 **≠** raster 已物化。
- 矢量重绘 / runtime redraw **不得** 满足 `supply_state.materialized` 或抬高 `materialized_rate_bps`、伪造 `registry_entries`。
- `redraw_only_fallback` 类信号保持 `materialized_rate_bps=0`、`registry_entries=0`（词汇已存在；legitimacy ADR-O15）。

## Consequences

- Capability（runtime redraw）与 legitimacy（corpus/gate）继续分离。

## References

- RFC-0001 §8.1
