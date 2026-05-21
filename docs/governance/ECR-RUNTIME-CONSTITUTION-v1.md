# ECR Runtime Constitution v1（Constitutionally-Governed Multi-Plane Cognitive Runtime）

**状态**：Accepted（engineering runtime；与 import enactment 正交）

**相关**：ADR-O16–O19、`governance:projection-purity`、`cross-medium-parity`、`negotiation-telemetry:*`

## Frozen Interpretation Chain

```
canonical → AST → cognitive → composition → pagination → negotiation → rendering
```

**仅 rendering 无 authority。** `lowerings never become authority`。

## Four authority invariants（全系统 · 通用）

理解 ECR 与 packing / parity / generic-exam 治理时，建议始终围绕四句（**非**题号/单卷/扫描件专规）：

1. **Semantic meaning is canonical.**  
2. **Cognition topology is frozen.**  
3. **Packing transforms are semantically non-generative.**（可解释、可观测、可 debug；不生成 cognition meaning、不参与 reasoning topology；Train 4 前为 stabilization 纪律，见 [PACKING-STABILIZATION-CHECKLIST.md](./PACKING-STABILIZATION-CHECKLIST.md)）  
4. **Rendering is projection-only.**

**共同根**：*Derived layers may optimize realization, but may never regain interpretive authority.*  
各 gate（projection-purity · parity · resilience · packing confinement · generic-exam-content-policy）防同一种风险：**authority creep**。

## Six Planes · Frozen Truth

| Plane | Frozen truth | Authority |
|-------|----------------|-----------|
| Semantic | canonical lineage | substrate |
| Structural | AST | derived |
| Cognitive | reading flow | derived |
| Composition | adaptive grouping | derived |
| Pagination | interruption topology | derived |
| Negotiation | physical compromise lineage | derived |
| Rendering | — | **projection only** |

## Dual Runtime Contract

| Plane | Nature | 决定什么 |
|-------|--------|----------|
| **Authority** | constitutive | cognition 是什么 |
| **Fidelity** | observational | projection 是否忠实 |

**宪法不变量**：`fidelity 可迭代，authority topology 永远冻结`（Constitutional Invariance）。

**观测层不变量**：`observational ≠ canonical` · `observational ≠ authority`（见下节）。

## Observational semantics（non-authoritative）

当前处于 **semantic stabilization**（非 governance freeze）；不抽独立 plane、不提前冻结 benchmark telemetry。Train 3（packing runtime）前须钉死边界语言，防 **semantic backflow**（observational policy 经 salience / shrink / relocation 偷获 cognition topology authority）。

### Boundary statement

> Observational semantics may explain projection behavior,  
> but may never redefine cognition topology.

### Explicit confinement

Observational signals are **non-authoritative**. They may influence:

- visual salience
- projection fidelity assessment
- observational diagnostics

They may **never** mutate:

- grouping
- `adaptivePresentation` topology
- pagination order
- negotiation sequencing
- continuity authority

## Three Orthogonal Governance Axes

| Axis | 防 / 量 | 工具 |
|------|---------|------|
| **1 — Authority integrity** | hidden renegotiation · cognition mutation · reinterpretation drift | `governance:projection-purity` · parity · resilience |
| **2 — Fidelity quality** | glyph / vector / pagination realization | `projectionFidelity` telemetry · `projection-fidelity:snapshot\|compare` |
| **3 — Temporal stability** | release regression · degradation topology | frozen snapshots · compare across epochs |

## P3.4 — Cognitive packing fidelity（draft）

任意卷 EPL：**packing / salience / transient hierarchy** 为 observational 治理域（非单卷专规）。见 [COGNITIVE-PACKING-FIDELITY-v1.md](./COGNITIVE-PACKING-FIDELITY-v1.md)、[PACKING-STABILIZATION-CHECKLIST.md](./PACKING-STABILIZATION-CHECKLIST.md)、`cognitivePackingObservability.shared.ts`。

## P3.3 — Projection primitives（非 layout intelligence）

Primitives = **realization substrate**，无 authority。

| 允许 | 禁止 |
|------|------|
| baseline solver · glyph packer · vector rasterizer · line box · bezier emission | semantic regroup · adaptive reorder · hidden figure relocation · cognition-aware overflow |

可执行：`projectionPrimitivesContract.shared.ts`

## Epistemic honesty

`UNOBSERVABLE` 是合法状态 — 禁止 fake fidelity score。见 `unobservable_reason` on fidelity metrics。

## Runtime maturation（正交 plane · 顺序）

| Phase | 核心 |
|-------|------|
| semantic | meaning freeze（canonical） |
| cognitive | topology freeze |
| pagination | interruption freeze |
| negotiation | compromise freeze |
| rendering | projection-only |
| packing | constrained spatial realization（transform-conditioned） |
| observability | non-generative instrumentation（debug；非 governance truth） |
| telemetry | stabilized transform governance（**Train 4+**；勿在 stabilization 期 freeze） |

## PR Gate（P3.3）

| Gate | 轴 |
|------|-----|
| projection-purity | Authority（blocking） |
| parity-regression | Authority |
| resilience-regression | Authority |
| projection-fidelity:compare | Fidelity + Temporal（advisory v1） |
