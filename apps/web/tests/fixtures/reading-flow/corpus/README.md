# Reading flow frozen corpus (P2.4.5)

CI **cognitive regression contract**：只读 `canonical.txt` → 派生 `reading_flow_diagnostics`（`replay_mutation=none`）。

| Case | 用途 |
|------|------|
| `reading-corpus-qwf-pass-01` | `question_with_figure` 绑定良好 → document PASS |
| `reading-corpus-cue-unbound-warn-01` | 如图 cue 无认知绑定 → WARN + `FIGURE_CUE_WITHOUT_COGNITIVE_BIND` |
| `negotiation-pressure-qwf-chain` | 长小问链 + QWF → stress viewport 触发 defer |
| `negotiation-pressure-multi-figure` | 多图连环 → figure cascade negotiation |
| `negotiation-pressure-dense-enum` | 密集 enumeration + 单图 |

更新：改 canonical 后跑 `npm run inspect:reading-flow -w @zhixue/web -- --corpus --snapshot` 核对分布，再提交。

**Invariant**：cognitive telemetry 永不回写 `cognitive_layout` / canonical。
