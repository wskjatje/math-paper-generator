/**
 * 导入卷题干配图供给（通用，非某套试卷硬编码）：
 * - 规则链推断 diagram_schema（坐标系、尺规、旋转等）
 * - 题干已可矢量表达时，不用整页扫描 `import-figures/<batch>/0.jpg` 顶替
 */
import type { SessionExamSnapshot } from "@/lib/examSession";
import { stemExpectsScanStyleFigure } from "@/lib/examRasterFigureHints.shared";
import { tryRuleBasedDiagramSchema } from "@/lib/geometry/geometryRuleInference.shared";
import { stemLooksLikeCartesianPlaneProblem } from "@/lib/geometry/geometryCartesianPlane.shared";
import type { Question } from "@/lib/types";

/** 批次整页占位图（非题面裁图） */
export function isWholePageImportFigureUrl(url: string): boolean {
  const u = String(url ?? "").trim();
  if (!/\/import-figures\/[0-9a-f-]{36}\//i.test(u)) return false;
  const name = (u.split("/").pop() ?? "").split(/[?#]/, 1)[0] ?? "";
  return /^0\.(jpe?g|png|webp)$/i.test(name);
}

/** 题干 stem 位图是否仅有整页图、无题面裁图 */
export function questionStemOnlyHasWholePageRaster(q: Question): boolean {
  const stem = q.raster_figures?.stem ?? [];
  if (!stem.length) return false;
  return stem.every((u) => isWholePageImportFigureUrl(String(u)));
}

/**
 * 题干语义上应用坐标/规则矢量即可，不应以整页扫描顶替（仍保留「图①」类裁图）。
 */
export function stemPrefersRuleDiagramOverWholePageScan(stem: string): boolean {
  const t = String(stem ?? "");
  if (stemExpectsScanStyleFigure(t)) return false;
  if (stemLooksLikeCartesianPlaneProblem(t)) return true;
  return tryRuleBasedDiagramSchema(t) != null;
}

function stripWholePageFromQuestion(q: Question, registry: SessionExamSnapshot["exam"]["figure_registry"]): Question {
  const stem = (q.raster_figures?.stem ?? []).filter((u) => !isWholePageImportFigureUrl(u));
  const refs = (q.figure_refs ?? []).filter((ref) => {
    const it = (registry ?? []).find((r) => r.figure_id === ref.figure_id);
    return it == null || !isWholePageImportFigureUrl(String(it.raster_url ?? ""));
  });
  const content = String(q.content ?? "").replace(
    /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/g,
    (full, urlRaw: string) => (isWholePageImportFigureUrl(String(urlRaw)) ? "" : full),
  );
  return {
    ...q,
    content: content.trim(),
    figure_refs: refs.length ? refs : null,
    raster_figures:
      stem.length > 0
        ? {
            version: 1 as const,
            stem,
            by_option: q.raster_figures?.by_option ?? {},
            stem_bbox_norm: q.raster_figures?.stem_bbox_norm ?? null,
            by_option_bbox_norm: q.raster_figures?.by_option_bbox_norm ?? null,
          }
        : null,
  };
}

/**
 * 单题：规则补 diagram_schema；在可用矢量表达时去掉整页扫描占位。
 */
export function enrichImportedQuestionStemFigureSupply(q: Question): Question {
  let out = q;
  const content = String(q.content ?? "");

  if (out.diagram_schema == null) {
    const schema = tryRuleBasedDiagramSchema(content);
    if (schema) out = { ...out, diagram_schema: schema };
  }

  const shouldStripWholePage =
    out.diagram_schema != null ||
    (stemPrefersRuleDiagramOverWholePageScan(content) && questionStemOnlyHasWholePageRaster(out));

  if (shouldStripWholePage) {
    out = stripWholePageFromQuestion(out, undefined);
  }

  return out;
}

/** 已有矢量或规则可表达时，卷级去掉整页 registry 项 */
export function stripWholePageImportRasterWhenVectorPresent(
  snap: SessionExamSnapshot,
): SessionExamSnapshot {
  const questions = snap.questions.map((q) => {
    if (q.diagram_schema == null && !stemPrefersRuleDiagramOverWholePageScan(String(q.content ?? ""))) {
      return q;
    }
    return stripWholePageFromQuestion(q, snap.exam.figure_registry);
  });
  const figure_registry = (snap.exam.figure_registry ?? []).filter(
    (it) => !isWholePageImportFigureUrl(String(it.raster_url ?? "")),
  );
  return { ...snap, exam: { ...snap.exam, figure_registry }, questions };
}

/** 导入快照：逐题规则矢量 + 整页扫描降级（同步，入库/修复脚本共用） */
export function applyImportStemFigureSupplyPolicy(
  snap: SessionExamSnapshot,
): SessionExamSnapshot {
  if (snap.exam.source !== "imported") return snap;
  const questions = snap.questions.map(enrichImportedQuestionStemFigureSupply);
  return stripWholePageImportRasterWhenVectorPresent({ ...snap, questions });
}
