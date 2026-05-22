/**
 * 服务端专用：一类修复 = repairExamMathCanonicalSync（内置自学库）+ DB 合并规则（无库时方写 data/exam-math-repair-overrides.json）。
 * 命题入库、读卷展示走完整链；客户端 MathContent 用 canonical（含内置库），无磁盘条目时与入库正文一致。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Json } from "@/integrations/supabase/types";
import { stripLeadingChoiceMarker } from "@/lib/examChoiceOptions.shared";
import type { PersistedExamMathRepairRule } from "@/lib/examMathRepairLexicon.shared";
export type { PersistedExamMathRepairRule } from "@/lib/examMathRepairLexicon.shared";
import type { SessionExamSnapshot } from "@/lib/examSession";
import { materializeQuestionRasterFigures } from "@/lib/importRasterFigures.shared";
import {
  sanitizeImportedMcqOptionTails,
  sanitizeImportedStemStructuralPollution,
} from "@/lib/questionImportSanitize.shared";
import { computeQuestionFigureDependencyV1 } from "@/lib/questionFigureDependency.shared";
import { cleanMcqStemInlineOptionResidue } from "@/lib/mcqStemInlineCleaner.shared";
import { shouldSuppressVectorDiagramSchemaForQuestion } from "@/lib/examRasterFigureHints.shared";
import type { Example, Question, QuestionType } from "@/lib/types";
import { getMysqlPool } from "@/lib/examStorage/mysqlExamStore.server";
import {
  loadMergedExamMathRepairRules,
  upsertExamMathRepairRulesToStores,
} from "@/lib/examMathRepairLexiconStore.server";
import {
  repairExamMathCanonicalSync,
  repairSolutionStepsFromJsonCorruption,
} from "@/lib/sanitizeExamMathDisplay";
import { resolveProjectRoot } from "@/lib/projectRoot.server";
import { runDefaultImportFormulaPipelineInRepo } from "@/lib/importFormulaPipeline.shared";
import { getSupabaseAdmin } from "@/lib/supabaseOptional.server";
import { applyImportedExamFigureOwnershipFromRaster } from "@/lib/figureOwnershipApply.shared";

function overridesPath() {
  return path.join(resolveProjectRoot(), "data", "exam-math-repair-overrides.json");
}
const MAX_RULES = 120;

type OverridesFile = { version: number; rules: PersistedExamMathRepairRule[] };

/**
 * 扫描「仅内置修复后」仍出现的残串；命中则把 find=detect.source 写入 overrides（去重 id）。
 * 发现新模式时在数组中追加一项即可，无需手改 JSON。
 */
/** 在 repairExamMathCanonicalSync 之后扫描；命中则写入 overrides（内置库已覆盖的不重复落盘） */
export const EXAM_MATH_LEARNING_TEMPLATES: Array<{
  id: string;
  detect: RegExp;
  replace: string;
}> = [
  { id: "mathbf-imes", detect: /\\mathbf\{imes\}/g, replace: "\\mathbf{\\times}" },
  { id: "plain-mbf-imes", detect: /mathbf\{imes\}/g, replace: "mathbf{\\times}" },
];

let rulesCache: PersistedExamMathRepairRule[] | null = null;
/** 最近一次从 DB + 本地合并的快照；未调用 {@link refreshExamMathRepairMergedRules} 前为 null，读盘兜底 */
let mergedRulesSnapshot: PersistedExamMathRepairRule[] | null = null;

/** 选项去重键：忽略选项字母前缀、大小写与多余空白（保留首次出现的原文） */
function optionDedupKey(raw: string): string {
  return stripLeadingChoiceMarker(String(raw ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeOptionsKeepFirst(options: unknown): unknown {
  if (!Array.isArray(options)) return options;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of options) {
    const text = String(item ?? "");
    const key = optionDedupKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function ensureDataDir(): void {
  const dir = path.dirname(overridesPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readOverridesFromDisk(): OverridesFile {
  ensureDataDir();
  try {
    const raw = readFileSync(overridesPath(), "utf8");
    const j = JSON.parse(raw) as OverridesFile;
    if (!j || typeof j !== "object" || !Array.isArray(j.rules)) return { version: 1, rules: [] };
    return {
      version: 1,
      rules: j.rules.filter((r) => r && typeof r.id === "string" && typeof r.find === "string"),
    };
  } catch {
    return { version: 1, rules: [] };
  }
}

export function invalidateExamMathRepairOverridesCache(): void {
  rulesCache = null;
  mergedRulesSnapshot = null;
}

/** 从 Supabase / MySQL / 本地 JSON 合并规则并刷新内存快照（命题、导入、自学写入前应调用） */
export async function refreshExamMathRepairMergedRules(): Promise<void> {
  mergedRulesSnapshot = await loadMergedExamMathRepairRules();
  rulesCache = null;
}

export function getPersistedRepairRulesSync(): PersistedExamMathRepairRule[] {
  if (mergedRulesSnapshot !== null) return mergedRulesSnapshot;
  if (rulesCache) return rulesCache;
  rulesCache = readOverridesFromDisk().rules;
  return rulesCache;
}

export function applyPersistedLearnedRulesSync(
  rules: PersistedExamMathRepairRule[],
  s: string,
): string {
  if (!s || !rules.length) return s;
  let out = s;
  for (const r of rules) {
    try {
      const re = new RegExp(r.find, r.flags ?? "g");
      out = out.replace(re, r.replace);
    } catch (e) {
      console.warn("[exam-math-repair] skip bad rule", r.id, e);
    }
  }
  return out;
}

/** 入库/展示统一入口：内置自学库 + 磁盘自学条目 */
export function repairExamMathFragmentFullSync(s: string): string {
  const base = repairExamMathCanonicalSync(s);
  return applyPersistedLearnedRulesSync(getPersistedRepairRulesSync(), base);
}

function finalizeImportedStyleMath(s: string): string {
  return runDefaultImportFormulaPipelineInRepo(repairExamMathFragmentFullSync(s));
}

export function repairExamQuestionPayloadStringsWithLearningSync(payload: {
  content?: unknown;
  answer?: unknown;
  options?: unknown;
  solution_steps?: unknown;
}) {
  const content = finalizeImportedStyleMath(String(payload.content ?? ""));
  const answer = finalizeImportedStyleMath(String(payload.answer ?? ""));
  const options = dedupeOptionsKeepFirst(
    Array.isArray(payload.options)
      ? payload.options.map((o) => finalizeImportedStyleMath(String(o)))
      : payload.options,
  );
  const solution_steps = repairSolutionStepsWithLearningSync(payload.solution_steps);
  return { content, answer, options, solution_steps };
}

function repairSolutionStepsWithLearningSync(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => {
    if (!step || typeof step !== "object") return step;
    const o = step as Record<string, unknown>;
    const next = { ...o };
    for (const k of ["description", "reasoning", "formula"] as const) {
      if (typeof o[k] === "string") {
        next[k] = finalizeImportedStyleMath(o[k] as string);
      }
    }
    return next;
  });
}

/** 内置自学库（canonical）之后的片段，用于检测是否仍需追加磁盘规则 */
function collectCanonicalFragmentsFromPayload(payload: {
  content?: unknown;
  answer?: unknown;
  options?: unknown;
  solution_steps?: unknown;
}): string[] {
  const parts: string[] = [];
  parts.push(repairExamMathCanonicalSync(String(payload.content ?? "")));
  parts.push(repairExamMathCanonicalSync(String(payload.answer ?? "")));
  if (Array.isArray(payload.options)) {
    for (const o of payload.options) parts.push(repairExamMathCanonicalSync(String(o)));
  }
  const steps = repairSolutionStepsFromJsonCorruption(payload.solution_steps);
  if (Array.isArray(steps)) {
    for (const st of steps) {
      if (!st || typeof st !== "object") continue;
      const o = st as Record<string, unknown>;
      for (const k of ["description", "reasoning", "formula"] as const) {
        if (typeof o[k] === "string") parts.push(repairExamMathCanonicalSync(o[k] as string));
      }
    }
  }
  return parts;
}

/** 命题成功后调用：canonical 后若仍命中模板则写入 overrides 并 upsert 数据库，再刷新合并快照 */
export async function scanBuiltinFixedFragmentsAndLearnRulesAsync(
  semiFragmentTexts: string[],
): Promise<string[]> {
  const joined = semiFragmentTexts.join("\n");
  const file = readOverridesFromDisk();
  const existingIds = new Set(file.rules.map((r) => r.id));
  const added: string[] = [];

  for (const t of EXAM_MATH_LEARNING_TEMPLATES) {
    if (!t.detect.test(joined)) continue;
    if (existingIds.has(t.id)) continue;
    if (file.rules.length >= MAX_RULES) break;
    const flags = t.detect.flags || "g";
    file.rules.push({
      id: t.id,
      find: t.detect.source,
      replace: t.replace,
      flags,
    });
    existingIds.add(t.id);
    added.push(t.id);
  }

  if (added.length) {
    const pool = await getMysqlPool();
    const hasDb = !!(getSupabaseAdmin() || pool);
    if (!hasDb) {
      ensureDataDir();
      writeFileSync(overridesPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
    }
    const addedObjs = file.rules.filter((r) => added.includes(r.id));
    await upsertExamMathRepairRulesToStores(addedObjs);
    await refreshExamMathRepairMergedRules();
    console.info("[exam-math-repair] learned new rules:", added.join(", "));
  }
  return added;
}

export function collectSemiBuiltinsOnlyFromRawQuestions(
  rawQuestions: Array<{
    content?: unknown;
    answer?: unknown;
    options?: unknown;
    solution_steps?: unknown;
  }>,
): string[] {
  const out: string[] = [];
  for (const q of rawQuestions) {
    out.push(...collectCanonicalFragmentsFromPayload(q));
  }
  return out;
}

/** 读卷展示输入：Supabase 行 / 本地快照；部分字段比 Question 更宽（DB Json、type 为 string） */
export type QuestionDisplayRepairInput = Omit<Question, "type" | "options" | "solution_steps"> & {
  type: QuestionType | string;
  options: Question["options"] | Json;
  solution_steps: Question["solution_steps"] | Json | null | undefined;
};

export type ExampleDisplayRepairInput = Omit<Example, "solution_steps"> & {
  solution_steps: Example["solution_steps"] | Json | null | undefined;
};

/** 读卷：为题干、选项、答案、分步应用完整一类修复（内置自学库 + 磁盘条目） */
export function deepRepairQuestionForDisplay(q: QuestionDisplayRepairInput): Question {
  const fix = finalizeImportedStyleMath;
  const rawOpts = Array.isArray(q.options) ? q.options.map((o) => fix(String(o))) : q.options;
  const deduped = dedupeOptionsKeepFirst(rawOpts) as Question["options"];
  const optsStrippedLead = Array.isArray(deduped)
    ? deduped.map((o) => stripLeadingChoiceMarker(String(o)))
    : null;
  const qt = String(q.type ?? "");
  const mcqFourPlus =
    (qt === "multiple_choice" || qt === "multiple_choice_multi") &&
    Array.isArray(optsStrippedLead) &&
    optsStrippedLead.filter((o) => String(o ?? "").trim()).length >= 4;
  let contentStem = sanitizeImportedStemStructuralPollution(fix(String(q.content ?? "")));
  if (mcqFourPlus) {
    contentStem = cleanMcqStemInlineOptionResidue(contentStem);
  }
  const base: Question = {
    ...q,
    type: q.type as QuestionType,
    content: contentStem,
    answer: fix(String(q.answer ?? "")),
    options: sanitizeImportedMcqOptionTails(optsStrippedLead) as Question["options"],
    solution_steps: (repairSolutionStepsWithLearningSync(q.solution_steps) ??
      q.solution_steps) as Question["solution_steps"],
  };
  const withRaster = materializeQuestionRasterFigures(base);
  /**
   * 缺卷面位图且题干用语依赖示意图时，禁止再用 diagram_schema 做「结构化重绘」——避免无原图时的随机线段幻觉。
   * 有 Markdown / raster_figures 附图则不剥。
   */
  const fd = computeQuestionFigureDependencyV1(withRaster);
  if (
    shouldSuppressVectorDiagramSchemaForQuestion(withRaster) &&
    withRaster.diagram_schema != null &&
    typeof withRaster.diagram_schema === "object"
  ) {
    return { ...withRaster, diagram_schema: null, figure_dependency: fd };
  }
  return { ...withRaster, figure_dependency: fd };
}

export function deepRepairExampleForDisplay(ex: ExampleDisplayRepairInput): Example {
  const rules = getPersistedRepairRulesSync();
  const fix = (s: string) => applyPersistedLearnedRulesSync(rules, repairExamMathCanonicalSync(s));
  const steps = repairSolutionStepsWithLearningSync(ex.solution_steps);
  return {
    ...ex,
    content: fix(String(ex.content ?? "")),
    answer: fix(String(ex.answer ?? "")),
    solution_steps: (steps ?? ex.solution_steps) as Example["solution_steps"],
  };
}

/** 会话快照：与入库卷相同的完整一类修复（内置卷 + data 自学条目），供打印/PDF/Markdown 与页面对齐 */
export function repairSessionExamSnapshotForExport(snap: SessionExamSnapshot): SessionExamSnapshot {
  const repaired: SessionExamSnapshot = {
    exam: {
      ...snap.exam,
      title: repairExamMathFragmentFullSync(String(snap.exam.title ?? "")),
      subtitle:
        snap.exam.subtitle != null
          ? repairExamMathFragmentFullSync(String(snap.exam.subtitle))
          : null,
      description:
        snap.exam.description != null
          ? repairExamMathFragmentFullSync(String(snap.exam.description))
          : null,
    },
    questions: snap.questions.map((q) => deepRepairQuestionForDisplay(q)),
    examples: snap.examples.map((e) => deepRepairExampleForDisplay(e)),
    ...(snap.offline_import_media ? { offline_import_media: snap.offline_import_media } : {}),
  };

  const regLen = repaired.exam.figure_registry?.length ?? 0;
  const hasStemUrls = repaired.questions.some((q) =>
    (q.raster_figures?.stem ?? []).some((u) => String(u ?? "").trim().length > 0),
  );
  if (repaired.exam.source === "imported" && regLen === 0 && hasStemUrls) {
    return applyImportedExamFigureOwnershipFromRaster(repaired);
  }
  return repaired;
}
