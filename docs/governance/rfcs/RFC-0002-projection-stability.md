# RFC-0002: Projection Stability Policy

| 字段 | 值 |
|------|-----|
| Status | **Draft**（随 RFC-0001 constitution bundle ratify） |
| **Ontology ratified at** | *(同 [RFC-0001](RFC-0001-governance-ontology.md) — pending)* |
| Scope | Bench golden、rollup 投影、replay、CI 漂移 |
| 实现 | `importPipelineBench.shared.ts`、`importPipelineBenchJsonEqual` |

## 1. 目的

将 **review surface** 视为正式 ABI：`projection_version`、golden 字段、replay 不变量。避免 debug dump 式字段进入门禁后无序膨胀。

## 2. Projection version 生命周期

### 2.1 当前版本

`ImportPipelineBenchGoldenV1.projection_version === 1`

涵盖字段（authoritative governance core + 可选 observational）：

- `questions_total`, `supply_state_counts`, `materialized_rate_bps`
- `registry_entries`, `refs_bound_total`, `provenance_artifacts`
- `linker_bound`, `linker_skipped_already_bound`
- `timeline_phase_ok`（仅 `ok=true` 的阶段计数）
- `producer_crop_jobs_emitted`, `producer_crops_persisted`（来自 import producer）
- `ocr_frontend`（observational；**不参与** `governanceBenchCoreEqual`）

### 2.2 何时递增 `projection_version`

| 允许 | 禁止 |
|------|------|
| 新增可选字段且旧 golden 仍合法 | 静默改字段含义 |
| 明确破坏性变更并批量更新 corpus | 无 version bump 改语义 |
| 文档化 migration 说明 | 删除已纳入 gate 的字段且无版本 |

递增后须：

1. 更新本 RFC 或 `projection-version-policy.md`
2. 运行 `import-pipeline:bench` 更新全部 `expected.bench-golden.json`
3. PR 标明 **projection vN → vN+1**

### 2.3 `projection_version_changed` 与 CI

Dual-run 中 `projection_version_changed === true` → **fail**（replay / review ABI 不稳定）。

## 3. Golden review 规则

### 3.1 生成路径

```
sanitizeImportedSnapshotForPersist
  → import_parse_quality rollup
  → computeImportPipelineBenchSummary
  → projectImportPipelineBenchForGolden
  → 与 expected.bench-golden.json 比较
```

### 3.2 相等性

`importPipelineBenchJsonEqual`：确定性比较；**剔除**非稳定字段（若引入 UUID、时间戳须在此登记）。

### 3.3 审阅重点（非 OCR 字准率）

优先审：

- `materialized_rate_bps`
- `registry_entries` / `refs_bound_total`
- `linker_bound`
- `supply_state_counts`
- `timeline_phase_ok` 关键阶段

次要：正文 BLEU / F1（不在 foundation gate 内）。

## 4. Replay 不变量

### 4.1 第二遍 linker

Corpus 测试：`applyDeterministicFigureLinkAppendPass` 第二遍仅产生 `skipped_already_bound`，不得改变 authoritative core 计数。

### 4.2 Timeline 与 pre-strip 观测

`figure_lifecycle_timelines_v1` 构建时须使用物化块 `per_question` 快照（含 strip 前 markdown 观测），避免 destructive normalization 摧毁 taxonomy 可解释性。

### 4.3 Rollup 考古

L3 可选 `import-parse-quality.json`：冻结入库后 rollup 子集，供 ontology archaeology（非第二真相源；**sanitize 路径仍为权威**）。

## 5. Observational vs Authoritative projection

| 投影 | 进入 golden | 进入 `pickGovernanceBenchCore` |
|------|-------------|--------------------------------|
| materialized / registry / refs / linker | 是 | 是 |
| `ocr_frontend` | 是（bench 摘要） | 否 |
| `timeline_phase_ok` | 是 | 否（整体 bench 比较） |
| trace 明细 | 在 rollup / seed 文件 | 否 |

Experimental frontend dual-run：**不得**改变 governance core 投影（RFC-0003）。

## 6. UUID / 路径纪律

- Golden 比较前剔除随机 `figure_id`（若比较函数未覆盖，须在 PR 说明）。
- Fixture URL 使用稳定 batch id（如 L3 `06803f4e-…`），避免机器相关路径。

## 7. 参考命令

```bash
npm run import-pipeline:bench -w @zhixue/web
npm run import-pipeline:dual-run -w @zhixue/web
```

## 8. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05 | 初稿：projection v1、replay、observational 切片 |
