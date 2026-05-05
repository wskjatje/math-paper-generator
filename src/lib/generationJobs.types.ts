import type { CompositionRowPayload, Difficulty, QuestionType } from "@/lib/types";
import type { PaperKindId } from "@/lib/generateCatalog";

export type GenJobStatus = "running" | "success" | "failed" | "cancelled";

export type CustomCompositionSlotSnapshot = { id: string; name: string; count: number };

/** 重新生成「生成试卷」时回填表单 */
export type PaperGenPayloadSnapshot = {
  title: string;
  grade: string;
  subject: string;
  scopes: string[];
  competition_focus: string[];
  paper_kind: PaperKindId;
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
