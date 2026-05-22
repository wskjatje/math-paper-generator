# Math Paper Generator（数学试卷生成项目）

依据定制需求生成 **数据竞赛 / 奥数类完整试卷**，并按卷内题型配套 **例题**；学科涵盖统计、编程、物理、化学等与数学交叉的拓展题型。目标：试卷、答案与例题 **开源可获取**，每题含 **详细步骤与推导**，并通过结构与人工闸门保障 **严谨性**。

## 仓库内有什么

| 路径 | 说明 |
|------|------|
| `schemas/v1/` | JSON Schema：`exam_paper`、`worked_example_pack` |
| `examples/v1/` | 最小合法示例（冒烟测试） |
| `papers/` | 正式试卷与例题数据（见 `papers/README.md`） |
| `docs/workflow.md` | 需求 → 组卷 → 例题 → 校验 → 发布流程 |
| `docs/validation-checklist.md` | 出版前人工清单 |
| `scripts/validate_all.py` | 结构校验脚本 |
| `apps/web/`（`src/`、`public/`、`vite.config.ts`） | **Web 应用（TanStack Start）**：npm workspace `@zhixue/web`；React 界面 + 服务端函数（命题、试卷列表等），构建产物面向 Cloudflare Workers |
| `services/gateway-api/` | API 网关占位（FastAPI，后续接反向代理与鉴权） |
| `infrastructure/docker`、`infrastructure/kubernetes` | Compose 全栈编排与 K8s 示例清单 |
| `docs/architecture/stack-docker.md` | Docker 拓扑与端口说明 |
| `shared/` | 跨服务契约占位（types / prompts / utils） |

## 快速开始

### 数据校验（Python）

```bash
make install    # 创建 .venv 并安装依赖
make validate   # 校验 examples/ 与 papers/ 下 JSON
```

校验脚本会遍历 `examples/**/*.json` 与 `papers/**/*.json`，根据根字段 `kind` 选择 Schema。

### Web 应用（Node · npm workspaces）

在**仓库根目录**安装依赖（workspace 悬停 `node_modules`），启动的是 `apps/web` 中的 TanStack Start（UI 与 API 同进程）：

```bash
npm install
npm run dev
```

- 首页 `/`，试卷库 `/library`，生成 `/generate`，试卷详情 `/exam/$id`。
- 演示试卷：`/exam/demo`（内置 MPG 演示数据）。
- 环境变量示例：`.env.example`；本地可与 `wrangler dev` / 部署环境对齐。

## 许可证说明

- **工具链与文档**：MIT（见 `LICENSE`）。
- **各试卷/例题 JSON**：以文件内 `metadata.license_spdx` 为准；添加内容时请与维护者对齐开放授权策略。

## 贡献

见 `CONTRIBUTING.md`。
