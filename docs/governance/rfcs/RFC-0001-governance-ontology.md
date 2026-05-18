# RFC-0001: Governance Ontology

> **Constitutional freeze (v1 draft):** This RFC freezes governance ontology **before**
> semantic-fallback archetypes are admitted into canonical corpus governance.
> Ontology stability takes precedence over semantic capability expansion.
>
> **Core methodology:** Governance semantics evolve more slowly than runtime capability.

| 字段 | 值 |
|------|-----|
| Status | **Draft** — *Governance Constitution v1*（foundation 已落地；§6–§8 冻结语义边界；**protocol review phase**） |
| Scope | 导入图链 / OCR frontend 比较治理 |
| 权威数据 | `apps/web/tests/fixtures/import-pipeline/failure-taxonomy.v1.json` |

## 1. 目的

定义 **失败分类本体（ontology）**：可归档的标本身份、可观测的不变量、与运行时分类器的关系。避免将 heuristic 标签当作长期档案 ID。

## 2. 核心概念

### 2.1 Taxonomy class（类）

`failure-taxonomy.v1.json` 中的 `classes.<id>`，包含：

| 字段 | 含义 |
|------|------|
| `severity` | `blocking` \| `degraded` \| `cosmetic` |
| `symptoms` | 人读症状描述 |
| `canonical_signal` | 机器可验证的不变量列表 |
| `root_cause_layer` | 归因层（materialize / ownership / ocr_frontend / …） |
| `expected_fix_stage` | 预期修复阶段标签 |
| `priority` | 多类同时命中时的消歧优先级 |

### 2.2 Expected taxonomy vs Detected taxonomy

| 概念 | 语义 | 稳定性 |
|------|------|--------|
| **Expected taxonomy** | Corpus `case.meta.taxonomy`：**标本档案身份** | 随 specimen 固定，不随 classifier 改 |
| **Detected taxonomy** | `detectImportFailureTaxonomy()` 运行时命中 | 可随 priority / 信号演进变化 |

**纪律**：评审 corpus 时以 **expected** 为准；**detected** 用于 drift 分析与并列类记录（`detected_taxonomy_also`）。

Classifier 优先级变更不得自动改写历史 specimen 的 `taxonomy` 字段；须显式 RFC + corpus 迁移。

### 2.3 Canonical signal（不变量）

单条 signal 由 `evaluateCanonicalSignal()` 解释，例如：

- `supply_state.materialized`
- `registry_entries>0`
- `linker_bound=0`
- `timeline.crop_persist=false`
- `producer.crops_persisted=0`
- `ocr_frontend.role=experimental`

**Canonical signal contract**：某 taxonomy class 的必要结构条件。类默认信号在 `failure-taxonomy.v1.json`；L3 可在 `case.meta.expected_canonical_signals` **收紧或替换子集**（见 RFC-0004），用于避免 tangled failure。

### 2.4 Archetype identity（标本本体）

一条 corpus case = 一个 **archetype specimen**，身份由：

- `case_id`
- `taxonomy`（expected）
- `expected_canonical_signals`（可选）
- `notes.md`（考古上下文）

共同定义。不得仅用「某次 OCR 跑挂了」描述标本。

### 2.5 Intentional drift（治理批准的偏离）

`case.meta.intentional_drift: true` 表示：golden 或 taxonomy 信号已知偏离仍为**批准态**（例如计划中的 registry 变更）。

| 场景 | CI |
|------|-----|
| golden 漂移 + 无 intentional | **fail** |
| golden 漂移 + intentional | **warn** |
| taxonomy 信号失败 + blocking + 无 intentional | **fail** |
| taxonomy 信号失败 + degraded | **warn**（bench gate） |

Dual-run 的 authoritative 漂移 **不可** 用 intentional 豁免（见 RFC-0003）。

## 3. Severity 与 CI 语义

| Severity | Bench gate | Dual-run（authoritative） | Dual-run（taxonomy_changed） |
|----------|------------|---------------------------|------------------------------|
| `blocking` | fail | fail | fail |
| `degraded` | warn | fail | warn |
| `cosmetic` | advisory | fail | advisory |

Dual-run 另有三层 drift 语义（实现：`evaluateDualRunGovernanceGate`）：

| 层级 | 含义 |
|------|------|
| **fail** | authoritative ABI 被破坏 |
| **warn** | degraded topology 漂移 |
| **advisory** | 仅 experimental observational |

## 4. Foundation ontology set（v1 冻结）

| Class | 安全边界 |
|-------|----------|
| `healthy_materialized_bind` | Happy path：物化 + registry + bind |
| `markdown_reconcile_gap` | Placeholder ≠ 真物化；reconcile 失败 |
| `degraded_global_pool` | Global pool 不得升格 authoritative bind |
| `ownership_scope_missing` | 有图池但 scope/label 未解析 |
| `no_materialization` | Producer 有作业无落盘 |

Foundation set **冻结**；Phase-2 语义类（含 `redraw_only_fallback`）须满足 [§8](#8-phase-2-semantic-boundary冻结前不得扩-l3) 后方可扩 L3 corpus。

## 5. Observational vs Authoritative

| 层 | 可写内容 | 不可写内容 |
|----|----------|------------|
| **Authoritative** | `figure_refs`、linker 选中绑定、`figure_registry` publish、持久化题面 |
| **Observational** | `ocr_frontend`、`import_parse_quality` 遥测、timeline、taxonomy、traces |

**Pre-strip observational / post-strip authoritative**：占位 `![](URL)` 在 strip 前计入 telemetry / taxonomy；持久化 content 不含不可解析占位 URL。

## 6. 术语：Topology-preserving vs Semantic-preserving

Foundation ontology（v1）主要建立在 **artifact lineage**（raster URL、registry、refs、linker traces）— 属 **topology-preserving** 观测：结构变化会反映在 bench / timeline 上。

Phase-2 将首次系统引入 **semantic substitution**（矢量重绘、推断几何、运行时 fallback）— 往往 **semantic-preserving**（人眼「像」）但 **非 topology-preserving**（无稳定 raster lineage、无 provenance 等价）。

| 术语 | 含义 | 治理含义 |
|------|------|----------|
| **Topology-preserving** | 可追踪的物化/登记/绑定谱系；bench core 可比较 | Foundation archetype 默认要求 |
| **Semantic-preserving** | 展示层或推断层「看起来像」；可无 raster 谱系 | 默认 **observational-first**；不得反向满足物化不变量 |

**纪律**：semantic 相似 ≠ topology 等价；不得因「画对了」升格 authoritative reconstruction。

## 7. Mixed-topology（混合拓扑）

Phase-2 archetype 可能同时涉及多种拓扑平面：

| 平面 | 含义 | 典型来源 |
|------|------|----------|
| **Artifact topology** | `raster_figures`、`figure_registry`、`figure_refs`、crop persist | OCR / 导入物化 |
| **Semantic topology** | `diagram_schema`、推断几何、规则链 | 矢量推断 / AI |
| **Runtime topology** | 读卷时 suppress / redraw、runtime supply | UI 策略、未持久化状态 |

`redraw_only_fallback` 将是 **第一条 formal mixed-topology** 候选类：有 semantic/runtime，无 artifact materialization。

**纪律**：

- Mixed-topology L3 须声明各平面上的 **expected_canonical_signals** 子集（RFC-0004）。
- 不得用单一 `supply_state` 掩盖多平面纠缠；必要时拆标本或标 `intentional_drift`。

## 8. Phase-2 Semantic Boundary（冻结前不得扩 L3）

在下列边界写入 RFC 并（若需）扩展 `failure-taxonomy.v1.json` **之前**，禁止新增 `redraw_only` 等 L3 corpus。目的：**防止 semantic fallback 污染 authoritative ontology**。

### 8.1 Redraw ≠ materialization

| 命题 | 说明 |
|------|------|
| `diagram_schema` 存在 | **不**等于 raster 已物化 |
| 矢量重绘 / runtime redraw | **不得**追溯满足 `supply_state.materialized` |
| 不得 | 因 redraw 抬高 `materialized_rate_bps`、伪造 `registry_entries`、满足 `healthy_materialized_bind` 类信号 |

`failure-taxonomy.v1.json` 中 `redraw_only_fallback` 的 canonical_signal 已要求 `materialized_rate_bps=0`、`registry_entries=0` — Phase-2 实现与 corpus 均须保持此分离。

### 8.2 Semantic fallback 默认 observational-first

| 组件 | 默认平面 |
|------|----------|
| Redraw renderer / 运行时矢量展示 | **Observational**（读卷路径） |
| `diagram_schema` 入库 | 须经 RFC-0003 式 **promotion** 方可视为 authoritative 输入 |
| Ownership bind | Redraw **不得** 写入或补全 `figure_refs` / linker 选中 |

未来若允许「provenance-backed reconstruction」升格，须单独 RFC：显式 provenance 字段 + dual-run + intentional review — 非默认。

### 8.3 Suppression 属于 governance semantics

`shouldSuppressVectorDiagramSchemaForQuestion`（及 `placeholder` / `broken` / `missing` 触发的矢量抑制）**不仅是 UI 策略**，而是 **topology observability** 治理：

- 影响用户可见替换（矢量顶替扫描图）
- 影响 `diagram_schema` 是否在持久化快照中保留
- 影响 artifact vs semantic 平面的可观测一致性

**纪律**：

- 变更 suppression 规则 → 视为 ontology 变更（RFC-0001 修订 + corpus 回归）。
- Suppression 不得静默抹掉应用作 taxonomy 证据的 observational 痕迹（对齐 pre-strip observational 原则）。

### 8.4 `redraw_only_fallback` 与 category collapse

`redraw_only_fallback` 不得与下列类 **合并表述** 或共用模糊信号：

- `markdown_reconcile_gap`（占位 Markdown）
- `no_materialization`（producer 无落盘）
- `ownership_scope_missing`（有池无 scope）
- `healthy_materialized_bind`（真物化）

Phase-2 L3 须 **taxonomy identity 最纯**：单一 mixed-topology 故事（例如：扫描式题干 + 无 raster + schema 存在 + runtime redraw 活跃）。

### 8.5 Redraw promotion 需要更强证据

晋升路径（若未来存在）不得低于 frontend promotion（RFC-0003），且额外要求：

| 要求 | 原因 |
|------|------|
| 明确 provenance 链 | 防 provenance integrity 丧失 |
| 不得仅语义相似 | 数学结构「对」≠ artifact 等价 |
| dual-run + bench | 证明未抬高 authoritative core |
| 与 suppression 策略联审 | 防 observational-authoritative bleed |

**禁止**：「用户觉得像」→ 直接写 authoritative `figure_refs` 或 materialized 计数。

### 8.6 Phase-2 推荐落地顺序

| 顺序 | 交付物 |
|------|--------|
| 1 | 本文档 §6–§8 评审通过（constitution 修订） |
| 2 | `failure-taxonomy.v1.json` 增补 mixed-topology 信号（若需） |
| 3 | `redraw_only` 专用 `expected_canonical_signals` 草案 |
| 4 | 首条 `redraw_only` L3 surgical slice + notes |
| 5 | 可选 redraw promotion path（RFC-0003 附录或新 RFC） |

## 9. 参考实现

- `importFailureTaxonomy.shared.ts` — signal 求值、gate
- `importPipelineDualRunGovernance.shared.ts` — comparative gate
- `figureMaterializationTelemetry.shared.ts` — observational 文本源

## 10. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-05 | 初稿：foundation set + expected/detected 分离 + L3 signals |
| 2026-05 | §6–§8：Phase-2 semantic boundary、topology/semantic-preserving、mixed-topology、redraw≠materialize |
