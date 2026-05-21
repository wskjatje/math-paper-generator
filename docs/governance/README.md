# 导入图链 Governance（宪法索引）

## 项目级通用规范（试卷 / 图片）

**[generic-exam-content-policy.md](generic-exam-content-policy.md)** — 试卷结构、图片地址、图片标签/数量：**禁止写死单卷单题**；按题型与题干/图池推导。导入路径细则见 [import-generic-rules-policy.md](import-generic-rules-policy.md)。PR 与 Agent 新增逻辑须先对照该文自检。

---

## ECR 六平面运行时宪法

→ [ECR-RUNTIME-CONSTITUTION-v1.md](ECR-RUNTIME-CONSTITUTION-v1.md)（Authority / Fidelity / Temporal 三轴 · Frozen Interpretation Chain）

## 系统状态

→ 完整声明：[CONSTITUTIONAL-STATE-v1.md](CONSTITUTIONAL-STATE-v1.md)（**constitutional state declaration**）

| | |
|---|---|
| **Bootstrap** | **Complete** — structurally complete；binding authority **dormant** |
| **Enactment** | **Pending** — [Ratification ceremony](RATIFICATION-CHECKLIST-v1.md) = **turning constitutional time on** |

```
draft constitutional order  →  [ ADR flip · ratified_at · Constitution-only merge ]  →  enacted semantic legal order
```

**Pre-enactment**：dual-run = pre-constitutional judiciary · redraw = reserved lexicon · GOT = experimental citizen · bench = draft enforcement · runtime = capability substrate only。

**Post-enactment**：executable 首次获得 derivative legitimacy · runtime 进入 constitutional era · semantic citizenship 可授予 · ontology amendment 须合法 lineage。

---

**Governance Constitution v1 (draft)** — **pre-ratification**；ratify 后进入 **enacted constitutional era**（见 [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)）。**暂缓** redraw signal 草案与 redraw L3 corpus。

> **Core methodology:** Governance semantics evolve more slowly than runtime capability.
> The governance lifecycle has higher priority than the runtime lifecycle.

本目录是 **OCR / 导入编译器治理语言** 的正式沉淀区：ontology、review ABI、frontend 晋升、corpus 纪律。实现与门禁以仓库代码与 fixture 为准；本文档定义**制度语义**（executable governance companion，与 bench / dual-run / CI 同构）。

> **Canonical ≠ 最好**：`canonical` 表示当前已批准的 governance 基线，不表示识别最准或最先进。

## 编译器栈与治理层（当前共识）

| 层 | 稳定对象 | Governance 化 |
|----|----------|---------------|
| Frontend | Paddle / GOT adapter | ✓ |
| Canonical IR | `StructuredExamOcrDocument` | ✓ |
| Materialization | raster / registry / refs | ✓ |
| Ownership | linker / degraded pool 策略 | ✓ |
| Governance | taxonomy / projection / corpus / CI | ✓ |
| **EPL / ECM**（Layer B） | Educational AST · derived presentation | ✓ [ADR-O16](decisions/ADR-O16-truth-preserving-presentation.md) |

**Constitutional principle**：`semantic ≠ authoritative`（RFC-0001 §5–§8）— 防止 artifact / semantic / runtime 三种 truth 塌缩。

**Presentation invariant**（Layer A ↔ Layer B）：*Presentation can evolve infinitely. Semantic provenance must remain frozen.* — truth-preserving lowering；详见 [ADR-O16](decisions/ADR-O16-truth-preserving-presentation.md)、[ECM](../architecture/educational-composition-model.md)。

## 四层权威模型（ratification 后）

| 层 | 角色 |
|----|------|
| Capability | 能产生语义；**≠** authoritative |
| Governance | 裁决 legitimacy（RFC、ADR） |
| Executable | 强制执行；faithful implementation |
| Runtime | 遵守 Accepted ADR 约束 |

**Ontology ratified at**：见 [RFC-0001](rfcs/RFC-0001-governance-ontology.md) 元数据（会后落态 → [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md)）。Authority 扩张四问 → [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)。

## Constitutional stack（当前状态）

**Semantic governance bootstrap** — 对 **semantic authority** 建立可审计宪制（substrate 之上的 enactment / lineage / epoch）；非仅 OCR pipeline 文档。

| 层 | 当前状态 | Authority |
|----|----------|-----------|
| Capability | 可快速实验 | 无 semantic legitimacy |
| Runtime | 可实现 heuristic | 必须服从 constitution |
| Executable governance | faithful enforcement（待 ratify 后 merge PR） | 派生 authority |
| Governance constitution | semantic judiciary（ADR/RFC 草案） | **唯一** truth semantics 来源 |
| **Ratification ceremony** | **待执行** | **semantic epoch 起点** |

**待办（唯一）**：[Enactment ceremony](RATIFICATION-CHECKLIST-v1.md) — ADR status flip → `ratified_at` → Constitution-only PR merge。

Ratify 后：semantic time 存在；pre-constitutional 实现史失去 binding authority；ontology amendment 须正式 lineage。

**Anti-semantic-collapse axioms**（全体系根）：

| Invariant | 防止 |
|-----------|------|
| `semantic ≠ authoritative` | redraw / heuristic 冒充 authority |
| `capability ≠ legitimacy` | 「效果更好」自动升格 truth |

Foundation 五条 = 上述公理在 OCR/materialization/linker 上的首批司法化体现。

### Semantic legal order（制度 ↔ 仓库）

| 制度角色 | 仓库对应 | 路径 |
|----------|----------|------|
| **Legislature**（semantic law） | RFC-0001–0004、`ratified_at` | [rfcs/](rfcs/) |
| **Case law / precedent** | ADR-O1–O15 | [decisions/](decisions/) |
| **Enactment** | Ratification ceremony | [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md) |
| **Legal vocabulary** | Taxonomy + traceability | [taxonomy/](taxonomy/) · [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md) |
| **Temporal law** | Semantic epoch | RFC-0001 `Ontology ratified at` |
| **Judiciary**（enforce，非立法） | Bench、dual-run、gates | `importPipeline*` · CI workflow（ratify 后 merge） |
| **Evidence** | Foundation + L3 corpus | `tests/fixtures/import-pipeline/` |
| **Separation of powers** | PR 分类 | [PR-CLASSIFICATION.md](PR-CLASSIFICATION.md) |
| **Promotion law** | Frontend 晋升 | [RFC-0003](rfcs/RFC-0003-frontend-promotion.md) |
| **Citizenship / ancestry** | Chain of custody、四问 | TRACEABILITY · [EXECUTABLE-GOVERNANCE-SCOPE-v1.md](EXECUTABLE-GOVERNANCE-SCOPE-v1.md) |

**Capability producers**（OCR/GOT/Paddle）≠ **authoritative pipeline**（IR/materialize/linker）≠ **executable judiciary**（bench/dual-run）≠ **legislature**（RFC/ADR/ratified_at）。

**正确顺序**：ontology → constitution → **ratification** → executable legitimacy → runtime enforcement（禁止 gate 先行反向定义 ontology）。

**Pre-ratification 现状**：bench / dual-run / reserved lexicon / experimental frontend = **无 constitutional citizenship**；见 checklist 纪律。

**Foundation 五条** = constitutional **calibration baselines**（非普通测试样例）：未来 capability 须相对其报告 drift，不得自定义「看起来更好」。

**几年后仍须能回答**（见 [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)）：何时合法化？哪个 epoch？cite 哪条 ADR？capability / promotion / amendment？CI fail 是 bug 还是 constitutional violation？

## PR 分类（长期）

→ [PR-CLASSIFICATION.md](PR-CLASSIFICATION.md)（Constitution / Executable / Runtime 分 PR 审）

## 目录结构

```
docs/governance/
  README.md                 ← 本文件
  ONTOLOGY-REVIEW-v1.md
  ONTOLOGY-REVIEW-AGENDA-v1.md
  PR-CLASSIFICATION.md
  decisions/              ← ADR-O1…O15
  RATIFICATION-CHECKLIST-v1.md
  CONSTITUTIONAL-STATE-v1.md
  CONSTITUTIONAL-TRACEABILITY-v1.md
  rfcs/
    RFC-0001-governance-ontology.md
    RFC-0002-projection-stability.md
    RFC-0003-frontend-promotion.md
    RFC-0004-corpus-governance.md
  taxonomy/
    taxonomy-semantics.md
  projections/
    projection-version-policy.md
  corpus/
    l3-guidelines.md
```

## 版本化协议（正式 API）

| 协议 | 权威路径 | 版本 |
|------|----------|------|
| Failure taxonomy | `apps/web/tests/fixtures/import-pipeline/failure-taxonomy.v1.json` | v1 |
| Bench projection | `ImportPipelineBenchGoldenV1.projection_version` | 1 |
| Link traces | `figure_link_traces_v1` | v1 |
| OCR frontend provenance | `OcrFrontendProvenanceV1.version` | 1 |
| Dual-run fixture | `expected.dual-run.v1.json` | 1 |
| Governance gate | `evaluateDualRunGovernanceGate` / `evaluateImportPipelineGovernanceGate` | 隐式 v1 |

## Foundation ontology set（constitutional calibration baselines）

Substrate（OCR、linker、bench、dual-run、CI）之上的 **semantic collapse 校准** — 后续 redraw / GOT / multimodal 争论须回答：是否跨越下列 authority boundary？

| Baseline (archetype) | Corpus | 卡住的 semantic collapse |
|----------------------|--------|---------------------------|
| `healthy_materialized_bind` | `materialized-bind-01` | materialization ↔ ownership |
| `markdown_reconcile_gap` | `placeholder-token-01` | placeholder ↔ real artifact |
| `degraded_global_pool` | `degraded-global-01` | degraded ↔ authoritative |
| `healthy_materialized_bind` | `parent-question-double-figure`（post-align） | 共图大题 align 后子题 bind |
| `ownership_scope_missing` | （synthetic 待补） | availability ↔ binding legitimacy |
| `no_materialization` | `ocr-no-crop` | OCR plan ↔ persisted topology |

| 层级 | synthetic / L3 |
|------|----------------|
| 上表前三 | synthetic |
| 后二 | L3 |

**Phase-2**（`redraw_only_fallback` 等）：语义 fallback / mixed-topology — 边界见 [RFC-0001 §6–§8](rfcs/RFC-0001-governance-ontology.md#8-phase-2-semantic-boundary冻结前不得扩-l3)。**冻结前不得扩 redraw L3。**

## 执行入口

```bash
npm run import-pipeline:bench -w @zhixue/web
npm run import-pipeline:dual-run -w @zhixue/web
npm run import-pipeline:taxonomy-coverage -w @zhixue/web
```

CI：`.github/workflows/import-pipeline-governance.yml`（governance-sensitive path 触发）

## Protocol review（当前阶段）

团队 **formal ontology review**（非 OCR / renderer / heuristic 评审）：

→ [ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md)  
→ [ONTOLOGY-REVIEW-AGENDA-v1.md](ONTOLOGY-REVIEW-AGENDA-v1.md)（待决清单）  
→ [ONTOLOGY-REVIEW-FACILITATOR-v1.md](ONTOLOGY-REVIEW-FACILITATOR-v1.md)（主持人稿）  
→ [decisions/](decisions/)（ADR-O* 裁决记录）

通过后：冻结 vocabulary → 再考虑 redraw signal 草案 → 最后 redraw L3。

Executable PR 范围（review 通过后）：[EXECUTABLE-GOVERNANCE-SCOPE-v1.md](EXECUTABLE-GOVERNANCE-SCOPE-v1.md)。

## RFC 阅读顺序

1. [RFC-0001 治理 Ontology](rfcs/RFC-0001-governance-ontology.md)（含 §6–§8 semantic boundary 冻结）
2. [RFC-0002 投影稳定性](rfcs/RFC-0002-projection-stability.md)
3. [RFC-0003 Frontend 晋升](rfcs/RFC-0003-frontend-promotion.md)
4. [RFC-0004 Corpus 治理](rfcs/RFC-0004-corpus-governance.md)

## 变更流程

- 修改 `failure-taxonomy.v1.json` 或 `projection_version` → 须 RFC 修订 + corpus baseline 更新 + CI 绿。
- 新增 L3 → 遵循 [l3-guidelines.md](corpus/l3-guidelines.md)。
- 晋升 canonical frontend → 遵循 [RFC-0003](rfcs/RFC-0003-frontend-promotion.md)。
