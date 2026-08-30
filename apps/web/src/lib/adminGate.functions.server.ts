import { createServerFn } from "@tanstack/react-start";
import { getAdminUiGateMode } from "@/lib/adminGate.server";

/** 返回管理员呈现区的可见模式；具体管理操作仍由各自 ServerFn 鉴权。 */
export const getAdminUiGateModeFn = createServerFn({ method: "GET" }).handler(async () => ({
  mode: getAdminUiGateMode(),
}));
