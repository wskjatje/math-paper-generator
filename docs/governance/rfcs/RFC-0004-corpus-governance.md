# RFC-0004: Corpus Governance

| 字段 | 值 |
|------|-----|
| Status | **Draft**（随 RFC-0001 constitution bundle ratify） |
| **Ontology ratified at** | *(同 [RFC-0001](RFC-0001-governance-ontology.md) — pending)* |
| Scope | `apps/web/tests/fixtures/import-pipeline/corpus/` |
| 工具 | `import-pipeline:bench`、`:dual-run`、`:taxonomy-coverage` |

## 1. 目的

Corpus 是 **ontology 的长期资产**，不是临时测试数据。本 RFC 规定如何新增、审阅、归档标本。

## 2. Synthetic vs L3

| 层级 | 目录约定 | 用途 |
|------|----------|------|
| **Synthetic archetype** | `materialized-bind-01` 等 | 最小拓扑、安全边界、确定性高 |
| **L3 real-world slice** | `q24-double-figure`、`ocr-no-crop` 等 | 经验接地、`case.meta.l3_real_world: true` |

**纪律**：

- 先 synthetic 建立 class，再 L3 接地。
- L3 **禁止** 整卷 dump（噪声、tangled failure、replay 不稳定）。

## 3. Surgical slice 纪律

每条 L3 仅保留：

- 与 **单一 archetype** 相关的最少题量
- 最小 `import-producer.json`（若需要）
- 不含无关章节 OCR 噪声

反例：上海全卷 JSON 直接进 corpus（archetype 身份被稀释）。

## 4. Taxonomy-first acquisition

新增 corpus 流程：

```
1. 发现真实失败 → 命名 archetype（或映射已有 class）
2. 写 case.meta.taxonomy + expected_canonical_signals
3. 构造 input.snapshot（最小拓扑）
4. 跑 sanitize → 固化 expected.bench-golden.json
5. 写 notes.md（来源、审阅重点、并列类）
6. 可选 expected.dual-run.v1.json
7. CI 绿 + taxonomy-coverage 更新
```

**禁止**：先写功能再补测试；先改 heuristic 再「对不上就算过」。

## 5. 必填文件

### 5.1 所有 case

| 文件 | 必填 |
|------|------|
| `input.snapshot.json` | 是 |
| `expected.bench-golden.json` | 是 |
| `case.meta.json` | 是 |

### 5.2 推荐

| 文件 | 用途 |
|------|------|
| `import-producer.json` | producer 契约（如 `ocr-no-crop`） |
| `expected.dual-run.v1.json` | frontend comparative |
| `import-parse-quality.json` | rollup 考古快照 |
| `notes.md` | 人读标本说明 |

### 5.3 `case.meta.json`  schema（扩展）

```json
{
  "version": 1,
  "case_id": "…",
  "taxonomy": "ownership_scope_missing",
  "l3_real_world": true,
  "expected_canonical_signals": ["…"],
  "detected_taxonomy_also": "degraded_global_pool",
  "intentional_drift": false,
  "notes": "简短说明"
}
```

- `taxonomy`：**specimen identity**（RFC-0001）
- `expected_canonical_signals`：可选；L3 推荐显式列出 invariants
- `detected_taxonomy_also`：运行时并列类，供 drift 分析

## 6. notes.md 要求（L3 必填）

须含：

| 小节 | 内容 |
|------|------|
| Source | 卷源、题号、batch |
| Expected taxonomy | 档案类名 |
| Failure topology | 最小结构描述 |
| Review focus | 审什么、不比什么 |
| Distinction | 与邻近 class 区分 |

## 7. Ontology archaeology

`import-parse-quality.json` 冻结：

- `figure_materialization`
- `figure_link_traces_v1`
- 关键 `figure_lifecycle_timelines_v1`

用于回答「2026Q2 为何 `ownership_scope_missing` 下降」类问题。**不以**其替代 sanitize _live 路径。

## 8. Coverage 报告

```bash
npm run import-pipeline:taxonomy-coverage -w @zhixue/web
```

输出 `by_expected_taxonomy` / `by_detected_taxonomy` / `l3_real_world` — 驱动 ontology completeness，非单纯测试计数。

## 9. 当前 foundation inventory

| case_id | taxonomy | 层级 |
|---------|----------|------|
| materialized-bind-01 | healthy_materialized_bind | synthetic |
| placeholder-token-01 | markdown_reconcile_gap | synthetic |
| degraded-global-01 | degraded_global_pool | synthetic |
| q24-double-figure | ownership_scope_missing | L3 |
| ocr-no-crop | no_materialization | L3 |

Phase-2：`redraw_only` L3 须在 [RFC-0001 §8](RFC-0001-governance-ontology.md#8-phase-2-semantic-boundary冻结前不得扩-l3) 评审通过后，按 §8.6 顺序添加（禁止 category collapse）。

## 10. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05 | 初稿：synthetic/L3、slice、meta、notes、考古 |
