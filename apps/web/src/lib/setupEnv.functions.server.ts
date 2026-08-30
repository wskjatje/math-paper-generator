/**
 * 配库页环境变量 ServerFn。
 * 禁止顶层 import runtimeEnvLocal.server（含 node:fs）：客户端 import 本文件会连带打包失败。
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  RUNTIME_ENV_LOCAL_KEYS,
  type RuntimeEnvLocalKey,
} from "@/lib/runtimeEnvLocal.shared";

/** 公开：换机页读取本机配库状态（无密钥明文） */
export const getSetupEnvUiState = createServerFn({ method: "GET" }).handler(async () => {
  const { getRuntimeEnvLocalUiState } = await import("@/lib/runtimeEnvLocal.server");
  return getRuntimeEnvLocalUiState();
});

const SaveSchema = z.object(
  Object.fromEntries(RUNTIME_ENV_LOCAL_KEYS.map((k) => [k, z.string().max(4000).optional()])) as Record<
    RuntimeEnvLocalKey,
    z.ZodOptional<z.ZodString>
  >,
);

/** 公开：保存到 data/runtime-env.local.json；空字段表示保持原值 */
export const saveSetupEnvLocal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SaveSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveRuntimeEnvLocal } = await import("@/lib/runtimeEnvLocal.server");
    return saveRuntimeEnvLocal(data as Partial<Record<RuntimeEnvLocalKey, string>>);
  });

const ClearSchema = z.object({
  key: z.enum(RUNTIME_ENV_LOCAL_KEYS as unknown as [RuntimeEnvLocalKey, ...RuntimeEnvLocalKey[]]),
});

export const clearSetupEnvLocalKey = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ClearSchema.parse(data))
  .handler(async ({ data }) => {
    const { clearRuntimeEnvLocalKey } = await import("@/lib/runtimeEnvLocal.server");
    return clearRuntimeEnvLocalKey(data.key);
  });
