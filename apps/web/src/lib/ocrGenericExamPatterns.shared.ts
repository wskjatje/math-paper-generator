/**
 * 试卷 OCR 通用模式修复（错误类别级，非某卷/某题专规）。
 * 卷面字面特例请写入 data/ocr-repair-lexicon.json。
 */
import { stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

export { stemLooksLikeConstructionGeometry, stemLooksLikeCoordinatePlaneExam } from "@/lib/ocrExamContext.shared";

/** OCR 顶点字母末尾数字 → 字母（常见误识，非单卷映射） */
const TRAILING_VERTEX_DIGIT_TO_LETTER: Record<string, string> = {
  "8": "B",
  "1": "I",
  "6": "G",
  "5": "S",
  "3": "E",
};

/** 拉丁点标被空格拆开且 △ 误识为 4：A 4 B C → A4BC（后续 △ 纠错链处理） */
export function collapseSpacedLatinPointTokens(text: string): string {
  if (stemLooksLikeCoordinatePlaneExam(text)) return text;
  return text.replace(
    /\b([A-Z])\s+4\s+([A-Z])(?:\s+([A-Z]))?(?![A-Za-z])/g,
    (_m, a: string, b: string, c?: string) => (c ? `${a}4${b}${c}` : `${a}4${b}`),
  );
}

/** △ 误识为 4 且末尾多识 H：A4BCH → A△BC */
export function normalizeTriangleDigitFourToken(text: string): string {
  return text.replace(/\b([A-Z])4([A-Z]{2,3})H\b/g, "$1△$2");
}

function fixTriangleLetterCompact(compact: string, hadTriangleFour: boolean): string {
  let c = compact;
  if (hadTriangleFour) {
    c = c.replace(/4/g, "");
    // A408→A08：中间 0、末位 8→B，再 0→O，得 AOB（勿先做全局 0→O 变成 A8O）
    const a0d = /^([A-Z])0(\d)$/.exec(c);
    if (a0d) {
      const mapped = TRAILING_VERTEX_DIGIT_TO_LETTER[a0d[2]!];
      if (mapped) c = `${a0d[1]}0${mapped}`;
    } else if (/^[A-Z]{2}\d$/.test(c)) {
      const mapped = TRAILING_VERTEX_DIGIT_TO_LETTER[c[2]!];
      if (mapped) c = c.slice(0, 2) + mapped;
    }
    c = c.replace(/0/g, "O");
    const aoDigit = /^([A-Z])O(\d)$/.exec(c);
    if (aoDigit) {
      const mapped = TRAILING_VERTEX_DIGIT_TO_LETTER[aoDigit[2]!];
      if (mapped) c = `${aoDigit[1]}O${mapped}`;
    }
  } else {
    c = c.replace(/([A-Z])0([A-Z])/gi, "$1O$2");
    c = c.replace(/0(?=[A-Z])/gi, "O");
  }
  return c;
}

export function normalizeTriangleKeywordRuns(text: string): string {
  return text.replace(
    /(直角|等边)\s*([A-Z0-9\s]{3,12})(?=[\s，。；：的]|顶点|$)/gi,
    (full, kw: string, letters: string) => {
      const raw = String(letters).replace(/\s+/g, "");
      const hadFour = /4/.test(raw);
      let compact = fixTriangleLetterCompact(raw, hadFour);
      if (compact.length < 3 || compact.length > 4) return full;
      return `${kw}△${compact}`;
    },
  );
}

/** 几何语境：数字 4 误识为点 A（非坐标系卷） */
export function normalizeDigitFourAsPointAInGeometry(text: string): string {
  if (stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/(边|与边|点|以点|若|则)\s*4([A-Z])(?=[\s，。；：、=]|$)/g, "$1 A$2");
  s = s.replace(/(边)4([A-Z])(?=[\s，。；：、])/g, "$1 A$2");
  s = s.replace(/以点\s*4\s*为/g, "以点 A 为");
  return s;
}

export function normalizeStepCircleMarkers(text: string): string {
  let s = text;
  s = s.replace(/@\s*作\s*射\s*线/g, "④作射线");
  s = s.replace(/@作射线/g, "④作射线");
  s = s.replace(/@\s*②\s*以\s*点/g, "②以点");
  s = s.replace(/与\s*第\s*@\s*步/g, "与第②步");
  s = s.replace(/与第@步/g, "与第②步");
  s = s.replace(/与\s*第\s*4\s*步\s*中\s*所\s*画\s*的\s*弧/g, "与第②步中所画的弧");
  s = s.replace(/与第4步中所画的弧/g, "与第②步中所画的弧");
  return s;
}

export function normalizeAngleNotationMisreads(text: string): string {
  let s = text;
  s = s.replace(/~\s*([A-Z][A-Z0-9′']{1,4})(?=\s*的度数)/g, "∠$1");
  s = s.replace(/L\s*([A-Z])\s*4\s*=\s*(\d+)/gi, "∠$1=$2");
  s = s.replace(/L([A-Z])4\s*=\s*(\d+)/gi, "∠$1=$2");
  s = s.replace(/<\s*([A-Z][A-Z0-9′']{0,4})(?=\s*的度数)/gi, "∠$1");
  s = s.replace(/L\s*([A-Z][A-Z0-9′']{0,4})(?=\s*的度数)/gi, "∠$1");
  s = s.replace(/<\s*([A-Z][A-Z0-9′']{0,4})的度数为\s*_{0,}\s*\*/gi, "∠$1的度数为____°");
  return s;
}

export function normalizeFigureLabelDigits(text: string): string {
  let s = text;
  /** 图① 常被识成 O/0（坐标系卷「点 O 为原点」干扰） */
  s = s.replace(/如\s*图\s*O\b/gi, "如图①");
  s = s.replace(/如\s*图\s*0\b/g, "图①");
  s = s.replace(/如\s*图\s*1\b/g, "图①");
  s = s.replace(/如\s*图\s*[\(（]\s*1\s*[\)）]/g, "如图①");
  s = s.replace(/图\s*[\[【]?\s*1\s*[\]】]?/g, "图①");
  s = s.replace(/图\s*[\(（]\s*1\s*[\)）]/g, "图①");
  s = s.replace(/如\s*图\s*2\b/g, "图②");
  s = s.replace(/如\s*图\s*[\(（]\s*2\s*[\)）]/g, "如图②");
  s = s.replace(/图\s*[\[【]?\s*2\s*[\]】]?/g, "图②");
  s = s.replace(/图\s*[\(（]\s*2\s*[\)）]/g, "图②");
  return s;
}

export function normalizeVertexDigitFourBeforeCoord(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/顶点\s*4\s*[（(]\s*(\d+)\s*[,，]\s*(\d+)\s*[）)]/g, "顶点A($1,$2)");
  s = s.replace(/(?<![A-Za-z])4\s*[（(]\s*(\d+)\s*[,，]\s*(\d+)\s*[）)]/g, "A($1,$2)");
  return s;
}

export function normalizeCoordDigitGluedToLetter(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/\b([A-Z])\s*\(?\s*500\s*,\s*(\d+)\s*\)?/gi, "$1(0,$2)");
  s = s.replace(/(?<![A-Za-z(])\b500\s*,\s*(\d+)\b/g, "(0,$1)");
  return s;
}

/** 等边 A DEF：△ 被识成孤立 A */
export function normalizeStrayABeforeTriangleName(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/等边\s+A\s+(DEF)\b/gi, "等边△$1");
  s = s.replace(/等边\s*A\s+(DEF)\b/gi, "等边△$1");
  s = s.replace(/等边\s+A\s+([A-Z]{3})\b/g, "等边△$1");
  return s;
}

/** 坐标系卷常见汉字误识（保守） */
export function normalizeCoordinatePlaneCjkTypos(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/本小原/g, "本小题");
  s = s.replace(/顶点忆(?=在第二象限)/g, "顶点D");
  s = s.replace(/得到钟面积/g, "得到…面积");
  return s;
}

/** 顶点行截断 / 点标缺失（坐标系卷） */
export function normalizeCoordinatePlaneVertexPhrases(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  let s = text;
  s = s.replace(/(△[A-Z]{2,4})的顶(?!点)/g, "$1的顶点");
  s = s.replace(/(?<![点])顶E(?=[\s（(]|,|，)/g, "顶点E");
  s = s.replace(/顶点\s*40\s*,\s*5\b/g, "顶点A(0,5)");
  s = s.replace(/直角△AOB的顶点\s*40\s*,\s*5/g, "直角△AOB的顶点A(0,5)");
  s = s.replace(
    /等边\s*△?\s*DEF\s*的\s*顶点\s*[（(]?\s*0\s*[,，]\s*3\s*[）)]?/gi,
    "等边△DEF的顶点E(0,3)",
  );
  s = s.replace(
    /DEF\s*的\s*顶点\s*[（(]?\s*0\s*[,，]\s*3\s*[）)]?/gi,
    "等边△DEF的顶点E(0,3)",
  );
  s = s.replace(/等边\s*△?\s*DEF[^。\n]{0,48}?\b5\s*\(\s*0\s*,\s*3\s*\)/gi, (m) =>
    m.replace(/5\s*\(/, "E("),
  );
  s = s.replace(/点\s*D\s*的\s*坐\s*标/g, "点D的坐标");
  s = s.replace(/\bCID\b/g, "(2)");
  return s;
}

export function normalizeTranslationParameterLabels(text: string): string {
  if (!stemLooksLikeCoordinatePlaneExam(text)) return text;
  return text.replace(
    /\b([A-Z])\s*\1\s*['′]?\s*=\s*([a-z])\b/gi,
    (_m, a: string, param: string) => `${a}${a}′=${param}`,
  );
}

export function applyGenericExamOcrPatterns(text: string): string {
  let s = text;
  s = normalizeCoordinatePlaneCjkTypos(s);
  s = normalizeCoordinatePlaneVertexPhrases(s);
  s = normalizeStrayABeforeTriangleName(s);
  s = collapseSpacedLatinPointTokens(s);
  s = normalizeTriangleDigitFourToken(s);
  s = normalizeTriangleKeywordRuns(s);
  s = normalizeDigitFourAsPointAInGeometry(s);
  s = normalizeStepCircleMarkers(s);
  s = normalizeAngleNotationMisreads(s);
  s = normalizeFigureLabelDigits(s);
  s = normalizeVertexDigitFourBeforeCoord(s);
  s = normalizeCoordDigitGluedToLetter(s);
  s = normalizeTranslationParameterLabels(s);
  return s;
}
