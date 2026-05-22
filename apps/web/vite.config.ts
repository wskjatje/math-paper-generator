// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { gatewayDevProxy } from "./vite-plugins/gateway-dev-proxy";
import { serveRuntimePublicAudio } from "./vite-plugins/serve-runtime-public-audio";

/** 本机 Vite :8080 将 OCR/公式等 API 反代到 Docker 网关（默认 8090），与 `MPG_GATEWAY_URL=http://127.0.0.1:8080` 配套。 */
const GATEWAY_PROXY_TARGET =
  process.env.MPG_GATEWAY_PROXY_TARGET?.trim() || "http://127.0.0.1:8090";

export default defineConfig({
  vite: {
    plugins: [gatewayDevProxy(), serveRuntimePublicAudio()],
    server: {
      port: 8080,
      strictPort: true,
      proxy: {
        "/api/v1": {
          target: GATEWAY_PROXY_TARGET,
          changeOrigin: true,
          /** OCR 冷启动 + 版面分析常 >2min，避免代理默认超时导致浏览器 fetch failed */
          timeout: 1_200_000,
          proxyTimeout: 1_200_000,
        },
        "/v1": {
          target: GATEWAY_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
    /**
     * 预构建一次拉齐常用入口，减少「发现新依赖 → 二次 optimize → HMR 仍引用旧 chunk」导致的
     * chunk-*.js 缺失（见 apps/web/node_modules/.vite/deps）。复发时可删 .vite 或 npm run dev:clean。
     */
    optimizeDeps: {
      include: [
        "cmdk",
        "@radix-ui/react-dialog",
        "@radix-ui/react-popover",
        "@radix-ui/react-dismissable-layer",
        "@radix-ui/react-focus-scope",
        "@radix-ui/react-portal",
        "@radix-ui/react-presence",
        "@radix-ui/react-slot",
        "seroval",
        "@tanstack/router-core",
      ],
    },
    build: {
      /** exam 路由聚合 KaTeX 等，单体略大属预期 */
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("xlsx")) return "vendor-xlsx";
          },
        },
      },
    },
  },
});
