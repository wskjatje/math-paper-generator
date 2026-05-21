# Cognitive Packing Fidelity v1（P3.4 路线图 · observational-first）

**状态**：Draft（Release Train；**Train 1 P0 已落地**）

## Release Train（禁止单 PR 混合）

| Train | 范围 | 状态 |
|-------|------|------|
| **1** | P0 projection leak（appendix + registry end_fallback） | ✅ 见 `projectionLeakGuard.shared.ts` |
| **2** | P3.4-1 figure cognitive role | ✅ 见 `FIGURE-COGNITIVE-ROLE-v1.md` |
| **3** | P3.4-2 packing runtime | ✅ `cognitivePackingRuntime.shared.ts`（kickoff constitution + v1 transforms） |
| 4 | P3.4-3 packing fidelity telemetry | 待做（runtime 稳定后） |
| 5 | P3.4-4 transient lifecycle | 待做 |

每 Train 后：`parity` / `resilience` / `projection-purity` snapshot；packing 指标在 Train 4 起冻结对比。

**相关**：[ECR-RUNTIME-CONSTITUTION-v1.md](./ECR-RUNTIME-CONSTITUTION-v1.md)（含 [observational confinement](./ECR-RUNTIME-CONSTITUTION-v1.md#observational-semantics-non-authoritative)）、[FIGURE-COGNITIVE-ROLE-v1.md](./FIGURE-COGNITIVE-ROLE-v1.md)、[PROJECTION-FIDELITY-GOVERNANCE-v1.md](./PROJECTION-FIDELITY-GOVERNANCE-v1.md)、ADR-O18

## Train 3 — Packing runtime kickoff constitution

**性质**：Train 3 开始前的 **constitutional vocabulary**（非 runtime 设计、非 telemetry freeze）。延续 Commit 3 的 `observational ≠ authority`：把「空间优化」正式降级为 **constrained transform**，在 constitutional sandbox 内实验，不升格为 authority plane。

### 总原则

> Packing transforms may optimize spatial realization,  
> but may never reinterpret cognitive topology.

与 ECR 一致：observational 可解释 projection，**不得** mutate grouping · `adaptivePresentation` topology · pagination order · negotiation sequencing · continuity authority。

### Transform taxonomy

| Allowed（packing-preserving · 调 space） | Forbidden（authority creep · 调 meaning choreography） |
|------------------------------------------|--------------------------------------------------------|
| adjacency tightening | regroup |
| density recovery | reorder |
| supportive compaction | semantic reprioritization |
| transient collapse | continuity reinterpretation |
| inline persistence tuning | hidden negotiation |

**够用词汇（本 Train；不引入新 ontology）**：adjacency integrity · supportive compression · topology preservation · attention persistence · visual interruption。

### Review framing

**Packing review evaluates topology preservation, not visual similarity to source paper.**

PR / review 须回答：该 transform 是否越权改变 cognition choreography — 而非「更像原卷」「更紧凑」「视觉更舒服」。

### Train 3 non-goals

Train 3 **does NOT**:

- introduce new cognition authority
- mutate `adaptivePresentation` semantics
- reorder reasoning flow
- freeze telemetry ontology
- formalize observational semantics plane（`figure_observational_semantics_v1` 等）
- formalize cognition benchmark fixtures（如 Q24 stress fixture）
- introduce cadence graph / visual entropy / attention inertia 等新术语层

**顺序（须守）**：runtime stabilization → telemetry freeze（Train 4）→ ontology / benchmark formalization — 不反向。

## 问题定性

| 已解决（结构性） | 尚未解决（P3.4） |
|------------------|------------------|
| Figure ownership → `question_with_figure` CognitiveGroup | **Cognitive packing density**（推理块 vs 内容流） |
| `keepWithFigure` · reading flow · negotiation lineage | **Figure cognitive role**（supportive vs primary vs transient） |
| Semantic / AST / registry 正确 | **Attention topology**（salience · 紧凑度 · 参数贴近） |

**关键判断**：`semantic correctness ≠ cognitive fidelity`。  
图1/图2 差异主因不是 OCR，而是 **composition density drift** + **legacy projection leak**。

## 图1 症状与代码锚点（可审计）

1. **双通道出图（projection leak）**  
   `exam.$id.tsx` 在 `EducationalDocumentRenderer` 之后仍渲染 `RasterFigureAppendix`（`stemAppendixUrls`）→ 卷面附图与 EPL 内图重复。

2. **Registry 未匹配图 → `end_fallback`**  
   `injectRegistryFiguresIntoEducationalAst` 将未匹配 registry 图 append 为 `placement: "end_fallback"` → `standalone_figure` 认知组，脱离 QWF 紧凑块。

3. **Salience 默认偏大**  
   `EducationalFigureBlock`：`layoutKind !== compact` 时 `max-h-[min(50vh,420px)]`；QWF 内虽用 `compact`，fallback/standalone 仍为 block 级视觉权重。

4. **Compositor 偏 content flow**  
   `EducationalSectionCompositor`：`bodyGroups` 逐组 `space-y` 竖排 → **cognitive over-expansion**（原卷高耦合 (II)+①+图② 被拉成纵向流）。

## 治理边界（须守 ADR-O18）

| 允许（composition / cognitive plane） | 禁止（lowering 偷权） |
|--------------------------------------|------------------------|
| `figureCognitiveRole` · `visualDominance` · packing priority | renderer 内 `reposition` / `reorder` / 启发式 `addPage` |
| 收紧 appendix 与 EPL 互斥策略 | 为裁切在 PDF 层改 cognition 拓扑 |
| packing fidelity telemetry | fake fidelity 分数 |

## P3.4 优先级

1. **Figure Cognitive Role System** — `supportive` | `reasoning_core` | `transient` | `reference_only` → 驱动尺寸/inline/block/persistence  
2. **Cognitive Packing Runtime** — reasoning-density preserving composition（非单纯 flex-row）  
3. **Packing fidelity telemetry** — `packing_fidelity` · `attention_divergence` · `visual_dominance_drift`（observational，与 authority gate 正交）  
4. **Transient figure lifecycle** — ephemeral artifacts 不进入全局 document flow  

## 与现有指标的关系

- **Reading flow**（P2.4）：`figureDetachmentRisk` · `FIGURE_CUE_WITHOUT_COGNITIVE_BIND` — 已有，偏 bind 质量  
- **Negotiation / parity**：物理妥协与跨媒介 — 已有  
- **Projection fidelity**（ADR-O19）：pagination realization — 已有；**packing** 为下一 observational 扩展  

## 近期可落地（不改变 authority）

- EPL 路径下：**抑制已与 AST/registry 绑定的 `RasterFigureAppendix`**（消除双通道）  
- Registry inject：**transient/supportive 角色** 决定 append 策略，而非一律 `end_fallback` block  
