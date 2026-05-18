# ADR-O15: redraw_only_fallback Governance Legitimacy

| 字段 | 值 |
|------|-----|
| Status | **Proposed** → **建议 Defer** |
| Date | |
| Deciders | |

## Context

Capability + vocabulary 已存在；corpus / gate / promotion legitimacy 不存在。团队须明确：何时允许该类成为 **governed archetype**。

## Decision

**Defer** governance legitimacy for `redraw_only_fallback`.

### 当前状态（Accept 为事实陈述，非授予 legitimacy）

- Vocabulary：✓
- Runtime classifier：可能命中
- Corpus / Gate / Promotion：✗

### 阻塞条件（Defer 解除）

1. ADR-O4（semantic-preserving 标准）解除 Defer 或最小标准 ADR 修订。
2. ADR-O11 顺序第 2–3 步完成（signal 草案）。
3. 首条 redraw-only L3 通过 bench + dual-run，且 **未** 抬高 authoritative core。

## Consequences

- 健康态：**capability exists, legitimacy does not** — 直至显式 ratify。
- Review 会议 **不** 辩论 redraw 启发式质量。

## References

- RFC-0001 §8.4, ADR-O9, ONTOLOGY-REVIEW #10
