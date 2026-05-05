# 生成与校验工作流（v1）

本文约定从「定制需求」到「可公开发布的试卷与例题」的最小闭环，并与 `schemas/v1`、`scripts/validate.py` 对齐。

## 1. 输入：定制需求

- **承载形式**：Issue、`docs/requirements/` 下 Markdown，或可追溯 URI（写入试卷 `specification.requirement_doc_uri`）。
- **建议字段**：受众与时长、难度区间、学科与交叉比例、禁止/必考知识点、题目类型配比、是否允许编程/数据附件、版权与引用约束。

## 2. 命题与组卷

1. 建立试卷 slug（`metadata.id`），在 `papers/<year>/<slug>/` 放置 `exam-paper.json`（或同名 YAML，若后续增加转换器）。
2. 按 Schema 填写 **section → problem**：题干 `stem_markdown`、题型 `question_type`、学科 `disciplines`、知识点 `topics`。
3. 每题必须附带 **解答** `solution`：`steps` 至少一步；`verification.methods` 至少一种，并在 `notes_markdown` 写清如何核验。

## 3. 配套例题

- 在 `papers/<year>/<slug>/worked-examples.json`（或独立 slug）使用 **例题包** Schema，`source.exam_paper_id` 指向主卷。
- `items[].targets_question_types` 应覆盖卷中需要示范的题型；`related_problem_ids` 建议填写以便交叉索引。

## 4. 自动化校验

- 运行 `make validate` 或 `python scripts/validate_all.py`（见仓库根目录说明）。
- 校验失败则修正数据或 Schema（Schema 变更需同步 `format_version` 与文档）。

## 5. 人工闸门（出版前）

执行 `docs/validation-checklist.md` 中的核对项；将 `metadata.quality.status` 从 `draft` → `review` → `published`，并填写审阅人与日期。

## 6. 发布与开源

- 仓库根 **LICENSE** 覆盖工具链与文档；每份试卷/例题的 **SPDX** 以 `metadata.license_spdx` 为准（可与仓库许可证不同，须在 README 说明）。
- PR 合并前确保校验通过且清单可追溯（Issue/PR 编号写入 `specification` 或提交说明）。
