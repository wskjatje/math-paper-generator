import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

/** 与 `Json` 一致，供 Zod 解析及 TanStack ServerFn 可序列化返回值对齐 */
export const zJson: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(zJson),
    z.record(z.string(), zJson),
  ]),
);
