"""GOT-OCR 2.0 推理（transformers / stepfun-ai/GOT-OCR-2.0-hf）。"""

from __future__ import annotations

import io
import logging
import os
import threading
from pathlib import Path
from typing import Any

from PIL import Image

logger = logging.getLogger(__name__)

_load_lock = threading.Lock()


def resolve_got_pretrained_source(model_id: str, model_local_dir: str | None) -> str:
    if model_local_dir:
        local = Path(model_local_dir)
        if (local / "config.json").is_file():
            logger.info("GOT-OCR 使用本地权重目录: %s", local)
            return str(local.resolve())
        logger.warning(
            "GOT_MODEL_LOCAL_DIR=%s 无 config.json，回退 Hub 模型 %s",
            model_local_dir,
            model_id,
        )
    return model_id


class GotOcrEngine:
    def __init__(
        self,
        model_id: str,
        *,
        model_local_dir: str | None = None,
        use_gpu: bool = False,
        max_new_tokens: int = 4096,
    ) -> None:
        self.model_id = model_id
        self.pretrained_source = resolve_got_pretrained_source(model_id, model_local_dir)
        self.use_gpu = use_gpu
        self.max_new_tokens = max(256, min(8192, int(max_new_tokens)))
        self._model: Any = None
        self._processor: Any = None
        self._device: str = "cpu"
        self._load_error: str | None = None
        self._load_in_progress = False

    @property
    def ready(self) -> bool:
        return self._model is not None and self._processor is not None

    @property
    def load_in_progress(self) -> bool:
        return self._load_in_progress

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def device(self) -> str:
        return self._device

    def warmup(self) -> None:
        self._ensure_loaded()

    def _resolve_device(self) -> str:
        import torch

        if self.use_gpu and torch.cuda.is_available():
            return "cuda"
        if self.use_gpu and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with _load_lock:
            if self._model is not None:
                return
            self._load_in_progress = True
            try:
                import torch
                from transformers import AutoModelForImageTextToText, AutoProcessor

                self._device = self._resolve_device()
                dtype = torch.float16 if self._device in ("cuda", "mps") else torch.float32
                use_local_dir = Path(self.pretrained_source).is_dir()
                if use_local_dir:
                    os.environ["TRANSFORMERS_OFFLINE"] = "1"
                    os.environ["HF_HUB_OFFLINE"] = "1"
                    logger.info(
                        "Loading GOT-OCR from local project mount %s (offline, no Hub)",
                        self.pretrained_source,
                    )
                else:
                    hf_endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co")
                    logger.info(
                        "Loading GOT-OCR %s on %s (HF_ENDPOINT=%s)",
                        self.pretrained_source,
                        self._device,
                        hf_endpoint,
                    )

                proc_hub: dict[str, Any] = {"local_files_only": use_local_dir}
                if not use_local_dir:
                    proc_hub["resume_download"] = True
                last_proc_err: Exception | None = None
                for use_fast in (True, False):
                    try:
                        self._processor = AutoProcessor.from_pretrained(
                            self.pretrained_source,
                            use_fast=use_fast,
                            **proc_hub,
                        )
                        last_proc_err = None
                        break
                    except Exception as pe:
                        last_proc_err = pe
                        self._processor = None
                if last_proc_err is not None:
                    raise last_proc_err

                # 禁止 load 后再 .to()：HF GOT 权重含 meta tensor，会触发 NotImplementedError
                # 勿把 resume_download 传给 model.from_pretrained（会误入 __init__ 导致 TypeError）
                model_kwargs: dict[str, Any] = {
                    "torch_dtype": dtype,
                    "local_files_only": use_local_dir,
                }
                if self._device == "cuda":
                    model_kwargs["device_map"] = "auto"
                else:
                    model_kwargs["device_map"] = self._device

                self._model = AutoModelForImageTextToText.from_pretrained(
                    self.pretrained_source,
                    **model_kwargs,
                )
                self._model.eval()
                self._load_error = None
                logger.info("GOT-OCR model loaded on %s", self._device)
            except Exception as e:
                self._load_error = _format_load_error(
                    e, self.model_id, self.pretrained_source
                )
                logger.exception("GOT-OCR load failed")
                self._model = None
                self._processor = None
            finally:
                self._load_in_progress = False

    def recognize(self, image_bytes: bytes, *, format_output: bool = True) -> str:
        self._ensure_loaded()
        if not self.ready:
            raise RuntimeError(self._load_error or "GOT-OCR 模型未加载")

        import torch

        pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        def _run_once(*, use_format: bool) -> str:
            proc_kwargs: dict[str, Any] = {"return_tensors": "pt"}
            if use_format:
                proc_kwargs["format"] = True
            inputs = self._processor(pil, **proc_kwargs)
            inputs = {
                k: v.to(self._device) if hasattr(v, "to") else v for k, v in inputs.items()
            }

            gen_kwargs: dict[str, Any] = {
                "do_sample": False,
                "max_new_tokens": self.max_new_tokens,
            }
            tokenizer = getattr(self._processor, "tokenizer", None)
            if tokenizer is not None:
                gen_kwargs["tokenizer"] = tokenizer

            with torch.inference_mode():
                try:
                    generate_ids = self._model.generate(**inputs, **gen_kwargs)
                except TypeError:
                    generate_ids = self._model.generate(
                        **inputs,
                        max_new_tokens=self.max_new_tokens,
                    )

            in_len = inputs["input_ids"].shape[1]
            return str(
                self._processor.decode(
                    generate_ids[0, in_len:],
                    skip_special_tokens=True,
                )
                or ""
            ).strip()

        text = _run_once(use_format=format_output)
        if text:
            return text
        if format_output:
            return _run_once(use_format=False)
        return ""


def _format_load_error(
    exc: BaseException, model_id: str, pretrained_source: str
) -> str:
    msg = f"{type(exc).__name__}: {exc}"
    low = msg.lower()
    if "connecttimeout" in low or "timed out" in low:
        return (
            f"{msg} — 容器无法从 Hugging Face 拉取权重。"
            "请在宿主机执行: npm run got-ocr:download-model，"
            "然后 npm run docker:api:detach 重建 ocr-service（会挂载 data/hf-models/GOT-OCR-2.0-hf）。"
            "或确认 compose 中 HF_ENDPOINT=https://hf-mirror.com 且网络可达。"
        )
    if "can't load tokenizer" in low or "preprocessor_config" in low:
        return (
            f"{msg} — 权重未下全。请 docker volume rm docker_zhixue_hf_cache 后，"
            "在宿主机 npm run got-ocr:download-model，再重建 ocr-service。"
        )
    if pretrained_source != model_id and "no such file" in low:
        return f"{msg} — 本地目录 {pretrained_source} 不完整。"
    return msg
