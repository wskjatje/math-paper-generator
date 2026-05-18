# RFC-0003: Frontend Promotion Protocol

| 字段 | 值 |
|------|-----|
| Status | **Draft** |
| Scope | OCR engine / adapter 生命周期 |
| 实现 | `ocrFrontendAdapter.shared.ts`、`importPipelineDualRun.*` |

## 1. 目的

将 **frontend 创新** 与 **authoritative truth 晋升** 分离。冻结原则：

> **Frontend cannot silently escalate authority.**

Experimental 只能影响 observational layer；不得单独改变 materialization、refs、registry、linker 选中结果。

## 2. 阶段模型

| 阶段 | `OcrFrontendRole` | 权限 | 门禁 |
|------|-------------------|------|------|
| **Experimental** | `experimental` | 仅 `ocr_frontend` provenance、symptoms、topology 观测 | dual-run advisory；authoritative 必须 parity |
| **Comparative** | `experimental` + corpus | 同上 + 必须跑 dual-run | `import-pipeline:dual-run` 绿 |
| **Candidate canonical** | 待批准 | 仍不得写 authoritative；可提议 drift 期望 | taxonomy drift report + 人工 review |
| **Canonical** | `canonical` | 作为治理基线 frontend（仍经 IR → 同一 pipeline） | 全量 bench + dual-run 回归 |
| **Rollback** | — | 降回 experimental | authoritative drift 或 projection 破坏 |

**Canonical ≠ 最好**：晋升不凭主观「更准」，凭 **governance evidence**。

## 3. 架构边界（不可绕过）

```
Raw OCR (paddle | got | …)
  → adaptRawOcrFrontend / adapter
  → StructuredExamOcrDocument   ← canonical IR
  → sanitizeImportedSnapshotForPersist
  → ownership / linker / materialization
```

禁止：

- `gotResult` 直接 `sanitize` 跳过 IR
- Adapter 写入 `figure_refs` / `figure_registry` bind
- Experimental 单独抬高 `materialized_rate_bps` 或 `refs_bound_total`

## 4. Dual-run 为晋升前置条件

每个 `expected.dual-run.v1.json` 声明：

- `canonical_engine`（通常 `paddle`）
- 各 engine 的 `provenance` / `required_adapter_symptoms`
- `drift_vs_canonical` 期望（authoritative 维度须 `false`）

`evaluateDualRunGovernanceGate`：

| 检查 | 结果 |
|------|------|
| `governance_core_equal_all` | 失败 → CI fail |
| `materialized_rate_changed` 等未声明 | fail |
| `projection_version_changed` | fail |
| `taxonomy_changed`（degraded） | warn |
| 仅 observational experimental | advisory |

## 5. Promotion RFC 模板（PR 必填）

晋升 canonical 时，PR 描述须含：

1. **动机**：为何换基线（非「更准」一句带过）
2. **Dual-run 报告**：全部 corpus `governance_core_equal_all`
3. **Taxonomy diff**：`taxonomy_changed` 项与是否 intentional
4. **Ownership safety**：`degraded_global_pool` / `ownership_scope_missing` 无回归
5. **Replay**：`projection_version` 无意外 bump
6. **Rollback**：如何切回 `MPG_OCR_ENGINE=paddle`

## 6. 环境变量

- `MPG_OCR_ENGINE=paddle|got`（见 `.env.example`）
- 默认 **paddle**；got 仅 comparative / lab

## 7. 与 OCR Engine RFC 的关系

本 RFC 是 **流程宪法**；具体 engine（GOT、MinerU、Qwen-VL…）各需：

- adapter 实现
- `OcrFrontendProvenanceV1` 症状
- dual-run fixture 行
- 可选新 taxonomy class（须 RFC-0001 修订）

## 8. 与 Phase-2 semantic fallback 的关系

Frontend promotion（本 RFC）治理 **OCR engine / adapter**。

**Redraw / 矢量 semantic fallback** 的晋升门槛 **高于** 本 RFC（见 RFC-0001 §8.5）；若未来存在 redraw promotion，须 **单独 RFC**，不得借 frontend 晋升路径隐式升格 authoritative reconstruction。

## 9. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05 | 初稿：五阶段 + dual-run 门禁 + IR 边界 |
| 2026-05 | §8：与 Phase-2 semantic fallback 晋升分离 |
