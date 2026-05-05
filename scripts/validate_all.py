#!/usr/bin/env python3
"""
校验仓库内 JSON 试卷/例题是否符合 schemas/v1。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
    from jsonschema import Draft202012Validator
except ImportError as exc:  # pragma: no cover - import guard
    print("请先安装依赖: pip install -r requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "schemas" / "v1"


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def validator_for(schema_path: Path) -> Draft202012Validator:
    schema = load_json(schema_path)
    return Draft202012Validator(schema)


def iter_candidate_files() -> list[Path]:
    paths: list[Path] = []
    for base in (ROOT / "examples", ROOT / "papers"):
        if not base.exists():
            continue
        paths.extend(sorted(base.rglob("*.json")))
    return paths


def classify_instance(data: object) -> str | None:
    if not isinstance(data, dict):
        return None
    kind = data.get("kind")
    return kind if isinstance(kind, str) else None


def main() -> int:
    exam_val = validator_for(SCHEMA_DIR / "exam-paper.schema.json")
    pack_val = validator_for(SCHEMA_DIR / "worked-example-pack.schema.json")

    candidates = iter_candidate_files()
    errors = 0

    if not candidates:
        print("未找到 examples/ 或 papers/ 下的 JSON 文件。")
        return 0

    for path in candidates:
        rel = path.relative_to(ROOT)
        try:
            data = load_json(path)
        except json.JSONDecodeError as exc:
            print(f"[JSON 语法错误] {rel}: {exc}")
            errors += 1
            continue

        kind = classify_instance(data)
        if kind == "exam_paper":
            validator = exam_val
        elif kind == "worked_example_pack":
            validator = pack_val
        else:
            print(f"[跳过] {rel}: 未知 kind={kind!r}（仅校验 exam_paper / worked_example_pack）")
            continue

        try:
            validator.validate(data)
            print(f"[OK] {rel}")
        except jsonschema.ValidationError as exc:
            print(f"[Schema 不合规] {rel}\n  {exc.message} @ {list(exc.absolute_path)}")
            errors += 1

    if errors:
        print(f"\n完成：{errors} 个文件未通过校验。", file=sys.stderr)
        return 1
    print("\n全部候选 JSON 已通过校验。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
