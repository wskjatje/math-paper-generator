/**
 * 无深度模型时：用几何启发式把连通域指认为「侧栏主图 + 下方四选项」等（易误判，见 docs）。
 */
import type { HeuristicFigurePlanItem } from "@/lib/paperLayoutImport/types.shared";
import type { NormBBox } from "@/lib/paperLayoutImport/types.shared";

function area(r: NormBBox): number {
  return r.w * r.h;
}

const cx = (r: NormBBox) => r.x + r.w / 2;
const cy = (r: NormBBox) => r.y + r.h / 2;

function bboxOverlap(a: NormBBox, b: NormBBox): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ox = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  return ox * oy > 0.002;
}

/** 题干含两幅图注（图①/图② 或 OCR 的 图(1)/图(2)）时，尝试裁切页底并排双图。 */
function ocrTextImpliesDualBottomDiagrams(ocrText: string): boolean {
  const t = String(ocrText ?? "");
  const hasCircled = /图[①②]/.test(t) || /如图[①②]/.test(t);
  const hasParen =
    /图\s*[\(（]\s*1\s*[\)）]/.test(t) &&
    /图\s*[\(（]\s*2\s*[\)）]/.test(t);
  return hasCircled || hasParen;
}

function tryPlanDualBottomCircledDiagrams(
  imageIndex: number,
  ocrText: string,
  regions: NormBBox[],
  questionIndex: number,
): HeuristicFigurePlanItem[] {
  if (!ocrTextImpliesDualBottomDiagrams(ocrText)) return [];

  const bottom = regions.filter(
    (r) => cy(r) > 0.48 && area(r) >= 0.015 && area(r) <= 0.4 && r.w >= 0.08,
  );
  if (bottom.length < 2) return [];

  const picks: NormBBox[] = [];
  for (const r of [...bottom].sort((a, b) => area(b) - area(a))) {
    if (picks.some((p) => bboxOverlap(p, r))) continue;
    picks.push(r);
    if (picks.length >= 2) break;
  }
  if (picks.length < 2) return [];

  picks.sort((a, b) => cx(a) - cx(b));
  const labels = ["①", "②"] as const;
  return picks.map((r, i) => ({
    bbox: [r.x, r.y, r.w, r.h] as [number, number, number, number],
    slug: `p${imageIndex}-图${labels[i]}`,
    caption: `图${labels[i]}`,
    questionIndex,
    role: "stem" as const,
  }));
}

/**
 * 从卷面 OCR 文本取首个 (n) 题号；无则 1。
 */
export function parseFirstParenthesisQuestionIndex(text: string): number {
  const m = /\(\s*(\d{1,2})\s*\)/.exec(text);
  if (!m?.[1]) return 1;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(99, n);
}

/**
 * 在归一化连通域上生成裁剪计划（相对整页原图坐标的 bbox）。
 */
export function buildHeuristicFigurePlan(
  imageIndex: number,
  ocrText: string,
  regions: NormBBox[],
): HeuristicFigurePlanItem[] {
  if (regions.length === 0) return [];

  const questionIndex = parseFirstParenthesisQuestionIndex(ocrText);
  const dualBottom = tryPlanDualBottomCircledDiagrams(imageIndex, ocrText, regions, questionIndex);
  if (dualBottom.length >= 2) return dualBottom;

  const baseSlug = `p${imageIndex}-q${questionIndex}`;

  /** 右侧可能为题图（立体几何「右图」） */
  const rightBlocks = regions.filter((r) => cx(r) > 0.52 && area(r) >= 0.014);
  const stem =
    rightBlocks.length > 0 ? [...rightBlocks].sort((a, b) => area(b) - area(a))[0] : undefined;

  /** 下方带状区内「小而横」的块 → 多选型图示（中心对称等） */
  const bottomBand = regions.filter(
    (r) =>
      cy(r) > 0.52 &&
      r.h < 0.5 &&
      area(r) >= 0.002 &&
      area(r) <= 0.14 &&
      r.w / Math.max(r.h, 1e-6) < 6,
  );
  const opts = [...bottomBand].sort((a, b) => cx(a) - cx(b)).slice(0, 4);

  const out: HeuristicFigurePlanItem[] = [];

  if (stem && area(stem) >= 0.014) {
    const dupOpt = opts.some(
      (o) =>
        Math.abs(cx(o) - cx(stem)) < 0.06 &&
        Math.abs(cy(o) - cy(stem)) < 0.06 &&
        Math.abs(area(o) - area(stem)) < 0.005,
    );
    if (!dupOpt) {
      out.push({
        bbox: [stem.x, stem.y, stem.w, stem.h],
        slug: `${baseSlug}-stem`,
        caption: `第(${questionIndex})题配图`,
        questionIndex,
        role: "stem",
      });
    }
  }

  const letters: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];
  if (opts.length === 4) {
    for (let i = 0; i < 4; i++) {
      const r = opts[i]!;
      out.push({
        bbox: [r.x, r.y, r.w, r.h],
        slug: `${baseSlug}-opt-${letters[i]}`,
        caption: `第(${questionIndex})题选项${letters[i]}`,
        questionIndex,
        role: "option",
        optionLetter: letters[i],
      });
    }
  }

  return out;
}
