#!/usr/bin/env bash
# 单终端：本机 GOT-OCR（MPS）后台 + docker 网关（mps）+ Vite 前台。
# Ctrl+C 会停 Vite 并结束后台 OCR。日志：.got-ocr-native.log
#
# Docker：仅当 :8090 网关未就绪时才 compose up（默认不 --build，不反复重建容器）。
# 需重建镜像时请手动：npm run docker:api:mps
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/.got-ocr-native.pid"
LOG_FILE="$ROOT/.got-ocr-native.log"
OCR_STATUS_URL="http://127.0.0.1:8101/v1/ocr/status"
OCR_WARMUP_URL="http://127.0.0.1:8101/v1/ocr/warmup"
GATEWAY_READY_URL="http://127.0.0.1:8090/v1/ready"

COMPOSE=(docker compose
  -f "$ROOT/infrastructure/docker/docker-compose.yml"
  -f "$ROOT/infrastructure/docker/docker-compose.api-only.yml"
  -f "$ROOT/infrastructure/docker/docker-compose.m1-mps.yml"
)

ocr_ready() {
  curl -sf "$OCR_STATUS_URL" 2>/dev/null | grep -q '"pipeline_ready":\s*true'
}

gateway_ready() {
  curl -sf "$GATEWAY_READY_URL" 2>/dev/null | grep -qE '"ocr"\s*:\s*true'
}

stop_managed_ocr() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

cleanup() {
  echo ""
  echo "正在停止本机 GOT-OCR…"
  stop_managed_ocr
}
trap cleanup EXIT INT TERM

cd "$ROOT"

if ocr_ready; then
  echo "==> 本机 OCR 已在 :8101 就绪，跳过启动"
else
  echo "==> 停止 Docker ocr-service（避免占用 8101）"
  docker stop docker-ocr-service-1 2>/dev/null || true
  stop_managed_ocr
  if lsof -ti :8101 >/dev/null 2>&1; then
    echo "==> 释放 8101 端口…"
    lsof -ti :8101 | xargs kill 2>/dev/null || true
    sleep 1
  fi
  echo "==> 后台启动本机 GOT-OCR（MPS），日志: $LOG_FILE"
  nohup bash "$ROOT/scripts/run-got-ocr-native-mps.sh" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  echo "==> 等待 :8101 进程启动…"
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:8101/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "==> 预热模型（M1 Max 首次约 30s–2 分钟，请稍候）…"
  curl -sf -X POST "$OCR_WARMUP_URL" >/dev/null || {
    echo "无法 POST /v1/ocr/warmup，请查看: tail -f $LOG_FILE" >&2
    exit 1
  }
  for i in $(seq 1 72); do
    if ocr_ready; then
      break
    fi
    sleep 5
    if (( i % 3 == 0 )); then
      loading="$(curl -sf "$OCR_STATUS_URL" 2>/dev/null | grep -o '"loading":[^,]*' || true)"
      echo "    …仍在加载 ($((i * 5))s) ${loading:-}"
    fi
  done
  if ! ocr_ready; then
    echo "本机 OCR 未在 5 分钟内就绪。请查看: tail -f $LOG_FILE" >&2
    exit 1
  fi
  device="$(curl -sf "$OCR_STATUS_URL" | sed -n 's/.*"device":"\([^"]*\)".*/\1/p')"
  echo "==> 本机 OCR 就绪 (device=${device:-?})"
fi

node scripts/first-run-env.mjs

if gateway_ready; then
  echo "==> API 网关 (:8090) 已在运行，跳过 docker compose（需重建时请手动 npm run docker:api:mps）"
else
  npm run docker:ensure --silent 2>/dev/null || npm run docker:ensure
  echo "==> 启动 API 栈（mps 叠加，不 --build；指向 host.docker.internal:8101）"
  "${COMPOSE[@]}" up -d
  for i in $(seq 1 30); do
    if gateway_ready; then
      break
    fi
    sleep 2
  done
  if ! gateway_ready; then
    echo "网关 :8090 未在 60s 内就绪，请检查: docker compose … ps" >&2
    exit 1
  fi
fi

echo ""
echo "=========================================="
echo "  浏览器: http://localhost:8080"
echo "  网关 OCR: 本机 MPS :8101"
echo "  按 Ctrl+C 停止 Vite 与本机 OCR"
echo "=========================================="
echo ""

export MPG_GATEWAY_URL=http://127.0.0.1:8080
npm run dev -w @zhixue/web
