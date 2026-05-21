# Packing Stabilization Checklist（通用 · topology-preserving）

**性质**：Train 3 stabilization 的 **human-readable packing review protocol**；适用于**任意**导入/生成卷 EPL 题面，非单卷/单题专规。

**启用**：卷面 URL `?packing_debug=1`（本地 `import.meta.env.DEV` 亦可见图例）。与 `?figures_debug=1` 正交。

**评审问题**（不是「更像某份原卷」）：

> 该目视结果是否由 **topology-preserving** packing transform 导致，且 **未** 改变 cognition choreography？

**宪法立场（通用）**：原卷/扫描件/PDF 样张仅为 **observational reference**，不是 semantic authority。验收 **topology preservation**，不以某份扫描件视觉相似度为准。

**长期 invariant（结构型）**：

1. canonical — **structure-conditioned**  
2. cognition — **topology-conditioned**  
3. packing — **transform-conditioned**（合法对象：QWF · role · transform 名；非法 authority：题号 · 单卷 ·「像原卷」）

**Train 4 前须防**：Transform semantic inflation（spatial transform → 语义优先级 → cognition authority creep）。观测元数据可解释 projection，**不得**重定义 cognition semantics（Train 4 freeze 时再正式命名）。

## Stabilization-before-governance-freeze（纪律 · 至 Train 4）

1. **不新增 transform taxonomy** — 现有四类足够；优先 **interaction stability**，不扩 coverage。  
2. **不让 debug 属性进入 scoring** — `data-packing-*` 不得写入 telemetry freeze / parity compare（防 observability → authority）。  
3. **benchmark 不驱动 runtime** — `case_id` 仅 observational / regression / parity；禁止 `if (case_id)` 分支触发 transform（防 benchmark backflow）。

## Checklist（结构驱动 · 通用）

| # | 项 | 通过信号 |
|---|-----|----------|
| 1 | `question_with_figure` 绑定未破坏 | 存在 `data-cognitive-role="question_with_figure"`；题干子问与锚定图仍在**同一** cognitive group |
| 2 | `supportive` 不主导 vertical cadence | 带「如图」cue 的辅助图有 `supportive_compaction`（debug 蓝框）；视觉权重低于同簇 `reasoning_core` |
| 3 | `appendix_only` 不进主 cadence | `附图*` / `附录图*` 为 `transient_collapse` 或 suppressed 占位；无 EPL + 附录条**双通道** |
| 4 | 无 post-QWF standalone hijack | 同 section 内 `standalone_figure` 不紧跟 QWF 抢注意力（或 debug 下已 collapsed） |
| 5 | adjacency 收紧无 reorder | `data-packing-transforms` 可含 `adjacency_tightening`；`cognitive_layout.groups` 组序与 role 序列未变 |
| 6 | 跨 viewport 拓扑一致 | 窄屏/booklet 仅 `effectiveAdaptivePresentation` lowering；**无** regroup / 组序 / negotiation 语义变化 |

## Transform interaction watchlist（通用 · stabilization）

单 transform 合法 ≠ 叠加稳定。人工 review 须额外看 **interaction**（不进 telemetry freeze）：

| Interaction | 风险（假阳性稳定） |
|-------------|-------------------|
| supportive_compaction × adjacency_tightening | pseudo-inline 错觉（像 regroup，拓扑未变） |
| transient_collapse × inline_persistence_tuning | hidden cadence gap |
| supportive_compaction × narrow viewport | accidental salience inversion（supportive 像 reasoning_core） |
| adjacency_tightening × QWF chain | visual regroup illusion |

**两类必查假阳性**：

1. **Pseudo-regroup illusion** — governance 不报警，但人类以为 subquestion/图 ownership 被重解释。  
2. **Salience inversion under stress viewport** — authority 仍在，fidelity drift；在 `mobile_vertical` / `pdf_exam_booklet` 等 profile 下复看。

## Transform footprint（debug DOM · 通用）

- `data-packing-transforms` — 生效 transform 列表  
- `data-packing-role` — derived figure role（非 canonical）  
- `data-packing-density` — `tight` \| `inline-tight` \| `collapsed` \| `suppressed`  

**Observational honesty**：suppressed 图须可见占位（灰虚线），不得与「从未存在」不可区分。

## 明确 non-goals（本阶段 · 通用）

- 不以「视觉相似度」或「像某卷扫描件」验收  
- 不写入 parity / resilience / packing snapshot  
- 不冻结 packing telemetry ontology  
- 不用题号（`q24` 等）作为规则触发条件（见 [generic-exam-content-policy.md](./generic-exam-content-policy.md)）

**相关**：[COGNITIVE-PACKING-FIDELITY-v1.md](./COGNITIVE-PACKING-FIDELITY-v1.md) · [ECR-RUNTIME-CONSTITUTION-v1.md](./ECR-RUNTIME-CONSTITUTION-v1.md) · 人工纪要模板（非 freeze）：[PACKING-STABILIZATION-LOG-template.md](./PACKING-STABILIZATION-LOG-template.md)
