# 导入修复：通用规则（细则）

> **上位规范**：[generic-exam-content-policy.md](generic-exam-content-policy.md)（试卷结构、图片地址、图片序号 — 项目级，优先适用）。

**项目纪律：只允许通用规则。** 不得新增单卷、单题号、单地区专规模块/脚本/分支；卷面字面差异仅进 `data/ocr-repair-lexicon.json` 等可配置层。提交前运行 `npm run governance:generic-exam-content`。

本文件仅补充**导入/OCR 路径**的模块归属与 CLI，不重复上位条文。

## 模块归属

| 模块 | 类型 |
|------|------|
| `importParentQuestionTopology` | 通用结构检测 |
| `importParentQuestionExpand` / `importParentQuestionPaperAlignment` | 通用结构修复 |
| `assignImportedQuestionRasterFromFigurePool` | 按题型/题干/图池分配附图（数量不固定） |
| `offlineExamCoordinateOcrNormalize` / `ocrGenericExamPatterns` | 通用 OCR 模式 |
| `educationSymbolLexicon` | 通用符号误识 |
| `ocr-repair-lexicon`（data/DB） | 可配置补丁 |

## CLI

- `apply-imported-exam-parent-question-alignment.ts`
- `apply-imported-exam-stem-figure-policy.ts`

## L3 夹具

- `parent-question-double-figure`：共图大题 + 双图误池化拓扑；post-sanitize 期望 `healthy_materialized_bind`。

## 自检

```bash
npm run governance:generic-exam-content
```
