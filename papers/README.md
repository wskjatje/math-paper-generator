# 试卷与例题存放约定

推荐目录结构：

```text
papers/
  <YYYY>/
    <slug>/
      exam-paper.json          # kind: exam_paper
      worked-examples.json     # kind: worked_example_pack（可与 slug 同名或并列）
```

- **slug**：与 `metadata.id` 对齐，便于检索与引用。
- **示例**：见 `papers/2026/demo-2026-amc-style-01/`（由 `examples/v1/` 复制，用于校验脚本遍历）。
- **许可证**：每份文档以 JSON 内 `metadata.license_spdx` 为准；须与仓库策略一致并在 README 总览中说明。
