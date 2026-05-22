# ocr-no-crop（L3 real-world / producer archetype）

## Specimen identity

| Field | Value |
|-------|--------|
| **Expected taxonomy** | `no_materialization` |
| **Detected taxonomy** | 通常同为 `no_materialization` |
| **Root cause layer** | materialize / producer |
| **Severity** | blocking |

## Failure topology（最小）

- 题干含图注锚点（如图① / 见图②）
- **无** `raster_figures`、**无** 可解析 Markdown 图 URL
- `import-producer`：`crop_jobs_emitted > 0`，`crops_persisted = 0`

语义：**OCR / 裁图计划成功 ≠ 物化成功**。

## Canonical signal contract（L3 invariants）

| Signal | 含义 |
|--------|------|
| `producer.crop_jobs_emitted>0` | 上游已产出裁图作业 |
| `producer.crops_persisted=0` | 零落盘 |
| `materialized_rate_bps=0` | 卷面无 authoritative raster 供给 |
| `registry_entries=0` | 未 publish registry |
| `timeline.crop_persist=false` | 生命周期 crop_persist 阶段失败 |

## 审阅重点（不比 OCR 字准率）

- producer 计数与 bench 投影一致
- experimental dual-run 不得抬高 materialization / registry
- 与 `placeholder-token-01` 区分：后者有占位 Markdown，本例为 **missing supply**

## Real-world 对应

- 线下导入仅 OCR 默认、未 persist 裁图
- 裁图批次失败但 OCR 文本已入库
- 真实卷在 **crop persist 前** 的观测态（可与 `parent-question-double-figure` 对照）

## Files

- `input.snapshot.json` — 入库前 2 题切片
- `import-producer.json` — producer 观测
- `import-parse-quality.json` — 入库后 rollup 考古快照
- `expected.bench-golden.json` / `expected.dual-run.v1.json` — governance 门禁
