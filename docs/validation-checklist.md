# 出版前校验清单（人工）

自动化校验通过仅代表 **结构合法**。出版前建议逐项完成下列核对。

## 学科与范围

- [ ] `metadata.disciplines` 与卷内各题一致；交叉学科题目标签完整。
- [ ] 难度区间 `difficulty_band` 与目标受众匹配。

## 题目质量

- [ ] 题干无歧义，单位、精度、编程语言版本等约束写在 `stem_markdown` 或 `answer_format_hint`。
- [ ] 选择题已在 `multiple_choice` 中给出选项键与正文；正确答案与解析一致。
- [ ] 附件路径或 URI 可访问且许可证允许再分发（若适用）。

## 解答与严谨性

- [ ] 每题 `solution.steps` 覆盖关键推理链，无跳步；必要时补充引用 `references`。
- [ ] `verification.methods` 与 `notes_markdown` 对应：说明如何用所列方法复核结论。
- [ ] 数值/代码类题目注明试验条件或边界情况（写入 `limitations_markdown` 若适用）。

## 例题包

- [ ] `targets_question_types` 与正式卷题型对齐。
- [ ] `related_problem_ids` 指向存在的 `problem.id`。

## 合规与溯源

- [ ] `license_spdx` 与仓库许可策略一致；第三方改编填写 `provenance`。
- [ ] `specification.requirement_doc_uri` 或等价可追溯链接可访问。

## 审阅记录

- [ ] `metadata.quality` 更新为 `published`，并填写 `reviewer`、`last_reviewed`。
