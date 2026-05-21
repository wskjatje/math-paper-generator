# Figure Cognitive Role v1（P3.4-1 · Train 2）

**状态**：Implemented

**性质**：derived visual semantics；**非** canonical truth。

## Role 最小集

| Role | 含义 |
|------|------|
| `reasoning_core` | 主推理图（QWF 内无「如图」cue 的 图N） |
| `supportive` | 辅助几何 cue（QWF + 如图） |
| `transient` | 临时/独立图块 |
| `appendix_only` | 仅附录通道；不进 EPL 主阅读流 |

## 允许 / 禁止

| 允许（projection modulation） | 禁止（Train 2） |
|------------------------------|-----------------|
| max height / width | regroup · reorder |
| salience weight（observational） | reinterpret linkage |
| main-flow vs appendix channel | hidden defer |
| caption emphasis | 修改 `adaptivePresentation` |

## Lineage

- Runtime：`figure_semantics_runtime_v1` on `EducationalRenderableDocumentV1`
- Provenance：`presentation_provenance.figure_role_counts`
- **不写回** canonical / `figure_registry`

## 实现

`apps/web/src/lib/figureCognitiveSemantics.shared.ts` → `EducationalFigureBlock`（`data-figure-cognitive-role`）

## 验证

```bash
npm run test -w @zhixue/web -- src/lib/figureCognitiveSemantics.shared.test.ts
npm run governance:projection-purity -w @zhixue/web
```
