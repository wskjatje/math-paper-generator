# 导入卷可选修复脚本（非自动管线）

以下脚本**不会**在「上传线下卷 → 识别 → 入库」时自动执行；入库主链已在 `sanitizeImportedSnapshotForPersist` 内含共图大题对齐与展开。

| 脚本 | 用途 |
|------|------|
| `apply-imported-exam-parent-question-alignment.ts` | 共图大题 + 小问：拓扑对齐、坏链、图①② |
| `apply-imported-exam-stem-figure-policy.ts` | 对齐 + 展开 + 规则矢量图 + 整页扫描策略 |
| `inspect-exam-materialization.ts` | 调试 figure 物化与 registry |

治理：**源码仅允许通用规则**，见 `docs/governance/generic-exam-content-policy.md`。卷面特例写入 `data/ocr-repair-lexicon.json`。

**勿保留** `importedExamQ24PaperAlignment.shared.ts`、`apply-imported-exam-q24-*.ts` 等 Q24/卷名垫片。共图对齐请用 `@/lib/importParentQuestionPaperAlignment.shared` 与 `apply-imported-exam-parent-question-alignment.ts`。

日常导入模块：`importParentQuestionTopology`、`importParentQuestionExpand`、`importSectionContext`、`importFigureReconcile`、`offlineExamCoordinateOcrNormalize`、`ocrGenericExamPatterns`、`educationSymbolLexicon` 等。
