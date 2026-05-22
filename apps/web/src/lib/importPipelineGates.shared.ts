/**
 * 线下导入「双轨 + 闸门」：轨 A 为现有 OCR 全文 → LLM submit_exam（默认唯一）。
 * 轨 B 与副产物（layout AST 占位）仅在环境变量 + 用户显式勾选时启用，默认不改变任何行为。
 */

/** 与 importFigureReconcile 一致：仅统计已持久化过的附图 URL 出现次数 */
export function countPersistedImportFigureUrlsInText(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n");
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const u = m[1]?.trim() ?? "";
    if (u.includes("/import-figures/") || u.includes("/offline-import/")) n++;
  }
  return n;
}

function envFlagTrue(name: string): boolean {
  try {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  } catch {
    return false;
  }
}

/** 服务端闸门：开启后，导入页才可勾选「双轨诊断」；未设或非 1/true 则与旧行为完全一致 */
export function isImportDualTrackGateEnabledFromEnv(): boolean {
  return envFlagTrue("MPG_IMPORT_DUAL_TRACK_GATE");
}

/**
 * 子闸门：在已通过双轨诊断流程时，将轨 B 占位 AST 写入 `data/import-layout-stubs/<examId>.json`。
 * 未开启则不写盘（试卷 JSON 不变）。
 */
export function isImportLayoutAstPersistEnabledFromEnv(): boolean {
  return envFlagTrue("MPG_IMPORT_LAYOUT_AST_PERSIST");
}

export type ImportLayoutAstStubV1 = {
  version: 1;
  track: "B_stub";
  exam_id: string;
  generated_at: string;
  source_char_len: number;
  import_figure_url_count: number;
  question_count: number;
  blocks: unknown[];
  note: string;
};

export function buildImportLayoutAstStubV1(input: {
  examId: string;
  sourceCharLen: number;
  importFigureUrlCount: number;
  questionCount: number;
}): ImportLayoutAstStubV1 {
  return {
    version: 1,
    track: "B_stub",
    exam_id: input.examId,
    generated_at: new Date().toISOString(),
    source_char_len: input.sourceCharLen,
    import_figure_url_count: input.importFigureUrlCount,
    question_count: input.questionCount,
    blocks: [],
    note: "Layout AST 占位：blocks 待接入版面检测（DocLayout-YOLO / PP-Structure 等）。轨 A 试卷数据未由此文件替代。",
  };
}
