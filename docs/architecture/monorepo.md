# Monorepo 与目录约定

## 布局

| 路径 | 职责 |
|------|------|
| `apps/web` | `@zhixue/web`：TanStack Start 主应用（当前唯一前端 + SSR Server Functions） |
| `services/gateway-api` | FastAPI 网关：`/api/v1/*` 聚合；可选 `WEB_UPSTREAM_URL` 反代 Web |
| `services/got-ocr-service` 等 | GOT-OCR 2.0 / 公式 / 视觉 / Agent / **question-parser**（FastAPI） |
| `schemas/`、`supabase/`、`data/`、`papers/` | 仓库根保留：试卷协议、迁移、本地数据与示例卷 |
| `shared/` | 跨服务类型 / Prompt / 工具函数占位 |
| `infrastructure/` | Docker Compose、K8s 示例清单 |

## 命令

在**仓库根**执行：`npm install`、`npm run dev`、`npm run build`。npm workspaces 将脚本转发到 `@zhixue/web`。

## `resolveProjectRoot()`（SSR）

服务端解析 `data/`、`schemas/`、`supabase/` 时以**含 `schemas/v1` 的仓库根**为准；Electron / `dev:bg` 通过 `MPG_PROJECT_ROOT` 注入该根路径。

## Docker / K8s

- Compose 全栈：`docs/architecture/stack-docker.md`、`npm run docker:stack`
- K8s 示例：`infrastructure/kubernetes/README.md`

## 后续拆分

本地 OCR 已接入 `got-ocr-service`；`apps/web` 经 `http://localhost:8090/api/v1/ocr/...` 调用。
