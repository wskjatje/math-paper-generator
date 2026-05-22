"""试卷页示意图启发式 + 题号切分（与 gateway JSON 契约兼容，无 Paddle/YOLO）。"""

from __future__ import annotations

import re

import numpy as np


def heuristic_diagram_regions(image: np.ndarray, *, right_ratio: float = 0.48) -> list[dict]:
    import cv2

    h, w = image.shape[:2]
    x0 = int(w * right_ratio)
    if x0 >= w - 24:
        return []
    roi = image[:, x0:]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thr = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions: list[dict] = []
    page_area = float(w * h)
    for i, c in enumerate(contours):
        x, y, bw, bh = cv2.boundingRect(c)
        area = float(bw * bh)
        if area < page_area * 0.012 or area > page_area * 0.45:
            continue
        ar = bw / max(bh, 1)
        if ar < 0.12 or ar > 5.0:
            continue
        regions.append(
            {
                "id": f"heuristic-diag-{i}",
                "kind": "diagram",
                "label": "diagram_heuristic",
                "bbox": [int(x + x0), int(y), int(x + x0 + bw), int(y + bh)],
                "score": None,
            }
        )
    regions.sort(key=lambda r: (r["bbox"][1], r["bbox"][0]))
    return regions[:10]


def structured_question_parser(full_text: str) -> list[dict]:
    joined = full_text.strip()
    if not joined:
        return []
    pattern = re.compile(
        r"(?:^|\n)\s*(?:"
        r"[（(]\s*(\d{1,2})\s*[）)]"
        r"|(?:\(|（)?(\d{1,2})(?:\)|）)?[.．、]"
        r")\s*"
    )
    matches = list(pattern.finditer(joined))
    if not matches:
        return []
    questions: list[dict] = []
    for i, m in enumerate(matches):
        qn_raw = m.group(1) or m.group(2)
        if not qn_raw:
            continue
        qn = int(qn_raw)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(joined)
        stem = joined[start:end].strip()
        questions.append(
            {
                "qid": f"q-{qn}",
                "index": qn,
                "stem": stem,
                "options": [],
                "formulas": [],
                "diagrams": [],
            }
        )
    return questions


def link_diagrams_to_questions(
    questions: list[dict],
    diagram_regions: list[dict],
    full_text: str,
    page_h: int,
) -> tuple[list[dict], list[dict]]:
    anchors: dict[int, float] = {}
    pat = re.compile(r"[（(]\s*(\d{1,2})\s*[）)]")
    lines = full_text.split("\n")
    y_cursor = 0.0
    line_h = max(page_h / max(len(lines), 1), 24.0)
    for line in lines:
        for m in pat.finditer(line):
            qn = int(m.group(1))
            anchors[qn] = y_cursor + line_h * 0.5
        y_cursor += line_h

    links: list[dict] = []
    thresh = max(page_h * 0.18, 72.0)
    q_by_index = {int(q["index"]): q for q in questions if q.get("index") is not None}
    for dr in diagram_regions:
        bbox = dr["bbox"]
        cy = (bbox[1] + bbox[3]) / 2.0
        best_q: int | None = None
        best_d = 1e9
        for qn, ay in anchors.items():
            d = abs(cy - ay)
            if d < best_d:
                best_d = d
                best_q = qn
        if best_q is None or best_d > thresh:
            continue
        did = str(dr.get("id", ""))
        links.append(
            {
                "question_index": best_q,
                "diagram_id": did,
                "bbox": bbox,
                "label": str(dr.get("label") or ""),
                "source": "heuristic",
            }
        )
        q = q_by_index.get(best_q)
        if q is not None:
            ds = q.setdefault("diagrams", [])
            if isinstance(ds, list) and did and did not in ds:
                ds.append(did)
    return questions, links
