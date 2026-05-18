# ADR-O9: Reserved Lexicon and Maturity Ladder

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

`redraw_only_fallback` 已在 taxonomy JSON 中存在，但尚无 corpus / gate / promotion legitimacy。

## Decision

采纳 **ontology maturity ladder**（Vocabulary → Signal → Corpus → Gate → Promotion）；**禁止一步到位**。

对 `redraw_only_fallback`：

| 阶段 | 状态 |
|------|------|
| Vocabulary | ✓ 存在 |
| Signal / Corpus / Gate / Promotion | ✗ review 期间禁止扩展 |

**纪律**：vocabulary exists ≠ governance legitimacy exists。

## Consequences

- Classifier 运行时 *可能* 命中该类；**不**等于 corpus-governed archetype。
- Review 期间禁止扩该类 `canonical_signal`（ADR-O14）。

## References

- [taxonomy-semantics.md](../taxonomy/taxonomy-semantics.md)
