"""GOT-OCR 2.0 试卷管线：整页识别 + 启发式 diagram_links。"""

from __future__ import annotations

import cv2
import numpy as np

from app.exam_heuristics import (
    heuristic_diagram_regions,
    link_diagrams_to_questions,
    structured_question_parser,
)
from app.got_engine import GotOcrEngine


def downscale_for_recognize(image_bgr: np.ndarray, max_side_px: int) -> np.ndarray:
    if max_side_px <= 0:
        return image_bgr
    h, w = image_bgr.shape[:2]
    long_side = max(h, w)
    if long_side <= max_side_px:
        return image_bgr
    scale = max_side_px / float(long_side)
    nh, nw = int(round(h * scale)), int(round(w * scale))
    return cv2.resize(image_bgr, (nw, nh), interpolation=cv2.INTER_AREA)


class GotOcrPipeline:
    def __init__(
        self,
        engine: GotOcrEngine,
        *,
        format_output: bool = True,
        heuristic_diagram_enabled: bool = True,
        heuristic_diagram_right_ratio: float = 0.48,
        exam_ocr_max_side_px: int = 1600,
    ) -> None:
        self.engine = engine
        self.format_output = format_output
        self.heuristic_diagram_enabled = heuristic_diagram_enabled
        self.heuristic_diagram_right_ratio = max(0.25, min(0.85, heuristic_diagram_right_ratio))
        self.exam_ocr_max_side_px = max(0, int(exam_ocr_max_side_px))

    def run(self, image_bytes: bytes) -> dict:
        np_img = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("无法解码图片")

        h, w = image.shape[:2]
        ocr_image = downscale_for_recognize(image, self.exam_ocr_max_side_px)
        ok, buf = cv2.imencode(".jpg", ocr_image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        ocr_bytes = buf.tobytes() if ok else image_bytes
        text = self.engine.recognize(ocr_bytes, format_output=self.format_output)

        diagram_regions: list[dict] = []
        if self.heuristic_diagram_enabled:
            diagram_regions = heuristic_diagram_regions(
                image, right_ratio=self.heuristic_diagram_right_ratio
            )

        blocks = [
            {
                "id": "got-full-0",
                "kind": "text",
                "bbox": [0, 0, w, h],
                "text": text,
                "score": None,
                "geometry_label": None,
            }
        ]
        for i, dr in enumerate(diagram_regions):
            blocks.append(
                {
                    "id": str(dr["id"]),
                    "kind": "diagram",
                    "bbox": dr["bbox"],
                    "text": "",
                    "score": dr.get("score"),
                    "geometry_label": dr.get("label"),
                }
            )

        questions = structured_question_parser(text)
        questions, diagram_links = link_diagrams_to_questions(
            questions, diagram_regions, text, h
        )

        return {
            "text": text,
            "blocks": blocks,
            "reading_order": [b["id"] for b in blocks],
            "questions": questions,
            "diagram_links": diagram_links,
            "layout": {
                "page_size": {"width": w, "height": h},
                "regions": [{"id": "layout-full", "kind": "text", "bbox": [0, 0, w, h]}],
                "diagram_regions": diagram_regions,
            },
        }
