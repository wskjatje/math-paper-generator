/**
 * 对已入库导入卷重跑「题干配图供给」通用策略（非某套卷硬编码）：
 * - 规则链 diagram_schema（坐标系 / 尺规 / 旋转等）
 * - 可用矢量表达时去掉整页 import-figures/…/0.jpg 占位
 *
 * 用法：
 *   npx tsx apps/web/scripts/apply-imported-exam-stem-figure-policy.ts <examId>
 *
 * 读取：data/local-exams → MySQL；写回同一来源。
 *
 * 已入库卷若缺 (1)(2) 小问：可传入完整 OCR 正文再展开（二选一）：
 *   IMPORT_SOURCE_PLAIN_TEXT='…全文…' npx tsx … <examId>
 *   IMPORT_SOURCE_PLAIN_TEXT_FILE=/path/to/ocr.txt npx tsx … <examId>
 */

import { readFileSync } from "node:fs";

import { fillGeometryDiagramsForSnapshot } from "../src/lib/geometryDiagramInference.server.ts";
import { expandImportedParentQuestionSnapshot } from "../src/lib/importParentQuestionExpand.shared.ts";
import {
  alignImportedParentQuestionSnapshot,
  extractImportFiguresBatchIdFromSnapshot,
} from "../src/lib/importParentQuestionPaperAlignment.shared.ts";
import { applyImportStemFigureSupplyPolicy } from "../src/lib/importStemFigureSupply.shared.ts";
import { loadLocalExam, saveLocalExamSnapshot } from "../src/lib/localExamStore.server.ts";
import {
  loadMysqlExamSnapshot,
  replaceExamSnapshotInMysql,
} from "../src/lib/examStorage/mysqlExamStore.server.ts";
import { sanitizeImportedSnapshotForPersist } from "../src/lib/questionImportSanitize.shared.ts";

const examId = process.argv[2]?.trim();
if (!examId) {
  console.error("用法: npx tsx apps/web/scripts/apply-imported-exam-stem-figure-policy.ts <examId>");
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
    console.warn("[stem-figure-policy] MySQL 读取失败:", e instanceof Error ? e.message : String(e));
  }
}
if (!snap) {
  console.error(`未找到试卷 ${examId}（local-exams 与 MySQL）`);
  process.exit(1);
}

if (snap.exam.source !== "imported") {
  console.error("仅 imported 卷适用本策略");
  process.exit(1);
}

console.info(`[stem-figure-policy] 来源: ${storage}`);

function readSourcePlainTextOverride(): string | undefined {
  const inline = process.env.IMPORT_SOURCE_PLAIN_TEXT?.trim();
  if (inline && inline.length >= 40) return inline;
  const file = process.env.IMPORT_SOURCE_PLAIN_TEXT_FILE?.trim();
  if (file) {
    try {
      const t = readFileSync(file, "utf8").trim();
      if (t.length >= 40) return t;
    } catch (e) {
      console.warn(
        "[stem-figure-policy] 无法读取 IMPORT_SOURCE_PLAIN_TEXT_FILE:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return undefined;
}

const sourceOverride = readSourcePlainTextOverride();
const batchId = extractImportFiguresBatchIdFromSnapshot(snap);
let working = alignImportedParentQuestionSnapshot(snap, { batchId });
const alignedDelta = working.questions.length - snap.questions.length;
if (alignedDelta !== 0) {
  console.info(`[stem-figure-policy] 共图大题对齐后题量 ${alignedDelta >= 0 ? "+" : ""}${alignedDelta}`);
}
working = expandImportedParentQuestionSnapshot(working, { sourceText: sourceOverride });
const expandedCount = working.questions.length - snap.questions.length;
if (expandedCount > 0) {
  console.info(`[stem-figure-policy] 已展开大题小问 +${expandedCount} 题`);
}
if (process.env.STEM_FIGURE_ALLOW_LLM === "1") {
  working = await fillGeometryDiagramsForSnapshot(working, undefined, { mode: "full" });
} else {
  working = await fillGeometryDiagramsForSnapshot(working, undefined, { mode: "rule_only" });
}
working = applyImportStemFigureSupplyPolicy(working);
working = sanitizeImportedSnapshotForPersist(working);

const diagramCount = working.questions.filter((q) => q.diagram_schema != null).length;
const wholePageRaster = working.questions.filter((q) =>
  (q.raster_figures?.stem ?? []).some((u) => /\/0\.jpe?g$/i.test(u)),
).length;

if (storage === "mysql") {
  await replaceExamSnapshotInMysql(working);
} else {
  await saveLocalExamSnapshot(working);
}

console.info(
  JSON.stringify(
    {
      ok: true,
      examId,
      storage,
      questions: working.questions.length,
      diagram_schema_count: diagramCount,
      questions_with_whole_page_raster: wholePageRaster,
    },
    null,
    2,
  ),
);
