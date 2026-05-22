#!/usr/bin/env python3
"""将 GOT-OCR 2.0 权重下载到 data/hf-models/GOT-OCR-2.0-hf（供 Docker 离线挂载）。"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_config(dest: Path) -> bool:
    return (dest / "config.json").is_file()


def _pip_install(*packages: str) -> None:
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", *packages],
        stdout=subprocess.DEVNULL,
    )


def download_via_hf_mirror(dest: Path, repo_id: str, endpoint: str) -> None:
    try:
        from huggingface_hub import HfApi
    except ImportError:
        _pip_install("huggingface_hub>=0.26.0")
        from huggingface_hub import HfApi

    endpoint = endpoint.rstrip("/")
    os.environ["HF_ENDPOINT"] = endpoint
    os.environ["HUGGINGFACE_HUB_ENDPOINT"] = endpoint

    print(f"HF 镜像: {repo_id}")
    print(f"  endpoint={endpoint}")
    print(f"  -> {dest}")

    api = HfApi(endpoint=endpoint)
    api.snapshot_download(repo_id=repo_id, local_dir=str(dest))


def download_via_modelscope(dest: Path, model_id: str) -> None:
    try:
        from modelscope.hub.snapshot_download import snapshot_download
    except ImportError:
        _pip_install("modelscope")
        from modelscope.hub.snapshot_download import snapshot_download

    print(f"ModelScope: {model_id}")
    print(f"  -> {dest}")

    if dest.exists() and any(dest.iterdir()):
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)

    out = snapshot_download(model_id, local_dir=str(dest))
    out_path = Path(out)
    if out_path.resolve() != dest.resolve() and _ensure_config(out_path):
        shutil.copytree(out_path, dest, dirs_exist_ok=True)


def main() -> int:
    root = _repo_root()
    dest = Path(os.environ.get("DEST", root / "data/hf-models/GOT-OCR-2.0-hf"))
    hf_repo = os.environ.get("GOT_MODEL_ID", "stepfun-ai/GOT-OCR-2.0-hf")
    ms_repo = os.environ.get("MODELSCOPE_MODEL_ID", "StepFun/GOT-OCR-2.0-hf")
    source = os.environ.get("GOT_OCR_DOWNLOAD_SOURCE", "auto").strip().lower()
    endpoint = os.environ.get("HF_ENDPOINT", "https://hf-mirror.com")

    dest.mkdir(parents=True, exist_ok=True)
    if _ensure_config(dest):
        print(f"已存在完整权重: {dest / 'config.json'}，跳过下载。")
        return 0

    errors: list[str] = []
    tried: list[str] = []

    if source in ("hf", "huggingface", "auto"):
        tried.append("hf-mirror")
        try:
            download_via_hf_mirror(dest, hf_repo, endpoint)
            if _ensure_config(dest):
                print("完成 (HF):", dest)
                return 0
            errors.append("HF: 下载结束但缺少 config.json")
        except Exception as e:
            errors.append(f"HF ({endpoint}): {e}")

    if source in ("modelscope", "ms", "auto"):
        tried.append("modelscope")
        try:
            download_via_modelscope(dest, ms_repo)
            if _ensure_config(dest):
                print("完成 (ModelScope):", dest)
                return 0
            errors.append("ModelScope: 下载结束但缺少 config.json")
        except Exception as e:
            errors.append(f"ModelScope ({ms_repo}): {e}")

    print("下载失败。已尝试:", ", ".join(tried) or source, file=sys.stderr)
    for err in errors:
        print(f"  · {err}", file=sys.stderr)
    print(
        "\n建议:\n"
        "  1) 仅 ModelScope: GOT_OCR_DOWNLOAD_SOURCE=modelscope npm run got-ocr:download-model\n"
        "  2) 换镜像: HF_ENDPOINT=https://hf-mirror.com npm run got-ocr:download-model\n"
        "  3) 浏览器打开 https://modelscope.cn/models/StepFun/GOT-OCR-2.0-hf 手动下载后解压到\n"
        f"     {dest}\n",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
