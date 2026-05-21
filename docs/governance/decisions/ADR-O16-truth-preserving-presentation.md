# ADR-O16: Truth-preserving educational presentation（Layer A / Layer B）

**状态**：Accepted（engineering companion；与 enactment 正交，可先按代码与 CI 执行）

**相关**：[SEMANTIC-REPLAY-LINEAGE-v1.md](../SEMANTIC-REPLAY-LINEAGE-v1.md)、[educational-presentation-layer.md](../../architecture/educational-presentation-layer.md)、[educational-composition-model.md](../../architecture/educational-composition-model.md)

## 背景

导入与卷面已具备 replayable canonicalization、lineage、ontology 与显式 Educational AST（EPL）。若 presentation 反向写入 canonical 或 persist 语义字段，将破坏 replay consistency、forensic integrity 与 metric trustworthiness。

## 决策

### 1. 二层分离（强耦合语义，弱耦合实现）

| 层 | 名称 | 职责 | 稳定对象 |
|----|------|------|----------|
| **A** | Semantic Governance Runtime | truth、replay、lineage、ontology、telemetry、authority、topology；**semantic correctness** | frozen `canonical text`、`import_parse_quality`、`figure_registry` / `figure_refs` |
| **B** | Educational Cognition Runtime | 阅读节奏、视觉认知、图文关系、数学排版、分页、视线流、教学结构感；**educational readability** | `EducationalDocumentAstV1`、layout hints、presentation lowering |

- **强耦合语义**：B 的结构（section / enumeration / figure anchor）必须映射 A 已冻结的语义，不得发明第二套题面结构真相。
- **弱耦合实现**：Web / PDF / mobile 可换 renderer，但共享同一 AST 与 composition 约束，不得各自 `split('\n')` 重解析 canonical。

### 2. 宪法不变量（必须守）

```
Presentation can evolve infinitely.
Semantic provenance must remain frozen.
```

等价表述：

- **layout 是可演化的**（spacing、float、分页策略可迭代）
- **truth 是不可回写的**（canonical、lineage、registry 不因排版需求而变）

管道（唯一合法方向）：

```
OCR transport
  → Canonical compiler（semantic truth）
  → Semantic runtime（topology / ownership / materialization）
  → Educational AST（structure）
  → Presentation lowering（readability only）
  → Document compositor（layout）
  → render target（web / print / pdf）
```

**禁止**：UI、renderer、spacing heuristic、`repairPresentationMathLatex` 等 **回写** canonical 或 `import_parse_quality` 语义段。

### 3. Presentation lowering 的边界

| 允许（derived） | 禁止（污染 substrate） |
|-----------------|-------------------------|
| `repairPresentationMathLatex`、prettify、AST nest | 为排版改 canonical 题号/小问/图序 |
| `forensic_banner` 与阅读层分离 | 把 `<<< 文件` 写回 persist 正文 |
| `FigureNode.anchor` / `layoutKind` | 用 CSS 结果反推 ownership 绑定 |
| `CompositionConstraint`（见 ECM） | 分页断行导致 registry 或 refs 变更 |

### 4. 演化路径（非本 ADR 实现范围）

- **P2.1** AST immutable contract：renderer **仅**消费 AST，禁止第二套 canonical 结构解析。
- **P2.2** `figure_registry` → `FigureNode` 注入（图脱离 `![](...)` 字符串）。
- **P2.3** `MathNode` 族（inline / display / geometry-label），超越 transport `$...$`。
- **P2.4** cognition-preserving pagination（`keepWithNext`、`avoidBreakInside`）。

## 后果

- 新增 EPL / 导出 / PDF 功能须先扩展 AST 或 composition schema，而非 patch canonical 字符串。
- Code review：任何从 `components/education/*` 或 renderer 写 persist 的路径视为 **constitutional violation**。
- 测试：EPL 单测与 `replay_mutation=none` 断言保持；registry 注入后须测 AST 与 registry 一致性，而非正文 markdown 一致性。

## 合规信号（实现侧）

- `EducationalDocumentAstV1.replay_mutation === "none"`
- **P2.1 ✅**：`EducationalDocumentRenderer` 仅接受 `EducationalRenderableDocumentV1`；`npm run governance:epl-ast-contract -w @zhixue/web`
- **P2.2 ✅**：`buildEducationalRenderableDocument` → `injectRegistryFiguresIntoEducationalAst`（`FigureNode.registryId`）
- `buildEducationalAstFromCanonical` 仅限 `lib/buildEducationalAst*`（UI 经 `buildEducationalRenderableDocument`）
- 呈现修复仅见于 `*Presentation*` / `*Render*` 模块，不入 `*Canonical*` / `*Persist*`
