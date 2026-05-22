/**
 * 线下导入：从 OCR 全文中抽取「大题」语境（如 一、选择题…每小题 3 分），
 * 供逐题 AI 提示注入与合并后的确定性题型/分值纠正（P0）。
 */

export type ImportSectionDefaultType =
  | "multiple_choice"
  | "multiple_choice_multi"
  | "fill_blank"
  | "short_answer"
  | "calculation";

export type ImportSectionV1 = {
  /** 大题标题行在全文中的起始字符下标（\\n 归一后） */
  startCharIndex: number;
  /** 原始标题行文本（截断展示） */
  headline: string;
  defaultType: ImportSectionDefaultType;
  /** 本大题小题数；未识别到则为 null（不参与题号区间推断） */
  questionCount: number | null;
  /** 每小题分值；未识别到则为 null */
  pointsEach: number | null;
};

const JOINED = (raw: string) => raw.replace(/\r\n/g, "\n");

/**
 * 扫描全文，识别常见「一、选择题（本大题共 n 小题，每小题 m 分…）」行。
 * 支持大题括号段跨行（OCR 常在「共 10」与「分）」处断行），最多合并连续 8 行。
 */
export function parseImportDocumentSections(raw: string): ImportSectionV1[] {
  const text = JOINED(raw);
  if (text.length < 8) return [];

  const lines = text.split("\n");
  const out: ImportSectionV1[] = [];
  let offset = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    let consumedEnd = i;
    let m = t.match(
      /^([一二三四五六七八九十百零]+)\s*[、.．]\s*(.+?)\s*[（(]\s*([^)）]{0,220}?)\s*[)）]/,
    );

    if (!m) {
      const looksOpen =
        /^([一二三四五六七八九十百零]+)\s*[、.．]\s*.+/.test(t) &&
        /(选择题|填空题|解答题|计算题)/.test(t) &&
        /[（(]/.test(t) &&
        !/[)）]/.test(t);
      if (looksOpen) {
        let merged = line;
        let j = i;
        while (!/[)）]/.test(merged) && j + 1 < lines.length && j - i < 8) {
          j++;
          merged += "\n" + lines[j]!;
        }
        const syn = merged.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        m = syn.match(
          /^([一二三四五六七八九十百零]+)\s*[、.．]\s*(.+?)\s*[（(]\s*([^)）]{0,400}?)\s*[)）]/,
        );
        if (m) consumedEnd = j;
      }
    }

    if (!m) {
      offset += line.length + 1;
      i += 1;
      continue;
    }
    const restAfterDot = m[2]!.trim();
    if (!/(选择题|填空题|解答题|计算题)/.test(restAfterDot)) {
      offset += line.length + 1;
      i += 1;
      continue;
    }

    const inner = m[3]!.trim();
    const countM =
      inner.match(/本大题共\s*(\d+)\s*小题/) ??
      inner.match(/本大题共\s*(\d+)\s*题/) ??
      inner.match(/共\s*(\d+)\s*小题/) ??
      inner.match(/共\s*(\d+)\s*题/);
    const totalM = inner.match(/共\s*(\d+)\s*分/);
    const pointsM = inner.match(/每小题\s*(\d+)\s*分/);

    let questionCount: number | null = null;
    if (countM) {
      const v = Number(countM[1]);
      questionCount = Number.isFinite(v) && v > 0 ? v : null;
    }
    if (questionCount == null && totalM && pointsM) {
      const tot = Number(totalM[1]);
      const pe = Number(pointsM[1]);
      if (Number.isFinite(tot) && Number.isFinite(pe) && pe > 0 && tot > 0 && tot % pe === 0) {
        questionCount = Math.round(tot / pe);
      }
    }

    let defaultType: ImportSectionDefaultType = "short_answer";
    if (/多项|不定项/.test(restAfterDot + inner)) {
      defaultType = "multiple_choice_multi";
    } else if (restAfterDot.includes("选择") || restAfterDot.includes("选择题")) {
      defaultType = "multiple_choice";
    } else if (restAfterDot.includes("填空")) {
      defaultType = "fill_blank";
    } else if (restAfterDot.includes("计算")) {
      defaultType = "calculation";
    } else if (restAfterDot.includes("解答")) {
      defaultType = "short_answer";
    }

    const headlineSrc =
      consumedEnd > i
        ? lines
            .slice(i, consumedEnd + 1)
            .join("\n")
            .trim()
        : t;
    const headline = headlineSrc.length > 200 ? `${headlineSrc.slice(0, 200)}…` : headlineSrc;

    out.push({
      startCharIndex: offset,
      headline,
      defaultType,
      questionCount,
      pointsEach: pointsM ? Number(pointsM[1]) || null : null,
    });

    for (let k = i; k <= consumedEnd; k++) {
      offset += lines[k]!.length + 1;
    }
    i = consumedEnd + 1;
  }

  return out;
}

/** 字符位置落在哪个大题标题之后（取最后一个 start ≤ offset） */
export function findImportSectionForCharOffset(
  sections: ImportSectionV1[],
  offset: number,
): ImportSectionV1 | null {
  if (!sections.length) return null;
  const ordered = [...sections].sort((a, b) => a.startCharIndex - b.startCharIndex);
  let best: ImportSectionV1 | null = null;
  for (const s of ordered) {
    if (s.startCharIndex <= offset) best = s;
    else break;
  }
  return best;
}

/**
 * 在全文中定位小题题干锚点「(n)」/「（n）」/「第 n 题」的字符下标，供大题无「本大题共 k 小题」时按版面位置回退绑定大题语境。
 */
export function findCharOffsetOfQuestionStemAnchor(
  fullText: string,
  questionNum: number,
): number | null {
  const join = fullText.replace(/\r\n/g, "\n");
  const n = questionNum;
  if (n < 1 || n > 99) return null;
  const reParen = new RegExp(`(?:^|\\n)\\s*[（(]\\s*${n}\\s*[）)]`);
  const m1 = reParen.exec(join);
  if (m1) return m1.index;
  const reDi = new RegExp(`(?:^|\\n)\\s*第\\s*${n}\\s*题`);
  const m2 = reDi.exec(join);
  if (m2) return m2.index;

  const reScan = new RegExp(`[（(]\\s*${n}\\s*[）)]`, "g");
  let m3: RegExpExecArray | null;
  while ((m3 = reScan.exec(join)) !== null) {
    const before = join.slice(Math.max(0, m3.index - 2), m3.index);
    if (/第$/.test(before)) continue;
    const afterClose = join[m3.index + m3[0].length] ?? "";
    if (afterClose === "题") continue;
    return m3.index;
  }
  return null;
}

/**
 * 按大题声明的小题数累加，将全局题号 n 映射到所属大题。
 * 小题数可来自「本大题共 k 小题」或「共 M 分 ÷ 每小题 P 分」推断；仍无时见 {@link findCharOffsetOfQuestionStemAnchor} 回退。
 */
export function findImportSectionForQuestionNumber(
  sections: ImportSectionV1[],
  questionNum: number,
): ImportSectionV1 | null {
  if (questionNum < 1 || !sections.length) return null;
  const ordered = [...sections].sort((a, b) => a.startCharIndex - b.startCharIndex);
  let startNum = 1;
  for (const sec of ordered) {
    const cnt = sec.questionCount;
    if (cnt == null || cnt <= 0) continue;
    const endNum = startNum + cnt - 1;
    if (questionNum >= startNum && questionNum <= endNum) return sec;
    startNum += cnt;
  }
  return null;
}

/** 供 AI 用户消息前缀：约束 type / points，减少「选择题变解答题」 */
export function formatImportSectionPromptHint(section: ImportSectionV1 | null): string {
  if (!section) return "";
  const parts: string[] = [];
  parts.push(`【大题语境】本段属于：${section.headline}`);
  parts.push(`须使用题型 type="${section.defaultType}"（与卷面大题一致）。`);
  if (section.pointsEach != null && section.pointsEach > 0) {
    parts.push(
      `若本题为该大题内小题，points 必须为 ${section.pointsEach}（与「每小题 ${section.pointsEach} 分」一致）。`,
    );
  }
  parts.push("禁止在卷面已标明为选择题的大题下，将本题标为 short_answer 或随意写成 1 分。");
  return `${parts.join("")}\n\n`;
}

/** 从切段文本或题干开头解析题号（用于大题区间映射） */
export function extractFirstQuestionNumberFromImportChunk(chunk: string): number | null {
  const s = chunk.trim();
  const m1 = s.match(/(?:^|\n)\s*(?:\(|（)\s*(\d{1,2})\s*(?:\)|）)/);
  if (m1) {
    const n = Number.parseInt(m1[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m2 = s.match(/(?:^|\n)\s*第\s*(?:\(|（)?\s*(\d{1,2})\s*(?:\)|）)?\s*题/);
  if (m2) {
    const n = Number.parseInt(m2[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

const LEAD_PAREN_QNUM_RE = /^(?:\(|（)\s*\d{1,2}\s*(?:\)|）)\s*[.、:：]?\s*/;

/**
 * P0：逐题导入合并前，将模型返回的题干首题号与切段期望题号对齐。
 * 期望题号来自 {@link extractFirstQuestionNumberFromImportChunk}(chunkText)；
 * 若模型漏写首题号、或行首为错误题号，则去掉错误行首题号并必要时补上 `(n) `。
 */
export function alignImportAiQuestionContentToChunk(
  chunkText: string,
  content: string,
): { content: string; repaired: boolean; expected: number | null; previousLead: number | null } {
  const raw = String(content ?? "");
  const expected = extractFirstQuestionNumberFromImportChunk(chunkText);
  const previousLead = extractFirstQuestionNumberFromImportChunk(raw.trim());

  if (expected == null) {
    return { content: raw, repaired: false, expected: null, previousLead };
  }

  let working = raw.trim();
  let lead = extractFirstQuestionNumberFromImportChunk(working);
  let repaired = false;

  if (lead === expected) {
    const out = raw.trim() === raw ? raw : working;
    return {
      content: out,
      repaired: raw.trim() !== raw,
      expected,
      previousLead,
    };
  }

  if (lead != null && lead !== expected) {
    const stripped = working.replace(LEAD_PAREN_QNUM_RE, "").trim();
    if (stripped !== working) {
      working = stripped;
      repaired = true;
      lead = extractFirstQuestionNumberFromImportChunk(working);
    }
  }

  if (lead === expected) {
    return { content: working, repaired, expected, previousLead };
  }

  const hasExpectedOpen = new RegExp(`^(?:\\(|（)\\s*${expected}\\s*(?:\\)|）)`).test(working);
  if (!hasExpectedOpen) {
    working = `(${expected}) ${working}`.trim();
    repaired = true;
  }

  return { content: working, repaired, expected, previousLead };
}

/** 与 submit_exam 解析后的题目对象兼容的最小形状 */
export type ImportSectionQuestionLike = {
  type?: string;
  /** 与卷面大题冲突时由确定性纠正清空 */
  type_label?: string | null;
  points?: number;
  content?: string;
  options?: string[] | null;
  answer?: string;
  solution_steps?: unknown;
  knowledge_tags?: unknown;
  subject?: string;
  diagram_schema?: unknown;
  diagramSchema?: unknown;
};

function patchQuestionWithSection<T extends ImportSectionQuestionLike>(
  q: T,
  sec: ImportSectionV1,
): T {
  const next = { ...q };
  const prevType = String(next.type ?? "").trim();
  const curType = prevType;
  const dt = sec.defaultType;

  /**
   * 大题为选择题时：区间内小题**强制**继承题型（继承锁），避免 LLM 将 (2) 标成解答题/作文等。
   */
  if (dt === "multiple_choice" || dt === "multiple_choice_multi") {
    next.type = dt;
  } else if (dt === "fill_blank") {
    if (
      curType === "short_answer" ||
      curType === "multiple_choice" ||
      curType === "multiple_choice_multi"
    ) {
      next.type = "fill_blank";
    }
    if (curType === "multiple_choice" || curType === "multiple_choice_multi") {
      next.options = null;
    }
  } else if (dt === "calculation") {
    if (
      curType === "short_answer" ||
      curType === "fill_blank" ||
      curType === "multiple_choice" ||
      curType === "multiple_choice_multi"
    ) {
      next.type = "calculation";
    }
    if (curType === "multiple_choice" || curType === "multiple_choice_multi") {
      next.options = null;
    }
  } else if (dt === "short_answer") {
    if (curType === "multiple_choice" || curType === "multiple_choice_multi") {
      next.type = "short_answer";
      next.options = null;
    }
  }

  if (sec.pointsEach != null && sec.pointsEach > 0) {
    const cur = Number(next.points ?? 0);
    if (!Number.isFinite(cur) || cur <= 0 || cur === 1 || cur !== sec.pointsEach) {
      next.points = sec.pointsEach;
    }
  }

  const newType = String(next.type ?? "").trim();
  if (newType !== prevType) {
    next.type_label = null;
  }

  return next;
}

/**
 * 按大题声明对 AI 结果做确定性纠正（逐题导入传 chunkTexts；整卷导入传 null 则从 content 猜题号）。
 */
export function applyImportSectionContextToParsedQuestions<T extends ImportSectionQuestionLike>(
  questions: T[],
  fullSourceText: string,
  chunkTexts: string[] | null,
): T[] {
  const sections = parseImportDocumentSections(fullSourceText);
  if (sections.length === 0) return questions;

  return questions.map((q, i) => {
    let num =
      chunkTexts?.[i] != null ? extractFirstQuestionNumberFromImportChunk(chunkTexts[i]!) : null;
    if (num == null) num = extractFirstQuestionNumberFromImportChunk(String(q.content ?? ""));
    if (num == null) num = i + 1;

    let sec = findImportSectionForQuestionNumber(sections, num);
    if (!sec && fullSourceText.trim().length > 0) {
      const off = findCharOffsetOfQuestionStemAnchor(fullSourceText, num);
      if (off != null) sec = findImportSectionForCharOffset(sections, off);
    }
    if (!sec) return q;
    return patchQuestionWithSection(q, sec);
  });
}
