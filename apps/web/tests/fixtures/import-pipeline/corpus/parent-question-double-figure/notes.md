# parent-question-double-figure（L3 real-world）

- **Taxonomy (post-sanitize)**: `healthy_materialized_bind`
- **Topology**: 两位数大题 + (1)(2) 小问 + 图①/图②
- **Input defect**: 双图误挂大题 stem、子题无裁图
- **Expected after sanitize**: `alignImportedParentQuestionSnapshot` → 子题按图①/② linker `bound`
- **Batch id（fixture）**: `06803f4e-d427-4807-9dac-a3aa90915e0a`
- **Assets**: `0.jpg`, `p0-图①.png`, `p0-图②.png`（与 CLI `p0-图{label}.png` 约定一致，无题号 slug）
