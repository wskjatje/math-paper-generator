#!/usr/bin/env bash
# 安装 Docling Sidecar 依赖。优先 Homebrew Python ≥3.10（系统 3.9 在新 macOS SDK 上编不过 pyobjc）。
set -euo pipefail
cd "$(dirname "$0")"

pick_python() {
  local c
  for c in \
    "${MPG_DOC_PARSER_PYTHON:-}" \
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
  echo "或设置：MPG_DOC_PARSER_PYTHON=/path/to/python3.12" >&2
  echo "（系统 /usr/bin/python3 多为 3.9，在新 Xcode SDK 上无法编译 Docling 依赖 pyobjc-core）" >&2
  exit 1
fi

echo "使用解释器: $PY ($("$PY" --version 2>&1))"

if [[ -d .venv ]]; then
  # 若现有 venv 基于过旧 Python，重建
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
python -m pip install -r requirements.txt

echo ""
echo "安装完成。启动：npm run doc-parser"
echo "健康检查：curl -s http://127.0.0.1:8765/health"
