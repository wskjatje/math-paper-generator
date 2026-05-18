# ADR-O12: Foundation Ontology Set Freeze

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

五条 foundation 构成 governance truth lattice / calibration core。

## Decision

**冻结** foundation set（review 关闭前不增 archetype）：

| Corpus | Taxonomy | Truth boundary |
|--------|----------|----------------|
| `materialized-bind-01` | `healthy_materialized_bind` | happy-path authority |
| `placeholder-token-01` | `markdown_reconcile_gap` | placeholder ≠ materialized |
| `degraded-global-01` | `degraded_global_pool` | global ≠ authoritative bind |
| `q24-double-figure` | `ownership_scope_missing` | ownership scope integrity |
| `ocr-no-crop` | `no_materialization` | producer intent ≠ persisted |

Executable PR **可** 携带此 5 条实现，但 **不得** 在 review 前 merge 以免默认 runtime = legitimacy（ADR-O13）。

## References

- RFC-0001 §4, README foundation table
