# ADR-O7: Suppression as Governance Semantics

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

`shouldSuppressVectorDiagramSchemaForQuestion` 影响可见性与持久化可观测性，不仅是 UI。

## Decision

- Suppression 规则变更 = **ontology 变更**（RFC-0001 修订 + corpus 回归）。
- Suppression **不得** 静默抹掉用作 taxonomy 证据的 observational 痕迹。
- Suppression 与 redraw promotion 须 **联审**（ADR-O10）。

## Consequences

- Runtime PR 若改 suppress 启发式，须标 Constitution follow-up 或拆 Constitution PR。

## References

- RFC-0001 §8.3
