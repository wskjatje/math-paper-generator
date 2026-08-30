import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAdminAccess } from "@/lib/adminGate.server";
import {
  approveGenerationLearningCandidateSync,
  disableGenerationLearningRuleSync,
  listGenerationLearningStateSync,
  listRecentGenerationLearningEventsSync,
  rejectGenerationLearningCandidateSync,
} from "@/lib/generationLearning.server";
import { isGenerationLearningDbEnabled } from "@/lib/generationLearningDb.server";

const DecisionSchema = z.object({
  id: z.string().min(8).max(80),
  actor: z.string().trim().min(1).max(80).default("admin"),
  /** 证据未达阈值时允许管理员显式强制批准（写入 forceApproved 审计标记）。 */
  force: z.boolean().optional(),
});

const ListSchema = z.object({
  eventLimit: z.number().int().min(1).max(200).default(50),
});

export const listGenerationLearningAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListSchema.parse(data))
  .handler(async ({ data }) => {
    assertAdminAccess();
    return {
      ...listGenerationLearningStateSync(),
      events: listRecentGenerationLearningEventsSync(data.eventLimit),
      /** true：事件与候选会镜像写入 Supabase 审计表；false：仅本地 data/generation-learning/。 */
      dbMirrorEnabled: isGenerationLearningDbEnabled(),
    };
  });

export const approveGenerationLearningCandidate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DecisionSchema.parse(data))
  .handler(async ({ data }) => {
    assertAdminAccess();
    return {
      ok: true as const,
      candidate: approveGenerationLearningCandidateSync(data.id, data.actor, {
        force: data.force === true,
      }),
    };
  });

export const rejectGenerationLearningCandidate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DecisionSchema.parse(data))
  .handler(async ({ data }) => {
    assertAdminAccess();
    return { ok: true as const, candidate: rejectGenerationLearningCandidateSync(data.id, data.actor) };
  });

export const disableGenerationLearningRule = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DecisionSchema.parse(data))
  .handler(async ({ data }) => {
    assertAdminAccess();
    return { ok: true as const, candidate: disableGenerationLearningRuleSync(data.id, data.actor) };
  });
