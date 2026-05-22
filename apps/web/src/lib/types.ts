import type { GeometryDiagramSchemaV1 } from "@/lib/geometryDiagramSchema.shared";
import type { FigureRefV1, FigureRegistryItemV1 } from "@/lib/figureOwnership.shared";
import type { QuestionImportQualityV1 } from "@/lib/importObservability.shared";
import type { VisualGeometryEvidenceV1 } from "@/lib/visualGeometryEvidence.shared";

export type Difficulty = "beginner" | "intermediate" | "competition" | "advanced";

export type QuestionType =
  | "multiple_choice"
  /** 多项选择题（至少 4 个选项，answer 可含多个正确项，建议用「A、B」或「A,B」） */
  | "multiple_choice_multi"
  | "fill_blank"
  | "short_answer"
  | "proof"
  | "programming"
  | "calculation"
  /** 语文 / 英语：大作文或规定体裁写作 */
  | "essay"
  /** 数学卷：物理情境中的建模与定量（仍以数学推导为主） */
  | "cross_math_physics"
  /** 数学卷：化学情境中的计量、速率、平衡等定量建模 */
  | "cross_math_chemistry"
  /** 物理卷：矢量、图像、微元与近似等数学工具运用 */
  | "cross_physics_math"
  /** 化学卷：计量、图表与图像分析中的定量推理 */
  | "cross_chemistry_math";

export interface SolutionStep {
  step: number;
  description: string;
  reasoning?: string;
  formula?: string;
}

/** 线下导入：卷面位图与题干/选项的显式绑定（与 content/options 内 Markdown 互补） */
export type QuestionRasterFiguresV1 = {
  version: 1;
  stem: string[];
  by_option: Partial<Record<"A" | "B" | "C" | "D", string[]>>;
  /**
   * 与 `stem[]` 同序：归一化 bbox [x,y,w,h]（相对整页或整题示意区 0–1，见 `offlineImportDiagramCrops` 的 toPixelRect）。
   * 无版面引擎时由 `importRasterFigures.shared` 用纵向分条**默认填充**，便于与外接真 bbox 对齐或调试裁剪。
   */
  stem_bbox_norm?: [number, number, number, number][] | null;
  /** 与各选项 URL 数组同序的归一化 bbox；规则同上 */
  by_option_bbox_norm?: Partial<
    Record<"A" | "B" | "C" | "D", [number, number, number, number][]>
  > | null;
};

/** 题面依赖主图 / 选项配图 / 二者 / 无（与矢量 diagram_schema 独立） */
export type QuestionFigureRole = "none" | "main_question" | "options" | "both";

/** 卷面位图依赖声明 v1（入库与读卷修复时写入） */
export type QuestionFigureDependencyV1 = {
  version: 1;
  requires_figure: boolean;
  figure_role: QuestionFigureRole;
  option_requires_figure: boolean;
};

export interface Question {
  id: string;
  exam_id: string;
  order_index: number;
  type: QuestionType;
  /** 命题页题型组成中的展示名（自定义题型为用户填写的中文名；可与 type 并存） */
  type_label?: string | null;
  subject: string;
  content: string;
  options: string[] | null;
  answer: string;
  solution_steps: SolutionStep[];
  knowledge_tags: string[];
  points: number;
  /** 题干驱动的学科矢量示意图（AI 推断结构化 JSON；数学几何为主，亦可近似理化生示意，非扫描裁剪图） */
  diagram_schema?: GeometryDiagramSchemaV1 | null;
  /** 扫描卷裁剪图 URL（import-figures / offline-import）；用于展示与「缺图」判定 */
  raster_figures?: QuestionRasterFiguresV1 | null;
  /**
   * 视觉几何证据 v1（导入/OCR 写入）：diagram_links、layout AST、图元等离散标记；
   * 与位图并列判定「非纯文本脑补」及题干区矢量优先于裁图展示。
   */
  visual_geometry_evidence?: VisualGeometryEvidenceV1 | null;
  /**
   * 卷面位图依赖声明 v1（入库/读卷时由规则写入）：`requires_figure` / `figure_role` /
   * `option_requires_figure`，供展示策略与导出；与 `diagram_schema` 独立。
   */
  figure_dependency?: QuestionFigureDependencyV1 | null;
  /**
   * P7-1A：对卷级 `figure_registry` 的图引用（`figure_id`）；子题可 `inherited` 自父题。
   * 消费侧请经 `resolveFigureResources`，勿直接当 URL 列表使用。
   */
  figure_refs?: FigureRefV1[] | null;
  /** 可选：导入可观测性 v1（与卷级 `import_parse_quality` 互补，便于按题定位 withhold 等工程原因） */
  import_quality?: QuestionImportQualityV1 | null;
}

export interface Exam {
  id: string;
  title: string;
  subtitle: string | null;
  subjects: string[];
  difficulty: Difficulty;
  duration_min: number;
  total_score: number;
  source: "curated" | "generated" | "imported";
  is_featured: boolean;
  description: string | null;
  created_at: string;
  /** AI 命题总耗时（秒），仅部分生成流程写入 */
  generation_duration_sec?: number | null;
  /** 列表接口聚合：该卷题目中出现过的题型（有序去重） */
  question_types?: string[];
  /** 列表接口：试卷存储位置（云端 / 本地 / 仓库内置 MPG） */
  storage_source?: "supabase" | "local" | "project" | "mysql";
  /** 列表接口：是否已有同型例题（用于切换「生成例题」/「下载例题」） */
  has_examples?: boolean;
  /** 逻辑删除时间（数据库或本地）；非空则不出现在试卷库 */
  deleted_at?: string | null;
  /**
   * 仅 `source === "imported"` 时有意义：`staging` 为待确认草稿（仅在「导入线下卷」页展示），
   * `confirmed` 为已核对入库（仍在「导入线下卷」正式列表，**不进入** `/library` 试卷库）。
   */
  import_review_status?: "staging" | "confirmed" | null;
  /**
   * P7-1A：卷面图 registry（`figure_id` → 当前 `raster_url` 等）；与题目 `figure_refs` 配合。
   */
  figure_registry?: FigureRegistryItemV1[] | null;
  /**
   * 仅导入卷：入库前由 `computeImportParseQualityRollup` 写入的质检 v1 对象（JSON），
   * 供待确认列表与详情页 HITL 提示；字段定义见 `importParseQuality.shared.ts`。
   * 使用 `Json` 以便与 DB / TanStack ServerFn 可序列化类型一致。
   */
  import_parse_quality?: import("@/integrations/supabase/types").Json | null;
}

/** 设置页 / 本地 data/local-exams 列表用 */
export interface LocalExamFileInfo {
  id: string;
  title: string;
  created_at: string;
  /** 文件大小（字节） */
  bytes: number;
}

export interface Example {
  id: string;
  exam_id: string;
  question_id: string | null;
  type: string;
  subject: string;
  content: string;
  answer: string;
  solution_steps: SolutionStep[];
  difficulty: string;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "入门",
  intermediate: "进阶",
  competition: "竞赛",
  advanced: "高阶竞赛",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "选择题（单选）",
  multiple_choice_multi: "选择题（多选）",
  fill_blank: "填空题",
  short_answer: "解答题",
  proof: "证明题",
  programming: "编程题",
  calculation: "计算题",
  essay: "作文 / 写作题",
  cross_math_physics: "数物综合题",
  cross_math_chemistry: "数化综合题",
  cross_physics_math: "数理工具题",
  cross_chemistry_math: "化学定量题",
};

/** 自定义题型稳定 ID 前缀；完整 id 为 `${CUSTOM_COMPOSITION_TYPE_PREFIX}${slotId}` */
export const CUSTOM_COMPOSITION_TYPE_PREFIX = "custom:";

/**
 * 提交命题 API 的题型组成行。
 * 内置题型：`type` 为 QuestionType；自定义题型：`type` 为稳定技术 id，`type_label` 为卷面展示名（方案 B）。
 */
export type CompositionRowPayload = {
  type: string;
  count: number;
  /** `custom:<slotId>` 时必填：用户自定义题型的展示名 */
  type_label?: string | null;
};

/** 单行题型的卷面/命题提示用名称（内置→中文标签；自定义→用户文案；旧版原始字符串→原样） */
export function compositionRowDisplayLabel(row: CompositionRowPayload): string {
  const key = String(row.type ?? "").trim();
  if (!key) return "";
  if (key in QUESTION_TYPE_LABELS) {
    return QUESTION_TYPE_LABELS[key as QuestionType];
  }
  if (key.startsWith(CUSTOM_COMPOSITION_TYPE_PREFIX)) {
    const lbl = String(row.type_label ?? "").trim();
    return lbl || key;
  }
  return key;
}

/** 详情页 / 导出：优先使用命题页自定义题型名 */
export function questionDisplayTypeLabel(q: Pick<Question, "type" | "type_label">): string {
  const raw = q.type_label?.trim();
  if (raw) return raw;
  return QUESTION_TYPE_LABELS[q.type as QuestionType] ?? String(q.type ?? "");
}
