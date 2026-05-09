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
  storage_source?: "supabase" | "local" | "project";
  /** 列表接口：是否已有同型例题（用于切换「生成例题」/「下载例题」） */
  has_examples?: boolean;
  /** 逻辑删除时间（数据库或本地）；非空则不出现在试卷库 */
  deleted_at?: string | null;
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
