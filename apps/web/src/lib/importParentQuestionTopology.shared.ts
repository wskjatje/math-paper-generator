/**
 * 大题 + 小问 + 共图：导入时保留 constitutional root，避免 per-question AI flatten。
 */

export const TOPOLOGY_RUNTIME_VERSION = "v1" as const;

export type ImportParentQuestionSubpartDetectionV1 = "numeric" | "roman" | "circled";

export type ImportParentQuestionTopologyDecisionTraceV1 = {
  version: 1;
  topology_runtime: typeof TOPOLOGY_RUNTIME_VERSION;
  matched_geometry_big_question: boolean;
  matched_figure_cue: boolean;
  /** 命中共图拓扑时导入主链禁用逐题 AI flatten */
  disabled_per_question_ai: boolean;
  per_question_ai_effective?: boolean;
  subpart_detection: ImportParentQuestionSubpartDetectionV1;
  /** 入库后回填：是否已展开为多题 */
  expanded_to_multi_question?: boolean;
  question_count_after_persist?: number;
};

export type ImportParentQuestionTopologyV1 = {
  version: 1;
  /** 大题题号，如 "22" */
  question_root: string;
  /** 检测到的小问锚点，如 ["(1)", "(2)"] */
  subparts: string[];
  shared_figure_scope: true;
  /**
   * 导入时截存的正文（用于已入库卷展开小问；上限约 16k，非某卷硬编码）。
   */
  source_plain_text?: string;
  topology_runtime?: typeof TOPOLOGY_RUNTIME_VERSION;
  decision_trace?: ImportParentQuestionTopologyDecisionTraceV1;
};

const CIRCLED_TO_ARABIC: Record<string, string> = {
  "①": "1",
  "②": "2",
  "③": "3",
  "④": "4",
  "⑤": "5",
  "⑥": "6",
  "⑦": "7",
  "⑧": "8",
  "⑨": "9",
  "⑩": "10",
};

/** 行首括号题号 (1)…(19)，排除大题根题号；勿把「如图(1)」内括号当小问。 */
function readNumericSubpartLabels(text: string, parentRoot: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*[（(]\s*(\d{1,2})\s*[）)]/gm;
  for (const m of text.matchAll(re)) {
    const num = m[1]!;
    if (num === parentRoot) continue;
    const n = Number(num);
    if (!Number.isFinite(n) || n < 1 || n > 19) continue;
    const label = `(${num})`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/** 行首罗马小问 (I)(II)…（中考大题常见） */
function readRomanSubpartLabels(text: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*[（(]\s*([IVX]{1,4})\s*[）)]/gim;
  for (const m of text.matchAll(re)) {
    const label = `(${m[1]!.toUpperCase()})`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/** 行首圈号小问 （①）→ 统一为 (1) 便于切段 */
function readCircledParenSubpartLabels(text: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*[（(]\s*([①②③④⑤⑥⑦⑧⑨⑩])\s*[）)]/gm;
  for (const m of text.matchAll(re)) {
    const ar = CIRCLED_TO_ARABIC[m[1]!];
    if (!ar) continue;
    const label = `(${ar})`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export type SubpartLabelDetectResult = {
  labels: string[];
  detection: ImportParentQuestionSubpartDetectionV1;
};

function readSubpartLabelsWithDetection(
  text: string,
  parentRoot: string,
): SubpartLabelDetectResult {
  const numeric = readNumericSubpartLabels(text, parentRoot);
  if (numeric.length >= 2) return { labels: numeric, detection: "numeric" };
  const roman = readRomanSubpartLabels(text);
  if (roman.length >= 2) return { labels: roman, detection: "roman" };
  const circled = readCircledParenSubpartLabels(text);
  if (circled.length >= 2) return { labels: circled, detection: "circled" };
  return { labels: numeric, detection: "numeric" };
}

function readSubpartLabels(text: string, parentRoot: string): string[] {
  return readSubpartLabelsWithDetection(text, parentRoot).labels;
}

/**
 * 检测「两位数大题 + 至少 2 个小问锚点」共图拓扑（如 (22) + (1)(2)，非固定卷 ID）。
 * 命中时导入应退回整卷单次 AI，勿 per-question flatten。
 */
export function detectImportParentQuestionTopology(
  textRaw: string,
): ImportParentQuestionTopologyV1 | null {
  const text = textRaw.replace(/\r\n/g, "\n").trim();
  if (text.length < 40) return null;

  const head = text.slice(0, 1200);
  const parentRe = /[（(]\s*(\d{2,})\s*[）)]/;
  const pm = parentRe.exec(head);
  if (!pm?.[1]) return null;

  const rootNum = Number(pm[1]);
  if (!Number.isFinite(rootNum) || rootNum < 10) return null;

  const { labels: subparts, detection: subpart_detection } = readSubpartLabelsWithDetection(
    text,
    String(pm[1]),
  );
  if (subparts.length < 2) return null;

  const matched_figure_cue =
    /如图[①②③④⑤⑥⑦⑧⑨0-9O]|图[①②③④⑤⑥⑦⑧⑨]|图\s*[\(（]\s*[0-9]/.test(text);
  const matched_geometry_big_question =
    /直角|等边|坐标|平面直角坐标|三角形|平移|旋转|面积|全等|相似|⊙|尺规/.test(text);
  if (!matched_figure_cue && !matched_geometry_big_question) return null;

  return {
    version: 1,
    question_root: String(pm[1]),
    subparts,
    shared_figure_scope: true,
    topology_runtime: TOPOLOGY_RUNTIME_VERSION,
    decision_trace: {
      version: 1,
      topology_runtime: TOPOLOGY_RUNTIME_VERSION,
      matched_geometry_big_question,
      matched_figure_cue,
      disabled_per_question_ai: true,
      subpart_detection,
    },
  };
}

/** 入库快照：回填展开结果与持久化题数 */
export function enrichImportParentQuestionTopologyAtPersist(
  topology: ImportParentQuestionTopologyV1,
  questions: readonly { content?: string | null }[],
): ImportParentQuestionTopologyV1 {
  let hit = 0;
  for (const sp of topology.subparts) {
    const num = sp.replace(/[()（）]/g, "");
    const re = new RegExp(`[（(]\\s*${num}\\s*[）)]`);
    if (questions.some((q) => re.test(String(q.content ?? "")))) hit += 1;
  }
  const expanded =
    questions.length >= topology.subparts.length + 1 && hit >= topology.subparts.length;
  const trace = topology.decision_trace;
  if (!trace) {
    return {
      ...topology,
      topology_runtime: TOPOLOGY_RUNTIME_VERSION,
    };
  }
  return {
    ...topology,
    topology_runtime: TOPOLOGY_RUNTIME_VERSION,
    decision_trace: {
      ...trace,
      expanded_to_multi_question: expanded,
      question_count_after_persist: questions.length,
    },
  };
}

/** 导入主链：写入 per_question_ai 实际值并截存 transport 快照 */
export function enrichImportParentQuestionTopologyForImport(
  topology: ImportParentQuestionTopologyV1,
  options: {
    sourcePlainText: string;
    perQuestionAiEffective: boolean;
  },
): ImportParentQuestionTopologyV1 {
  const trace = topology.decision_trace;
  return {
    ...topology,
    source_plain_text: options.sourcePlainText.slice(0, 16_000),
    topology_runtime: TOPOLOGY_RUNTIME_VERSION,
    decision_trace: trace
      ? {
          ...trace,
          per_question_ai_effective: options.perQuestionAiEffective,
          disabled_per_question_ai: !options.perQuestionAiEffective,
        }
      : undefined,
  };
}
