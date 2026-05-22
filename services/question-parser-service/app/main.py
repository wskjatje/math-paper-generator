"""结构化题目解析：把 OCR 输出分块转换为题目对象。"""

from __future__ import annotations

import re

from fastapi import FastAPI

app = FastAPI(title="zhixue-question-parser", version="0.2.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "question-parser"}


@app.post("/v1/questions/parse")
async def parse(payload: dict) -> dict:
    text = str(payload.get("text") or "").strip()
    blocks = payload.get("blocks") or []
    merged = text or "\n".join([str(b.get("text") or "").strip() for b in blocks if isinstance(b, dict)])

    p = re.compile(r"(?:^|\n)\s*(?:\(|（)?(\d{1,2})(?:\)|）)?[.、]\s*")
    ms = list(p.finditer(merged))
    questions = []
    for i, m in enumerate(ms):
        start = m.end()
        end = ms[i + 1].start() if i + 1 < len(ms) else len(merged)
        stem = merged[start:end].strip()
        questions.append(
            {
                "qid": f"q-{m.group(1)}",
                "index": int(m.group(1)),
                "stem": [{"type": "text", "value": stem}],
                "options": [],
                "answer": [],
                "knowledge_points": [],
                "diagram": None,
            }
        )

    return {
        "engine": "rule-parser-v1",
        "questions": questions,
        "source_text_len": len(merged),
        "meta": {"hint": "已支持块级输入；可再接 LLM 做选项/答案抽取"},
    }
