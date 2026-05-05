# 贡献指南

感谢参与维护试卷数据与工具链。请先阅读 `docs/workflow.md` 与 `docs/validation-checklist.md`。

## 许可证

- 本仓库代码与文档默认遵循根目录 **MIT License**（见 `LICENSE`）。
- **试卷、例题与解答正文**以各 JSON 文件中的 `metadata.license_spdx` 为准（推荐使用 CC-BY-SA-4.0 等开放内容许可证）；若与仓库许可证不同，须在 PR 说明中写明理由。

## 文件与命名

| 类型 | 路径约定 | Schema |
|------|-----------|--------|
| 试卷 | `papers/<YYYY>/<slug>/exam-paper.json` | `schemas/v1/exam-paper.schema.json` |
| 例题包 | `papers/<YYYY>/<slug>/worked-examples.json` | `schemas/v1/worked-example-pack.schema.json` |
| 示例/冒烟 | `examples/v1/*.json` | 同上 |

- `slug` 建议仅含小写字母、数字与 `-`，并与 `metadata.id` 一致。
- 题干与解答正文使用 **Markdown**（LaTeX 数学公式遵循仓库渲染约定）。

## 提交前检查

1. 安装依赖：`make install`（在项目根目录创建 `.venv` 并安装 `requirements.txt`）
2. 运行：`make validate`
3. 若改动 Web 应用：在仓库根目录 `npm install && npm run build`
3. 对照 `docs/validation-checklist.md` 完成人工核对（出版态）

## Pull Request

- 说明命题范围、对应需求/Issue 链接、是否改编既有题目（填写 `provenance`）。
- Schema 或 `format_version` 变更须同步更新 `docs/workflow.md` 或本文件相关表格。
