# 导入图链 Governance（宪法索引）

**Governance Constitution v1 (draft)** — formal ontology review / **pre-ratification** 阶段；ratify 后进入 **enacted constitutional era**（见 [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)）。**暂缓** redraw signal 草案与 redraw L3 corpus。

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

**Constitutional principle**：`semantic ≠ authoritative`（RFC-0001 §5–§8）— 防止 artifact / semantic / runtime 三种 truth 塌缩。

## 四层权威模型（ratification 后）

| 层 | 角色 |
|----|------|
| Capability | 能产生语义；**≠** authoritative |
| Governance | 裁决 legitimacy（RFC、ADR） |
| Executable | 强制执行；faithful implementation |
| Runtime | 遵守 Accepted ADR 约束 |

**Ontology ratified at**：见 [RFC-0001](rfcs/RFC-0001-governance-ontology.md) 元数据（会后落态 → [RATIFICATION-CHECKLIST-v1.md](RATIFICATION-CHECKLIST-v1.md)）。Authority 扩张四问 → [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md)。

## Constitutional stack（当前状态）

对 **semantic authority** 建立可审计宪制 — 非仅 OCR pipeline 文档。

| 层 | 当前状态 | Authority |
|----|----------|-----------|
| Capability | 可快速实验 | 无 semantic legitimacy |
| Runtime | 可实现 heuristic | 必须服从 constitution |
| Executable governance | faithful enforcement（待 ratify 后 merge PR） | 派生 authority |
| Governance constitution | semantic judiciary（ADR/RFC 草案） | **唯一** truth semantics 来源 |
| **Ratification ceremony** | **待执行** | **semantic epoch 起点** |

**待办（唯一）**：[Enactment ceremony](RATIFICATION-CHECKLIST-v1.md) — ADR status flip → `ratified_at` → Constitution-only PR merge。

Ratify 后：semantic time 存在；pre-constitutional 实现史失去 binding authority；ontology amendment 须正式 lineage。

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

## Foundation ontology set（当前）

| Archetype | Corpus | 层级 |
|-----------|--------|------|
| `healthy_materialized_bind` | `materialized-bind-01` | synthetic |
| `markdown_reconcile_gap` | `placeholder-token-01` | synthetic |
| `degraded_global_pool` | `degraded-global-01` | synthetic |
| `ownership_scope_missing` | `q24-double-figure` | L3 |
| `no_materialization` | `ocr-no-crop` | L3 |

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
