import { z } from "zod";
import { GraphDslSchema } from "@/lib/educationOs/graphDsl.zod";

/** 与现有 MPG 科目风格对齐，并预留扩展 */
export const EducationSubjectSchema = z.enum([
  "math",
  "physics",
  "chemistry",
  "biology",
  "informatics",
  "english",
  "chinese",
  "general",
]);

export const QuestionAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "svg", "audio", "pdf_page", "other"]),
  uri: z.string().min(1),
  mime_type: z.string().optional(),
  alt: z.string().optional(),
  /** OCR 置信度 0–1 */
  ocr_confidence: z.number().min(0).max(1).optional(),
  /** 归一化 bbox [x, y, w, h]，相对页面 0–1 */
  bbox_norm: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});

export const TutorAttachmentSchema = z.object({
  socratic_prompts: z.array(z.string()).optional(),
  common_errors: z.array(z.string()).optional(),
  hint_ladder: z.array(z.string()).optional(),
});

export const WrongBookAttachmentSchema = z.object({
  mistake_tags: z.array(z.string()).optional(),
  knowledge_gaps: z.array(z.string()).optional(),
  remedial_question_ids: z.array(z.string()).optional(),
});

/** 答案区：允许结构化或宽松 JSON，便于 OCR / 导入 */
export const AnswerBlockSchema = z.union([
  z.object({
    mode: z.literal("text"),
    value: z.string(),
  }),
  z.object({
    mode: z.literal("single_choice"),
    options: z.array(z.string()).min(2),
    correct_index: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("multi_choice"),
    options: z.array(z.string()).min(2),
    correct_indices: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({
    mode: z.literal("free"),
    rubric: z.string().optional(),
    reference: z.string().optional(),
  }),
  z.record(z.unknown()),
]);

export const AnalysisBlockSchema = z
  .object({
    short: z.string().optional(),
    steps: z
      .array(
        z.object({
          step: z.number().int().min(1),
          text: z.string(),
          formula: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

/**
 * 教育 OS 题目协议 v1（与数据库 `os_question_documents.payload` 对齐）
 */
export const QuestionSchemaV1 = z.object({
  schema_version: z.literal("1.0.0"),
  id: z.string().min(1),
  subject: EducationSubjectSchema,
  /** 年级：1–12 义务教育/高中；可扩展 */
  grade: z.number().int().min(1).max(16).optional(),
  /** 连续难度 0–1，可与 band 并存 */
  difficulty: z.number().min(0).max(1).optional(),
  difficulty_band: z
    .enum([
      "introductory",
      "intermediate",
      "advanced",
      "competition_regional",
      "competition_national",
      "olympiad",
    ])
    .optional(),
  question_type: z.string().min(1),
  knowledge_points: z.array(z.string()),
  stem: z.string().min(1),
  graph_dsl: GraphDslSchema.optional().nullable(),
  assets: z.array(QuestionAssetSchema).default([]),
  answer: AnswerBlockSchema,
  analysis: AnalysisBlockSchema.optional(),
  metadata: z
    .object({
      provenance: z.enum(["ai", "ocr", "import", "manual"]).optional(),
      ocr_engine: z.string().optional(),
      source_uri: z.string().optional(),
      locale: z.string().optional(),
      tutor: TutorAttachmentSchema.optional(),
      wrong_book: WrongBookAttachmentSchema.optional(),
    })
    .passthrough()
    .optional(),
});

export type QuestionSchemaV1 = z.infer<typeof QuestionSchemaV1>;
export type QuestionAsset = z.infer<typeof QuestionAssetSchema>;
export type EducationSubject = z.infer<typeof EducationSubjectSchema>;

export function parseQuestionSchemaV1(raw: unknown): QuestionSchemaV1 {
  return QuestionSchemaV1.parse(raw);
}

export function safeParseQuestionSchemaV1(raw: unknown) {
  return QuestionSchemaV1.safeParse(raw);
}
