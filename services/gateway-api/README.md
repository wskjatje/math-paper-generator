# gateway-api（API 网关）

## 职责

- `GET /health`、`GET /v1/ready` — 自身与各 Stub 服务存活探测（及对 Web 上游可选探测）
- `ANY /api/v1/{ocr|formula|vision|agent|questions}/...` — 反向代理至对应微服务（路径改写为 `/v1/...`）
- 中间件：若配置 `WEB_UPSTREAM_URL`，则将其余浏览器路径反代至 TanStack Web（跳过 `/api`、`/health`、`/v1/ready`、`/openapi.json`、`/docs`、`/redoc`）

## 本地运行

```bash
cd services/gateway-api
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export OCR_SERVICE_URL=http://127.0.0.1:8101
export WEB_UPSTREAM_URL=http://127.0.0.1:8080   # 可选
uvicorn app.main:app --reload --port 8090
```

## Docker

```bash
docker build -t zhixue/gateway:latest services/gateway-api
```

契约样例见仓库根 `shared/contracts/v1/`。
