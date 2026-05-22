# Educational Composition Runtime (Phase 1 — PDF Parity ABI)

## 目标

证明 **reading truth 独立于 React DOM**：Web 与 PDF 共用同一 composition runtime，而非双轨启发式布局。

## 合法管道

```
EducationalRenderableDocumentV1  (Presentation Semantic ABI)
        ↓
composeEducationalDocument(doc, viewportProfile)
        ↓
ComposedEducationalDocumentV1    (device-independent)
        ↓
┌───────────────┬────────────────────┐
│ Web lowering  │ PDF lowering (Ph3) │
│ (DOM/CSS)     │ (primitives)       │
└───────────────┴────────────────────┘
```

## Viewport profiles

| Profile | QWF `inline_figure_right` |
|---------|---------------------------|
| `desktop_paper` | 保持 |
| `mobile_vertical` | → `stacked_vertical` |
| `pdf_a4` | 保持 |
| `pdf_exam_booklet` | → `stacked_vertical` |

## 模块

| 文件 | 职责 |
|------|------|
| `educationalCompositionRuntime.shared.ts` | `composeEducationalDocument` |
| `educationalPdfLowering.shared.ts` | 仅消费 `ComposedEducationalDocumentV1` |
| `EducationalDocumentRenderer` | Web lowering（`desktop_paper`） |

## 禁止（governance `pdf_lowering` scope）

- `buildEducationalAstFromCanonical` / `buildEducationalCognitiveGroups` 于 PDF 路径
- `parseCanonical` / `detectFigureBinding` 启发式

## 验收

```bash
npm run test -w @zhixue/web -- src/lib/educationalCompositionRuntime.shared.test.ts
npm run governance:epl-ast-contract -w @zhixue/web
```

## Phase 2 — Pagination Runtime v1（Issue 3）✅

```
ComposedEducationalDocumentV1
        ↓
paginateEducationalDocument()
        ↓
PaginatedEducationalDocumentV1   (page cognition truth)
        ↓
PDF lowering (Phase 3)
```

- 模块：`educationalPaginationRuntime.shared.ts`
- **Stage A**：semantic-first logical pages（`maxSemanticUnitsPerPage`；**不测量 px**）
- `PageBreakDecisionV1`：`decision_reason`、`interruption_cost`、`avoided_cost`、`continuity_preserved`
- Governance：`npm run inspect:pagination-flow -w @zhixue/web -- --corpus`
- PDF 仅消费 `PaginatedEducationalDocumentV1`（`buildPaginatedDocumentForPdf`）

## P3.1 — Pagination temporal governance ✅

- `PaginationTelemetrySnapshotV1`：`aggregate`、`rates`、`scores`、`distributions`、`corpus_snapshot`
- `npm run pagination-telemetry:snapshot|compare -w @zhixue/web`
- 基线：`data/pagination-telemetry-snapshots/<date>/pagination-flow.snapshot.json`
- **Invariant**：`page_cognition_truth_semantic_first` — 快照 diff 禁止引入 px/DOM 分页真相

## P3.2 — Physical Negotiation Runtime ✅

```
PaginatedEducationalDocumentV1 + PhysicalViewportProfileV1
        ↓
negotiatePhysicalPagination()
        ↓
NegotiatedPaginatedDocumentV1
  - physical_pages
  - negotiation_decisions[] (NegotiationDecisionV1 + rejected_strategies)
  - negotiation_diagnostics
```

- Physical metrics **仅**在 negotiation plane（`physical_footprint_units` 等）
- `paginated` / `composed` / `cognitive_layout` **只读引用**，不被改写
- Governance：`inspect:negotiation-flow`、`negotiation-telemetry:snapshot|compare`
- PDF：`buildNegotiatedDocumentForPdf` → `lowerNegotiatedDocumentToPdfModel`

## P3.2.4 — Resilience regression governance ✅

- Degradation topology：`severity_distribution_shift`、`critical_path_break_rate`、`cascading_negotiation_rate`、`compound_compromise_rate`
- `npm run negotiation-telemetry:compare-resilience`（stress baseline vs ci-current）
- 宪法：[NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md](../governance/NEGOTIATION-RESILIENCE-GOVERNANCE-v1.md)、[ADR-O17](../governance/decisions/ADR-O17-negotiation-lineage-and-pdf-lowering.md)

## P3.2.3 — Negotiation pressure corpus ✅

- Stress viewport：`pdf_exam_booklet_dense` | `pdf_low_margin` | `mobile_ultra_narrow`
- Adversarial cases：`negotiation-pressure-qwf-chain` | `multi-figure` | `dense-enum`
- `NegotiationDecisionV1.severity` + `negotiationSeverityDistribution`（cognition economics）
- `npm run inspect:negotiation-flow -- --corpus --stress-profile pdf_low_margin`
- `npm run negotiation-telemetry:snapshot -- --stress-profile pdf_low_margin`

## P3.2.5 — Cross-medium parity governance ✅

- Triad：`pdf_a4`（reference）× `pdf_exam_booklet_dense` × `mobile_ultra_narrow`
- `cross-medium-parity:snapshot|compare`；`inspect:cross-medium-parity --corpus`
- 见 [CROSS-MEDIUM-PARITY-GOVERNANCE-v1.md](../governance/CROSS-MEDIUM-PARITY-GOVERNANCE-v1.md)

## P3.3 — Authority vs Fidelity 双轴

- **Authority**（blocking）：`governance:projection-purity`、[ADR-O18](../governance/decisions/ADR-O18-projection-only-rendering.md)
- **Fidelity**（observational）：`assessProjectionFidelity`、[ADR-O19](../governance/decisions/ADR-O19-authority-vs-fidelity-dual-axis.md)

## P3.3 — Projection-only rendering（宪法）✅ 门禁已立

- [ADR-O18](../governance/decisions/ADR-O18-projection-only-rendering.md)、[PROJECTION-PURITY-GOVERNANCE-v1.md](../governance/PROJECTION-PURITY-GOVERNANCE-v1.md)
- `npm run governance:projection-purity`；P3.3 PR 须同时通过 parity + resilience + projection-purity CI
- `lowerNegotiatedDocumentToPdfModel` 实现像素时：**禁止**回流 negotiate / overflow 分页 / figure reposition（**Completeness ≠ Authority**）

## 后续

- **P3.3 实现**：negotiated → PDF primitives（deterministic projection only）
- **Stage B**：font metrics adapters（仍不进 semantic truth）
