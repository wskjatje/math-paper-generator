import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { forwardPlainTextToOpenNotebook } from "@/lib/openNotebookIntegration.server";
import { enhancePlaintextViaHttpService } from "@/lib/plaintextExtractAdapter.server";

const ForwardSchema = z.object({
  text: z.string().min(30),
  title: z.string().max(500).optional(),
});

const EnhanceSchema = z.object({
  text: z.string().min(30),
});

/** 将导入预览中的正文转发到 Open Notebook（需在服务端配置 API Base）。 */
export const forwardOfflinePreviewToOpenNotebook = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ForwardSchema.parse(data))
  .handler(async ({ data }) => forwardPlainTextToOpenNotebook(data.text, data.title));

/** 调用可选 HTTP 正文增强服务（抽取合并后、AI 语义修复前可选一步）。 */
export const enhanceOfflineExtractViaHttpService = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EnhanceSchema.parse(data))
  .handler(async ({ data }) => enhancePlaintextViaHttpService(data.text));
