/**
 * 已入库导入卷：共图大题 + 小问对齐 CLI（local-exams / MySQL）。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  alignImportedParentQuestionSnapshot,
  extractImportFiguresBatchIdFromSnapshot,
} from "@/lib/importParentQuestionPaperAlignment.shared";
import { attachImportBatchPageFigureIfMissing } from "@/lib/offlineImportFigureBackfill.shared";
import { loadLocalExam, saveLocalExamSnapshot } from "@/lib/localExamStore.server";
import {
  loadMysqlExamSnapshot,
  replaceExamSnapshotInMysql,
} from "@/lib/examStorage/mysqlExamStore.server";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

export async function runParentQuestionAlignmentCli(argv: string[]): Promise<void> {
  const examId = argv[2]?.trim();
  if (!examId) {
    console.error(
      "用法: npx tsx apps/web/scripts/apply-imported-exam-parent-question-alignment.ts <examId>",
    );
    process.exit(2);
  }

  const localSnap = await loadLocalExam(examId);
  let storage: "local" | "mysql" = "local";
  let snap = localSnap;
  if (!snap) {
    try {
      snap = await loadMysqlExamSnapshot(examId);
      if (snap) storage = "mysql";
    } catch (e) {
      console.warn("[parent-q-align] MySQL 读取失败:", e instanceof Error ? e.message : String(e));
    }
  }
  if (!snap) {
    console.error(
      `未找到试卷 ${examId}（已查 data/local-exams 与 MySQL；若在 Supabase，请先导出快照到本地）`,
    );
    process.exit(1);
  }
  console.info(`[parent-q-align] 来源: ${storage}`);

  const batchIdArg = process.env.IMPORT_FIGURES_BATCH_ID?.trim() || argv[3]?.trim();
  let working = snap;
  if (batchIdArg && !extractImportFiguresBatchIdFromSnapshot(working)) {
    working = attachImportBatchPageFigureIfMissing(working, batchIdArg);
  }
  const batchId = batchIdArg || extractImportFiguresBatchIdFromSnapshot(working);
  const root = resolveProjectRoot();
  const figDir =
    batchId != null ? path.join(root, "apps", "web", "public", "import-figures", batchId) : null;

  if (process.env.COPY_PAGE_ALIASES === "1" && figDir && batchId) {
    const page = path.join(figDir, "0.jpg");
    if (existsSync(page)) {
      mkdirSync(figDir, { recursive: true });
      const existing = new Set(readdirSync(figDir));
      const diagramLabels = ["①", "②", "③", "④"];
      for (const lab of diagramLabels) {
        const hasLabel = [...existing].some((n) => n.includes(`图${lab}`));
        if (hasLabel) continue;
        const name = `p0-图${lab}.png`;
        const dest = path.join(figDir, name);
        copyFileSync(page, dest);
        console.info(`[parent-q-align] copied ${name} from 0.jpg`);
      }
    } else {
      console.warn(`[parent-q-align] 未找到 ${page}，跳过 COPY_PAGE_ALIASES`);
    }
  }

  const aligned = alignImportedParentQuestionSnapshot(working, { batchId });
  if (storage === "mysql") {
    await replaceExamSnapshotInMysql(aligned);
  } else {
    await saveLocalExamSnapshot(aligned);
  }

  console.info(
    JSON.stringify(
      {
        ok: true,
        examId,
        storage,
        batchId,
        questions: aligned.questions.length,
        registry: aligned.exam.figure_registry?.length ?? 0,
      },
      null,
      2,
    ),
  );
}
