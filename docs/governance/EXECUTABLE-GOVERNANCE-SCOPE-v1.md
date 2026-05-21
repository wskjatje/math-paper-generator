# Executable Governance PR Scope（v1）

**前置条件**：Constitution review 完成（[ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md) 通过，RFC-0001–0004 Accepted）。

**审阅问题（单一）**：这是否为 [Constitution](README.md) 的 **faithful executable companion**？  
**不是**：是否在偷偷扩 ontology / 引入 redraw semantics。

---

## 包含（IN）

| 类别 | 路径 / 内容 |
|------|-------------|
| **Corpus** | `apps/web/tests/fixtures/import-pipeline/corpus/`（foundation 5 条） |
| **Taxonomy 数据** | `failure-taxonomy.v1.json`（**不**新增 class、不扩 canonical_signal） |
| **Bench** | `importPipelineBench.shared.ts`、golden 比较、`import-pipeline:bench` |
| **Dual-run** | `importPipelineDualRun*`、`importPipelineFrontendDrift*`、`import-pipeline:dual-run` |
| **Gates** | `importPipelineDualRunGovernance*`、`evaluateImportPipelineGovernanceGate` |
| **Taxonomy 求值** | `importFailureTaxonomy.shared.ts`（`verifyCaseTaxonomySignals` 等） |
| **Projection / replay** | `projection_version: 1`、replay append-only 测试 |
| **Observational 配套** | pre-strip 物化遥测、timeline 用物化块（与 RFC-0001 §5 一致） |
| **CI** | `.github/workflows/import-pipeline-governance.yml` |
| **OCR frontend（observational）** | `ocrFrontendAdapter*`、`pluggableOcrPipeline` provenance 注入（**不写** authoritative） |
| **Vitest** | `*importPipeline*.test.ts`、`importFailureTaxonomy.shared.test.ts` |
| **Scripts** | `scripts/run-import-pipeline-bench.ts`、`run-import-pipeline-dual-run.ts`、`report-import-pipeline-taxonomy-coverage.ts` |
| **npm scripts** | `import-pipeline:bench`、`:dual-run`、`:taxonomy-coverage` |

---

## 不包含（OUT）

| 类别 | 原因 |
|------|------|
| 新 taxonomy class / 新 canonical_signal 词汇 | Constitution / review 期禁止 |
| `redraw_only` L3、redraw signal 草案 | Phase-2；RFC-0001 §8 |
| `docs/governance/` RFC 正文变更 | 属 Constitution PR |
| IR schema 变更、`StructuredExamOcrDocument` 破坏性演进 | Runtime / 另 PR |
| 新 linker / ownership 启发式（无 corpus） | Runtime PR |
| Renderer / suppress 行为变更（无 RFC） | 须 Constitution 或 Runtime 分 PR |
| 上海卷全卷 dump、未 slice 的 L3 | RFC-0004 |

---

## Foundation calibration baseline（本 PR 不增条数）

| Corpus | Expected taxonomy | Truth boundary |
|--------|-------------------|----------------|
| `materialized-bind-01` | `healthy_materialized_bind` | happy-path authority |
| `placeholder-token-01` | `markdown_reconcile_gap` | placeholder ≠ materialized |
| `degraded-global-01` | `degraded_global_pool` | global ≠ authoritative bind |
| `parent-question-double-figure` | `healthy_materialized_bind` | 共图 align + 子题 bind（post-sanitize） |
| `ocr-no-crop` | `no_materialization` | producer intent ≠ persisted artifact |

---

## PR 描述模板（复制用）

```markdown
## Summary

Executable governance companion for Governance Constitution v1 (RFC-0001–0004).
Implements bench, dual-run, CI gates, and foundation corpus — **no ontology expansion**.

## Constitution dependency

- Requires merged: `docs/governance/` (23e71ee, da17ac7, …)
- Review question: faithful executable companion only?

## In scope

- [ ] 5 foundation corpus cases + fixtures
- [ ] `import-pipeline:bench` / `:dual-run` / CI workflow
- [ ] Authoritative parity gate (experimental must not mutate materialization/refs/registry)
- [ ] Pre-strip observational telemetry (RFC-0001 §5)

## Out of scope

- [ ] No new taxonomy classes or redraw L3
- [ ] No RFC edits in this PR

## Test plan

- [ ] `npm run import-pipeline:bench -w @zhixue/web`
- [ ] `npm run import-pipeline:dual-run -w @zhixue/web`
- [ ] `npm run import-pipeline:taxonomy-coverage -w @zhixue/web`
```

---

## 建议合并顺序

1. Constitution PRs（`docs/governance/`）→ review → Accepted  
2. **本 PR**（executable）  
3. Runtime capability PRs（相对 baseline 报 drift）

见 [PR-CLASSIFICATION.md](PR-CLASSIFICATION.md)。
