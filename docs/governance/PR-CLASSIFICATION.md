# Pull Request 分类（长期纪律）

> Governance semantics evolve more slowly than runtime capability.

避免在同一 diff 中同时评审 **哲学、taxonomy、runtime、heuristic**。

| PR 类型 | 典型路径 / 内容 | Reviewer 关注点 |
|---------|-----------------|-----------------|
| **Constitution** | `docs/governance/`、RFC、ontology 措辞、`failure-taxonomy` 语义修订（须 RFC） | 术语是否稳定、是否可组合、mixed-topology 是否塌缩 |
| **Executable governance** | `tests/fixtures/import-pipeline/`、bench/dual-run 脚本、CI workflow、gate 实现 | golden 漂移、replay、authoritative parity |
| **Runtime** | OCR adapter、linker、materialize、renderer、suppress 启发式 | 行为正确性；**不得**顺带改 ontology 无 RFC |

**纪律**：

- Constitution PR 与 Executable PR **分开发、分合并**（已用于 governance v1 draft）。
- Runtime PR 若触及 suppression / materialization 语义，须引用 RFC 或标为 follow-up constitution 议题。

## 演化速度（团队共识）

| 层 | 演化速度 |
|----|----------|
| Runtime | 快 |
| Governance（executable） | 慢 |
| Ontology / Constitution | 极慢 |

Review 阶段见 [ONTOLOGY-REVIEW-v1.md](ONTOLOGY-REVIEW-v1.md)。
