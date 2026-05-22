# GOT-OCR 本机 MPS（Apple Silicon）

Docker 内 `ocr-service` 为 Linux CPU，无法用 Metal。M1/M1 Max 等应在 **macOS 宿主** 运行 `services/got-ocr-service` 并设 `GOT_USE_GPU=true`。

## 前提

- Python 3.12：`brew install python@3.12`（常见路径 `/opt/homebrew/bin/python3.12`）
- 权重：`npm run got-ocr:download-model` → `data/hf-models/GOT-OCR-2.0-hf/`

## 日常开发

### 单终端（推荐）

```bash
npm run dev:host:mps
```

自动：按需停 Docker OCR → 后台本机 MPS :8101 → **仅当 :8090 未就绪时** `docker compose up -d`（不 `--build`）→ 前台 Vite。**Ctrl+C** 会同时停 Vite 与本机 OCR。日志：`.got-ocr-native.log`。

重复执行 `dev:host:mps` 不会反复重建 Docker；需改镜像或强制重启栈时请手动 `npm run docker:api:mps`（含 `--build`）或 `docker compose … down` 后再 up。

### 双终端（手动）

**终端 A — 本机 OCR**

```bash
npm run got-ocr:native
```

等待 `curl -s http://127.0.0.1:8101/v1/ocr/status` 中 `pipeline_ready: true` 且 `device: "mps"`。

**终端 B — 网关 + 前端**

```bash
npm run docker:api:mps
MPG_GATEWAY_URL=http://127.0.0.1:8080 npm run dev -w @zhixue/web
```

浏览器 `http://localhost:8080`，设置里网关 `http://127.0.0.1:8080`。

`docker:api:mps` 不会启动容器内 `ocr-service`（避免与 :8101 冲突），网关经 `host.docker.internal:8101` 访问本机 MPS。

## 仅首次：手动建 venv

```bash
cd services/got-ocr-service
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install -U pip && pip install -r requirements.txt
```

之后 `npm run got-ocr:native` 会复用 `.venv`。

## 预期耗时（参考）

| 方式 | 单张竖拍卷 |
|------|------------|
| Docker CPU | 约 10–20 分钟 |
| 本机 MPS（M1 Max） | 约 30 秒–2 分钟 |

## 排错

- `Address already in use :8101`：`docker stop docker-ocr-service-1` 或停掉其它占用 8101 的进程。
- `device: cpu`：未设 `GOT_USE_GPU` 或不在 macOS 本机运行。
- 导入仍显示「CPU 单页约 2–10 分钟」：文案未区分 MPS；以 `/v1/ocr/status` 的 `device` 为准。
