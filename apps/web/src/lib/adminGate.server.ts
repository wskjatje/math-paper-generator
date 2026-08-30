import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type AdminUiGateMode = "token_required" | "dev_open" | "locked";

/** 设置页等客户端入口的呈现闸门；不替代服务端操作的实际鉴权。 */
export function getAdminUiGateMode(): AdminUiGateMode {
  if (process.env.MPG_ADMIN_TOKEN?.trim()) return "token_required";
  if (import.meta.env.DEV) return "dev_open";
  return "locked";
}

/**
 * 保护 Admin ServerFn：优先校验环境变量 MPG_ADMIN_TOKEN（请求头 x-mpg-admin-token 或 Bearer）。
 * 未配置时：开发环境放行；生产环境拒绝。
 *
 * 用 `createServerOnlyFn` 包裹：本函数用到的 `getRequest`（`@tanstack/react-start/server`）仅服务端可用，
 * 而调用方（如 accountAdmin ServerFn 中的 `assertOpsAccess`）经由普通模块级函数间接引用，
 * 若不显式声明环境边界，client 构建会因静态分析追踪到该 import 而报错；客户端误调用则按设计直接抛错。
 */
export const assertAdminAccess = createServerOnlyFn((): void => {
  const adminToken = process.env.MPG_ADMIN_TOKEN?.trim();
  const req = getRequest();

  if (adminToken) {
    const fromHeader = req?.headers?.get("x-mpg-admin-token")?.trim();
    const fromBearer = req?.headers
      ?.get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
    if (fromHeader === adminToken || fromBearer === adminToken) return;
    throw new Response("Forbidden: invalid admin token", { status: 403 });
  }

  if (import.meta.env.DEV) return;

  throw new Response("Forbidden: configure MPG_ADMIN_TOKEN for admin operations", {
    status: 403,
  });
});
