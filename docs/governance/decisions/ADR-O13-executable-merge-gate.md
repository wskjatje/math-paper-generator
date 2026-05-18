# ADR-O13: Executable Governance Merge Gate

| 字段 | 值 |
|------|-----|
| Status | **Proposed** |
| Date | |
| Deciders | |

## Context

Executable 已含 bench、dual-run、taxonomy、CI、replay、gates、L3 corpus — 体量足够。Review 未完成即 merge 会导致 **runtime reality = governance legitimacy**。

## Decision

- **暂停** executable governance PR **merge** 直至 formal ontology review 关闭（ADR-O1–O14 就位，RFC-0001 标 Accepted）。
- 本地 / 分支继续开发 **允许**；不得以 merged main 暗示 constitution 已 ratify。
- Merge 时 scope **严格** 遵循 [EXECUTABLE-GOVERNANCE-SCOPE-v1.md](../EXECUTABLE-GOVERNANCE-SCOPE-v1.md)。
- 审阅句：*Is this a faithful executable companion to constitution?*

## Consequences

- Constitution stream（`docs/governance/`）可先 Accepted；executable 紧随其后。
- Semantic capability 与 semantic legitimacy 保持拆开。

## References

- EXECUTABLE-GOVERNANCE-SCOPE-v1.md, PR-CLASSIFICATION.md
