# Agent 提示（本仓库）

- **流程与闸门**：命题与发布闭环见 `docs/workflow.md`；人工核对清单见 `docs/validation-checklist.md`。
- **数据结构**：`schemas/v1/*.schema.json`；示例见 `examples/v1/` 与 `papers/2026/demo-2026-amc-style-01/`。
- **校验**：修改 JSON 后运行 `make validate`。
- **前端与服务端（TanStack Start）**：在仓库根目录 `npm install && npm run dev`；首页 `/`，试卷库 `/library`，生成 `/generate`，演示详情 `/exam/demo`（MPG JSON），`/dashboard` 重定向到 `/`，Schema 快照 `/preview`。
- **桌面应用（Electron）**：`npm run build && npm run desktop` 在本地以窗口打开（先构建再启 `vite preview`）。发布安装包：`npm run desktop:dmg`（输出到 `release/`，需本机已装 Node 且能执行 `node`，因预览进程用系统 Node 启动 Vite）。未签名的 .app 若被 macOS 拦截，可右键「打开」。
- **Electron 安装失败（`socket hang up`）**：仓库已含 `.npmrc` 指向 npmmirror 的 `electron_mirror`；若仍失败，删除 `node_modules/electron` 后重试 `npm install`，或临时执行 `export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"` 再安装。
- **`vite preview` / Electron 白屏或 500**：构建后会复制 `dist/server/server.js`（与 TanStack 预览入口名一致）；服务端读写 `data/` 使用 `resolveProjectRoot()`（或环境变量 `MPG_PROJECT_ROOT`），避免 SSR 下 `cwd` 为 `/` 时误写 `/data`。
