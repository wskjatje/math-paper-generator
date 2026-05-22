"""GOT-OCR 2.0 微服务：与网关契约一致的 /v1/ocr/image。"""

from __future__ import annotations

import os
import threading
from typing import Optional

from fastapi import FastAPI, File, UploadFile

from app.config import Settings
from app.got_engine import GotOcrEngine
from app.pipeline import GotOcrPipeline
from app.schemas import OcrResponse

settings = Settings()
if settings.hf_home:
    os.environ.setdefault("HF_HOME", settings.hf_home)
if settings.hf_endpoint:
    os.environ.setdefault("HF_ENDPOINT", settings.hf_endpoint)
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", str(settings.hf_hub_download_timeout))
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", str(settings.hf_hub_etag_timeout))

_engine = GotOcrEngine(
    settings.got_model_id,
    model_local_dir=settings.got_model_local_dir,
    use_gpu=settings.got_use_gpu,
    max_new_tokens=settings.got_max_new_tokens,
)
_pipeline: GotOcrPipeline | None = None
_pipeline_error: str | None = None
_warmup_lock = threading.Lock()
_warmup_thread: threading.Thread | None = None


def get_pipeline() -> GotOcrPipeline | None:
    global _pipeline, _pipeline_error
    if _pipeline is not None:
        return _pipeline
    try:
        _engine.warmup()
        if not _engine.ready:
            _pipeline_error = _engine.load_error or "GOT-OCR 模型加载失败"
            _pipeline = None
            return None
        _pipeline = GotOcrPipeline(
            _engine,
            format_output=settings.got_format_output,
            heuristic_diagram_enabled=settings.heuristic_diagram_enabled,
            heuristic_diagram_right_ratio=settings.heuristic_diagram_right_ratio,
            exam_ocr_max_side_px=settings.exam_ocr_max_side_px,
        )
        _pipeline_error = None
    except Exception as e:
        _pipeline_error = str(e)
        _pipeline = None
    return _pipeline


def start_pipeline_warmup_background() -> bool:
    """后台加载模型，避免单 worker 阻塞 /status 与网关探活。"""
    global _warmup_thread
    if _engine.ready:
        return False
    if _engine.load_in_progress:
        return False
    with _warmup_lock:
        if _warmup_thread is not None and _warmup_thread.is_alive():
            return False

        def _run() -> None:
            get_pipeline()

        _warmup_thread = threading.Thread(target=_run, name="got-ocr-warmup", daemon=True)
        _warmup_thread.start()
        return True


app = FastAPI(title="zhixue-got-ocr-service", version="1.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": settings.service_name, "engine": "got-ocr2"}


def _pipeline_status_payload(*, trigger_load: bool = False) -> dict:
    """轻量 status 不触发加载；warmup / image 才 trigger_load。"""
    if trigger_load:
        get_pipeline()
    ready = _pipeline is not None and _engine.ready
    loading = _engine.load_in_progress
    err = None
    if not ready and not loading:
        err = _pipeline_error or _engine.load_error or "GOT-OCR 未就绪"
    return {
        "pipeline_ready": ready,
        "loading": loading,
        "model_id": settings.got_model_id,
        "error": err,
        "profile": "got-ocr2",
        "device": _engine.device if _engine.ready else None,
    }


@app.get("/v1/ocr/status")
def ocr_status() -> dict:
    return _pipeline_status_payload(trigger_load=False)


@app.post("/v1/ocr/warmup")
def ocr_warmup() -> dict:
    start_pipeline_warmup_background()
    return _pipeline_status_payload(trigger_load=False)


@app.post("/v1/ocr/image")
async def ocr_image(file: Optional[UploadFile] = File(None)) -> OcrResponse:
    if not file:
        return OcrResponse(
            engine="got-ocr2",
            text="",
            blocks=[],
            reading_order=[],
            questions=[],
            diagram_links=[],
            layout={},
            meta={"upload_bytes": 0, "warning": "未提供文件"},
        )

    pipeline = get_pipeline()
    raw = await file.read()
    if pipeline is None:
        return OcrResponse(
            engine="got-ocr2",
            text="",
            blocks=[],
            reading_order=[],
            questions=[],
            diagram_links=[],
            layout={},
            meta={
                "upload_bytes": len(raw),
                "error": _pipeline_error or _engine.load_error or "GOT-OCR 流水线未初始化",
                "model_id": settings.got_model_id,
            },
        )

    try:
        result = pipeline.run(raw)
    except Exception as e:
        return OcrResponse(
            engine="got-ocr2",
            text="",
            blocks=[],
            reading_order=[],
            questions=[],
            diagram_links=[],
            layout={},
            meta={
                "upload_bytes": len(raw),
                "filename": file.filename or "",
                "error": str(e),
                "model_id": settings.got_model_id,
            },
        )

    return OcrResponse(
        engine="got-ocr2",
        text=result["text"],
        blocks=result["blocks"],
        reading_order=result["reading_order"],
        questions=result["questions"],
        diagram_links=result.get("diagram_links") or [],
        layout=result["layout"],
        meta={
            "upload_bytes": len(raw),
            "filename": file.filename or "",
            "stack": ["GOT-OCR2.0", "transformers", "FastAPI"],
            "model_id": settings.got_model_id,
            "format_output": settings.got_format_output,
        },
    )
