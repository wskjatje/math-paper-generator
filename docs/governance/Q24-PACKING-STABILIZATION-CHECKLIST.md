# Q24 Packing Stabilization Checklist（人工 review · topology-preserving）

**性质**：Train 3 stabilization 的 **human-readable packing review protocol**；非 benchmark fixture、非 telemetry freeze。

**启用**：EPL 卷面 URL 加 `?packing_debug=1`（本地 `import.meta.env.DEV` 亦默认可见图例）。

**评审问题**（不是「更像原卷」）：

> 该目视结果是否由 **topology-preserving** packing transform 导致，且 **未** 改变 cognition choreography？

## Checklist

| # | 项 | 通过信号 |
|---|-----|----------|
| 1 | QWF ownership preserved | `data-cognitive-role="question_with_figure"` 仍存在；①+图② 同簇 |
| 2 | supportive 不主导 vertical cadence | 图②带 `supportive_compaction` / 蓝框；高度低于 reasoning_core 主图 |
| 3 | appendix 不进主 cadence | `附图*` 为 `transient_collapse` 或折叠占位；无附录双通道 |
| 4 | 无 QWF 后 standalone hijack | 无 `standalone_figure` 紧跟 QWF 抢注意力（或 debug 下已 collapsed） |
| 5 | adjacency 收紧无 reorder | `data-packing-transforms` 含 `adjacency_tightening`；组序与 cognitive_layout 一致 |
| 6 | desktop / mobile 拓扑一致 | 窄屏仅 `effectiveAdaptivePresentation` lowering；**无** regroup / 组序变化 |

## Transform footprint（debug DOM）

- `data-packing-transforms` — 生效 transform 列表
- `data-packing-role` — figure cognitive role（Train 2 derived）
- `data-packing-density` — `tight` | `inline-tight` | `collapsed` | `suppressed`

## 明确 non-goals（本阶段）

- 不以「视觉相似度」验收
- 不写入 parity / resilience snapshot
- 不冻结 packing telemetry ontology

**相关**：[COGNITIVE-PACKING-FIDELITY-v1.md](./COGNITIVE-PACKING-FIDELITY-v1.md) § Train 3
