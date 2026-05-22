/**
 * 线下试卷图片 OCR（Tesseract）常见误读的后处理：几何符号、拉丁字母与数字混淆、图中噪声行等。
 * 规则保守；严重乱码仍依赖图像质量或下游 AI（见 runImportDocumentAiGeneration 提示）。
 */
import {
  normalizeCoordinatePlaneOcrText,
  normalizeOcrFillBlankMarkers,
  stripGotOcrPageHallucinations,
} from "@/lib/offlineExamCoordinateOcrNormalize.shared";
import { applyGenericExamOcrPatterns } from "@/lib/ocrGenericExamPatterns.shared";
import { applyEducationSymbolLexicon } from "@/lib/ocr/educationSymbolLexicon";

/** 图中「第(10)题」附近易被误读成的孤立噪声行 */
function dropDiagramNoiseLines(s: string): string {
  return s
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^(及\s*AN|及AN|机)\s*$/.test(t)) return false;
      // 纯英文噪声行（多为右侧图区竖排误扫）
      if (/^(WHETHER|WB,)\s*$/i.test(t)) return false;
      if (/^\$?A\s*ABC\s*HX\s*KB\s*$/i.test(t)) return false;
      return true;
    })
    .join("\n");
}

/** 关闭「逐字空格合并」时设置 `MPG_OCR_COLLAPSE_CJK_SPACE=0`（服务端 / .env） */
function isOcrCjkSpaceCollapseEnabled(): boolean {
  try {
    if (typeof process !== "undefined" && process.env?.MPG_OCR_COLLAPSE_CJK_SPACE === "0") {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * 合并 OCR 在相邻汉字、标点之间插入的多余空格（默认开启）。
 *  latin 与数字之间的空格保留，后续规则仍会处理 `A 4 B C` 等。
 */
export function collapseOcrCjkInterstitialSpaces(input: string): string {
  let s = input.replace(/\u3000/g, " ");
  for (let i = 0; i < 24; i++) {
    const next = s.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/([\u4e00-\u9fff])\s+([，。；：、])/g, "$1$2");
  s = s.replace(/([，。；：、])\s+([\u4e00-\u9fff])/g, "$1$2");
  s = s.replace(/([\u4e00-\u9fff])\s+([（《「『])/g, "$1$2");
  s = s.replace(/([》」』）])\s+([\u4e00-\u9fff])/g, "$1$2");
  s = s.replace(/\(\s+(\d+)/g, "($1");
  return s;
}

export type NormalizeMathExamOcrTextOptions = {
  /** 已由 canonicalization `geometry_notation_normalize` 执行时置 true */
  skipCoordinatePlane?: boolean;
  skipFillBlank?: boolean;
  skipDiagramStrip?: boolean;
};

/** Tesseract/通用 OCR 常插入「字间空格」，关键短语用 \s* 放宽匹配 */
export function normalizeMathExamOcrText(
  raw: string,
  opts?: NormalizeMathExamOcrTextOptions,
): string {
  let working = opts?.skipFillBlank ? raw : normalizeOcrFillBlankMarkers(raw);
  if (isOcrCjkSpaceCollapseEnabled()) {
    working = collapseOcrCjkInterstitialSpaces(working);
  }

  const circled = ["①", "②", "③", "④"];
  const parts = working.split(/\r?\n(?=\(\d+\))/);
  let s = parts
    .map((part) => {
      let i = 0;
      return part.replace(/@\s*以点/g, () => `${circled[Math.min(i++, 3)]!}以点`);
    })
    .join("\n");

  s = applyGenericExamOcrPatterns(s);
  s = applyEducationSymbolLexicon(s);

  // 拉丁字母后多余 @（如 N@）
  s = s.replace(/([A-Z])@/g, "$1");

  // 题号/选项版式噪声
  s = s.replace(/\(Cc\)/gi, "(C)");
  s = s.replace(/（Cc）/gi, "（C）");
  s = s.replace(/\(12[》」]/g, "(12)");

  // 科学记数法：上标 3/4/5/6 常被识成 °、*，或 (C) 被识成 ©
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×xX]\s*10\s*°\s*([0-9])/g, "$1×10^$2");
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×xX]\s*10\s*\*\s*([0-9])/g, "$1×10^$2");
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×xX]\s*10(\d)(?!\d)/g, "$1×10^$2");
  // 指数位被吃掉时：0.05×10°、(BY 0.5×10*（仍限在 ×10 邻域，减少误伤「45°」类角度）
  s = s.replace(/([×xX])\s*10\s*[°*'"`´]/gi, "$110^");
  s = s.replace(/\(BY(?=\s)/gi, "(B) ");
  // 上标整块缺失时常见「□」占位；保留为 10^n 以免与度数符号混淆
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×xX]\s*10\s*□/g, "$1×10^n");
  s = s.replace(/\(\s*BY\s*\)/gi, "(B)");
  s = s.replace(/（\s*BY\s*）/gi, "（B）");
  s = s.replace(/\(©\)/g, "(C)");
  s = s.replace(/（©）/g, "（C）");
  // (C) 常被识成 © 且夹在 (B) 与 (D) 之间，导致括号链断裂
  s = s.replace(/([（(]B[）)])\s*©\s*([（(]D[）)])/g, "$1(C)$2");
  // 化学式：OCR 常拆成 H 2 O 或 H2O 无下标，用 Unicode 下标便于未进 LaTeX 时仍可读
  s = s.replace(/\bH\s*2\s*O\b/gi, "H₂O");
  s = s.replace(/\bH2O\b/g, "H₂O");
  s = s.replace(/\bC\s*O\s*2\b/gi, "CO₂");
  s = s.replace(/\bCO2\b/g, "CO₂");

  if (!opts?.skipCoordinatePlane) {
    s = normalizeCoordinatePlaneOcrText(s);
  }
  if (!opts?.skipDiagramStrip) {
    s = stripGotOcrPageHallucinations(s);
  }
  s = dropDiagramNoiseLines(s);
  return s;
}

/**
 * 去掉 AI 仍可能输出的致谢、分隔线与说明尾段（不影响题干内的「希望」等学术用语）。
 */
function stripAiRepairFooterNoise(s: string): string {
  let t = s.replace(/\r\n/g, "\n").trim();
  t = t.replace(
    /\n-{3,}\s*\n[\s\S]{0,800}?(希望这能|希望能帮|希望能帮助|以上(?:是我|识别)?)[^\n]{0,200}[\s\S]*$/i,
    "",
  );
  t = t.replace(
    /\n+(希望这能|希望能帮|希望能帮助|以上[^。\n]{0,60}(识别)?(结果)?)[^\n]{0,160}\n*$/i,
    "",
  );
  t = t.replace(/\n*【?以上为[^\n]{0,80}】?\s*$/, "");
  return t.trim();
}

/**
 * 选项行尾常被双栏版式拖入「第（12）题」等栏标。
 */
function cleanupMcqOptionLineTrailingLabels(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      const heavy = line.match(/^(\([A-D]\)\s*)(.+?)(\s{2,}第[（(]\d+[）)][题]?)\s*$/);
      if (heavy) return `${heavy[1]}${heavy[2].trim()}`;
      const light = line.match(/^(\([A-D]\)\s*)(.+?)(\s+第[（(]\d+[）)][题]?)\s*$/);
      if (light) return `${light[1]}${light[2].trim()}`;
      return line;
    })
    .join("\n");
}

/** (A)～(D) 行内多余空白压缩，减轻 OCR 裂栏产生的巨大空格 */
function collapseExcessiveSpacesInMcqLines(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\([A-D]\)\s*)(.+)$/);
      if (!m) return line;
      const body = m[2]!.replace(/\s{2,}/g, " ").trim();
      return `${m[1]}${body}`;
    })
    .join("\n");
}

/**
 * 大模型 OCR 语义修复之后调用：版式尾噪 + 选择题行整理。
 * 不改变「仅规则词典」路径；与 {@link normalizeMathExamOcrText} 互补。
 */
export function postRepairNormalizeExamText(s: string): string {
  let t = s.trim();
  t = stripAiRepairFooterNoise(t);
  t = cleanupMcqOptionLineTrailingLabels(t);
  t = collapseExcessiveSpacesInMcqLines(t);
  return t.trim();
}
