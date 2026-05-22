import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WorkspaceIntegrationSettings } from "@/lib/workspaceSettings.shared";
import {
  loadMergedWorkspaceIntegrationSettings,
  mergePersistWorkspaceIntegrationSettings,
} from "@/lib/workspaceSettingsStore.server";

const PatchSchema = z.object({
  gateway: z
    .object({
      baseUrl: z.string().max(500).optional(),
    })
    .optional(),
  webSearch: z
    .object({
      tavilyApiKey: z.string().max(500).optional(),
      braveApiKey: z.string().max(500).optional(),
      provider: z.enum(["auto", "tavily", "brave"]).optional(),
    })
    .optional(),
});

/** 网关 URL、外网检索密钥（合并 Supabase + 本机 MySQL.workspace_settings） */
export const fetchWorkspaceIntegrationSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true; settings: WorkspaceIntegrationSettings }> => {
    const settings = await loadMergedWorkspaceIntegrationSettings();
    return { ok: true, settings };
  },
);

export const saveWorkspaceIntegrationSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PatchSchema.parse(data))
  .handler(async ({ data }) => {
    await mergePersistWorkspaceIntegrationSettings(data as WorkspaceIntegrationSettings);
    return { ok: true as const };
  });
