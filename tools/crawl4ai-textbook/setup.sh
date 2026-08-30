#!/usr/bin/env bash
# 安装 Crawl4AI 到 tools/crawl4ai-textbook/.venv
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/tools/crawl4ai-textbook"
cd "$DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "需要 python3" >&2
  exit 1
fi

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -U -r requirements.txt
if command -v crawl4ai-setup >/dev/null 2>&1; then
  crawl4ai-setup || python -m playwright install chromium
else
  python -m playwright install chromium
fi
echo "Crawl4AI 已安装：$DIR/.venv"
echo "下一步：编辑 jobs.json（enabled=true + 授权目录 URL）后执行："
echo "  npm run textbook-directory:crawl4ai"
