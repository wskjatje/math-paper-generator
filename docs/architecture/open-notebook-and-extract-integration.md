# Open Notebook 与可插拔正文增强（松耦合 / 组件级）

本页说明如何在**不合并代码仓、不增加 npm 对 Open Notebook 依赖**的前提下，将两类能力与 MPG 线下导入衔接。

## 1. 产品流程（零依赖）

与 [Open Notebook](https://github.com/lfnovo/open-notebook) 的「先纳管资料再消费」一致，MPG 线下卷已采用：

1. 上传 / 抽取 / 可选修复 → **待确认（临时库）**
2. 人工核对试卷详情 → **确认入库（正式库）**

导入页顶部 Alert 与导入对话框文案即为此流程；无需额外服务。

## 2. Open Notebook（HTTP 松耦合）

单独部署 Open Notebook（FastAPI 默认 `:5055`）。MPG 服务端在配置了 API Base 后，可在「导入线下试卷」对话框将**当前预览正文**以 `type: text` 提交到对方 `POST /api/sources/json`（与 Open Notebook 1.8.x 一致），便于在其侧做嵌入、检索与 Transformations。

| 环境变量 | 说明 |
|----------|------|
| `MPG_OPEN_NOTEBOOK_API_BASE_URL` | 例如 `http://127.0.0.1:5055`，无尾部路径 |
| `MPG_OPEN_NOTEBOOK_PASSWORD` | 可选；与对方 `OPEN_NOTEBOOK_PASSWORD` 一致时放在 `Authorization: Bearer …` |
| `MPG_OPEN_NOTEBOOK_NOTEBOOK_ID` | 可选；指定则写入该笔记本，否则为无笔记本挂靠的 Source |

未配置 `MPG_OPEN_NOTEBOOK_API_BASE_URL` 时，界面不显示「同步预览到 Open Notebook」。

## 3. HTTP 正文增强（组件级适配器）

你可自托管任意服务（例如用 Python `content-core` 抽 PDF/复杂版式），对外暴露单一 HTTP 接口，由 **MPG 服务端**在抽取合并完成后、AI 语义修复之前代为调用。

| 环境变量 | 说明 |
|----------|------|
| `MPG_PLAINTEXT_EXTRACT_URL` | POST 入口完整 URL |
| `MPG_PLAINTEXT_EXTRACT_TOKEN` | 可选；`Authorization: Bearer …` |

**请求**（JSON）：

```json
{
  "text": "<MPG 合并后的正文>",
  "source": "mpg-offline-import"
}
```

**响应**（JSON，二选一）：

```json
{ "text": "……" }
```

或 `{ "content": "……" }`。返回正文过短会被拒绝并保留本地抽取稿。

用户在对话框中勾选「抽取后 HTTP 正文增强」且**在本次选择文件前**勾选，下次上传时才会调用。

## 4. 能力探测

`getBackendCapabilities` 返回：

- `openNotebookIntegrationConfigured` — 是否配置了 `MPG_OPEN_NOTEBOOK_API_BASE_URL`
- `plaintextExtractServiceConfigured` — 是否配置了 `MPG_PLAINTEXT_EXTRACT_URL`

用于导入对话框是否展示可选区块。

## 5. 安全与合规

- MPG 仅向你配置的 URL 发送正文；请勿将密钥写入前端。
- Open Notebook 侧访问控制、数据留存与合规由该服务自行负责；MPG 不存储对方返回的侧信道数据（除成功提示中的来源 id）。
