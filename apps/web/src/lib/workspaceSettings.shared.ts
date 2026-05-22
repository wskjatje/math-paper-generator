import type { GatewaySettingsForm } from "@/lib/gatewaySettingsStorage";
import type { WebSearchSettingsForm } from "@/lib/webSearchSettingsStorage";

/**
 * 与 workspace_settings.settings JSON 对齐。
 * 网关/检索可落在 Supabase 与本机 MySQL 的 workspace_settings 表。
 * MySQL 连接密文仅写入 Supabase（或本地文件），不写入 MySQL 库的 workspace_settings，以免bootstrap套娃。
 */
export type WorkspaceIntegrationSettings = {
  gateway?: Partial<GatewaySettingsForm>;
  webSearch?: Partial<WebSearchSettingsForm>;
};
