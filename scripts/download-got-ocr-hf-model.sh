#!/usr/bin/env bash
# 在宿主机下载 GOT-OCR 2.0 到 data/hf-models/GOT-OCR-2.0-hf（供 Docker 离线挂载）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEST="${ROOT}/data/hf-models/GOT-OCR-2.0-hf"
export GOT_MODEL_ID="${GOT_MODEL_ID:-stepfun-ai/GOT-OCR-2.0-hf}"
export MODELSCOPE_MODEL_ID="${MODELSCOPE_MODEL_ID:-StepFun/GOT-OCR-2.0-hf}"
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-1800}"
export GOT_OCR_DOWNLOAD_SOURCE="${GOT_OCR_DOWNLOAD_SOURCE:-auto}"

echo "==> GOT-OCR 权重 -> ${DEST}"
echo "    来源: ${GOT_OCR_DOWNLOAD_SOURCE} (auto = 先 HF 镜像，失败再 ModelScope)"
echo "    HF_ENDPOINT=${HF_ENDPOINT}"
echo "    （约 1GB+）"

# 优先用 Homebrew / 较新 Python（系统 3.9 + 旧 pip 易触发 Hub 元数据错误）
PY=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done
if [[ -z "$PY" ]]; then
  echo "未找到 python3" >&2
  exit 1
fi
echo "    Python: $($PY --version 2>&1)"

exec "$PY" "${ROOT}/scripts/download_got_ocr_hf_model.py"
