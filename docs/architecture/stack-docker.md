# Docker / Compose 全栈

## 服务拓扑

| 容器 | 端口 | 说明 |
|------|------|------|
| `gateway` | 8090 | 聚合 `/api/v1/*`；可选反代浏览器流量至 Web |
| `web` | 8080 | `@zhixue/web`（vite preview） |
| `ocr-service` | 8101 | **GOT-OCR 2.0**（`services/got-ocr-service`） |
| `formula-service` | 8102 | 公式 Stub → 可换 Pix2Text |
| `vision-service` | 8103 | 几何视觉 Stub |
| `agent-service` | 8104 | Agent Stub |
| `question-parser-service` | 8105 | 题目解析 Stub |

## 启动

在**仓库根目录**：

```bash
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

- 统一浏览器入口：`http://localhost:8090`（经网关访问 **容器内** Web）
- **推荐本地开发（本机 Vite + OCR 网关）**：仓库根 `npm run dev:host` → 只构建 API 栈（**不**构建 `web` 镜像，避免 Docker 内 `npm ci` 拉 electron 失败）→ 浏览器 `http://localhost:8080`；`.env` 设 `MPG_GATEWAY_URL=http://127.0.0.1:8080`，MySQL 用 `127.0.0.1`
- 仅 API 栈（后台）：`npm run docker:api:detach`（等同 `docker compose … api-only.yml`）
- 就绪探针：`GET http://localhost:8090/v1/ready`
- OCR Stub：`POST http://localhost:8090/api/v1/ocr/image`（multipart `file`）
- 题目解析 Stub：`POST http://localhost:8090/api/v1/questions/parse`，JSON `{"text":"..."}` 

## 网关环境变量

| 变量 | 含义 |
|------|------|
| `OCR_SERVICE_URL` | OCR 服务根 URL |
| `FORMULA_SERVICE_URL` | 公式服务根 URL |
| `VISION_SERVICE_URL` | 视觉服务根 URL |
| `AGENT_SERVICE_URL` | Agent 服务根 URL |
| `WEB_UPSTREAM_URL` | 置空则网关**仅**提供 API；设为 `http://web:8080` 时浏览器可走网关统一端口 |

## Web 镜像

`infrastructure/docker/Dockerfile.web` 的构建上下文必须是**仓库根**（含 workspaces `package-lock.json`）。

## 限制说明

- 经网关反代的 **WebSocket / HMR** 未专项适配；本地开发建议直连 `http://localhost:8080`，网关仅在预览聚合 API 或统一入口时使用。
- OCR 默认 **GOT-OCR 2.0**（首次启动从 Hugging Face 拉权重，建议 `POST /api/v1/ocr/warmup`）；公式 / 视觉 / Agent 仍为 Stub。

## K8s

见 `infrastructure/kubernetes/README.md`：Namespace、`ConfigMap`、各 `Deployment`/`Service`、两种 Ingress 示例（统一网关 vs API/Web 分拆）。
