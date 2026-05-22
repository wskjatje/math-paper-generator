from __future__ import annotations

from pydantic import BaseModel, Field


class Block(BaseModel):
    id: str
    kind: str = Field(description="text|formula|diagram|table|other")
    bbox: list[int] = Field(description="[x1, y1, x2, y2]")
    text: str = ""
    score: float | None = None
    geometry_label: str | None = None


class Question(BaseModel):
    qid: str
    index: int
    stem: str
    options: list[str] = []
    formulas: list[str] = []
    diagrams: list[str] = []


class OcrResponse(BaseModel):
    engine: str
    text: str
    blocks: list[Block]
    reading_order: list[str]
    questions: list[Question]
    diagram_links: list[dict] = Field(default_factory=list)
    layout: dict
    meta: dict
