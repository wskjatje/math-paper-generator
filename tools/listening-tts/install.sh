#!/usr/bin/env bash
# 安装本仓库听力声纹克隆旁路（Chatterbox）。镜像 document-parser：可换机重跑。
set -euo pipefail
cd "$(dirname "$0")"

pick_python() {
  local c
  for c in \
    "${MPG_LISTENING_TTS_PYTHON:-}" \
    python3.12 \
    python3.11 \
    python3.10 \
    /opt/homebrew/bin/python3.12 \
    /opt/homebrew/bin/python3.11 \
    /usr/local/bin/python3.12 \
    /usr/local/bin/python3.11
  do
    [[ -z "$c" ]] && continue
    if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then
      local bin
      bin="$(command -v "$c" 2>/dev/null || echo "$c")"
      local ver
      ver="$("$bin" -c 'import sys; print("%d.%d"%sys.version_info[:2])' 2>/dev/null || true)"
      case "$ver" in
        3.1[0-9]|3.[2-9][0-9]) echo "$bin"; return 0 ;;
      esac
    fi
  done
  return 1
}

PY="$(pick_python || true)"
if [[ -z "${PY}" ]]; then
  echo "未找到 Python 3.10+。" >&2
  echo "macOS 请先安装：brew install python@3.12" >&2
  echo "或设置：MPG_LISTENING_TTS_PYTHON=/path/to/python3.12" >&2
  exit 1
fi

echo "使用解释器: $PY ($("$PY" --version 2>&1))"

if [[ -d .venv ]]; then
  old="$(".venv/bin/python" -c 'import sys; print("%d.%d"%sys.version_info[:2])' 2>/dev/null || echo "0.0")"
  case "$old" in
    3.1[0-9]|3.[2-9][0-9]) echo "复用已有 .venv (Python $old)" ;;
    *)
      echo "删除基于 Python $old 的旧 .venv…"
      rm -rf .venv
      ;;
  esac
fi

if [[ ! -d .venv ]]; then
  "$PY" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -U pip setuptools wheel

# Apple Silicon：先装带 MPS 的 torch，再装其余（避免被 chatterbox 依赖拉乱）
if [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
  echo "安装 PyTorch（macOS arm64）…"
  python -m pip install torch torchaudio
fi

python -m pip install -r requirements.txt
# perth 水印依赖 pkg_resources（setuptools）；缺失会导致 PerthImplicitWatermarker=None
python -m pip install -U "setuptools>=70"
if ! command -v ffmpeg >/dev/null 2>&1 && [[ -z "${MPG_FFMPEG_BIN:-}" ]]; then
  echo "警告：未在 PATH 中找到 ffmpeg。合成调速需要 ffmpeg（brew install ffmpeg）。" >&2
fi

echo ""
echo "安装完成。启动：npm run listening-tts"
echo "健康检查：curl -s http://127.0.0.1:7778/health"
echo "首次换机请再执行：npm run listening-tts:ensure"
