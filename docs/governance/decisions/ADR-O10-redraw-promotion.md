# ADR-O10: Redraw Promotion Path

| 字段 | 值 |
|------|-----|
| Status | **Proposed** → **建议 Defer** |
| Date | |
| Deciders | |

## Context

未来可能存在「provenance-backed reconstruction」升格 authoritative；门槛须高于 frontend promotion。

## Decision

**Defer** — 不在本次 review 定稿 promotion RFC 正文。

### 阻塞条件

1. ADR-O8、O6、O7 **Accepted**。
2. 首条 `redraw_only` L3 + dual-run 证明未抬高 authoritative core。
3. 新 RFC 或 RFC-0003 附录：provenance 字段、dual-run、suppression 联审清单。

### 已确认底线（本次即可 Accept 的约束，写入 Defer 前提）

- 禁止「用户觉得像」→ 直接写 `figure_refs` 或 materialized 计数。
- 门槛 **不得低于** RFC-0003 frontend promotion。

## References

- RFC-0001 §8.5, RFC-0003
