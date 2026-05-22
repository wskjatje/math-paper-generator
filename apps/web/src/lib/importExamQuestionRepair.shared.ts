/**
 * 线下 / 文档导入：AI 一次整理多题时常见「answer 空、分步不足」导致整卷 assert 失败。
 * 在入库闸门之前做**最小可入库修补**（不替代人工核对；命题生成路径勿调用）。
 */
import type { SolutionStep } from "@/lib/types";

export type ImportRepairQuestionInput = {
  type: string;
  content: string;
  answer: string;
  options?: string[] | null;
  solution_steps: unknown;
};

const PLACEHOLDER_SINGLE_MCQ = "（导入待定：模型未返回答案，请据原卷补答）";
const PLACEHOLDER_MULTI_MCQ = "（导入待定：多选题请据原卷补全正确项）";

export const IMPORT_ANSWER_PLACEHOLDER_SINGLE = PLACEHOLDER_SINGLE_MCQ;
export const IMPORT_ANSWER_PLACEHOLDER_MULTI = PLACEHOLDER_MULTI_MCQ;
export const IMPORT_ANSWER_PLACEHOLDER_GENERIC = "（导入待定：请补全答案）";

export function isImportPlaceholderAnswer(answer: string): boolean {
  const a = String(answer ?? "").trim();
  return (
    a === PLACEHOLDER_SINGLE_MCQ ||
    a === PLACEHOLDER_MULTI_MCQ ||
    a === IMPORT_ANSWER_PLACEHOLDER_GENERIC ||
    a.startsWith("（导入待定")
  );
}

function joinSolutionStepsForInference(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  const parts: string[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    for (const k of ["description", "reasoning", "formula"] as const) {
      const t = o[k];
      if (typeof t === "string" && t.trim()) parts.push(t);
    }
  }
  return parts.join("\n");
}

function normalizeSolutionStepsArray(raw: unknown): SolutionStep[] {
  if (!Array.isArray(raw)) return [];
  const out: SolutionStep[] = [];
  let i = 0;
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const step = typeof o.step === "number" && Number.isFinite(o.step) ? o.step : i + 1;
    const description = String(o.description ?? "").trim();
    const reasoning = String(o.reasoning ?? "").trim();
    const formula = o.formula != null ? String(o.formula).trim() : "";
    if (!description && !reasoning && !formula) continue;
    const row: SolutionStep = { step, description: description || reasoning || formula };
    if (reasoning && reasoning !== description) row.reasoning = reasoning;
    if (formula) row.formula = formula;
    out.push(row);
    i++;
  }
  return out;
}

/** 仅从解析/推导文本推断单选字母（保守：避免从题干 OCR 噪声里误抽）。 */
export function inferSingleMcqLetterFromAnalysisText(blob: string): string | null {
  const t = blob.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const seq = [
    /(?:故选|因此选|所以选|应选|答案|正确选项)\s*[：:为]?\s*([ABCD])\b/i,
    /(?:选|填)\s*[（(]?\s*([ABCD])\s*[）)]?(?:\s|$|[，。；])/i,
    /(?:选项)?\s*([ABCD])\s*(?:为|是)?\s*正确/i,
    /最终\s*(?:答案|结论)\s*[：:]\s*([ABCD])\b/i,
  ];
  for (const re of seq) {
    const m = re.exec(t);
    if (m?.[1]) return m[1]!.toUpperCase();
  }
  const hits = [...t.matchAll(/[（(]\s*([ABCD])\s*[）)]/gi)];
  if (hits.length) return hits[hits.length - 1]![1]!.toUpperCase() ?? null;
  return null;
}

function placeholderSolutionSteps(stemPreview: string): SolutionStep[] {
  const hint = stemPreview.replace(/\s+/g, " ").trim().slice(0, 120);
  return [
    {
      step: 1,
      description: "【导入占位】模型未返回完整分步推导。",
      reasoning: hint
        ? `题干摘要：${hint}${stemPreview.length > 120 ? "…" : ""}。请在确认入库前补全解析或重新整理本题。`
        : "请在确认入库前补全解析或重新整理本题。",
    },
    {
      step: 2,
      description: "请核对选项与答案字段。",
      reasoning: "若原卷为图示类选择题，请补充裁图或选项内插图链接后再保存。",
    },
  ];
}

function ensureAtLeastTwoSteps(steps: SolutionStep[], stemPreview: string): SolutionStep[] {
  if (steps.length >= 2) return steps;
  if (steps.length === 1) {
    const s0 = steps[0]!;
    return [
      s0,
      {
        step: (typeof s0.step === "number" ? s0.step : 1) + 1,
        description: "【导入占位】请继续补全后续推理或验算。",
        reasoning: "模型仅返回一步解析时自动补足结构，以免入库失败。",
      },
    ];
  }
  return placeholderSolutionSteps(stemPreview);
}

/**
 * 单题：补 answer、补 solution_steps，满足 collectParsedQuestionsIssues 的最低要求。
 */
export function repairImportQuestionForDbGate<T extends ImportRepairQuestionInput>(q: T): T {
  const type = String(q.type ?? "").trim();
  const content = String(q.content ?? "");
  let answer = String(q.answer ?? "").trim();
  let steps = normalizeSolutionStepsArray(q.solution_steps);

  if (!answer) {
    const blob = joinSolutionStepsForInference(q.solution_steps);
    const letter = inferSingleMcqLetterFromAnalysisText(blob);
    if (letter && (type === "multiple_choice" || type === "multiple_choice_multi")) {
      answer = letter;
    } else if (type === "multiple_choice_multi") {
      answer = PLACEHOLDER_MULTI_MCQ;
    } else if (type === "multiple_choice") {
      answer = PLACEHOLDER_SINGLE_MCQ;
    } else {
      answer = "（导入待定：请补全答案）";
    }
  }

  steps = ensureAtLeastTwoSteps(steps, content);

  return { ...q, answer, solution_steps: steps };
}

export function applyImportExamQuestionMinimalRepair<T extends ImportRepairQuestionInput>(
  questions: T[],
): T[] {
  return questions.map((q) => repairImportQuestionForDbGate(q));
}
