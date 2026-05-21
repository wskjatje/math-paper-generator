# ADR-O19: Authority vs Fidelity 双轴（Constitutional Cognitive Publishing Runtime）

**状态**：Accepted（observational-first）

**相关**：[ADR-O18](./ADR-O18-projection-only-rendering.md)、[PROJECTION-FIDELITY-GOVERNANCE-v1.md](../PROJECTION-FIDELITY-GOVERNANCE-v1.md)

## 背景

Authority topology 已由 ADR-O18 + `governance:projection-purity` executable 化。下一阶段 P3.3 需要允许 **rendering quality 自由演进**，同时 **authority 永远冻结**。

## 决策

### 双轴正交

| 轴 | 问题 | 机制 |
|----|------|------|
| **Authority** | 谁有权解释/改写 cognition？ | ADR-O18、EPL forbidden APIs、parity/resilience CI |
| **Fidelity** | projection 质量如何？ | `assessProjectionFidelity`（observational metrics） |

**禁止**：用 fidelity 目标 justify authority mutation（例如为裁切而 reorder figure）。

### Projection Fidelity 指标（v1）

| Metric | 含义 |
|--------|------|
| `glyph_fidelity` | 字形保真（P3.3 primitives 后观测） |
| `baseline_fidelity` | baseline 稳定 |
| `vector_fidelity` | 数学向量质量 |
| `pagination_realization_fidelity` | negotiated physical pages 对 groups 的实现准确度 |

未实现 backend 时 metric 为 `null` + `unobservable_reason`（**不得** 回退为启发式分页）。

### 与 Frozen Interpretation Chain 的关系

```
canonical → AST → cognitive → pagination → negotiation → rendering
                                              ↑ authority ends here
rendering: fidelity only (no authority)
```

## 三轴治理（完整体系）

见 [ECR-RUNTIME-CONSTITUTION-v1.md](../ECR-RUNTIME-CONSTITUTION-v1.md)：

1. **Authority integrity** — projection-purity · parity · resilience  
2. **Fidelity quality** — `projection-fidelity:snapshot|compare`（observational）  
3. **Temporal stability** — frozen snapshot diff（fidelity compare 默认 advisory）

## 后果

- P3.3 PR：authority gates **硬失败**；fidelity metrics **可回归比较、不阻塞宪法**（直至显式 SLO）。
- 项目身份：**Constitutionally-Governed Multi-Plane Cognitive Runtime** — runtime jurisprudence，非 product feature 清单。
