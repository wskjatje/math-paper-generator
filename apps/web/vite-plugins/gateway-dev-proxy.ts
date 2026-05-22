/**
 * 在 TanStack Start SSR 中间件之前把 /api/v1、/v1 反代到 Docker 网关。
 * 避免 /v1/ready 等请求落入 SSR 后触发 handleServerAction 的 method 未定义错误。
 */
import type { Connect } from "vite";
import type { Plugin } from "vite";
import http from "node:http";
import https from "node:https";

const GATEWAY_TARGET =
  process.env.MPG_GATEWAY_PROXY_TARGET?.trim().replace(/\/$/, "") ||
  "http://127.0.0.1:8090";

function shouldProxy(pathname: string): boolean {
  return pathname.startsWith("/api/v1") || pathname.startsWith("/v1/");
}

function proxyRequest(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  targetUrl: string,
): void {
  const url = new URL(targetUrl);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  const headers = { ...req.headers, host: url.host };
  delete headers.host;

  const proxyReq = lib.request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end(`Bad Gateway: ${err.message}`);
  });

  req.pipe(proxyReq);
}

export function gatewayDevProxy(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      const raw = req.url ?? "";
      const pathname = raw.split("?")[0] ?? "";
      if (!shouldProxy(pathname)) {
        next();
        return;
      }
      const targetUrl = `${GATEWAY_TARGET}${raw}`;
      proxyRequest(req, res, targetUrl);
    });
  };

  return {
    name: "mpg-gateway-dev-proxy",
    enforce: "pre",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}
