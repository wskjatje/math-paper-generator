#!/usr/bin/env python3
"""Deterministic Manim templates for ExplainScriptV1 scenes (no LLM).

Env:
  EXPLAIN_SCENE_JSON — path to JSON: { templateId, onScreen, durationSec?, purpose? }
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from manim import DOWN, UP, FadeIn, Scene, Text, Write, YELLOW


def _load_scene() -> dict:
    path = os.environ.get("EXPLAIN_SCENE_JSON", "").strip()
    if not path:
        raise SystemExit("EXPLAIN_SCENE_JSON missing")
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _lines(s: str, max_chars: int = 28, max_lines: int = 10) -> list[str]:
    raw = (s or "").replace("\r\n", "\n").strip()
    out: list[str] = []
    for para in raw.split("\n"):
        p = para.strip()
        if not p:
            if len(out) < max_lines:
                out.append("")
            continue
        i = 0
        while i < len(p) and len(out) < max_lines:
            out.append(p[i : i + max_chars])
            i += max_chars
        if len(out) >= max_lines:
            break
    if not out:
        t = re.sub(r"\s+", " ", raw) or " "
        return [t[:max_chars]]
    return out[:max_lines]


class ExplainTemplateScene(Scene):
    def construct(self) -> None:
        data = _load_scene()
        template = str(data.get("templateId") or data.get("purpose") or "step").strip()
        on_screen = str(data.get("onScreen") or "")
        duration = float(data.get("durationSec") or 4.0)
        duration = max(1.5, min(duration, 30.0))
        lines = _lines(on_screen)

        color = "#f5f5f5"
        if template == "answer":
            color = YELLOW
        elif template == "pitfall":
            color = "#ff8a80"
        elif template == "summary":
            color = "#80cbc4"
        elif template == "idea":
            color = "#90caf9"

        mobs = [Text(line or " ", font_size=36, color=color) for line in lines]
        for i, m in enumerate(mobs):
            if i == 0:
                m.to_edge(UP, buff=0.7)
            else:
                m.next_to(mobs[i - 1], DOWN, buff=0.22)
            m.set_x(0)

        write_budget = min(2.2, duration * 0.45)
        wait_budget = max(0.4, duration - write_budget - 0.15)
        per = max(0.2, write_budget / max(1, len(mobs)))

        if template in ("idea", "summary", "pitfall"):
            for m in mobs:
                self.play(FadeIn(m, shift=UP * 0.15), run_time=per)
        else:
            for m in mobs:
                self.play(Write(m), run_time=per)

        self.wait(wait_budget)
