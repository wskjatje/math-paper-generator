# GOT-OCR 2.0 微服务

基于 [Ucas-HaoranWei/GOT-OCR2.0](https://github.com/Ucas-HaoranWei/GOT-OCR2.0) 的 Hugging Face 权重 `stepfun-ai/GOT-OCR-2.0-hf`，对外暴露与旧 `ocr-service` 相同的 `POST /v1/ocr/image` JSON 契约。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `GOT_MODEL_ID` | `stepfun-ai/GOT-OCR-2.0-hf` | HF 模型 id |
| `GOT_USE_GPU` | `false` | CUDA/MPS |
| `GOT_MAX_NEW_TOKENS` | `4096` | 生成长度上限 |
| `GOT_FORMAT_OUTPUT` | `true` | 公式/版式友好输出 |
| `HEURISTIC_DIAGRAM_ENABLED` | `true` | 右栏示意图 bbox（启发式） |
| `HF_ENDPOINT` | `https://hf-mirror.com` | Hub 镜像（compose 默认） |
| `HF_HUB_DOWNLOAD_TIMEOUT` | `1800` | 单文件下载超时（秒） |
| `GOT_MODEL_LOCAL_DIR` | — | 本地权重目录（含 `config.json` 时优先） |

## 国内网络：宿主机预下载（推荐）

容器内拉 HF 常 `ConnectTimeout`，日志表现为 `Can't load tokenizer`。在**仓库根**：

```bash
npm run got-ocr:download-model
npm run docker:api:detach
curl -s http://127.0.0.1:8101/v1/ocr/status   # pipeline_ready: true
```

权重落在 `data/hf-models/GOT-OCR-2.0-hf/`，compose 已挂载到容器 `/models/got-ocr`。

HF 镜像若报 `Distant resource does not seem to be on huggingface.co`，改用 ModelScope：

```bash
GOT_OCR_DOWNLOAD_SOURCE=modelscope npm run got-ocr:download-model
```

## Docker 构建（国内网络）

若 `pip install` 报 `pypi.org` SSL / `JSONDecodeError`，镜像已默认使用清华源。可显式重建：

```bash
docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.api-only.yml \
  build --no-cache ocr-service \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  --build-arg PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn
```

备选镜像：`https://mirrors.aliyun.com/pypi/simple/`（`PIP_TRUSTED_HOST=mirrors.aliyun.com`）。

## 注意

- **首次启动**会从 Hugging Face 下载约 1GB+ 权重，请预留磁盘与网络；建议先 `POST /v1/ocr/warmup`。
- **CPU** 推理较慢（单页可能数分钟）；有 GPU 时设 `GOT_USE_GPU=true`。
- 示意图为右栏连通域启发式框，非训练检测器。
