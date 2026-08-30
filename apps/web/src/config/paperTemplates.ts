import paperTemplatesJson from "./paper-templates.json";

export type PaperTemplate = {
  id: string;
  label: string;
  printClassName: string;
  columns: 1 | 2;
  showSectionHeaders: boolean;
  showPageFooter: boolean;
  /** 是否在每页顶部重复卷名/时长（默认 false；卷面 paper-card 已有标题） */
  showPrintHeader?: boolean;
  footerPattern?: string;
  /**
   * 是否在卷面页头展示 `exam.description`（库内检索/导出用概述，默认不进卷面，与打印页眉一致）。
   */
  showDescription?: boolean;
};

type PaperTemplatesConfig = {
  version: number;
  defaultTemplateId: string;
  templates: PaperTemplate[];
};

const cfg = paperTemplatesJson as PaperTemplatesConfig;

export const PAPER_TEMPLATES = cfg.templates;
export const DEFAULT_PAPER_TEMPLATE_ID = cfg.defaultTemplateId;

export function paperTemplateById(id: string | null | undefined): PaperTemplate | undefined {
  const key = id?.trim();
  if (!key) return PAPER_TEMPLATES.find((t) => t.id === DEFAULT_PAPER_TEMPLATE_ID);
  return PAPER_TEMPLATES.find((t) => t.id === key);
}

export function paperTemplateLabel(id: string | null | undefined): string {
  return paperTemplateById(id)?.label ?? "标准单栏";
}

/** 按年级/学科推荐版式（数据驱动，非页面硬编码） */
export function suggestPaperTemplateId(gradeId?: string, subjectId?: string): string {
  const grade = gradeId?.trim() ?? "";
  const subject = subjectId?.trim() ?? "";
  if (grade.startsWith("jhs_") && subject === "math") return "zh-junior-math-exam";
  if (grade.startsWith("jhs_") && subject === "english") return "zh-standard-single";
  return DEFAULT_PAPER_TEMPLATE_ID;
}
