/**
 * 入库前：仅校验「本站可解析的本地 public 路径」`/import-figures/…` 是否在磁盘存在。
 * 不对外链做 HEAD（CDN/auth）；远端 Storage URL 视为 unverified，不在此剥离。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { shouldSuppressVectorDiagramSchemaForQuestion } from "@/lib/examRasterFigureHints.shared";
import { isResolvableRasterAssetUrl } from "@/lib/rasterAssetUrl.shared";
import {
  attachPerQuestionImportQualityFromRollup,
  computeImportParseQualityRollup,
  mergeImportChainIntoRollup,
  mergeLocalPersistedFigureMissingIntoRollup,
  parseImportParseQualityRollup,
  type ImportChainV1,
} from "@/lib/importParseQuality.shared";
import {
  fillHeuristicRasterBboxNormsIfNeeded,
  isPersistedImportRasterUrl,
} from "@/lib/importRasterFigures.shared";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { computeQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import type { Example, Exam, Question, QuestionRasterFiguresV1 } from "@/lib/types";

/** 将 `/import-figures/…` 或含该 path 的绝对 URL 映射到仓库内 `apps/web/public/import-figures/…`；否则 null */
export function resolveLocalImportFiguresPublicFsPath(
  rawUrl: string,
  projectRoot = resolveProjectRoot(),
): string | null {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;
  let pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    return null;
  }
  const marker = "/import-figures/";
  const idx = pathname.indexOf(marker);
  if (idx < 0) return null;
  const rel = pathname.slice(idx + marker.length);
  if (!rel || rel.includes("..")) return null;
  const segments = rel.split("/").filter(Boolean);
  if (!segments.length) return null;
  return path.join(projectRoot, "apps", "web", "public", "import-figures", ...segments);
}

export function localImportFigureFileMissingOnDisk(
  rawUrl: string,
  projectRoot = resolveProjectRoot(),
): boolean {
  if (!isPersistedImportRasterUrl(rawUrl)) return false;
  const fsPath = resolveLocalImportFiguresPublicFsPath(rawUrl, projectRoot);
  if (!fsPath) return false;
  return !existsSync(fsPath);
}

const MD_IMG_RE = /!\[[^\]]*\]\(\s*([^)]+?)\s*\)/g;

function normalizeImgUrl(u: string): string {
  return String(u ?? "").trim();
}

/** 从 Markdown 中移除指向给定 URL 的图片语法（空格容忍与 extract 一致） */
export function stripMarkdownImagesForUrls(text: string, remove: ReadonlySet<string>): string {
  if (!remove.size) return text;
  const normRemove = new Set([...remove].map(normalizeImgUrl));
  return String(text ?? "").replace(MD_IMG_RE, (full, urlRaw: string) => {
    const u = normalizeImgUrl(urlRaw);
    return normRemove.has(u) ? "" : full;
  });
}

function collectRasterUrls(rf: QuestionRasterFiguresV1 | null | undefined): string[] {
  if (!rf) return [];
  const out: string[] = [];
  for (const u of rf.stem ?? []) {
    if (String(u).trim()) out.push(String(u));
  }
  for (const L of ["A", "B", "C", "D"] as const) {
    for (const u of rf.by_option?.[L] ?? []) {
      if (String(u).trim()) out.push(String(u));
    }
  }
  return out;
}

function collectMarkdownImageUrls(text: string): string[] {
  const s = String(text ?? "");
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MD_IMG_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const u = normalizeImgUrl(m[1] ?? "");
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function urlShouldScrubBeforePersist(url: string, projectRoot: string): boolean {
  const norm = normalizeImgUrl(url);
  if (!isResolvableRasterAssetUrl(norm)) return true;
  return localImportFigureFileMissingOnDisk(norm, projectRoot);
}

function collectUrlsToScrubForQuestion(q: Question, projectRoot: string): Set<string> {
  const acc = new Set<string>();
  const consider = (u: string) => {
    if (urlShouldScrubBeforePersist(u, projectRoot)) acc.add(normalizeImgUrl(u));
  };
  for (const u of collectMarkdownImageUrls(String(q.content ?? ""))) consider(u);
  if (Array.isArray(q.options)) {
    for (const o of q.options) {
      for (const u of collectMarkdownImageUrls(String(o ?? ""))) consider(u);
    }
  }
  for (const u of collectRasterUrls(q.raster_figures ?? null)) consider(u);
  return acc;
}

function filterRasterFiguresByUrls(
  rf: QuestionRasterFiguresV1 | null,
  remove: ReadonlySet<string>,
): QuestionRasterFiguresV1 | null {
  if (!rf || !remove.size) return rf;
  const rm = new Set([...remove].map(normalizeImgUrl));
  const stem = (rf.stem ?? []).filter((u) => !rm.has(normalizeImgUrl(u)));
  const by_option: NonNullable<QuestionRasterFiguresV1["by_option"]> = { ...(rf.by_option ?? {}) };
  for (const L of ["A", "B", "C", "D"] as const) {
    const arr = by_option[L];
    if (!arr) continue;
    const next = arr.filter((u) => !rm.has(normalizeImgUrl(u)));
    if (next.length) by_option[L] = next;
    else delete by_option[L];
  }
  const keys = Object.keys(by_option);
  if (stem.length === 0 && keys.length === 0) return null;
  return fillHeuristicRasterBboxNormsIfNeeded({
    version: 1,
    stem,
    by_option: keys.length ? by_option : {},
    stem_bbox_norm: rf.stem_bbox_norm ?? null,
    by_option_bbox_norm: rf.by_option_bbox_norm ?? null,
  });
}

function reconcileDiagramAfterRasterEdit(q: Question): Question {
  const fd = computeQuestionFigureDependencyV1(q);
  if (
    shouldSuppressVectorDiagramSchemaForQuestion(q) &&
    q.diagram_schema != null &&
    typeof q.diagram_schema === "object"
  ) {
    return { ...q, diagram_schema: null, figure_dependency: fd };
  }
  return { ...q, figure_dependency: fd };
}

function scrubQuestion(q: Question, remove: ReadonlySet<string>): Question {
  if (!remove.size) return reconcileDiagramAfterRasterEdit(q);
  const content = stripMarkdownImagesForUrls(String(q.content ?? ""), remove);
  const options = Array.isArray(q.options)
    ? q.options.map((o) => stripMarkdownImagesForUrls(String(o ?? ""), remove))
    : q.options;
  const rfNext = filterRasterFiguresByUrls(q.raster_figures ?? null, remove);
  const next: Question = {
    ...q,
    content,
    options: options as Question["options"],
    raster_figures: rfNext,
  };
  return reconcileDiagramAfterRasterEdit(next);
}

function collectUrlsToScrubForExample(ex: Example, projectRoot: string): Set<string> {
  const acc = new Set<string>();
  const consider = (u: string) => {
    if (urlShouldScrubBeforePersist(u, projectRoot)) acc.add(normalizeImgUrl(u));
  };
  for (const u of collectMarkdownImageUrls(String(ex.content ?? ""))) consider(u);
  for (const u of collectMarkdownImageUrls(String(ex.answer ?? ""))) consider(u);
  if (Array.isArray(ex.solution_steps)) {
    for (const st of ex.solution_steps) {
      for (const u of collectMarkdownImageUrls(String(st.description ?? ""))) consider(u);
      for (const u of collectMarkdownImageUrls(String(st.reasoning ?? ""))) consider(u);
      for (const u of collectMarkdownImageUrls(String(st.formula ?? ""))) consider(u);
    }
  }
  return acc;
}

function scrubExample(ex: Example, remove: ReadonlySet<string>): Example {
  if (!remove.size) return ex;
  const strip = (t: string) => stripMarkdownImagesForUrls(t, remove);
  const steps = Array.isArray(ex.solution_steps)
    ? ex.solution_steps.map((st) => ({
        ...st,
        description: strip(String(st.description ?? "")),
        reasoning:
          st.reasoning != null ? strip(String(st.reasoning)) : (st.reasoning as undefined | null),
        formula: st.formula != null ? strip(String(st.formula)) : (st.formula as undefined | null),
      }))
    : ex.solution_steps;
  return {
    ...ex,
    content: strip(String(ex.content ?? "")),
    answer: strip(String(ex.answer ?? "")),
    solution_steps: steps as Example["solution_steps"],
  };
}

function extractImportChainFromExam(
  importParseQuality: Exam["import_parse_quality"],
): ImportChainV1 | null {
  const rollup = parseImportParseQualityRollup(importParseQuality);
  return rollup?.import_chain ?? null;
}

export type ScrubMissingLocalImportFiguresResult = {
  bundle: SessionExamSnapshot;
  /** 从题干/选项 Markdown 与 raster 元数据中剥离的「本地 import-figures 且磁盘不存在」URL 数（按题 Set 去重后累加） */
  scrubbedImportFigureUrlCount: number;
};

/**
 * 剥离磁盘不存在的 `/import-figures/…` 引用，并按最新题干重算 `import_parse_quality`（保留原 `import_chain` 合并）。
 */
export function scrubMissingLocalImportFiguresBeforePersist(
  bundle: SessionExamSnapshot,
  projectRoot = resolveProjectRoot(),
): ScrubMissingLocalImportFiguresResult {
  const missingByOrder = new Map<number, string[]>();
  let scrubbedImportFigureUrlCount = 0;
  const questions = bundle.questions.map((q) => {
    const remove = collectUrlsToScrubForQuestion(q, projectRoot);
    if (!remove.size) return q;
    scrubbedImportFigureUrlCount += remove.size;
    missingByOrder.set(q.order_index, [...remove]);
    return scrubQuestion(q, remove);
  });

  const examples = bundle.examples.map((ex) => {
    const remove = collectUrlsToScrubForExample(ex, projectRoot);
    if (!remove.size) return ex;
    scrubbedImportFigureUrlCount += remove.size;
    return scrubExample(ex, remove);
  });

  let rollup = computeImportParseQualityRollup(questions);
  rollup = mergeImportChainIntoRollup(
    rollup,
    extractImportChainFromExam(bundle.exam.import_parse_quality),
  );
  rollup = mergeLocalPersistedFigureMissingIntoRollup(rollup, missingByOrder);

  const questionsOut = attachPerQuestionImportQualityFromRollup(questions, rollup);

  return {
    bundle: {
      ...bundle,
      questions: questionsOut,
      examples,
      exam: {
        ...bundle.exam,
        import_parse_quality: rollup,
      },
    },
    scrubbedImportFigureUrlCount,
  };
}
