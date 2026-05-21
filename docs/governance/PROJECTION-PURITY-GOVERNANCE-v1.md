# Projection Purity Governance v1（P3.3 宪法）

**状态**：Accepted

**相关**：[ADR-O18](./decisions/ADR-O18-projection-only-rendering.md)

## 核心原则

```
lowerings never become authority
interpretation frozen → rendering derived
Projection Completeness ≠ Projection Authority
```

| 行为 | Authority |
|------|-----------|
| compose | cognitive grouping |
| paginate | interruption topology |
| negotiate | physical compromise |
| lower | **projection only** |

**允许**：typography / bezier / glyph / vectorization / canvas batching（见 `projectionPurityContract.shared.ts`）

**禁止**：regroup、reorder figure、split cognition unit、hidden defer、overflow `addPage`

## PR Gate（P3.3 起强制）

| Check | Command |
|-------|---------|
| Projection purity | `npm run governance:projection-purity -w @zhixue/web` |
| Cross-medium parity | `cross-medium-parity:compare`（CI `parity-regression`） |
| Negotiation resilience | `negotiation-telemetry:compare-resilience`（CI `resilience-regression`） |
| EPL AST contract | `governance:epl-ast-contract` |

## Forbidden（executable）

见 `apps/web/scripts/epl-forbidden-apis.registry.mjs`：

- **pdf_lowering**（`downloadExamPdf.ts`）：隐式 negotiate、overflow `addPage`、`heightLeft` 启发式
- **projection_lib**（`educationalPdfLowering.shared.ts`）：`lower*` 内 cognition API
- **renderer**（`education/*`）：negotiate、paginate、regroup、figure reorder

## 单测契约

`projectionPurityContract.shared.ts` + `projectionPurityContract.shared.test.ts`：

- `lowerNegotiatedDocumentToPdfModel` 无 forbidden authority 模式
- 无 heuristic pagination
- LEGACY `downloadExamPdf` 栅格路径须带 `@epl-ast-contract-allow`（controlled debt）

## 与 visual fidelity

**先宪法、后像素**。Fidelity 迭代不得引入第二分页器或 medium-specific interpretation runtime。

**Authority vs Fidelity 双轴**见 [ADR-O19](./decisions/ADR-O19-authority-vs-fidelity-dual-axis.md)、[PROJECTION-FIDELITY-GOVERNANCE-v1.md](./PROJECTION-FIDELITY-GOVERNANCE-v1.md)。
