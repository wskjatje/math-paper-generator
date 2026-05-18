# Projection Version 策略

RFC：[RFC-0002 Projection Stability](../rfcs/RFC-0002-projection-stability.md)

## 当前：`projection_version: 1`

类型：`ImportPipelineBenchGoldenV1`（`importPipelineBench.shared.ts`）

### Governance core（参与 dual-run 比较）

- `questions_total`
- `supply_state_counts`
- `materialized_rate_bps`
- `registry_entries`, `refs_bound_total`, `provenance_artifacts`
- `linker_bound`, `linker_skipped_already_bound`

提取函数：`pickGovernanceBenchCore()`。

### 非 core（golden 含、parity 排除）

- `timeline_phase_ok`
- `producer_crop_*`
- `ocr_frontend`
- `projection_version` 自身

## 变更检查清单

- [ ] 是否递增 `projection_version`？
- [ ] 是否更新全部 `expected.bench-golden.json`？
- [ ] 是否更新 RFC-0002 / 本文件？
- [ ] dual-run 是否仍 `projection_version_changed: false`？

## 工具

```bash
npm run import-pipeline:bench -w @zhixue/web
```

Golden 比较：`importPipelineBenchJsonEqual`。
