# Educational Presentation Layer (EPL Runtime)

## Constitutional boundary

| 层 | 职责 | 写入 persist |
|----|------|----------------|
| **Canonical compiler** | semantic truth（transport → canonical text） | ✅ `import_parse_quality` |
| **EPL Runtime** | educational readability（AST → 卷面） | ❌ derived only |

**Invariant**：`presentation is derived` — renderer / AST **不得**反写 canonical 或 lineage。  
**治理**：[ADR-O16](../governance/decisions/ADR-O16-truth-preserving-presentation.md)（Layer A/B 分离 · *Presentation can evolve infinitely. Semantic provenance must remain frozen.*）  
**Compositor 蓝图**：[educational-composition-model.md](./educational-composition-model.md)（ECM）

```
frozen canonical text [+ figure_registry]
  → buildEducationalRenderableDocument()   // UI 唯一边界
  → EducationalRenderableDocumentV1 { ast }
  → EducationalDocumentRenderer (仅消费 ast)
  → EducationalAstNodeRenderer (node.type)
```

**P2.1**：`apps/web/src/components/education/*` 禁止 `canonicalText` / `buildEducationalAstFromCanonical`（`npm run governance:epl-ast-contract -w @zhixue/web`）。

**P2.2**：`buildEducationalAstForQuestion` + `injectRegistryFiguresIntoEducationalAst` — `FigureNode.registryId` / `src` 以 registry 为准。  
**P2.2.1**：`presentation_provenance`（`presentation_authority`: `fallback` | `partial` | `registry-backed`；`derived_from_substrates`）。  
**Anti-regression**：`scripts/epl-forbidden-apis.registry.mjs` + `governance:epl-ast-contract`（ERROR / WARN / DEPRECATED）。

## AST schema（显式 v1）

定义：`apps/web/src/lib/educationalAst.shared.ts`

| `node.type` | 语义 |
|-------------|------|
| `question_stem` | 题头（如 `(24)`） |
| `forensic_banner` | OCR provenance（`<<< 文件`）；阅读面默认隐藏 |
| `section` | 大问（I / II），`children[]` 嵌套 ①② 与锚定图 |
| `subquestion` | 小问（①②），通常挂在 `section.children` |
| `paragraph` | 普通段落 |
| `figure` | 图块 + `placement` + `layoutKind` + `anchor` |
| `math_block` | 独立 displayed 公式块（预留） |

`figure.placement`：`after_section` | `before_subquestion` | `inline_with_subquestion` | `end_fallback`  
`figure.layoutKind`：`block` | `compact` | `inline`（阅读面默认 compact + 可选 float）

嵌套：`nestEducationalAst.shared.ts`（从 section 正文内拆 embedded `①②`，并吸收扁平 subquestion / figure）。

段落内公式：`segments[]` 中 `math_inline` vs `text`（非裸字符串拼接）。

## 与 compiler 的关系

- `enumeration_semantic_reconstruction` 仍输出 **canonical text** 中的 `（I）` / `①`（persist 边界不变）。
- EPL **解析**这些标记为 `section` / `subquestion` **节点**，不在 renderer 里 `startsWith("（I）")`。

## Phase roadmap

| Phase | 内容 | 状态 |
|-------|------|------|
| A | rejoin、enumeration text、block 预览 | ✅ |
| B | 显式 AST、layout anchors、math segments、node.type renderer | ✅ |
| B+ | section 树、`forensic_banner` 分离、compact 锚定图、presentation math repair | ✅ |
| P2.1 | AST immutable contract · `EducationalRenderableDocumentV1` | ✅ |
| P2.2 | figure_registry → AST injection | ✅ |
| P2.2.1 | presentation provenance + `presentation.authority.level` telemetry | ✅ |
| P2.3.1 ✅ | `MathInlineNode`（`mathKind` / `semanticTokens` / `typographyHints`）+ typography CSS |
| P2.4 | `CompositionConstraint` on enum + anchored figures | ✅ |
| P2.4.1–2 ✅ | ECGR + `question_with_figure` compositor | |
| P2.4.3 ✅ | `ReadingFlowSemantics`（steps / attention / continuity / adaptivePresentation） | |
| C | ECM constraints、pagination | 见 [ECM](./educational-composition-model.md) |

## 入口

- `buildEducationalAstFromCanonical` — canonical → AST（lib 内；UI 勿直接调）
- `buildEducationalRenderableDocument` — **UI 唯一合法** EPL 构建
- `EducationalDocumentRenderer` — 仅 `document: EducationalRenderableDocumentV1`
- `shouldUseEducationalPresentation` — 是否启用 EPL
