"""几何 / 通用视觉服务（Stub）。"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, UploadFile

app = FastAPI(title="zhixue-vision-service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vision"}


@app.post("/v1/vision/geometry")
async def geometry(file: Optional[UploadFile] = File(None)) -> dict:
    size = 0
    if file:
        size = len(await file.read())
    return {
        "engine": "stub",
        "shapes": [],
        "relations": [],
        "meta": {"upload_bytes": size, "hint": "接入 YOLOv8 / Qwen-VL 结构化输出"},
    }
