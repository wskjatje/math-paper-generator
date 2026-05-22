/**
 * 对齐已入库的「共图大题 + 小问」导入卷：坏链配图、按拓扑切分保留正文、按图①/②挂裁图、清除误生成矢量图。
 *
 * 用法（仓库根或 apps/web）：
 *   npx tsx apps/web/scripts/apply-imported-exam-parent-question-alignment.ts <examId>
 *
 * 可选：从整页 0.jpg 复制占位裁图（batch 下缺「图①」「图②」等文件名时）：
 *   COPY_PAGE_ALIASES=1 npx tsx apps/web/scripts/apply-imported-exam-parent-question-alignment.ts <examId>
 *
 * 卷内无 figure_registry 但 public 下已有 batch 目录时：
 *   IMPORT_FIGURES_BATCH_ID=<uuid> npx tsx … <examId>
 *
 * 矢量图 / 整页扫描策略：apply-imported-exam-stem-figure-policy.ts（已内含本对齐 + 展开 + 配图供给）。
 */

import { runParentQuestionAlignmentCli } from "../src/lib/importParentQuestionAlignmentCli.server.ts";

await runParentQuestionAlignmentCli(process.argv);
