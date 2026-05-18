# ADR-O4: Semantic-Preserving Criteria

| 字段 | 值 |
|------|-----|
| Status | **Proposed** → **建议 Defer** |
| Date | |
| Deciders | |

## Context

Phase-2 将引入 semantic substitution（redraw、推断几何）；「何时算 semantic-preserving」若过早定死可能阻碍合法观测，过早放松则 collapse authoritative。

## Decision

**Defer** — 不在本次 review 定量化准入标准。

### 阻塞条件（Defer 解除前）

1. 首条 `redraw_only` L3 surgical slice 草案存在（observational 叙事完整）。
2. ADR-O8、O6、O9 已 **Accepted**。
3. 单独 RFC 附录或 ADR-O4 修订：列出 **可观测** 的 semantic-preserving 必要条件（非「用户觉得像」）。

## Consequences

- Runtime 可继续实验 redraw；**不得** 扩 taxonomy legitimacy（ADR-O15）。
- 默认纪律仍适用：semantic-preserving ⊂ observational-first（ADR-O6）。

## References

- RFC-0001 §6
