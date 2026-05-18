# ADR-O1: Expected vs Detected Taxonomy Separation

| 字段 | 值 |
|------|-----|
| Status | **Proposed** → _Accepted / Rejected / Deferred_ |
| Date | |
| Deciders | |

## Context

Classifier 输出与 corpus 标本身份混用会导致「runtime reality = governance legitimacy」的 semantic collapse。

## Decision

- **Expected taxonomy**（`case.meta.taxonomy`）= **specimen identity**；随标本固定，不随 classifier 改。
- **Detected taxonomy**（`detectImportFailureTaxonomy()`）= **observational classifier**；用于 drift、`detected_taxonomy_also`。
- CI / bench 验证以 **expected** + `verifyCaseTaxonomySignals` 为准。
- Priority 调整 **不得** 自动改写历史 specimen 的 `taxonomy`；须 RFC + corpus 迁移。

## Consequences

- `q24-double-figure` 等 L3 可长期维护 expected `ownership_scope_missing` 与 detected `degraded_global_pool` 并列。
- Executable PR 不得用 detected 覆盖 expected golden。

## References

- RFC-0001 §2.2
- `importFailureTaxonomy.shared.ts`
