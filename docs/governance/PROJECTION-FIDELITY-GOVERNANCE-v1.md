# Projection Fidelity Governance v1（Authority 正交轴）

**状态**：Accepted（observational-first；非 blocking gate v1）

**相关**：[ADR-O19](./decisions/ADR-O19-authority-vs-fidelity-dual-axis.md)、[PROJECTION-PURITY-GOVERNANCE-v1.md](./PROJECTION-PURITY-GOVERNANCE-v1.md)

## 双轴

```
Authority  →  Who may interpret cognition?  (constitutional, frozen)
Fidelity   →  How good is the projection?   (evolvable quality)
```

**Projection Completeness ≠ Projection Authority** — completeness 提升 fidelity，不得获得 authority。

## 指标注册表

实现：`apps/web/src/lib/projectionFidelity.shared.ts`

| ID | v1 状态 |
|----|---------|
| `pagination_realization_fidelity` | 可从 `NegotiatedPaginatedDocumentV1` 观测 |
| `glyph_fidelity` | UNOBSERVABLE until P3.3 primitives |
| `baseline_fidelity` | UNOBSERVABLE until P3.3 primitives |
| `vector_fidelity` | UNOBSERVABLE until P3.3 primitives |

## 使用

```typescript
const model = lowerNegotiatedDocumentToPdfModel(negotiated);
// model.fidelity — observational only; never mutates negotiated
```

## Temporal telemetry（Axis 3）

```bash
npm run projection-fidelity:snapshot -w @zhixue/web -- --out data/projection-fidelity-snapshots/2026-05-20
npm run projection-fidelity:compare -w @zhixue/web -- \
  --baseline data/projection-fidelity-snapshots/2026-05-20 \
  --current data/projection-fidelity-snapshots/fidelity-ci-current
```

Compare 默认 **advisory**（`exitCode=0`）；authority 不得因 fidelity 压力而放宽。

## PR 策略（P3.3）

| Gate | 类型 |
|------|------|
| `governance:projection-purity` | **blocking**（authority） |
| `parity-regression` / `resilience-regression` | **blocking**（cognition drift） |
| `projection-fidelity:compare` | **advisory**（fidelity + temporal） |

## 禁止

- 为提升 fidelity 在 lowering 中 regroup / reorder / split / hidden defer
- 将 `null` fidelity 用启发式分页“凑分”
