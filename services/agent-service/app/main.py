"""Agent 编排服务（Stub）。"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="zhixue-agent-service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent"}


@app.post("/v1/agent/tasks")
async def run_task(payload: dict) -> dict:
    task = str(payload.get("task") or "unknown")
    return {
        "ok": True,
        "task": task,
        "messages": [
            {"role": "assistant", "content": "[stub] 后续接入 DeepSeek-R1 / 工具链 / 记忆表"},
        ],
        "tool_calls": [],
        "meta": {},
    }
