/**
 * 试卷版面 / 图文绑定（与 OCR 文本层解耦）。
 */
export type NormBBox = {
  /** 相对整页宽高的归一化框 xywh，∈ [0,1] */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutFigureRole = "stem" | "option";

export type HeuristicFigurePlanItem = {
  bbox: [number, number, number, number];
  /** persistOfflineImportDiagramCrops.slug，仅 [a-zA-Z0-9_-] */
  slug: string;
  caption: string;
  questionIndex: number;
  role: LayoutFigureRole;
  optionLetter?: "A" | "B" | "C" | "D";
};
