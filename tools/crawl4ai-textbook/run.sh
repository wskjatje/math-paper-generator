#!/usr/bin/env bash
# 运行 Crawl4AI 课本目录采集 → data/grade-fills/crawl4ai-out/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/tools/crawl4ai-textbook"
PY="$DIR/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "未找到 $PY。请先：npm run textbook-directory:crawl4ai:setup" >&2
  exit 1
fi
exec "$PY" "$DIR/crawl_toc.py" --jobs "${CRAWL4AI_JOBS:-$DIR/jobs.json}" --out "${CRAWL4AI_OUT:-$ROOT/data/grade-fills/crawl4ai-out}" "$@"
