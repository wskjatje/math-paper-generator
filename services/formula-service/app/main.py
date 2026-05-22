"""公式识别服务（Stub）。"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, File, UploadFile

app = FastAPI(title="zhixue-formula-service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "formula"}


@app.post("/v1/formula/from-image")
async def from_image(file: Optional[UploadFile] = File(None)) -> dict:
    size = 0
    if file:
        size = len(await file.read())
    return {
        "engine": "stub",
        "latex": "",
        "confidence": 0.0,
        "raw_boxes": [],
        "meta": {"upload_bytes": size, "hint": "接入 Pix2Text / VL 公式分支"},
    }


@app.post("/v1/formula/from-text-line")
async def from_text_line(payload: dict) -> dict:
    line = str(payload.get("text") or "")
    return {"engine": "stub", "latex": line, "confidence": 0.0}
