#!/usr/bin/env bash
# 本机 GOT-OCR（MPS，Apple Silicon）。用法见 docs/architecture/got-ocr-m1-native.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVC="$ROOT/services/got-ocr-service"
MODEL_DIR="$ROOT/data/hf-models/GOT-OCR-2.0-hf"

if [[ ! -f "$MODEL_DIR/config.json" ]]; then
  echo "缺少本地权重，请先在仓库根执行: npm run got-ocr:download-model" >&2
  exit 1
fi

PY="${PYTHON312:-}"
if [[ -z "$PY" ]]; then
  for candidate in /opt/homebrew/bin/python3.12 /usr/local/bin/python3.12 python3.12; do
    if command -v "$candidate" >/dev/null 2>&1; then
      PY="$candidate"
      break
    fi
  done
fi
if [[ -z "$PY" ]]; then
  echo "未找到 python3.12。请: brew install python@3.12" >&2
  exit 1
fi

cd "$SVC"
if [[ ! -d .venv ]]; then
  echo "创建 venv ($PY)…"
  "$PY" -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate

if ! python -c "import torch" >/dev/null 2>&1; then
  echo "安装依赖（首次约 5–15 分钟）…"
  pip install -U pip setuptools wheel
  pip install -r requirements.txt
fi

python -c "import torch; assert torch.backends.mps.is_available(), 'MPS 不可用'" 2>/dev/null || {
  echo "警告: MPS 不可用，将退回 CPU；确认在 macOS 本机运行且 PyTorch 为 arm64 版。" >&2
}

export GOT_USE_GPU=true
export GOT_MODEL_LOCAL_DIR="$MODEL_DIR"
export EXAM_OCR_MAX_SIDE_PX="${EXAM_OCR_MAX_SIDE_PX:-1600}"

echo "启动 GOT-OCR @ http://127.0.0.1:8101 （GOT_USE_GPU=true）"
echo "自检: curl -s http://127.0.0.1:8101/v1/ocr/status"
exec uvicorn app.main:app --host 127.0.0.1 --port 8101
