import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AiRuntimePayload } from "@/lib/aiRuntime.shared";
import { repairOcrTextWithAi } from "@/services/ocr-ai-repair.server";

const AiRuntimeSchema = z
  .object({
    mode: z.enum(["cloud", "local"]),
    cloudModel: z.string().max(200).optional(),
    localBaseUrl: z.string().max(512).optional(),
    localModel: z.string().max(200).optional(),
    localSubjectModels: z.record(z.string(), z.string()).optional(),
    localApiKey: z.string().max(500).optional(),
  })
  .passthrough()
  .optional();

const Schema = z.object({
  text: z.string().max(2_000_000),
  curriculum_subject_id: z.string().max(64).optional(),
  ai: AiRuntimeSchema,
});

/**
 * 线下导入：对 OCR 聚合正文做「教育语义」AI 修复（规则词典已在服务内预处理）。
 */
export const repairOfflineOcrTextWithAi = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Schema.parse(data))
  .handler(async ({ data }) => {
    const ai = data.ai as AiRuntimePayload | undefined;
    return repairOcrTextWithAi({
      rawText: data.text,
      curriculumSubjectId: data.curriculum_subject_id,
      ai,
    });
  });
