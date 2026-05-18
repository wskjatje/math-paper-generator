# Taxonomy 语义说明

权威定义：`apps/web/tests/fixtures/import-pipeline/failure-taxonomy.v1.json`（**勿**在 `docs/` 下维护副本，避免漂移）。

RFC：[RFC-0001 Governance Ontology](../rfcs/RFC-0001-governance-ontology.md)

## Expected vs Detected

| | Expected | Detected |
|---|----------|----------|
| **来源** | `case.meta.taxonomy` | `detectImportFailureTaxonomy()` |
| **用途** | 标本身份、CI 验证（经 `verifyCaseTaxonomySignals`） | 漂移分析、并列类 |
| **变更** | 仅 specimen / RFC 迁移 | 可随 priority 调整 |

当二者不一致时，在 `case.meta.detected_taxonomy_also` 记录并列类（如 `q24-double-figure` → expected `ownership_scope_missing`，detected 常为 `degraded_global_pool`）。

## Canonical signal 语法（摘录）

| 模式 | 示例 |
|------|------|
| supply 计数 | `supply_state.materialized` |
| bench 数值 | `registry_entries>0`、`materialized_rate_bps=0` |
| timeline | `timeline.crop_persist=false` |
| producer | `producer.crops_persisted=0`、`producer.crop_jobs_emitted>0` |
| linker 聚合 | `linker_skipped_degraded_pool>0` |
| ocr_frontend | `ocr_frontend.role=experimental` |

实现：`evaluateCanonicalSignal()` in `importFailureTaxonomy.shared.ts`。

## Severity

| 值 | 含义 | Bench CI |
|----|------|----------|
| `blocking` | 阻断物化/入库质量 | 信号失败 → fail |
| `degraded` | 降级可继续但须可见 | 信号失败 → warn |
| `cosmetic` | 观测性 | advisory |

## Foundation classes（v1）

见 [README](../README.md#foundation-ontology-set当前)。

### Ontology maturity ladder（合法性阶梯）

| 阶段 | 含义 | `redraw_only_fallback` 当前 |
|------|------|------------------------------|
| Vocabulary | 术语存在于 taxonomy JSON | ✓ |
| Signal | observability / classifier 可命中 | （类内 canonical_signal 仅作预留，**不扩**） |
| Corpus | governance specimen | ✗ |
| Gate | canonical enforcement（bench/dual-run） | ✗ |
| Promotion | authority legitimacy | ✗ |

**纪律**：分阶段获得 legitimacy；禁止一步到位。

### Reserved lexicon：`redraw_only_fallback`

| 状态 | 说明 |
|------|------|
| 在 `failure-taxonomy.v1.json` | 类条目 **已存在**（词汇预留） |
| Governance legitimacy | **尚无** — 无 corpus、无 foundation gate、无 signal 扩展、无 promotion |
| Review 期间 | **禁止** 新增该类 canonical_signal 或 L3（防 category collapse） |

**语义**：`detectImportFailureTaxonomy()` 在运行时 *可能* 命中该类；与 **corpus-governed archetype** 不是同一概念。标本身份以 `case.meta.taxonomy` + foundation corpus 为准。

Phase-2 语义边界（redraw ≠ materialize、semantic-preserving、mixed-topology、suppression as governance）：[RFC-0001 §6–§8](../rfcs/RFC-0001-governance-ontology.md#6-术语topology-preserving-vs-semantic-preserving)。
