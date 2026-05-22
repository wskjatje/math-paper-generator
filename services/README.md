# services（后端微服务）

| 目录 | 端口（Compose） | 说明 |
|------|-----------------|------|
| `gateway-api` | 8090 | API 聚合 + 可选 Web 反代 |
| `got-ocr-service` | 8101 | **GOT-OCR 2.0**（Compose 服务名仍为 `ocr-service`） |
| `formula-service` | 8102 | 公式 Stub |
| `vision-service` | 8103 | 几何视觉 Stub |
| `agent-service` | 8104 | Agent Stub |
| `question-parser-service` | 8105 | 题目解析 Stub |

对外统一前缀（经网关）：`/api/v1/<ocr|formula|vision|agent|questions>/...`

构建镜像：`docker build -t zhixue/got-ocr:latest services/got-ocr-service`
