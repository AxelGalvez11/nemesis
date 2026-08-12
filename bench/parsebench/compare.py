"""Place Nemesis against ParseBench's published leaderboard, per dimension.

🔴 DIAGNOSTIC, NOT A TARGET. The question is where Nemesis is already competitive
and where it is plainly behind — not how to climb this table. Nothing in the
parser is to be tuned against these numbers.

🔴 THE COMPARISON IS NOT LIKE-FOR-LIKE, AND SAYING SO IS THE POINT. Almost every
row is a vision-language model or a paid API reading RENDERED PAGES. Nemesis reads
a PDF's native text and vector rulings and runs locally at no per-page cost. It
should be expected to lose badly wherever the answer is only visible in pixels
(charts, scans) and to be competitive where the file already states the answer.
The rows worth reading closely are the other native/local parsers.

    python3 compare.py <parsebench-checkout>/leaderboard.csv <output/nemesis_parse>
"""

from __future__ import annotations

import csv
import pathlib
import sys

from analyze import HEADLINE, headline_value  # same directory

import json

# The comparison set the report asks for: a local/native parser, the open-weight
# baseline closest to our architecture, a specialised commercial parser, the
# leading agentic one, and the cheapest VLM — spanning the field rather than
# flattering any part of it.
PEERS = [
    "Docling-models",
    "LlamaParse Agentic",
    "LlamaParse Cost Effective",
    "Azure Document Intelligence (Layout)",
    "AWS Textract",
    "Datalab Fast",
    "Firecrawl",
    "Mistral OCR 4",
    "Databricks AI Parse",
]

COLUMNS = {
    "table": "Tables",
    "chart": "Charts",
    "text_content": "Content_Faithfulness",
    "text_formatting": "Semantic_Formatting",
    "layout": "Visual_Grounding",
}


def main(leaderboard: pathlib.Path, output: pathlib.Path) -> None:
    rows = list(csv.DictReader(leaderboard.open()))
    by_name = {r["Provider"]: r for r in rows}

    ours: dict[str, float | None] = {}
    for dimension in HEADLINE:
        path = output / dimension / "_evaluation_report.json"
        ours[dimension] = headline_value(json.loads(path.read_text()), dimension) if path.exists() else None

    header = f"{'parser':38} {'Tbl':>6} {'Chrt':>6} {'Faith':>6} {'Fmt':>6} {'Ground':>7}  category"
    print(header)
    print("-" * len(header))
    print(
        f"{'► Nemesis (native, local, $0/page)':38} "
        + " ".join(
            f"{(100 * ours[d]):6.1f}" if ours.get(d) is not None else "   n/a"
            for d in ("table", "chart", "text_content", "text_formatting")
        )
        + f" {(100 * ours['layout']):7.1f}" if ours.get("layout") is not None else "     n/a"
    )
    print("-" * len(header))
    for name in PEERS:
        row = by_name.get(name)
        if not row:
            print(f"{name:38}  (not on this leaderboard revision)")
            continue
        vals = []
        for dimension in ("table", "chart", "text_content", "text_formatting", "layout"):
            raw = row.get(COLUMNS[dimension], "")
            vals.append(f"{float(raw):6.1f}" if raw else "   n/a")
        print(f"{name:38} {' '.join(vals[:4])} {vals[4]:>7}  {row['Category']}")

    print("\n🔴 Every row above except Nemesis reads RENDERED PAGES with a vision model")
    print("   or a paid API. Nemesis reads native PDF text and vector rulings, locally,")
    print("   at no per-page cost. Read the dimensions, never a single ranking.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(2)
    main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
