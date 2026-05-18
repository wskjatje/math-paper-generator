# ADR-O6: Observational-First Default for Semantic Fallback

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

Semantic fallback 天然向上 pressure ontology；须默认隔离 authoritative。

## Decision

- Redraw renderer / 运行时矢量展示 → **Observational**（读卷路径）。
- `diagram_schema` 升格 authoritative 输入 → 须经 RFC-0003 式 **promotion**，非默认。
- Ownership bind：redraw **不得** 写或补全 `figure_refs` / linker 选中。
- **无默认例外清单**；例外须 future ADR + RFC + dual-run。

## Consequences

- Pre-strip observational 原则（RFC-0001 §5）与 placeholder taxonomy 继续成立。
- Experimental OCR 不得 mutate authoritative bench core（RFC-0003）。

## References

- RFC-0001 §5, §8.2
