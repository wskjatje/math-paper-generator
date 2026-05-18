# ADR-O14: Taxonomy Class Additions Freeze (Review Period)

| 字段 | 值 |
|------|-----|
| Status | **Proposed** → **Frozen** (upon Accept) |
| Date | |
| Deciders | |

## Context

Review 期间最易 scope diffusion：现场新增 class 或扩 `canonical_signal`。

## Decision

**Frozen** 自 review 开幕至关闭：

| 禁止 | 允许 |
|------|------|
| `failure-taxonomy.v1.json` **新增** class | RFC/README/ADR 措辞 |
| 扩展现有类 `canonical_signal`（含 redraw） | `notes.md` / `case.meta` 说明性编辑 |
| 新增 foundation / redraw L3 | 记录 ADR 决策 |
| Constitution + Executable + Runtime 同 PR | — |

Review **关闭后**：taxonomy 变更仍须 Constitution PR + RFC 修订 + corpus baseline。

## References

- ONTOLOGY-REVIEW-v1.md freeze table
