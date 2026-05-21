# ADR-O18: Projection-only rendering（non-authoritative lowering）

**状态**：Accepted

**相关**：[ADR-O17](./ADR-O17-negotiation-lineage-and-pdf-lowering.md)、[CROSS-MEDIUM-PARITY-GOVERNANCE-v1.md](../CROSS-MEDIUM-PARITY-GOVERNANCE-v1.md)、[PROJECTION-PURITY-GOVERNANCE-v1.md](../PROJECTION-PURITY-GOVERNANCE-v1.md)

## 背景

P3.2.5 已将 **medium parity** 冻结为 governance object：`pdf_a4` 为 **reference cognition realization**；`mobile_ultra_narrow` / `pdf_exam_booklet_dense` 为 **constrained lowerings**。若 rendering 层重新获得 negotiate / regroup / overflow 分页权，则 parity、resilience、replay、forensic 将慢性腐蚀。

## 决策

### 1. Interpretation frozen；rendering derived

```
NegotiatedPaginatedDocumentV1
  → lower* (projection adapter)
  → target media (PDF / print / canvas / EPUB)
```

**Rendering layers may not:**

- negotiate
- regroup / reprioritize cognitive groups
- reinterpret section / figure ownership
- split clusters or continuity chains
- run local overflow / `addPage` heuristics as cognition authority

**Rendering layers may only:**

- project frozen negotiated cognition truth（deterministic、replayable）

### 1b. Projection Completeness ≠ Projection Authority

**允许（completeness / fidelity，不改动 cognition 拓扑）：**

- typography、glyph placement、baseline、bezier、vectorization、canvas batching、确定性坐标

**禁止（即使动机是“避免裁切”）：**

- regroup / reorder figure、split cognition unit、reinterpret continuity、hidden defer

> 在 lowering 里 “reposition 一下 figure” = **unconstitutional cognition mutation**，绕过 paginate → negotiate → lineage → parity → resilience 整条 frozen chain。

可执行清单：`apps/web/src/lib/projectionPurityContract.shared.ts`

### 2. Reference medium model

| 角色 | Viewport |
|------|----------|
| Reference cognition realization | `pdf_a4` |
| Constrained lowerings | stress / mobile / booklet profiles |

Parity 度量的是 **reinterpretation drift**，不是 layout pixel diff。

### 3. 可执行宪法

- `epl-forbidden-apis.registry.mjs`：`pdf_lowering`、`projection_lib`、`renderer`（ADR-O18 规则）
- `npm run governance:projection-purity`（EPL contract + `projectionPurityContract` 单测）
- P3.3 PR：**必须**通过 `parity-regression` + `resilience-regression` + `projection-purity`

### 4. 工厂边界（唯一例外）

`buildNegotiatedDocumentForPdf` 位于 `educationalPdfLowering.shared.ts`，标注 `@epl-ast-contract-allow`：compose → paginate → negotiate **不得**复制到 `downloadExamPdf` 或 `lowerNegotiatedDocumentToPdfModel`。

### 5. 技术债（显式）

`downloadExamPdf.ts` 内 html2canvas + `heightLeft` / `addPage` 栅格分页为 **LEGACY**，须迁移至 negotiated projection；临时 `@epl-ast-contract-allow` 仅作文档化债，不得扩展。

## 后果

- Visual fidelity 可迭代；**authority 不可回流**。
- 新 backend（PDFKit、print、EPUB）仅实现 projection adapter，不触碰 governance 平面。
