# ADR-O17: Negotiation lineage frozen；PDF lowering 无 cognition authority

**状态**：Accepted

**相关**：[ADR-O16](./ADR-O16-truth-preserving-presentation.md)、[ADR-O18](./ADR-O18-projection-only-rendering.md)、[NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md](../NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md)

## 背景

物理分页若留在 renderer 黑箱（overflow → newPage、cluster 拆分、figure 掉页），则无法 replay、diff、CI gate 或 forensic 审计。P3.2 已将 **physical compromise** 冻结为 `NegotiationDecisionV1` + `rejected_strategies`。

## 决策

### 1. Negotiation 为独立 frozen plane

- `NegotiationDecisionV1` **不得** 含 jsPDF / DOM / px viewport 耦合。
- `physical_footprint_units` **仅** 存在于 negotiation plane；禁止写回 `paginated` / `cognitive_layout` / canonical。
- Stress viewport profiles 是 **governance 对象**（adversarial cognition），不是 CSS preset。

### 2. PDF primitives = lowering only

合法：

```
EducationalRenderableDocumentV1
  → buildNegotiatedDocumentForPdf()   # 工厂边界（非 downloadExamPdf 内联）
  → NegotiatedPaginatedDocumentV1
  → lowerNegotiatedDocumentToPdfModel() # deterministic projection
```

禁止（`epl-forbidden-apis.registry.mjs` → `pdf_lowering` scope）：

- 在 export 路径内 `compose` / `paginate` / `negotiate`
- `remainingHeight` / `imageHeight` 触发的隐式 `newPage` 分页决策
- canonical 二次解析或 cognitive group 重建

### 3. Resilience regression（P3.2.4）

Stress corpus + `negotiation_severity_distribution` + **degradation topology compare**（`severity_distribution_shift`、`catastrophic` 扩散、`cascading_negotiation_rate` 等）。

## 后果

- 可换 PDFKit / print / EPUB backend，仍 compare **negotiation truth**。
- P3.3 实现安全前提：backend 不再拥有 layout authority。
