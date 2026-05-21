# ECR Runtime Constitution v1（Constitutionally-Governed Multi-Plane Cognitive Runtime）

**状态**：Accepted（engineering runtime；与 import enactment 正交）

**相关**：ADR-O16–O19、`governance:projection-purity`、`cross-medium-parity`、`negotiation-telemetry:*`

## Frozen Interpretation Chain

```
canonical → AST → cognitive → composition → pagination → negotiation → rendering
```

**仅 rendering 无 authority。** `lowerings never become authority`。

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

## Three Orthogonal Governance Axes

| Axis | 防 / 量 | 工具 |
|------|---------|------|
| **1 — Authority integrity** | hidden renegotiation · cognition mutation · reinterpretation drift | `governance:projection-purity` · parity · resilience |
| **2 — Fidelity quality** | glyph / vector / pagination realization | `projectionFidelity` telemetry · `projection-fidelity:snapshot\|compare` |
| **3 — Temporal stability** | release regression · degradation topology | frozen snapshots · compare across epochs |

## P3.4 — Cognitive packing fidelity（draft）

图1 vs 原卷：semantic 已对齐，**packing / salience / transient hierarchy** 待治理。见 [COGNITIVE-PACKING-FIDELITY-v1.md](./COGNITIVE-PACKING-FIDELITY-v1.md)、`cognitivePackingObservability.shared.ts`。

## P3.3 — Projection primitives（非 layout intelligence）

Primitives = **realization substrate**，无 authority。

| 允许 | 禁止 |
|------|------|
| baseline solver · glyph packer · vector rasterizer · line box · bezier emission | semantic regroup · adaptive reorder · hidden figure relocation · cognition-aware overflow |

可执行：`projectionPrimitivesContract.shared.ts`

## Epistemic honesty

`UNOBSERVABLE` 是合法状态 — 禁止 fake fidelity score。见 `unobservable_reason` on fidelity metrics。

## PR Gate（P3.3）

| Gate | 轴 |
|------|-----|
| projection-purity | Authority（blocking） |
| parity-regression | Authority |
| resilience-regression | Authority |
| projection-fidelity:compare | Fidelity + Temporal（advisory v1） |
