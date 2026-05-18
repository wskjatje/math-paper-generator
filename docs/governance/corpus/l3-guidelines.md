# L3 Real-World Corpus 指南

RFC：[RFC-0004 Corpus Governance](../rfcs/RFC-0004-corpus-governance.md)

## 何时做 L3

- Synthetic archetype 已存在且 signal contract 清晰
- 真实卷中存在 **单一、可命名** 的失败拓扑
- 需要把 irregularity 引入 ontology（非 capability 演示）

## 何时不做 L3

- 同时坏五层（OCR + crop + ownership + redraw + split）→ 先拆标本
- 仅能「整卷复现」→ 先 surgical slice
- 尚无 `expected_canonical_signals` 思路 → 先写 RFC-0001 修订

## 目录模板

```
corpus/<case-id>/
  input.snapshot.json
  import-producer.json          # 若 producer 契约相关
  case.meta.json
  expected.bench-golden.json
  expected.dual-run.v1.json     # 若有 frontend 维度
  import-parse-quality.json     # 推荐：rollup 考古
  notes.md                      # 必填
```

## `case.meta` 示例（L3）

```json
{
  "version": 1,
  "case_id": "ocr-no-crop",
  "taxonomy": "no_materialization",
  "l3_real_world": true,
  "expected_canonical_signals": [
    "producer.crop_jobs_emitted>0",
    "producer.crops_persisted=0",
    "materialized_rate_bps=0",
    "registry_entries=0",
    "timeline.crop_persist=false"
  ],
  "detected_taxonomy_also": "no_materialization"
}
```

## 已有 L3 标本

| case_id | taxonomy | 要点 |
|---------|----------|------|
| `q24-double-figure` | `ownership_scope_missing` | 双图误池化、子题继承、linker `skipped_degraded_pool` |
| `ocr-no-crop` | `no_materialization` | crop_jobs>0、crops_persisted=0 |

## Phase-2 候选（冻结前禁止开工）

`redraw_only_fallback` — **mixed-topology** 第一条 L3。

前置条件（见 [RFC-0001 §8](../rfcs/RFC-0001-governance-ontology.md#8-phase-2-semantic-boundary冻结前不得扩-l3)）：

1. Phase-2 semantic boundary 评审通过  
2. `expected_canonical_signals` 草案（不得与 materialized / healthy 类信号混淆）  
3. 再建 surgical slice + `notes.md`（明确 artifact vs semantic vs runtime 平面）

禁止：在未冻结 §8 前写 `redraw_only` corpus（防止 category collapse）。

## 验收

```bash
npm run import-pipeline:bench -w @zhixue/web
npm run import-pipeline:dual-run -w @zhixue/web
npm run import-pipeline:taxonomy-coverage -w @zhixue/web
```
