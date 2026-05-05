/**
 * 服务端专用：一类修复 = repairExamMathCanonicalSync（内置自学库）+ data/exam-math-repair-overrides.json。
 * 命题入库、读卷展示走完整链；客户端 MathContent 用 canonical（含内置库），无磁盘条目时与入库正文一致。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Json } from "@/integrations/supabase/types";
import type { SessionExamSnapshot } from "@/lib/examSession";
import type { Example, Question, QuestionType } from "@/lib/types";
import {
  repairExamMathCanonicalSync,
  repairSolutionStepsFromJsonCorruption,
} from "@/lib/sanitizeExamMathDisplay";
import { resolveProjectRoot } from "@/lib/projectRoot.server";

function overridesPath() {
  return path.join(resolveProjectRoot(), "data", "exam-math-repair-overrides.json");
}
const MAX_RULES = 120;

export type PersistedExamMathRepairRule = {
  id: string;
  find: string;
  replace: string;
  flags?: string;
};

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
}

export function getPersistedRepairRulesSync(): PersistedExamMathRepairRule[] {
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

export function repairExamQuestionPayloadStringsWithLearningSync(payload: {
  content?: unknown;
  answer?: unknown;
  options?: unknown;
  solution_steps?: unknown;
}) {
  const content = repairExamMathFragmentFullSync(String(payload.content ?? ""));
  const answer = repairExamMathFragmentFullSync(String(payload.answer ?? ""));
  const options = Array.isArray(payload.options)
    ? payload.options.map((o) => repairExamMathFragmentFullSync(String(o)))
    : payload.options;
  const solution_steps = repairSolutionStepsWithLearningSync(payload.solution_steps);
  return { content, answer, options, solution_steps };
}

function repairSolutionStepsWithLearningSync(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  const rules = getPersistedRepairRulesSync();
  return steps.map((step) => {
    if (!step || typeof step !== "object") return step;
    const o = step as Record<string, unknown>;
    const next = { ...o };
    for (const k of ["description", "reasoning", "formula"] as const) {
      if (typeof o[k] === "string") {
        const base = repairExamMathCanonicalSync(o[k] as string);
        next[k] = applyPersistedLearnedRulesSync(rules, base);
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

/** 命题成功后调用：canonical 后若仍命中模板则写入 overrides（与内置库合并生效） */
export function scanBuiltinFixedFragmentsAndLearnRules(semiFragmentTexts: string[]): string[] {
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
    ensureDataDir();
    writeFileSync(overridesPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
    invalidateExamMathRepairOverridesCache();
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
  const rules = getPersistedRepairRulesSync();
  const fix = (s: string) => applyPersistedLearnedRulesSync(rules, repairExamMathCanonicalSync(s));
  return {
    ...q,
    type: q.type as QuestionType,
    content: fix(String(q.content ?? "")),
    answer: fix(String(q.answer ?? "")),
    options: Array.isArray(q.options)
      ? q.options.map((o) => fix(String(o)))
      : (q.options as Question["options"]),
    solution_steps: (repairSolutionStepsWithLearningSync(q.solution_steps) ??
      q.solution_steps) as Question["solution_steps"],
  };
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
  return {
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
  };
}
