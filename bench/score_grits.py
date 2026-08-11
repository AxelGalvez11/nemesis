"""
Score Nemesis's recovered tables against PubTables-1M ground truth, using the
OFFICIAL GriTS implementation from microsoft/table-transformer unmodified.

🔴 WHAT IS AND IS NOT COMPUTED HERE, STATED UP FRONT.

  GriTS-Top (topology)  COMPUTED. Ground truth row/column/spanning-cell boxes
    become a cell grid; Nemesis's `rows: string[][]` becomes one too. This is the
    metric that asks "is the grid the same shape, with the same merges".
  GriTS-Con (content)   NOT COMPUTED. It needs ground-truth cell TEXT, which
    lives in `Structure_Table_Words` — a 4.17 GB archive that does not fit the
    disk available. Reported as not computed rather than approximated.
  GriTS-Loc (location)  NOT COMPUTED. It needs both sides' boxes in one
    coordinate space; ground truth is in cropped-image pixels and Nemesis works
    in PDF points, and the archive that maps between them is 3.7 GB.

🔴 AND THE MATCH IS DELIBERATELY GENEROUS. Every sampled article contains exactly
one annotated table, but Nemesis may emit several; this takes its BEST scoring
table. That flatters the parser, and it is the right choice for a first
baseline — a generous match that still scores badly is unambiguous evidence,
whereas a strict one leaves you arguing about alignment. The count of extra
tables is reported alongside so the flattery is visible.
"""
import json
import sys
from collections import Counter, defaultdict

import numpy as np
import defusedxml.ElementTree as ET

sys.path.insert(0, ".")
from grits_official import cells_to_relspan_grid, get_spanning_cell_rows_and_columns, grits_top  # noqa: E402

sample_path, ann_dir, dump_path, out_path = sys.argv[1:5]


def ground_truth_cells(xml_path: str):
    """Row/column/spanning-cell boxes -> the cell list GriTS consumes."""
    root = ET.parse(xml_path).getroot()
    rows, columns, spanning = [], [], []
    for obj in root.findall("object"):
        label = (obj.findtext("name") or "").strip()
        bb = obj.find("bndbox")
        if bb is None:
            continue
        box = [float(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax")]
        if label == "table row":
            rows.append({"bbox": box})
        elif label == "table column":
            columns.append({"bbox": box})
        elif label == "table spanning cell":
            spanning.append({"bbox": box})
    if not rows or not columns:
        return None
    rows.sort(key=lambda r: r["bbox"][1])
    columns.sort(key=lambda c: c["bbox"][0])

    # Which grid locations each spanning cell covers, by the benchmark's own rule.
    # Returns one list of (row_num, column_num) pairs per spanning cell — empty when a
    # spanning cell matched nothing.
    matches_by_spanning_cell = get_spanning_cell_rows_and_columns(spanning, rows, columns)
    covered = {}
    for idx, matches in enumerate(matches_by_spanning_cell):
        for r, c in matches:
            covered[(r, c)] = idx

    cells, emitted = [], set()
    for r in range(len(rows)):
        for c in range(len(columns)):
            idx = covered.get((r, c))
            if idx is None:
                cells.append({"row_nums": [r], "column_nums": [c]})
            elif idx not in emitted:
                emitted.add(idx)
                matches = matches_by_spanning_cell[idx]
                cells.append({
                    "row_nums": sorted({m[0] for m in matches}),
                    "column_nums": sorted({m[1] for m in matches}),
                })
    return {"cells": cells, "n_rows": len(rows), "n_cols": len(columns), "n_span": len(spanning)}


def as_object_grid(grid):
    """
    A numpy array whose ELEMENTS are plain lists.

    🔴 NOT A STYLE CHOICE. `factored_2dmss` indexes with `[i, j]`, so a Python list of
    lists fails with `'list' object has no attribute 'shape'` — but a plain
    `np.array(...)` makes each cell an ndarray, and modern PyMuPDF's `Rect()` rejects
    an ndarray. An object array satisfies both without touching the vendored metric.
    """
    rows, cols = len(grid), len(grid[0]) if grid else 0
    arr = np.empty((rows, cols), dtype=object)
    for i in range(rows):
        for j in range(cols):
            arr[i, j] = list(grid[i][j])
    return arr


def nemesis_cells(rows):
    """Nemesis emits a plain grid: every cell is 1x1, because `DocTable` cannot express a span."""
    out = []
    for i, row in enumerate(rows):
        for j in range(len(row)):
            out.append({"row_nums": [i], "column_nums": [j]})
    return out


sample = {json.loads(l)["id"]: json.loads(l) for l in open(sample_path)}
dumps = {json.loads(l)["pmc"]: json.loads(l) for l in open(dump_path)}

results = []
for tid, rec in sample.items():
    dump = dumps.get(rec["pmc"])
    if dump is None:
        continue                                  # PDF never arrived; counted as attrition elsewhere
    gt = ground_truth_cells(f"{ann_dir}/{tid}.xml")
    if gt is None:
        continue
    true_grid = as_object_grid(cells_to_relspan_grid(gt["cells"]))

    tables = dump.get("tables") or []
    best, best_table = 0.0, None
    for t in tables:
        if not t["rows"]:
            continue
        pred_grid = as_object_grid(cells_to_relspan_grid(nemesis_cells(t["rows"])))
        # 🔴 NO try/except HERE. An earlier version swallowed every scoring error and
        # recorded it as 0.0, which reported a clean "GriTS-Top 0.000" for the whole
        # sample — a harness bug wearing the costume of a parser result. A metric that
        # cannot be computed must crash, not score zero.
        score = grits_top(true_grid, pred_grid)[0]
        if score > best:
            best, best_table = score, t

    proposals = dump.get("proposals") or []
    accepted = [p for p in proposals if "rejected" not in p]
    rejected = Counter(p["rejected"] for p in proposals if "rejected" in p)
    outcome = (
        "recovered" if tables else
        "proposed-then-rejected" if proposals else
        "no-region-proposed"
    )
    results.append({
        "id": tid,
        "stratum": rec["stratum"],
        "gt_rows": gt["n_rows"], "gt_cols": gt["n_cols"], "gt_span": gt["n_span"],
        "grits_top": round(best, 4),
        "outcome": outcome,
        "n_tables_emitted": len(tables),
        "n_proposed": len(proposals),
        "n_accepted": len(accepted),
        "rejections": dict(rejected),
        "pred_rows": len(best_table["rows"]) if best_table else 0,
        "pred_cols": len(best_table["rows"][0]) if best_table and best_table["rows"] else 0,
        "pages_with_vertical_rule": dump.get("pagesWithVerticalRule", 0),
        "pages": dump.get("pages", 0),
    })

with open(out_path, "w") as f:
    for r in results:
        f.write(json.dumps(r) + "\n")

# ── report ───────────────────────────────────────────────────────────────────
n = len(results)
print(f"\n{'='*76}\nPubTables-1M · GriTS-Top · {n} sampled tables with a fetched source PDF\n{'='*76}")
outcomes = Counter(r["outcome"] for r in results)
print("outcome:")
for k, v in outcomes.most_common():
    print(f"   {k:26s} {v:4d}  ({100*v/max(n,1):.1f}%)")

scored = [r for r in results if r["outcome"] == "recovered"]
print(f"\nGriTS-Top over ALL {n} sampled tables (a miss scores 0):")
print(f"   mean {sum(r['grits_top'] for r in results)/max(n,1):.3f}")
if scored:
    print(f"GriTS-Top over the {len(scored)} where a table was recovered:")
    print(f"   mean {sum(r['grits_top'] for r in scored)/len(scored):.3f}")
    exact = sum(1 for r in scored if r["grits_top"] >= 0.99)
    print(f"   exact grid match: {exact}/{len(scored)}")

print("\nby stratum:")
by = defaultdict(list)
for r in results:
    by[r["stratum"]].append(r)
for k in sorted(by):
    rs = by[k]
    rec = sum(1 for r in rs if r["outcome"] == "recovered")
    print(f"   {k:24s} n={len(rs):3d}  recovered {rec:3d}  mean GriTS-Top {sum(r['grits_top'] for r in rs)/len(rs):.3f}")

all_rej = Counter()
for r in results:
    all_rej.update(r["rejections"])
print("\nwhy regions were refused:", dict(all_rej.most_common()))
print(f"\nwritten to {out_path}")
