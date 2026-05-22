import type { CompositionRowPayload, Difficulty, QuestionType } from "@/lib/types";
import type { ExamGenerationModeId, ExamTrackId, PaperKindId } from "@/lib/generateCatalog";

export type GenJobStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type CustomCompositionSlotSnapshot = { id: string; name: string; count: number };

/** 重新生成「生成试卷」时回填表单 */
export type PaperGenPayloadSnapshot = {
  title: string;
  grade: string;
  subject: string;
  scopes: string[];
  competition_focus: string[];
  paper_kind: PaperKindId;
  /** 命题页一级模式（旧队列无则按 exam_track 推断） */
  exam_mode?: ExamGenerationModeId;
  /** 缺省或旧队列无此字段时视为校内同步 */
  exam_track?: ExamTrackId;
  target_track_id?: string;
  /** 校内同步：教材版本（可选） */
  textbook_edition_hint?: string;
  /** 校内同步：单元 / 章节侧重（可选）；由勾选目录 + 补充说明序列化 */
  chapter_focus?: string;
  /** 勾选的内置章节 id（可选，便于队列精确回填） */
  chapter_catalog_ids?: string[];
  /** 章节补充说明原文（可选） */
  chapter_focus_supplement?: string;
  difficulty: Difficulty;
  duration_min: number;
  total_score: number;
  /** 与提交 API 一致的题型组成 */
  compositionPayload: CompositionRowPayload[];
  /** 完整矩阵与自定义槽，用于恢复界面 */
  composition: Record<string, number>;
  customCompositionSlots: CustomCompositionSlotSnapshot[];
  compositionRowOrder: string[];
  notes: string;
  allow_overlap_with_library_question_types: boolean;
};

export interface PaperGenJob {
  id: string;
  title: string;
  gradeId: string;
  subjectId: string;
  gradeLabel: string;
  subjectLabel: string;
  status: GenJobStatus;
  createdAt: string;
  updatedAt: string;
  /** 用户点击取消（生成仍可能在服务端完成，前端不再跳转成功） */
  cancelRequested?: boolean;
  errorMessage?: string;
  examId?: string;
  payload: PaperGenPayloadSnapshot;
}

export interface ExampleGenJob {
  id: string;
  examTitle: string;
  examId: string;
  gradeLabel: string;
  subjectLabel: string;
  status: GenJobStatus;
  createdAt: string;
  updatedAt: string;
  cancelRequested?: boolean;
  errorMessage?: string;
  payload: {
    examId: string;
    types: QuestionType[];
  };
}

export interface GenerationJobsRoot {
  paper: PaperGenJob[];
  example: ExampleGenJob[];
}
