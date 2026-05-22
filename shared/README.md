# shared（跨端契约占位）

建议后续抽出：

- `types/`：OpenAPI / JSON Schema 生成的 TypeScript 类型，供 `apps/web` 与网关、Python 服务对齐。
- `prompts/`：版本化 Prompt（勿写死在业务代码）。
- `utils/`：纯函数、无运行时耦合工具。

- **`contracts/v1/*.sample.json`**：OCR / 公式 / 视觉 / Agent 响应示例 Schema（与 Stub 服务对齐，便于后续换真实引擎）。

当前仓库仍以 `schemas/v1`（试卷 JSON）与 `apps/web/src` 为真理来源；微服务 JSON 契约在此目录演进。
