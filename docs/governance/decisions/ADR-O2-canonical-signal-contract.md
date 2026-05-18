# ADR-O2: Canonical Signal Contract

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

Taxonomy class 须机器可验证，避免纯自然语言标签进入 CI。

## Decision

- `canonical_signal` = 某 class 的**必要结构条件**；由 `evaluateCanonicalSignal()` 求值。
- 权威列表在 `failure-taxonomy.v1.json`；L3 可用 `expected_canonical_signals` **收紧子集**（RFC-0004），不得模糊扩义。
- Review 期间 **禁止** 新增 signal 词汇（ADR-O14）。

## Consequences

- Foundation 5 条各自锁定一条 truth boundary（materialized / placeholder / global pool / ownership / no persist）。

## References

- RFC-0001 §2.3, RFC-0004
