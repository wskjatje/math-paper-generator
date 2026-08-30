#!/usr/bin/env python3
"""
本仓库听力 TTS 旁路：OpenAI 兼容 POST /v1/audio/speech。
音色 = data/listening-tts/samples/<voice>.wav 声纹克隆（Chatterbox）。
语速 = 请求 speed，合成后用 ffmpeg atempo 调整（不臆造默认年级语速）。

资源策略：
- 启动时不预加载 Torch/Chatterbox（仅起 HTTP）；首次 /v1/audio/speech 再加载。
- 空闲超过 MPG_LISTENING_TTS_IDLE_UNLOAD_SEC（默认 600）卸载模型，释放内存/MPS。
"""

from __future__ import annotations

import os

# 必须在 import huggingface / chatterbox 之前设置（国内镜像）
if not (os.environ.get("HF_ENDPOINT") or "").strip():
    os.environ["HF_ENDPOINT"] = (os.environ.get("MPG_HF_ENDPOINT") or "https://hf-mirror.com").strip()

import gc
import io
import subprocess
import tempfile
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Optional

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SAMPLES = ROOT / "data" / "listening-tts" / "samples"
SAMPLES_DIR = Path(os.environ.get("MPG_LISTENING_TTS_SAMPLES", str(DEFAULT_SAMPLES))).expanduser()
HOST = os.environ.get("MPG_LISTENING_TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("MPG_LISTENING_TTS_PORT", "7778"))
FFMPEG = os.environ.get("MPG_FFMPEG_BIN", "ffmpeg")
MODEL_ID = "chatterbox"

# 0 = 禁用空闲卸载；默认 600 秒
_IDLE_UNLOAD_SEC = int(os.environ.get("MPG_LISTENING_TTS_IDLE_UNLOAD_SEC", "600") or "600")

_app = FastAPI(title="MPG Listening Clone TTS", version="1")
_model = None
_device = "cpu"
_torch = None
_last_used_monotonic = 0.0
_model_lock = threading.Lock()


def pick_device() -> str:
    forced = (os.environ.get("MPG_LISTENING_TTS_DEVICE") or "").strip().lower()
    if forced in ("cpu", "mps", "cuda"):
        return forced
    # 延迟 import torch，仅在探测设备时
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def unload_model(reason: str = "idle") -> None:
    global _model, _torch, _device
    with _model_lock:
        if _model is None:
            return
        print(f"[mpg-listening-tts] unload model ({reason})")
        _model = None
        _torch = None
        gc.collect()
        try:
            import torch

            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass


def load_model():
    global _model, _device, _torch, _last_used_monotonic
    with _model_lock:
        if _model is not None:
            _last_used_monotonic = time.monotonic()
            return _model

        import torch

        _torch = torch
        # perth 在缺 pkg_resources 时 PerthImplicitWatermarker=None，Chatterbox 会崩
        import perth
        from perth.dummy_watermarker import DummyWatermarker

        if getattr(perth, "PerthImplicitWatermarker", None) is None:
            perth.PerthImplicitWatermarker = DummyWatermarker
            print("[mpg-listening-tts] perth implicit watermark unavailable; using DummyWatermarker")

        from chatterbox.tts import ChatterboxTTS

        _device = pick_device()
        print(f"[mpg-listening-tts] loading Chatterbox on {_device}…")
        _model = ChatterboxTTS.from_pretrained(device=_device)
        _last_used_monotonic = time.monotonic()
        return _model


def _idle_watchdog() -> None:
    if _IDLE_UNLOAD_SEC <= 0:
        return
    while True:
        time.sleep(min(30, max(5, _IDLE_UNLOAD_SEC // 10)))
        if _model is None:
            continue
        idle_for = time.monotonic() - _last_used_monotonic
        if idle_for >= _IDLE_UNLOAD_SEC:
            unload_model(f"idle>={_IDLE_UNLOAD_SEC}s")


def resolve_voice_wav(voice: str) -> Path:
    name = (voice or "").strip()
    if not name or "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail=f"非法 voice: {voice!r}")
    # 允许 voice=narrator 或 voice=narrator.wav
    stem = name[:-4] if name.lower().endswith(".wav") else name
    path = SAMPLES_DIR / f"{stem}.wav"
    if not path.is_file():
        raise HTTPException(
            status_code=400,
            detail=(
                f"参考声不存在：{path}。"
                f"请将合规 wav 放入 {SAMPLES_DIR}，或设置 MPG_LISTENING_TTS_VOICE_PACK 后运行 npm run listening-tts:ensure"
            ),
        )
    return path


def wav_bytes_from_tensor(wav: Any, sr: int) -> bytes:
    import torch

    audio = wav.detach().cpu().numpy() if isinstance(wav, torch.Tensor) else np.asarray(wav)
    if audio.ndim > 1:
        audio = np.squeeze(audio)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def apply_speed_ffmpeg(wav_bytes: bytes, speed: float) -> bytes:
    """OpenAI speed：1.0 原速。用 atempo（ffmpeg 限制约 0.5–2.0，链式覆盖更宽）。"""
    if abs(speed - 1.0) < 1e-6:
        return wav_bytes
    if speed < 0.25 or speed > 4.0:
        raise HTTPException(status_code=400, detail="speed 须在 0.25–4.0")

    factors: list[float] = []
    remaining = float(speed)
    # atempo 单次约 [0.5, 2.0]
    while remaining > 2.0 + 1e-9:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5 - 1e-9:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    filt = ",".join(f"atempo={f:.6f}" for f in factors)

    with tempfile.TemporaryDirectory(prefix="mpg-tts-") as td:
        inp = Path(td) / "in.wav"
        out = Path(td) / "out.wav"
        inp.write_bytes(wav_bytes)
        cmd = [
            FFMPEG,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(inp),
            "-filter:a",
            filt,
            str(out),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except FileNotFoundError as e:
            raise HTTPException(status_code=500, detail=f"未找到 ffmpeg（{FFMPEG}）") from e
        except subprocess.CalledProcessError as e:
            err = (e.stderr or b"").decode("utf-8", errors="replace")[:400]
            raise HTTPException(status_code=500, detail=f"ffmpeg 调速失败：{err}") from e
        return out.read_bytes()


class SpeechRequest(BaseModel):
    model: Optional[str] = None
    input: str = Field(..., min_length=1)
    voice: str = Field(..., min_length=1)
    speed: float = 1.0
    response_format: str = "wav"
    # 可选：客户端若带 base64 参考声则优先写临时文件（与档案 referenceAudio 对齐）
    reference_audio: Optional[str] = None


@_app.get("/health")
def health() -> dict[str, Any]:
    samples = sorted(p.stem for p in SAMPLES_DIR.glob("*.wav")) if SAMPLES_DIR.is_dir() else []
    return {
        "ok": True,
        "service": "mpg-listening-clone-tts",
        "model": MODEL_ID,
        "device": pick_device() if _model is not None else os.environ.get("MPG_LISTENING_TTS_DEVICE") or "deferred",
        "modelLoaded": _model is not None,
        "idleUnloadSec": _IDLE_UNLOAD_SEC,
        "samplesDir": str(SAMPLES_DIR),
        "voices": samples,
    }


@_app.get("/v1/models")
def list_models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [{"id": MODEL_ID, "object": "model", "owned_by": "local"}],
    }


@_app.post("/v1/audio/speech")
def audio_speech(body: SpeechRequest) -> Response:
    import torch

    text = body.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="input 为空")
    fmt = (body.response_format or "wav").lower()
    if fmt not in ("wav", "pcm"):
        raise HTTPException(status_code=400, detail="本旁路仅支持 response_format=wav|pcm")

    prompt_path: Path
    tmp_ref: Optional[Path] = None
    try:
        if body.reference_audio and body.reference_audio.strip():
            raw = body.reference_audio.strip()
            if raw.startswith("data:") and "," in raw:
                raw = raw.split(",", 1)[1]
            import base64

            tmp_ref = Path(tempfile.mkstemp(suffix=".wav", prefix="mpg-ref-")[1])
            tmp_ref.write_bytes(base64.b64decode(raw))
            prompt_path = tmp_ref
        else:
            prompt_path = resolve_voice_wav(body.voice)

        model = load_model()
        with torch.inference_mode():
            wav = model.generate(text, audio_prompt_path=str(prompt_path))
        sr = int(getattr(model, "sr", 24000))
        wav_bytes = wav_bytes_from_tensor(wav, sr)
        wav_bytes = apply_speed_ffmpeg(wav_bytes, float(body.speed))

        if fmt == "pcm":
            # 去掉 WAV 头：用 soundfile 再读
            data, _ = sf.read(io.BytesIO(wav_bytes), dtype="int16")
            return Response(content=data.tobytes(), media_type="application/octet-stream")
        return Response(content=wav_bytes, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — 旁路需把引擎错误带回客户端
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"克隆合成失败：{type(e).__name__}: {e}",
        ) from e
    finally:
        if tmp_ref is not None:
            try:
                tmp_ref.unlink(missing_ok=True)
            except OSError:
                pass


def main() -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    print(
        f"[mpg-listening-tts] samples={SAMPLES_DIR} listen={HOST}:{PORT} "
        f"hf={os.environ.get('HF_ENDPOINT')} idleUnloadSec={_IDLE_UNLOAD_SEC} "
        f"(model loads on first /v1/audio/speech)"
    )
    if _IDLE_UNLOAD_SEC > 0:
        t = threading.Thread(target=_idle_watchdog, name="tts-idle-unload", daemon=True)
        t.start()
    # 先起 HTTP，再按需加载模型（避免预加载期间 /health 无响应）
    uvicorn.run(_app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
