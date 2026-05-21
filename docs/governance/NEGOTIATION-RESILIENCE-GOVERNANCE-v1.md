# Negotiation Resilience Governance v1（P3.2.4）

**状态**：Accepted（与 `negotiation-governance.yml` 配套）

**相关**：[educational-composition-runtime.md](../architecture/educational-composition-runtime.md)、[ADR-O17-negotiation-lineage-and-pdf-lowering.md](./decisions/ADR-O17-negotiation-lineage-and-pdf-lowering.md)

## 目标

从 **governed runtime** 推进到 **resilient runtime**：比较「变坏多少」（degradation topology），而非仅「有没有变坏」。

## 不变量（必须守）

```
All higher planes are derived-only.

semantic → structural → cognitive → composition → pagination → negotiation → rendering
```

| 禁止 | 后果 |
|------|------|
| PDF / renderer 内嵌第二分页器 | 失去 replay、negotiation truth、stress 有效性 |
| `physical_footprint_units` 渗入 pagination / cognitive | cross-medium semantic drift |
| stress profile 当作 responsive CSS | 治理对象退化为视觉调参 |

## Resilience 指标（topology）

| 指标 | 含义 |
|------|------|
| `severity_distribution_shift` | L1 归一化 severity 直方图漂移 |
| `catastrophic_spread` | catastrophic 决策占比 / 绝对上升 |
| `critical_path_break_rate` | QWF 关键路径上 catastrophic 或 keepWithFigure 语义破坏 |
| `cascading_negotiation_rate` | 同一 logical page 上 ≥2 次 defer（级联妥协） |
| `compound_compromise_rate` | 多策略拒绝 + 高 continuity loss 的复合妥协 |

## Stress 环境

`pdf_low_margin`、`pdf_exam_booklet_dense`、`mobile_ultra_narrow` 是 **adversarial cognition environments**，不是 UI breakpoint。

## CLI

```bash
# 冻结 stress 基线
npm run negotiation-telemetry:snapshot -w @zhixue/web -- \
  --out data/negotiation-telemetry-snapshots/2026-05-20-stress-pdf_low_margin \
  --stress-profile pdf_low_margin

# Resilience regression（degradation topology）
npm run negotiation-telemetry:compare-resilience -w @zhixue/web -- \
  --baseline data/negotiation-telemetry-snapshots/2026-05-20-stress-pdf_low_margin \
  --current data/negotiation-telemetry-snapshots/stress-ci-current
```

## 与 P3.3 的边界

P3.3 PDF primitives **仅** `lowerNegotiatedDocumentToPdfModel(NegotiatedPaginatedDocumentV1)` — 禁止 negotiate / paginate / compose / 启发式 `newPage()` 决策。
