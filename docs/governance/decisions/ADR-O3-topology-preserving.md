# ADR-O3: Topology-Preserving Definition

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

Foundation v1 建立在 artifact lineage（raster、registry、refs、linker traces）。

## Decision

- **Topology-preserving**：可追踪的物化/登记/绑定谱系；变化反映在 bench core / timeline。
- Foundation archetype **默认** 要求 topology-preserving 信号可满足。
- 「画对了」或 semantic 相似 **不构成** topology 等价。

## Consequences

- Dual-run authoritative gate 继续以 `GovernanceBenchCoreV1` 物化/registry/refs 为核心。
- Phase-2 semantic 类不得反向满足 `healthy_materialized_bind` 信号。

## References

- RFC-0001 §6
