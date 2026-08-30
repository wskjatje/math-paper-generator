## 项目概述：数学试卷生成器（Math Paper Generator）

这是一个 **数学试卷自动生成 Web 应用**，定位是为竞赛/奥数级数学题生成完整的试卷与配套例题。它的核心能力：

### 数据侧
- 按需求生成**数学/竞赛类试卷**（含统计、编程、物理、化学等跨学科题型），每道题带详细步骤推导
- JSON Schema 定义数据结构（`schemas/v1/`），经 Python 校验脚本 `make validate` 确保严谨性
- 试卷与例题开源可获取，存放在 `papers/` 目录

### 应用侧（当前活跃开发）
- 基于 **TanStack Start**（React + SSR）+ **Vite** 构建的前后端一体 Web 应用
- 路由：首页 `/`、试卷库 `/library`、生成 `/generate`、试卷详情 `/exam/$id`、设置 `/settings`、离线导入 `/offline-imports`
- 数据库使用 **Supabase**（PostgreSQL），适配 **Cloudflare Workers** 部署
- 支持 **Electron 桌面应用**（`npm run desktop`）和 macOS DMG 打包

### 最近新增功能
- **听力试卷**：支持 Piper TTS 本地免费生成听力音频（macOS 回退到 `say`），听力稿格式 v3
- **导入线下卷**：上传文件经导入队列入库（网上历年卷目录已移除）
- **多模型任务管理**：支持同时调用多个 AI 模型完成命题
- AI 设置持久化（`aiSettingsStorage.ts`）、Markdown 导出增强等

### 技术栈
| 层 | 技术 |
|------|------|
| 前端 | React + TanStack Router |
| 后端/SSR | TanStack Start + Vite |
| 数据库 | Supabase (PostgreSQL) |
| 部署 | Cloudflare Workers |
| 桌面 | Electron + electron-builder |
| 本地 TTS | Piper / macOS `say` |
| 编排层 | Claude Code CLI（当前 `deepseek-chat`） |
| 本地推理 | Ollama（MCP，模型 `qwen2.5-coder:14b`） |

当前代码处于**活跃开发**状态，有大量未提交变更（~2500 行增删），正在导入远程试卷、完善听力音频管线，以及进行前端优化重构。