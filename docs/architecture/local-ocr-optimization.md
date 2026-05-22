# 本地 OCR（GOT-OCR 2.0）

## 链路

```
拍照/PDF → 网关 :8090 → got-ocr-service（GOT-OCR 2.0）→ 前端规则纠错 → 预览
```

权重：[Ucas-HaoranWei/GOT-OCR2.0](https://github.com/Ucas-HaoranWei/GOT-OCR2.0) → HF `stepfun-ai/GOT-OCR-2.0-hf`。

**规则层保留**（与引擎无关）：`ocrGenericExamPatterns`、`offlineExamCoordinateOcrNormalize`、`offlineExamOcrNormalize`、`educationSymbolLexicon`、`gatewayOcrPlainTextPick` 等。

## Docker 配置

```bash
npm run docker:api:detach
```

构建 `ocr-service` 若遇 PyPI SSL 失败，见 `services/got-ocr-service/README.md`（默认清华 pip 源）。

| 变量 | 默认 | 作用 |
|------|------|------|
| `GOT_MODEL_ID` | `stepfun-ai/GOT-OCR-2.0-hf` | HF 模型 |
| `GOT_USE_GPU` | `false` | CUDA/MPS |
| `GOT_MAX_NEW_TOKENS` | `4096` | 输出长度 |
| `GOT_FORMAT_OUTPUT` | `true` | 公式/版式友好输出 |

模型缓存卷 `zhixue_hf_cache`。有 GPU 时设 `GOT_USE_GPU=true`。

**Apple Silicon（M1/M2/M3）**：Docker 内无法使用 MPS，须在 macOS 本机跑 OCR。见 [got-ocr-m1-native.md](./got-ocr-m1-native.md)（`npm run got-ocr:native` + `npm run docker:api:mps`）。

## 项目内离线权重（推荐，避免容器内联网）

一次性在宿主机下载到仓库目录（约 1GB+，已 `.gitignore`，勿提交 Git）：

```bash
npm run got-ocr:download-model
# → data/hf-models/GOT-OCR-2.0-hf/（含 config.json、tokenizer、权重分片）
npm run docker:api:detach
```

HF 镜像失败时（`FileMetadataError` / `not on huggingface.co`）：

```bash
GOT_OCR_DOWNLOAD_SOURCE=modelscope npm run got-ocr:download-model
```

`docker-compose` 将该目录只读挂载为容器内 `/models/got-ocr`；检测到 `config.json` 后 **仅读本地、不再访问 Hugging Face**（`TRANSFORMERS_OFFLINE=1`）。

换机或重装：复制整个 `data/hf-models/GOT-OCR-2.0-hf/` 目录即可，无需重新下载。

## 导入操作

1. 硬刷新前端，打开导入对话框等「GOT-OCR 已预热」
2. 网关 `http://localhost:8090` 或 dev 下 `http://127.0.0.1:8080`
3. 勿依赖浏览器 Tesseract（已移除）；图片仅走网关

## 自检

```bash
curl -s http://127.0.0.1:8090/v1/ready
curl -s -X POST http://127.0.0.1:8090/api/v1/ocr/warmup
```
