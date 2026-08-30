/**
 * 表驱动语义闸门（跨学科）：定位对齐、解析–答案冲突、计数选项可疑、
 * 多选字母完备、物理量纲陷阱、溶液质量分数。规则来自 exam-domain.json。
 */
import { EXAM_SEMANTIC_GATES } from "@/config/examDomain";
import { gradeBand, stretchGradeBandOneStep, type GradeBand } from "@/lib/generateCatalog";

export type ExamSemanticValidationContext = {
  title?: string;
  subtitle?: string;
  gradeId?: string;
  gradeLabel?: string;
  subjectId?: string;
  subjectLabel?: string;
  difficulty?: string;
  paperKindId?: string;
  paperKindLabel?: string;
  examTrackId?: string;
  examTrackLabel?: string;
  competitionFocusLabels?: string[];
  /** 已入库扁平标签（inspect / 旧卷） */
  subjectTags?: string[];
};

export type SemanticGateQuestion = {
  type?: string;
  content?: string;
  answer?: string;
  options?: unknown;
  knowledge_tags?: unknown;
  solution_steps?: unknown;
  subject?: string;
};

function safeRegex(source: string, flags = "i"): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function anyPattern(text: string, patterns: ReadonlyArray<string>): boolean {
  for (const p of patterns) {
    const re = safeRegex(p);
    if (re && re.test(text)) return true;
  }
  return false;
}

function firstCapture(text: string, pattern: string): number | undefined {
  const re = safeRegex(pattern);
  if (!re) return undefined;
  const m = re.exec(text);
  if (!m?.[1]) return undefined;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function firstTwoCaptures(text: string, pattern: string): [number, number] | undefined {
  const re = safeRegex(pattern);
  if (!re) return undefined;
  const m = re.exec(text);
  if (!m?.[1] || !m[2]) return undefined;
  const a = Number.parseFloat(m[1]);
  const b = Number.parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return [a, b];
}

function solutionTextOf(q: SemanticGateQuestion): string {
  const steps = q.solution_steps;
  if (!Array.isArray(steps)) return "";
  return steps
    .map((s) => {
      if (!s || typeof s !== "object") return String(s ?? "");
      const o = s as Record<string, unknown>;
      return [o.description, o.reasoning, o.formula].map((x) => String(x ?? "")).join(" ");
    })
    .join("\n");
}

function knowledgeTagsText(q: SemanticGateQuestion): string {
  if (!Array.isArray(q.knowledge_tags)) return "";
  return q.knowledge_tags.map((t) => String(t ?? "")).join(" ");
}

function buildAlignmentCorpus(
  ctx: ExamSemanticValidationContext | undefined,
  questions: SemanticGateQuestion[],
): string {
  const parts: string[] = [];
  if (ctx) {
    for (const v of [
      ctx.title,
      ctx.subtitle,
      ctx.gradeId,
      ctx.gradeLabel,
      ctx.subjectId,
      ctx.subjectLabel,
      ctx.difficulty,
      ctx.paperKindId,
      ctx.paperKindLabel,
      ctx.examTrackId,
      ctx.examTrackLabel,
      ...(ctx.competitionFocusLabels ?? []),
      ...(ctx.subjectTags ?? []),
    ]) {
      if (v?.trim()) parts.push(v.trim());
    }
  }
  for (const q of questions) {
    const kt = knowledgeTagsText(q);
    if (kt) parts.push(kt);
  }
  return parts.join("\n");
}

function resolveGradeBand(ctx: ExamSemanticValidationContext | undefined): string | undefined {
  if (!ctx) return undefined;
  if (ctx.gradeId?.trim()) {
    const b = gradeBand(ctx.gradeId.trim());
    if (b) return b;
  }
  const label = `${ctx.gradeLabel ?? ""} ${ctx.title ?? ""} ${ctx.subjectTags?.join(" ") ?? ""}`;
  if (/小学|一年级|二年级|三年级|四年级|五年级|六年级|pri_g/i.test(label)) return "primary";
  if (/初中|七年级|八年级|九年级|初一|初二|初三|jhs_/i.test(label)) return "junior";
  if (/高中|高一|高二|高三|hs_g/i.test(label)) return "senior";
  return undefined;
}

export function collectAlignmentIssues(
  ctx: ExamSemanticValidationContext | undefined,
  questions: SemanticGateQuestion[],
): string[] {
  const cfg = EXAM_SEMANTIC_GATES;
  if (!cfg.enabled || !cfg.alignment.enabled) return [];
  const band = resolveGradeBand(ctx);
  if (!band) return [];
  /** 与命题页侧重过滤一致：年级参照允许上浮一档后再套 alignment */
  const alignmentBand =
    band === "primary" || band === "junior" || band === "senior"
      ? stretchGradeBandOneStep(band as GradeBand)
      : band;
  const corpus = buildAlignmentCorpus(ctx, questions);
  const out: string[] = [];
  for (const rule of cfg.alignment.rules) {
    if (!rule.whenGradeBands.includes(alignmentBand)) continue;
    if (!anyPattern(corpus, rule.forbidCorpusPatterns)) continue;
    out.push(`整卷定位：${rule.message}（规则 ${rule.id}）`);
  }
  return out;
}

export function collectSolutionAnswerConflictIssues(
  questions: SemanticGateQuestion[],
): string[] {
  const cfg = EXAM_SEMANTIC_GATES.solutionAnswerConflict;
  if (!EXAM_SEMANTIC_GATES.enabled || !cfg.enabled) return [];
  const out: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    const solution = solutionTextOf(q);
    const answer = String(q.answer ?? "").trim();
    if (!solution || !answer) return;
    for (const rule of cfg.rules) {
      if (!anyPattern(solution, rule.solutionPatterns)) continue;
      if (!anyPattern(answer, rule.answerConflictPatterns)) continue;
      out.push(`第 ${n} 题：${rule.message}（规则 ${rule.id}）`);
      break;
    }
  });
  return out;
}

function optionNumericValues(opts: unknown): number[] | null {
  if (!Array.isArray(opts) || opts.length === 0) return null;
  const vals: number[] = [];
  for (const raw of opts) {
    const s = String(raw ?? "")
      .replace(/^[A-Ha-h][.、．)）]\s*/u, "")
      .replace(/\$/g, "")
      .trim();
    const m = /^(-?\d+(?:\.\d+)?)/.exec(s);
    if (!m) return null;
    const v = Number.parseFloat(m[1]!);
    if (!Number.isFinite(v)) return null;
    vals.push(v);
  }
  return vals;
}

export function collectCountMcqSuspiciousOptionIssues(
  questions: SemanticGateQuestion[],
): string[] {
  const cfg = EXAM_SEMANTIC_GATES.countMcqSuspiciousOptions;
  if (!EXAM_SEMANTIC_GATES.enabled || !cfg.enabled) return [];
  const out: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    const t = String(q.type ?? "");
    if (!cfg.optionTypes.includes(t)) return;
    const content = String(q.content ?? "");
    if (!anyPattern(content, cfg.stemPatterns)) return;
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length < cfg.minOptionCount) return;
    const nums = optionNumericValues(opts);
    if (cfg.requireAllOptionsNumeric && !nums) return;
    if (!nums) return;
    const maxAbs = Math.max(...nums.map((v) => Math.abs(v)));
    if (maxAbs > cfg.maxOptionAbsValue) return;
    out.push(`第 ${n} 题：${cfg.message}`);
  });
  return out;
}

/** 从 answer 抽出选项字母（A–H） */
export function extractAnswerOptionLetters(answer: string): string[] {
  const found: string[] = [];
  const re = /(?:^|[^A-Za-z])([A-Ha-h])(?=[^A-Za-z]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const L = m[1]!.toUpperCase();
    if (!found.includes(L)) found.push(L);
  }
  return found;
}

export function collectMultiSelectAnswerLetterIssues(
  questions: SemanticGateQuestion[],
): string[] {
  const cfg = EXAM_SEMANTIC_GATES.multiSelectAnswerLetters;
  if (!EXAM_SEMANTIC_GATES.enabled || !cfg.enabled) return [];
  const out: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    const t = String(q.type ?? "");
    if (!cfg.types.includes(t)) return;
    const opts = q.options;
    if (!Array.isArray(opts) || opts.length === 0) return;
    const maxLetter = String.fromCharCode("A".charCodeAt(0) + opts.length - 1);
    const letters = extractAnswerOptionLetters(String(q.answer ?? ""));
    if (letters.length === 0) {
      out.push(`第 ${n} 题：${cfg.messageInvalid}`);
      return;
    }
    for (const L of letters) {
      if (L < "A" || L > maxLetter) {
        out.push(`第 ${n} 题：${cfg.messageInvalid}`);
        return;
      }
    }
    const content = String(q.content ?? "");
    if (
      cfg.requireMultipleLettersWhenPluralStem &&
      anyPattern(content, cfg.pluralStemPatterns) &&
      letters.length < 2
    ) {
      out.push(`第 ${n} 题：${cfg.messagePluralIncomplete}`);
    }
  });
  return out;
}

export function collectPhysicsWeightAsMassTrapIssues(
  questions: SemanticGateQuestion[],
): string[] {
  const cfg = EXAM_SEMANTIC_GATES.domainPlugins.physicsWeightAsMassTrap;
  if (!EXAM_SEMANTIC_GATES.enabled || !EXAM_SEMANTIC_GATES.domainPlugins.enabled || !cfg.enabled) {
    return [];
  }
  const out: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    const content = String(q.content ?? "");
    if (!anyPattern(content, cfg.stemPatterns)) return;
    const G = firstCapture(content, cfg.weightNewtonPattern);
    const f = firstCapture(content, cfg.frictionNewtonPattern);
    const a = firstCapture(content, cfg.accelPattern);
    if (G === undefined || f === undefined || a === undefined) return;
    const ans = firstCapture(String(q.answer ?? ""), cfg.answerNewtonPattern);
    if (ans === undefined) return;
    const wrong = G * a + f;
    const correct = (G / cfg.gApprox) * a + f;
    const tol = cfg.toleranceAbs;
    const nearWrong = Math.abs(ans - wrong) <= tol;
    const nearCorrect = Math.abs(ans - correct) <= tol;
    if (nearWrong && !nearCorrect) {
      out.push(`第 ${n} 题：${cfg.message}`);
    }
  });
  return out;
}

export function collectMassFractionIssues(questions: SemanticGateQuestion[]): string[] {
  const cfg = EXAM_SEMANTIC_GATES.domainPlugins.solutionMassFraction;
  if (!EXAM_SEMANTIC_GATES.enabled || !EXAM_SEMANTIC_GATES.domainPlugins.enabled || !cfg.enabled) {
    return [];
  }
  const out: string[] = [];
  questions.forEach((q, i) => {
    const n = i + 1;
    const content = String(q.content ?? "");
    if (!anyPattern(content, cfg.stemPatterns)) return;
    const init = firstTwoCaptures(content, cfg.initialMassPercentPattern);
    if (!init) return;
    const [M, wPct] = init;
    const add = firstCapture(content, cfg.addMassPattern) ?? 0;
    const evap = firstCapture(content, cfg.evaporatePattern) ?? 0;
    const solute = (M * wPct) / 100;
    const finalMass = M + add - evap;
    if (!(finalMass > 0)) return;
    const expected = (solute / finalMass) * 100;
    const ans = firstCapture(String(q.answer ?? ""), cfg.answerPercentPattern);
    if (ans === undefined) return;
    if (Math.abs(ans - expected) > cfg.toleranceAbs) {
      out.push(`第 ${n} 题：${cfg.message}`);
    }
  });
  return out;
}

/** 收集全部语义闸门问题（可与结构校验合并） */
export function collectSemanticGateIssues(
  questions: SemanticGateQuestion[],
  ctx?: ExamSemanticValidationContext,
): string[] {
  if (!EXAM_SEMANTIC_GATES.enabled) return [];
  return [
    ...collectAlignmentIssues(ctx, questions),
    ...collectSolutionAnswerConflictIssues(questions),
    ...collectCountMcqSuspiciousOptionIssues(questions),
    ...collectMultiSelectAnswerLetterIssues(questions),
    ...collectPhysicsWeightAsMassTrapIssues(questions),
    ...collectMassFractionIssues(questions),
  ];
}
