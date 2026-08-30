#!/usr/bin/env python3
"""Crawl4AI → 课本目录 Markdown + grade-apply CSV 行。

配置：tools/crawl4ai-textbook/jobs.json（仅 enabled 且含 sourceUrl 的任务）。
纪律：不猜 bookId；无任务 / 抽不出单元 → 非 0 退出；拒绝「第N单元」占位。
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL_DIR = Path(__file__).resolve().parent
DEFAULT_JOBS = TOOL_DIR / "jobs.json"
OUT_DIR = ROOT / "data" / "grade-fills" / "crawl4ai-out"

PLACEHOLDER_RE = re.compile(r"^第[一二三四五六七八九十百零〇\d]+单元")


def load_jobs(path: Path) -> dict:
    if not path.is_file():
        raise SystemExit(f"任务配置不存在：{path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise SystemExit("jobs.json 须 schemaVersion=1 的对象")
    return data


def enabled_jobs(data: dict) -> list[dict]:
    jobs = data.get("jobs") or []
    out = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        if j.get("enabled") is not True:
            continue
        url = str(j.get("sourceUrl") or "").strip()
        book_id = str(j.get("bookId") or "").strip()
        if not url or not book_id:
            raise SystemExit(f"任务 {j.get('id')!r} 缺少 sourceUrl 或 bookId")
        if "example.com" in url:
            raise SystemExit(
                f"任务 {j.get('id')!r} 仍是示例 URL，请换成已获授权的真实目录页"
            )
        out.append(j)
    return out


def heading_level(line: str) -> int | None:
    m = re.match(r"^(#{1,6})\s+\S", line.strip())
    if not m:
        return None
    return len(m.group(1))


def extract_units_from_markdown(
    md: str,
    *,
    heading_levels: list[int],
    unit_line_regex: str | None,
    reject_placeholder: bool,
) -> list[str]:
    lines = [ln.rstrip() for ln in (md or "").splitlines()]
    units: list[str] = []
    if unit_line_regex:
        cre = re.compile(unit_line_regex)
        for ln in lines:
            m = cre.search(ln)
            if not m:
                continue
            label = (m.group(1) if m.lastindex else m.group(0)).strip()
            label = re.sub(r"^#+\s*", "", label).strip()
            if label:
                units.append(label)
    else:
        levels = set(int(x) for x in heading_levels)
        for ln in lines:
            lv = heading_level(ln)
            if lv is None or lv not in levels:
                continue
            label = re.sub(r"^#+\s*", "", ln.strip()).strip()
            # 去掉常见目录噪声
            if not label or label in {"目录", "Contents", "CONTENTS"}:
                continue
            units.append(label)

    # 去重保序
    seen: set[str] = set()
    cleaned: list[str] = []
    for u in units:
        if u in seen:
            continue
        seen.add(u)
        if reject_placeholder and PLACEHOLDER_RE.match(u):
            raise SystemExit(f"拒绝占位单元名：{u}")
        cleaned.append(u)
    return cleaned


async def crawl_one(url: str) -> str:
    try:
        from crawl4ai import AsyncWebCrawler
    except ImportError as e:
        raise SystemExit(
            "未安装 crawl4ai。请执行：\n"
            "  cd tools/crawl4ai-textbook && python3 -m venv .venv\n"
            "  .venv/bin/pip install -U -r requirements.txt && .venv/bin/crawl4ai-setup"
        ) from e

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url)
    md = getattr(result, "markdown", None) or ""
    if hasattr(md, "raw_markdown"):
        md = md.raw_markdown or ""
    text = str(md).strip()
    if not text:
        # 部分版本字段名不同
        text = str(getattr(result, "cleaned_html", "") or "").strip()
    if not text:
        raise SystemExit(f"爬取无正文：{url}")
    return text


def write_csv_row(path: Path, job: dict, unit_labels: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "bookId",
        "editionId",
        "subjectId",
        "gradeBaseId",
        "semester",
        "title",
        "unitLabels",
        "sourceUrlOrBook",
        "notes",
        "status",
    ]
    row = {
        "bookId": job["bookId"],
        "editionId": job.get("editionId") or "",
        "subjectId": job.get("subjectId") or "",
        "gradeBaseId": job.get("gradeBaseId") or "",
        "semester": job.get("semester") or "",
        "title": job.get("title") or "",
        "unitLabels": unit_labels,
        "sourceUrlOrBook": job.get("sourceUrl") or "",
        "notes": job.get("notes") or "crawl4ai",
        "status": "draft",
    }
    write_header = not path.is_file()
    with path.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            w.writeheader()
        w.writerow(row)


def filter_jobs(
    jobs: list[dict],
    *,
    grade_id: str | None,
    book_ids: str | None,
) -> list[dict]:
    out = jobs
    if grade_id:
        m = re.match(r"^(.+)_(s1|s2)$", grade_id.strip())
        if not m:
            raise SystemExit(f"年级格式须为 gradeBaseId_s1|s2，收到：{grade_id}")
        base, sem = m.group(1), m.group(2)
        out = [
            j
            for j in out
            if str(j.get("gradeBaseId") or "") == base and str(j.get("semester") or "") == sem
        ]
    if book_ids:
        wanted = {x.strip() for x in book_ids.split(",") if x.strip()}
        out = [j for j in out if str(j.get("bookId") or "").strip() in wanted]
    return out


async def run_jobs(
    jobs_path: Path,
    out_dir: Path,
    *,
    grade_id: str | None = None,
    book_ids: str | None = None,
) -> int:
    data = load_jobs(jobs_path)
    jobs = enabled_jobs(data)
    jobs = filter_jobs(jobs, grade_id=grade_id, book_ids=book_ids)
    if not jobs:
        raise SystemExit(
            "没有匹配的 enabled 爬取任务。请编辑 tools/crawl4ai-textbook/jobs.json "
            "填入已获授权的目录页 URL 后重试。"
        )

    defaults = data.get("defaults") or {}
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "toc-from-crawl4ai.csv"
    if csv_path.is_file():
        csv_path.unlink()

    ok = 0
    for job in jobs:
        jid = str(job.get("id") or job["bookId"])
        url = str(job["sourceUrl"]).strip()
        print(f"[crawl4ai] {jid} ← {url}", flush=True)
        md = await crawl_one(url)
        md_path = out_dir / f"{jid}.md"
        md_path.write_text(md + "\n", encoding="utf-8")

        levels = job.get("markdownHeadingLevels")
        if levels is None:
            levels = defaults.get("markdownHeadingLevels") or [2, 3]
        ure = job.get("unitLineRegex")
        if ure is None:
            ure = defaults.get("unitLineRegex")
        reject = job.get("rejectPlaceholderUnits")
        if reject is None:
            reject = defaults.get("rejectPlaceholderUnits", True)

        units = extract_units_from_markdown(
            md,
            heading_levels=list(levels),
            unit_line_regex=str(ure).strip() if ure else None,
            reject_placeholder=bool(reject),
        )
        min_u = int(job.get("minUnits") or defaults.get("minUnits") or 1)
        max_u = int(job.get("maxUnits") or defaults.get("maxUnits") or 80)
        if len(units) < min_u:
            raise SystemExit(
                f"{jid}: 仅抽出 {len(units)} 个单元（最少 {min_u}）。"
                f"请调整 markdownHeadingLevels / unitLineRegex，或检查页面结构。Markdown：{md_path}"
            )
        if len(units) > max_u:
            raise SystemExit(f"{jid}: 抽出 {len(units)} 个单元超过上限 {max_u}，疑似误抽")

        unit_labels = "|".join(units)
        write_csv_row(csv_path, job, unit_labels)
        meta = {
            "jobId": jid,
            "bookId": job["bookId"],
            "sourceUrl": url,
            "unitCount": len(units),
            "units": units,
            "markdownPath": str(md_path.relative_to(ROOT)),
            "csvPath": str(csv_path.relative_to(ROOT)),
        }
        (out_dir / f"{jid}.units.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"[crawl4ai] {jid}: {len(units)} units → {csv_path.name}", flush=True)
        ok += 1

    print(f"[crawl4ai] done jobs={ok} csv={csv_path}", flush=True)
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Crawl4AI 课本目录采集")
    p.add_argument(
        "--jobs",
        type=Path,
        default=DEFAULT_JOBS,
        help="任务 JSON（默认 tools/crawl4ai-textbook/jobs.json）",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=OUT_DIR,
        help="输出目录（默认 data/grade-fills/crawl4ai-out）",
    )
    p.add_argument(
        "--extract-md",
        type=Path,
        default=None,
        help="仅从本地 Markdown 抽单元（不联网；用于校验 regex/标题级）",
    )
    p.add_argument(
        "--heading-levels",
        default="2,3",
        help="与 --extract-md 联用：标题级，逗号分隔",
    )
    p.add_argument("--unit-regex", default=None, help="与 --extract-md 联用：捕获组为单元名")
    p.add_argument("--grade", default=None, help="仅该年级，如 pri_g1_s2")
    p.add_argument("--book-ids", default=None, help="逗号分隔 bookId，仅跑这些册")
    args = p.parse_args()

    if args.extract_md:
        md = args.extract_md.read_text(encoding="utf-8")
        levels = [int(x) for x in str(args.heading_levels).split(",") if x.strip()]
        units = extract_units_from_markdown(
            md,
            heading_levels=levels,
            unit_line_regex=args.unit_regex,
            reject_placeholder=True,
        )
        print(json.dumps({"unitCount": len(units), "units": units}, ensure_ascii=False, indent=2))
        if not units:
            raise SystemExit(1)
        return

    raise SystemExit(
        asyncio.run(
            run_jobs(
                args.jobs,
                args.out,
                grade_id=args.grade,
                book_ids=args.book_ids,
            )
        )
    )


if __name__ == "__main__":
    main()
