# Educational Composition Model（ECM）

**状态**：architecture companion（EPL v1 已落地；ECM 为 compositor 演进蓝图）

**宪法**：[ADR-O16](../governance/decisions/ADR-O16-truth-preserving-presentation.md) — *Presentation can evolve infinitely. Semantic provenance must remain frozen.*

## 定位

试卷不是普通网页，而是 **认知流布局系统**。ECM 描述 Layer B（Educational Cognition Runtime）如何从 AST 生成可读的 document layout，而不重新定义 semantic truth。

```
Layer A (Semantic Governance)     Layer B (Educational Cognition)
─────────────────────────────     ────────────────────────────────
canonical · lineage · registry    AST · composition · renderer
         │                                    ▲
         └──────── frozen facts ──────────────┘
                    (read-only)
```

## 当前实现（EPL v1）

| 能力 | 位置 | 说明 |
|------|------|------|
| Educational AST | `educationalAst.shared.ts` | `section.children[]`、`figure.anchor`、`forensic_banner` |
| AST build | `buildEducationalAstFromCanonical.shared.ts` | canonical → AST，`replay_mutation=none` |
| Nest / split ①② | `nestEducationalAst.shared.ts` | 树形小问；`图②` 不误拆 |
| Presentation math | `educationalPresentationMathRepair.shared.ts` | derived LaTeX repair |
| Web compositor | `EducationalDocumentRenderer.tsx` | 仅渲染 AST；`showForensic` 默认 false |

详见 [educational-presentation-layer.md](./educational-presentation-layer.md)。

## ECM 目标：Layout becomes semantic

Tailwind 类（`mt-4`、`float-right`）是 **render target 的 lowering**；compositor 输入应是 **CompositionConstraint**，而非在 renderer 里堆视觉启发式。

### CompositionConstraint（草案 v0）

```ts
type CompositionConstraintV0 = {
  keepWithNext?: boolean;       // 小问与紧随图不分离
  avoidBreakInside?: boolean;   // section / ①+图② 不断裂
  preferredPlacement?: "inline-right" | "inline-left" | "block" | "wrap";
  readingFlowPriority?: number; // 视线流：先文字后图 / 先图后文字
};
```

挂载点（计划）：

- `SubquestionNodeV1.layoutHints`
- `FigureNodeV1.layoutHints` + 已有 `anchor` / `placement` / `layoutKind`

**原则**：约束来自 AST + registry 语义，CSS 只是最后一层实现。

## FigureNode 演进（→ FigureAttachmentRuntime）

当前：

```ts
FigureNode { label, src, placement, layoutKind, layoutAnchor, anchor? }
```

目标（P2.2+）：

```ts
FigureNode {
  registryId?: string;
  ownership?: "stem" | "inherited" | …;
  topologyScope?: string;
  semanticRole?: "diagram" | "coordinate" | …;
  layoutHints?: CompositionConstraintV0;
}
```

构建：`buildEducationalAstFromExamQuestion(canonical, exam, questionId)` 从 `resolveFigureResources` 注入 `src`，正文 `![](...)` 仅作过渡 fallback。

## MathNode 演进（→ math-native typography）

当前：`segments[]` 中 `math_inline` + `$...$` transport。

目标：

```ts
MathNode
  ├─ inline
  ├─ display
  ├─ geometry-label
  └─ coordinate-expression
```

几何标注、坐标、分式、角度的 **baseline / line-height / spacing** 与正文分离；仍 **不写回** canonical。

## Pagination Runtime（P2.4）

**Cognition-preserving pagination** 要解决：

- 图②不漂到无关页
- （II）大问不在页末孤行
- ① 与锚定图保持认知邻接

依赖 ECM 的 `keepWithNext` / `avoidBreakInside`，先于 PDF/print 路径实现；非单纯 CSS `@media print`。

## 反模式（ECM 禁止）

| 反模式 | 为何退化 |
|--------|----------|
| renderer `split('\n')` 解析 canonical | web/pdf/mobile 三套结构，semantic drift |
| 为 float 改 canonical 插图顺序 | 破坏 lineage 与 forensic |
| 分页断行写回 `figure_refs` | ownership 真相被 presentation 污染 |
| 仅 `repairLatex()` 无 AST 节点 | 数学仍是字符串，非 cognition graph |

## EPL runtime version governance

Presentation 层与 semantic 层同样遵守 **non-retroactivity**：

- `presentation_runtime`（如 `educational_presentation_runtime_v1`）递增时须保留旧 runtime 的 replay 路径
- `composition_runtime` / `layout_strategy` 独立版本（如 `ecm-v0`、`float-right-compact-v1`）
- 禁止静默覆盖旧卷呈现；forensic 用 `presentation_provenance` + DOM `data-epl-*` 对齐

## ECGR — Cognitive grouping（P2.4.1 / P2.4.2）

`buildEducationalCognitiveGroups(ast)` → `EducationalCognitiveLayoutV1`（`ecgr-v1`）。

| `role` | 含义 |
|--------|------|
| `question_with_figure` | 小问 + 锚定图 = 单一阅读单元（非 sibling 平铺） |
| `subquestion_cluster` | 无伴图小问 |
| `section_preamble` | 大问题干（I / II 首段） |

Renderer：`EducationalSectionCompositor` → `compose(group)`，按 `readingSemantics.steps` 编排。

**P2.4.3 ReadingFlowSemantics**（每组）：

- `steps[]`：`question` → `figure`（认知序，非 DOM 邻接）
- `attentionPriority` / `interruptionCost` / `continuityWeight`
- `adaptivePresentation`：`inline_figure_right` | `stacked_vertical`（Web 用 CSS lowering；PDF/mobile 可换实现）

`EducationalCognitiveLayoutV1`：`replay_mutation=none`，`derived_from=educational_document_ast_v1`（与 AST 同律，防 cognitive drift）。

管道：`canonical → AST → cognitive_layout → reading semantics → composition → renderer`。

**P2.4.4 ReadingFlow Analyzer** — `analyzeReadingFlow(layout)` → `ReadingFlowDocumentDiagnosticsV1`（`verdict` PASS/WARN、`figureDetachmentRisk`、`mobileStackedContinuityDrop` 等）。

**P2.4.5 Cognitive corpus governance** — `ReadingFlowCorpusSnapshotV1`、cohort-qualified rates、`--corpus --gate-*`（见 `docs/governance/COGNITIVE-READING-TELEMETRY-v1.md`）。Invariant：**cognitive telemetry never mutates reading truth**。

**Composition Runtime Phase 1（PDF parity ABI）** — `composeEducationalDocument` → `ComposedEducationalDocumentV1`；Web/PDF 共用；见 `docs/architecture/educational-composition-runtime.md`。

CLI：

```bash
npm run inspect:reading-flow -w @zhixue/web -- <examId>
npm run inspect:reading-flow -w @zhixue/web -- --corpus --snapshot
npm run inspect:reading-flow -w @zhixue/web -- --corpus --gate-max-rate document_warn_rate=0.5
```Telemetry：`emitReadingFlowDiagnosticFacts`。

## Presentation provenance（P2.2.1）

`EducationalRenderableDocumentV1.presentation_provenance`：

- `presentation_runtime` / `composition_runtime`（`ecm-v0`）
- `presentation_authority`：`fallback`（仅 canonical/markdown）| `partial` | `registry-backed`
- `derived_from_substrates`：显式 multi-substrate composition（后续可扩 `topology_runtime`）

导入预览与入库卷面可 **epistemically honest** 地不同权威级别，不伪造 registry。

Telemetry：`emitPresentationLineageFacts` → `presentation.authority.level`（`--find` / 聚合 cohort）。

## 路线图

| 阶段 | 内容 |
|------|------|
| B+ ✅ | section 树、forensic 分离、compact anchor 图、presentation math repair |
| P2.1 ✅ | AST immutable contract + `epl-forbidden-apis.registry` |
| P2.2 ✅ | registry → FigureNode injection |
| P2.2.1 ✅ | presentation provenance / authority levels |
| P2.3 | MathNode 族 + typography runtime |
| P2.4 | pagination / PDF compositor |

**战略优势**：semantic integrity + cognition-preserving composition，而非单纯 OCR 准确率。
