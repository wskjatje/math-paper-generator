# Cross-Medium Parity Governance v1（P3.2.5）

**状态**：Accepted（`negotiation-governance.yml` → `parity-regression`）

**相关**：[NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md](./NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md)、[ADR-O17](./decisions/ADR-O17-negotiation-lineage-and-pdf-lowering.md)

## 宪法

```
同一 cognitive truth（paginated）→ 多 viewport 仅 lower differently，不得 reinterpret。
All higher planes are derived-only. Lowerings never become authority.
```

## Medium parity triad（governance object）

| Viewport | 角色 |
|----------|------|
| `pdf_a4` | **reference**（desktop paper） |
| `pdf_exam_booklet_dense` | booklet / gutter 压力 |
| `mobile_ultra_narrow` | 窄屏 stacked degradation |

**不是** responsive CSS breakpoint。

## 观测指标

| 指标 | 含义 |
|------|------|
| `continuity_drop_from_reference` | 相对 reference 的 continuity 最大跌落 |
| `max_severity_shift_from_reference` | severity 直方图 L1 漂移（reference → stress viewport） |
| `catastrophic_spread_delta_from_reference` | catastrophic 占比相对 reference 上升 |
| `figure_detachment_escalation` | stress viewport 上图题语义破坏多于 reference |
| `cascading_negotiation_rate_range` | 跨 viewport 级联 defer 率极差 |

## CLI

```bash
npm run inspect:cross-medium-parity -w @zhixue/web -- --corpus
npm run cross-medium-parity:snapshot -w @zhixue/web -- --out data/cross-medium-parity-snapshots/2026-05-20
npm run cross-medium-parity:compare -w @zhixue/web -- \
  --baseline data/cross-medium-parity-snapshots/2026-05-20 \
  --current data/cross-medium-parity-snapshots/parity-ci-current
```

## 与 P3.3 的关系

PDF primitives 上线前后，**parity compare 不变**：比较的是 negotiation lineage，不是像素。
