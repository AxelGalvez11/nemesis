"""Did turning vision on change anything the layout evaluator can see?

🔴 THIS ASKS THE QUESTION AS A DIFF, NOT AS A SCORE, AND THAT IS THE POINT.
ParseBench's layout dimension is scored from exactly two things per prediction —
a rectangle and a label — via `nemesis_layout_adapter.py`:

    segments = item.layout_segments or ([item.bbox] if item.bbox is not None else [])
    ...  LayoutPrediction(bbox=[x1, y1, x2, y2], label=seg.label or item.type, ...)

So if the (bbox, label) multiset for a document is IDENTICAL between two arms,
every localization and classification number that document can produce is
identical too — necessarily, not probably. Re-running a scorer to discover that
would add a re-implementation risk and could not produce a stronger claim.

An item with no bbox contributes NO prediction at all. It cannot help the score
and it cannot hurt it.

`value` is reported separately because it DOES move: a described figure renders
as `[Figure: caption]\\n<description>`, which reaches the evaluator as prediction
CONTENT. That is a content-faithfulness input, not a layout one, and conflating
the two is how "vision changed the output" becomes "vision improved layout".

Usage:
    python3 bench/parsebench/vision_arm_compare.py <resultsdir> <armA> <armB>
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

# Rounded before comparison so a float that survived a different code path by a
# billionth is not reported as a moved rectangle.
ROUND = 9


def geometry(record: dict) -> Counter:
    """The (page, bbox, label) multiset — everything the layout evaluator reads."""
    out: Counter = Counter()
    for page in record.get("layout_pages", []):
        for item in page.get("items", []):
            box = item.get("bbox")
            if box is None:
                # No rectangle -> the adapter emits no prediction. Counted
                # separately so "we produced a block the evaluator never saw" is
                # visible rather than silently equal to "we produced nothing".
                out[(page["page_number"], None, item.get("type"))] += 1
                continue
            out[(
                page["page_number"],
                (round(box["x"], ROUND), round(box["y"], ROUND), round(box["w"], ROUND), round(box["h"], ROUND)),
                box.get("label") or item.get("type"),
            )] += 1
    return out


def content(record: dict) -> Counter:
    return Counter(
        (page["page_number"], item.get("value", ""))
        for page in record.get("layout_pages", [])
        for item in page.get("items", [])
    )


def main() -> int:
    root, arm_a, arm_b = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    files = sorted(p.name for p in (root / arm_a).glob("*.json"))
    same_geom = diff_geom = same_text = diff_text = 0
    rows = []
    for name in files:
        a = json.loads((root / arm_a / name).read_text())
        b = json.loads((root / arm_b / name).read_text())
        ga, gb = geometry(a), geometry(b)
        ca, cb = content(a), content(b)
        geom_equal = ga == gb
        text_equal = ca == cb
        same_geom += geom_equal
        diff_geom += not geom_equal
        same_text += text_equal
        diff_text += not text_equal
        rows.append({
            "document": name[:-5],
            "vision_calls_a": a.get("visionCalls", 0),
            "vision_calls_b": b.get("visionCalls", 0),
            "items_a": sum(len(p["items"]) for p in a.get("layout_pages", [])),
            "items_b": sum(len(p["items"]) for p in b.get("layout_pages", [])),
            "geometry_identical": geom_equal,
            "geometry_moved": sum((gb - ga).values()) + sum((ga - gb).values()),
            "content_identical": text_equal,
            "content_changed_items": sum((cb - ca).values()),
        })

    print(f"{arm_a}  vs  {arm_b}      ({len(files)} documents)")
    print(f"{'document':46s} {'callsA':>6s} {'callsB':>6s} {'itemsA':>6s} {'itemsB':>6s} {'geom=':>6s} {'moved':>5s} {'text=':>6s} {'txtΔ':>5s}")
    for r in rows:
        print(
            f"{r['document'][:46]:46s} {r['vision_calls_a']:6d} {r['vision_calls_b']:6d} "
            f"{r['items_a']:6d} {r['items_b']:6d} {str(r['geometry_identical']):>6s} {r['geometry_moved']:5d} "
            f"{str(r['content_identical']):>6s} {r['content_changed_items']:5d}"
        )
    print()
    print(f"geometry (bbox + label) identical in {same_geom}/{len(files)} documents; changed in {diff_geom}")
    print(f"prediction content identical in {same_text}/{len(files)} documents; changed in {diff_text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
