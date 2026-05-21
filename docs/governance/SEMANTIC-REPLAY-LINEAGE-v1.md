# Semantic replay lineage & non-retroactivity（v1）

**状态**：executable governance companion（与 `import_parse_quality` 入库路径同构）。

## Epistemic lattice（operational epistemology）

Gate / rate 输出使用 **first-class verdict**，不是 `null`、skip 或隐式绿：

| Verdict | Epistemic meaning |
|---------|-------------------|
| `PASS` | observable + acceptable（cohort 可观测且满足阈值） |
| `FAIL` | observable + unacceptable |
| `UNOBSERVABLE` | no eligible evidence substrate（`denominator=0`；**≠ healthy**） |

**核心纪律**：lack of observability **不得**静默变绿（禁止 false green / denominator laundering）。

**Evidence-qualified telemetry**：`facts` 仅当 substrate 存在时发射（例：`authority.*` 须有 `figure_materialization` 或 `figure_link_traces_v1`）。

**双层 SLO**（`--gate-mode` 为 policy 解释层，默认 `strict`）：

| 层 | 问什么 | 例 |
|----|--------|-----|
| Coverage | 系统是否仍可观测？ | `UNOBSERVABLE` → strict 下阻断 |
| Quality | 可观测 cohort 内语义是否达标？ | `bind_refusal_rate` 阈值 |

Remediation：`HINT: re-import` → 恢复 frozen `import_parse_quality`，非仅诊断。

## Semantic execution graph（显式化）

单次导入在 `import_parse_quality.semantic_execution_lineage_v1` 冻结 **graph identity**：

| 子 runtime | 编译器角色 | correlation segment |
|------------|------------|---------------------|
| `canonicalization` | lexer / lowering | `#canonicalization` |
| `topology` | AST construction | `#topology` |
| `figure_materialization` | resource materialization | `#figure_materialization` |
| `bind` | semantic resolution | `#bind` |
| `structuring` | probabilistic transform boundary | `#structuring` |

根 ID：`lineage_id`（UUID）。子 ID：`{lineage_id}#{segment}` — 便于 **single-click semantic lineage** 与跨区 Forensics 对齐。

**Lineage schema ABI**：`lineage_schema: "v1"`（对象形状契约，与 `lineage_runtime` 子系统版本正交）。演进时递增 schema，replay tooling 按 schema 分支。

## CLI forensic primitive（lineage-native）

```bash
npm run inspect:semantic-lineage -w @zhixue/web -- <examId>
# 或
npx tsx apps/web/scripts/inspect-semantic-lineage.ts <examId>
```

只读冻结 `import_parse_quality`；**不重算** canonicalization / topology / bind。实现：

| 模块 | 角色 |
|------|------|
| `semanticLineageReplayModel.shared.ts` | 冻结 provenance → 可查询模型 |
| `semanticLineageQuery.shared.ts` | `--find` / `--where` / `--phase` 代数 |
| `semanticLineageReplay.shared.ts` | 对外导出（UI / CLI 共用，禁止分叉解释） |

### 查询（semantic observability algebra）

```bash
# 单 phase + 大题根
npm run inspect:semantic-lineage -w @zhixue/web -- <examId> --phase bind --question 24

# 子串命中（无命中 exit 1，便于脚本）
npm run inspect:semantic-lineage -w @zhixue/web -- <examId> --find bind_refused

# 精确 fact
npm run inspect:semantic-lineage -w @zhixue/web -- <examId> --where crop_jobs_emitted=0

# 首条确定性 edit（semantic git-blame 雏形）
npm run inspect:semantic-lineage -w @zhixue/web -- <examId> --first-corruption

# 扫描本地卷库
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --find bind_refused
```

`--diff-runtime canonicalization=v1..v2`：**未实现** — 须对新导入重放 v2，不得 retroactive 改写旧 provenance（见下）。

## Query fact namespace（`fact_ontology=v1`）

与 governance ontology 正交的 **query ABI**（`semanticLineageFactOntology.shared.ts`）。稳定键示例：

| Legacy / 直觉 | Namespaced fact |
|---------------|-----------------|
| `bind_refused` | `authority.bind.refused=true` · `authority.failure.present=true` |
| `crop_jobs_emitted=0` | `materialization.crop_jobs.emitted=0` · `materialization.supply.empty=true` |
| `disabled_per_question_ai` | `topology.policy.disabled_per_question_ai=true` |
| `first_corruption` / `rule_id` | `canonicalization.origin.phase` · `canonicalization.origin.rule_id` |
| `question_root` | `topology.question.root` · `lineage.question_root` |

```bash
npm run inspect:semantic-lineage -w @zhixue/web -- <examId> \
  --where authority.failure.present=true

npm run inspect:semantic-lineage -w @zhixue/web -- <examId> \
  --where materialization.crop_jobs.emitted=0
```

`--find bind_refused` 仍可用（映射到 namespaced 键别名）。**禁止**在 UI/CLI/inspector 分叉解释 — 仅扩展 `SemanticFactKey` + `emitNamespacedSemanticFacts`。

### Ontology evolution discipline（`fact_ontology=v1`）

| 动作 | 允许 |
|------|------|
| 新增 namespace | ✓ |
| 新增 fact 键 / 枚举 token | ✓ |
| deprecate legacy `--find` 别名 | ✓（保留至少一版） |
| **rename** 已发布 stable key | ✗ |
| **semantic reinterpretation**（同键新含义） | ✗ |

`authority.failure.reason` 等聚合键须 **enum-like**（`AuthorityFailureReason`）；freeform 归入 `unclassified` 并触发 aggregate WARN。

### Semantic aggregation（distribution）

```bash
# 卷库：authority refusal 原因分布
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --aggregate by=reason

npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local \
  --aggregate authority.failure.reason

# 先过滤再聚合
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local \
  --where topology.policy.disabled_per_question_ai=true \
  --aggregate canonicalization.origin.rule_id
```

实现：`semanticLineageAggregate.shared.ts`（只读 `facts[]` 计数，不重算 pipeline）。

### Metric metadata registry（`metric_registry=v1`）

单一描述源：`semanticMetricRegistry.shared.ts`（UI / dashboard / CI / `--rate` 共用）。

| Metric | `kind` | `population`（分母总体，非 `exams_total`） |
|--------|--------|---------------------------------------------|
| `bind_refusal_rate` | `authority_availability` | `exams_with_authority_bind_evaluation` |
| `topology_preservation_rate` | `topology_continuity` | `exams_with_shared_figure_topology` |
| `materialization_success_rate` | `extraction_health` | `exams_with_materialization_telemetry` |
| `canonicalization_corruption_rate` | `transport_quality` | `exams_with_canonicalization_trace` |

```bash
npm run inspect:semantic-lineage -w @zhixue/web -- --list-metrics
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --rate slo-report
```

每条 descriptor 冻结 `numerator_semantics` / `denominator_semantics`；**禁止** rename 已发布 metric id 或改写 population 含义。

### Semantic rates / SLO（derived health indicators）

```bash
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --rate bind_refusal_rate

npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --rate materialization.*
```

| Preset | 语义 |
|--------|------|
| `bind_refusal_rate` | authority integrity（`authority.failure.present` / 有 bind runtime） |
| `topology_preservation_rate` | 共图拓扑下 `disabled_per_question_ai` 激活比例 |
| `materialization_success_rate` | `registry.entries > 0`（有物化 telemetry 的卷） |
| `canonicalization_corruption_rate` | 存在 `canonicalization.origin.rule_id` |

### Metric derivation discipline

| 类型 | 允许 |
|------|------|
| aggregate on frozen facts | ✓ |
| derive ratios from aggregates / per-exam facts | ✓ |
| infer new provenance retroactively | ✗ |
| recompute historical semantic state | ✗ |
| aggregation 改写 `import_parse_quality` | ✗ |

`SEMANTIC_METRIC_DERIVATION_READ_ONLY`：telemetry 层 **只读** lineage；与 `replay_immutable=true` 同构。

### CI semantic gate（release contract）

GitHub Actions：`.github/workflows/semantic-lineage-governance.yml`

| Phase | 对象 | 命令 |
|-------|------|------|
| A Coverage | 遥测可观测 | `--corpus --gate-mode strict --gate-min-rate materialization_success_rate=0.5` |
| B Quality | 语义质量预算 | `--corpus --gate-mode strict --gate-max-rate bind_refusal_rate=0.15` |

**Frozen corpus**（禁止 CI 扫 `data/local-exams` 或重算 lineage）：`apps/web/tests/fixtures/semantic-lineage/corpus/*/exam.snapshot.json`。

```bash
# 本地卷库（探索）
npm run inspect:semantic-lineage -w @zhixue/web -- --scan-local --gate-min-rate materialization_success_rate=0.5

# CI 同源 corpus
npm run inspect:semantic-lineage -w @zhixue/web -- --corpus --gate-max-rate bind_refusal_rate=0.15

# 多条 gate（任一 FAIL → exit 1）
npm run inspect:semantic-lineage -w @zhixue/web -- --corpus \
  --gate-min-rate materialization_success_rate=0.5 \
  --gate-max-rate bind_refusal_rate=0.15
```

实现：`semanticLineageGate.shared.ts`。阈值对照 **frozen rate**。

**Epistemic verdicts**（非 PASS/FAIL 二元）：

| Verdict | 含义 |
|---------|------|
| `PASS` | cohort 可观测且满足阈值 |
| `FAIL` | cohort 可观测但不满足阈值 |
| `UNOBSERVABLE` | `denominator=0`（无 eligible telemetry；≠ healthy） |

**`--gate-mode`**（默认 `strict` = telemetry coverage SLO）：

| mode | unobservable | threshold FAIL | exit |
|------|--------------|----------------|------|
| `strict` | FAIL | FAIL | 1 |
| `permissive` | WARN（exit 0） | FAIL | 1 |
| `report-only` | 仅报告 | 仅报告 | 0 |

`authority.*` facts 仅在存在 `figure_materialization` 或 `figure_link_traces_v1` 时发射（禁止 false green）。

**Temporal compare**（frozen snapshot diff，禁止重跑旧 lineage）：

```bash
npm run semantic-telemetry:snapshot -w @zhixue/web -- --out data/telemetry-snapshots/2026-05-20 --label weekly
npm run semantic-telemetry:compare -w @zhixue/web -- \
  --baseline data/telemetry-snapshots/2026-05-20/slo-report.json \
  --current data/telemetry-snapshots/ci-current/slo-report.json \
  --max-rate-rise 0.1 --max-rate-drop 0.1
```

基线目录：`data/telemetry-snapshots/<date>/slo-report.json`（`replay_mutation=none`）。周对比只 diff JSON，不用新 runtime 覆盖历史卷。

### Aggregate namespace taxonomy

稳定前缀：`lineage.*` · `authority.*` · `materialization.*` · `canonicalization.*` · `topology.*` · `structuring.*`  

未来 `--aggregate-prefix authority.failure` 须在此 taxonomy 内扩展，禁止 ad-hoc 平行命名。

## Lineage references append-only

`lineage_id`、`{lineage_id}#{segment}`、`forensic_runtime_versions` 一旦写入 `import_parse_quality`：

| 禁止 | 允许 |
|------|------|
| rewrite / recycle / reassignment | 新导入分配新 `lineage_id` |
| migration「修复」历史 trace_id | 只读 replay + synthetic lineage 降级 |

代码标记：`SEMANTIC_LINEAGE_REFERENCES_APPEND_ONLY`（`semanticExecutionLineage.shared.ts`）。

## Semantic ABI versioning

`forensic_runtime_versions` 记录入库时各子 runtime 契约（`canonicalization` / `topology` / `figure` / `linker`）。  
**未来** canonicalizer v2、topology v3、linker policy v2 须 **replay against frozen contract**，不得假定当前 runtime 解释历史 provenance。

## Constitutional invariant：replay never mutates persisted provenance

| 允许 | 禁止 |
|------|------|
| 读卷展示冻结 `import_parse_quality` | runtime 升级后 **回填 / 覆盖** 已入库 provenance |
| 新规则仅作用于 **新导入** | 对旧卷 JSON **retroactive rewrite** `decision_trace` / `lineage` / `forensic_runtime_versions` |
| Forensics UI **只读** replay | 「修复」入库卷 provenance 的 migration 脚本（除非显式 HITL 重导入） |

`semantic_execution_lineage_v1.replay_immutable === true` 为写入时标记，表明该快照为 **time-stable semantic replay** 契约。

与 [CONSTITUTIONAL-TRACEABILITY-v1.md](CONSTITUTIONAL-TRACEABILITY-v1.md) **Retroactivity 纪律** 一致：禁止 semantic retroactive reinterpretation；实现 convenience 不得改写 frozen jurisprudence。

## Refusal provenance

`bind_refused` + `reason`（Authority / bind Forensics）与 success provenance **同等** — authority-aware runtime 须能解释 **为何 constitution 拒绝赋权**。

## 卷面入口

导入卷 `/exam/:id?figures_debug=1` → **ExamForensicsPanel** 顶栏 `lineage_id` 与各 section `trace:` 行。

旧卷无 `semantic_execution_lineage_v1`：graceful degradation；完整 graph 须 **重新导入**。

## 参考实现

- `apps/web/src/lib/semanticExecutionLineage.shared.ts`
- `mergeSemanticExecutionLineageIntoRollup`（`sanitizeImportedSnapshotForPersist` 末步）
- `docs/architecture/educational-text-canonicalization.md`
