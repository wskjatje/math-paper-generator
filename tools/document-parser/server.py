#!/usr/bin/env python3
"""
本机文档解析 Sidecar（Docling 优先）。

协议：HTTP JSON
  GET  /health
  POST /extract  { "path": "<绝对路径>", "document_id": "..." }

输出对齐 TypeScript DocumentExtractionBundle（version=1）。
未安装 docling 时返回 quality=basic_fallback 的最小结构，由 Node 侧再走 PDF.js/Tesseract。
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import traceback
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = os.environ.get("MPG_DOC_PARSER_HOST", "127.0.0.1")
PORT = int(os.environ.get("MPG_DOC_PARSER_PORT", "8765"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.digest().hex()


def try_docling_extract(path: Path, document_id: str) -> dict[str, Any] | None:
    try:
        from docling.document_converter import DocumentConverter
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.datamodel.base_models import InputFormat
        from docling.document_converter import PdfFormatOption
    except Exception:
        return None

    started = utc_now()
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = True
    # 公式 / 图片：尽力开启；旧版本可能无这些属性
    for attr, val in (
        ("do_formula_enrichment", True),
        ("generate_picture_images", True),
        ("images_scale", 2.0),
    ):
        if hasattr(pipeline_options, attr):
            setattr(pipeline_options, attr, val)

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    result = converter.convert(str(path))
    doc = result.document

    assets: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    regions: list[dict[str, Any]] = []
    plain_parts: list[str] = []
    reading = 0

    # DoclingDocument 导出为结构化 dict（版本差异下尽量兼容）
    exported: dict[str, Any] = {}
    if hasattr(doc, "export_to_dict"):
        exported = doc.export_to_dict()
    elif hasattr(doc, "model_dump"):
        exported = doc.model_dump()

    # 优先用 markdown 作为 plainText 保真文本（含公式）
    markdown = ""
    if hasattr(doc, "export_to_markdown"):
        try:
            markdown = doc.export_to_markdown() or ""
        except Exception:
            markdown = ""
    if markdown:
        plain_parts.append(markdown)

    page_items = exported.get("pages") or []
    if not page_items and hasattr(doc, "pages"):
        try:
            page_items = list(getattr(doc, "pages") or [])
        except Exception:
            page_items = []

    # 统一：从 texts / pictures / tables 拼 blocks
    def add_page(idx: int, width: float = 1000.0, height: float = 1000.0) -> dict[str, Any]:
        page = {
            "id": f"{document_id}-p{idx}",
            "pageIndex": idx,
            "width": float(width),
            "height": float(height),
            "blocks": [],
        }
        pages.append(page)
        return page

    # 简化：整份文档按阅读顺序拉 texts
    texts = exported.get("texts") or []
    pictures = exported.get("pictures") or []
    tables = exported.get("tables") or []

    if not pages:
        add_page(0)

    page0 = pages[0]

    def bbox_from_prov(prov: Any) -> dict[str, float] | None:
        if not prov:
            return None
        if isinstance(prov, list) and prov:
            prov = prov[0]
        if not isinstance(prov, dict):
            return None
        bbox = prov.get("bbox") or prov.get("bounding_box")
        if not bbox:
            return None
        if isinstance(bbox, dict):
            return {
                "x0": float(bbox.get("l") or bbox.get("x0") or bbox.get("left") or 0),
                "y0": float(bbox.get("t") or bbox.get("y0") or bbox.get("top") or 0),
                "x1": float(bbox.get("r") or bbox.get("x1") or bbox.get("right") or 0),
                "y1": float(bbox.get("b") or bbox.get("y1") or bbox.get("bottom") or 0),
            }
        if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            return {
                "x0": float(bbox[0]),
                "y0": float(bbox[1]),
                "x1": float(bbox[2]),
                "y1": float(bbox[3]),
            }
        return None

    for t in texts:
        if not isinstance(t, dict):
            continue
        text = t.get("text") or t.get("orig") or ""
        if not text.strip():
            continue
        label = str(t.get("label") or t.get("type") or "text").lower()
        block_type = "formula" if "formula" in label or "equation" in label else "text"
        if "header" in label:
            block_type = "header"
        if "footer" in label:
            block_type = "footer"
        reading += 1
        page_idx = 0
        prov = t.get("prov") or t.get("provenance")
        if isinstance(prov, list) and prov and isinstance(prov[0], dict):
            page_idx = int(prov[0].get("page_no") or prov[0].get("page") or 0)
            # Docling 常 1-based
            if page_idx > 0:
                page_idx = page_idx - 1
        while len(pages) <= page_idx:
            add_page(len(pages))
        block = {
            "id": f"{document_id}-b{reading}",
            "pageIndex": page_idx,
            "readingOrder": reading,
            "type": block_type,
            "text": text,
            "latex": t.get("text") if block_type == "formula" else None,
            "confidence": t.get("confidence"),
            "bbox": bbox_from_prov(prov),
        }
        pages[page_idx]["blocks"].append(block)
        if not markdown:
            plain_parts.append(text)

    for i, pic in enumerate(pictures):
        if not isinstance(pic, dict):
            continue
        reading += 1
        asset_id = str(uuid.uuid4())
        page_idx = 0
        prov = pic.get("prov") or pic.get("provenance")
        if isinstance(prov, list) and prov and isinstance(prov[0], dict):
            page_idx = int(prov[0].get("page_no") or prov[0].get("page") or 0)
            if page_idx > 0:
                page_idx = page_idx - 1
        while len(pages) <= page_idx:
            add_page(len(pages))
        # 图片二进制由 Node 侧按区域裁剪更稳；此处登记 picture block + 占位资产元数据
        assets.append(
            {
                "id": asset_id,
                "uri": "",
                "mimeType": "image/png",
                "role": "source_figure",
                "pageIndex": page_idx,
            }
        )
        block = {
            "id": f"{document_id}-pic{i}",
            "pageIndex": page_idx,
            "readingOrder": reading,
            "type": "picture",
            "text": pic.get("caption") or pic.get("text") or f"图{i + 1}",
            "bbox": bbox_from_prov(prov),
            "assetId": asset_id,
        }
        pages[page_idx]["blocks"].append(block)
        regions.append(
            {
                "id": f"{document_id}-r-fig-{i}",
                "pageIndex": page_idx,
                "regionType": "figure",
                "bbox": block["bbox"],
                "readingOrder": reading,
                "blockIds": [block["id"]],
            }
        )

    for i, table in enumerate(tables):
        if not isinstance(table, dict):
            continue
        reading += 1
        page_idx = 0
        while len(pages) <= page_idx:
            add_page(len(pages))
        block = {
            "id": f"{document_id}-tbl{i}",
            "pageIndex": page_idx,
            "readingOrder": reading,
            "type": "table",
            "text": str(table.get("data") or table.get("text") or "表格"),
            "bbox": bbox_from_prov(table.get("prov")),
        }
        pages[page_idx]["blocks"].append(block)

    finished = utc_now()
    plain = "\n\n".join(p for p in plain_parts if p).strip()
    return {
        "version": 1,
        "documentId": document_id,
        "createdAt": finished,
        "sourceFilename": path.name,
        "sourceMimeType": "application/pdf" if path.suffix.lower() == ".pdf" else "application/octet-stream",
        "sourceSha256": sha256_file(path),
        "sourceFilePath": str(path),
        "quality": "high_fidelity",
        "ocrRun": {
            "id": str(uuid.uuid4()),
            "engine": "docling",
            "modelVersions": {"docling": getattr(sys.modules.get("docling"), "__version__", "unknown")},
            "startedAt": started,
            "finishedAt": finished,
            "quality": "high_fidelity",
            "warnings": [],
        },
        "pages": pages,
        "regions": regions,
        "assets": assets,
        "plainText": plain,
    }


def basic_fallback(path: Path, document_id: str, reason: str) -> dict[str, Any]:
    started = utc_now()
    text = ""
    try:
        if path.suffix.lower() in {".txt", ".md", ".csv"}:
            text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        text = ""
    finished = utc_now()
    return {
        "version": 1,
        "documentId": document_id,
        "createdAt": finished,
        "sourceFilename": path.name,
        "sourceMimeType": "application/octet-stream",
        "sourceSha256": sha256_file(path) if path.is_file() else "",
        "sourceFilePath": str(path),
        "quality": "basic_fallback",
        "ocrRun": {
            "id": str(uuid.uuid4()),
            "engine": "plain_text",
            "startedAt": started,
            "finishedAt": finished,
            "quality": "basic_fallback",
            "warnings": [reason, "Sidecar 未完成 Docling 解析；请由 Node 侧 PDF.js/Tesseract 补抽"],
        },
        "pages": [
            {
                "id": f"{document_id}-p0",
                "pageIndex": 0,
                "width": 0,
                "height": 0,
                "blocks": (
                    [
                        {
                            "id": f"{document_id}-b1",
                            "pageIndex": 0,
                            "readingOrder": 1,
                            "type": "text",
                            "text": text,
                        }
                    ]
                    if text
                    else []
                ),
            }
        ],
        "regions": [],
        "assets": [],
        "plainText": text,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[doc-parser] " + (fmt % args) + "\n")

    def _json(self, code: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/health"):
            docling_ok = False
            try:
                import docling  # noqa: F401

                docling_ok = True
            except Exception:
                docling_ok = False
            self._json(200, {"ok": True, "docling": docling_ok, "port": PORT})
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/extract":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw.decode("utf-8"))
        except Exception:
            self._json(400, {"ok": False, "error": "invalid_json"})
            return
        path_str = str(req.get("path") or "").strip()
        document_id = str(req.get("document_id") or uuid.uuid4()).strip()
        if not path_str:
            self._json(400, {"ok": False, "error": "path_required"})
            return
        path = Path(path_str)
        if not path.is_file():
            self._json(404, {"ok": False, "error": "file_not_found", "path": path_str})
            return
        try:
            bundle = try_docling_extract(path, document_id)
            if bundle is None:
                bundle = basic_fallback(path, document_id, "docling 未安装或导入失败")
            self._json(200, {"ok": True, "bundle": bundle})
        except Exception as e:
            traceback.print_exc()
            bundle = basic_fallback(path, document_id, f"docling 解析异常: {e}")
            self._json(200, {"ok": True, "bundle": bundle, "warning": str(e)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"[doc-parser] listening on http://{HOST}:{PORT}\n")
    server.serve_forever()


if __name__ == "__main__":
    main()
