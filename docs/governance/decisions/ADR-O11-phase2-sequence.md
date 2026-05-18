# ADR-O11: Phase-2 Landing Sequence

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

须防止 semantic fallback 在 constitution 未 ratify 时通过 corpus 偷渡。

## Decision

采纳 RFC-0001 §8.6 顺序：

| 顺序 | 交付物 |
|------|--------|
| 1 | Constitution review 关闭（本 ADR 集 + RFC Accepted） |
| 2 | `failure-taxonomy.v1.json` 增补 mixed-topology 信号（**若需**，独立 Constitution PR） |
| 3 | `redraw_only` `expected_canonical_signals` 草案 |
| 4 | 首条 `redraw_only` L3 surgical slice |
| 5 | 可选 redraw promotion（ADR-O10 解除 Defer 后） |

**禁止** 颠倒为「先 L3 后 vocabulary」。

## References

- RFC-0001 §8.6
