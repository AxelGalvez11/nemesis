"""
A compact failure gallery, grouped by failure CLASS rather than by document.

🔴 A FEW REPRESENTATIVE CASES, NOT THOUSANDS OF SCREENSHOTS. The point is to make
each failure mode inspectable once — what the page looks like, what the ground
truth says the table is, and what Nemesis produced — so a reader can tell a
scope limit from a bug without opening the corpus.

🔴 GROUND TRUTH IS NOT OVERLAID ON THE PAGE, AND THAT IS A REAL LIMITATION, NOT A
DESIGN CHOICE. PubTables-1M annotates boxes in CROPPED TABLE IMAGE pixels;
Nemesis works in PDF points. Mapping between them needs the 3.7 GB
PDF-coordinate archive that does not fit here, so the gallery shows the page
beside the ground-truth SHAPE (rows x columns x merges) rather than drawing the
annotation onto the page. Drawing it without the mapping would put boxes in the
wrong place and look authoritative.

Usage:
  python3 gallery.py grits_results.jsonl <pdf-dir> <out-dir> [per-class]
"""
import base64
import html
import json
import os
import sys
from collections import defaultdict

import fitz

results_path, pdf_dir, out_dir = sys.argv[1:4]
per_class = int(sys.argv[4]) if len(sys.argv) > 4 else 3
os.makedirs(out_dir, exist_ok=True)

rows = [json.loads(l) for l in open(results_path)]


def failure_class(r: dict) -> str:
    """The classes are the ones that imply different ACTIONS, not different scores."""
    if r["outcome"] == "no-region-proposed":
        return "no-region-proposed (no vertical rules to find)"
    if r["outcome"] == "proposed-then-rejected":
        top = max(r["rejections"], key=r["rejections"].get) if r["rejections"] else "unknown"
        return f"proposed-then-rejected ({top})"
    if r["grits_top"] >= 0.99:
        return "recovered exactly"
    if r["gt_span"] > 0:
        return "recovered but merged cells lost"
    if r["pred_rows"] != r["gt_rows"] or r["pred_cols"] != r["gt_cols"]:
        return "recovered with the wrong grid shape"
    return "recovered, other mismatch"


by_class = defaultdict(list)
for r in rows:
    by_class[failure_class(r)].append(r)


def page_png(pmc: str, max_width: int = 620) -> str | None:
    """First page, downscaled. Enough to see the document's shape, small enough to inline."""
    path = os.path.join(pdf_dir, f"{pmc}.pdf")
    if not os.path.exists(path):
        return None
    try:
        with fitz.open(path) as doc:
            if doc.page_count == 0:
                return None
            page = doc[0]
            zoom = min(max_width / max(page.rect.width, 1), 1.4)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            return base64.b64encode(pix.tobytes("png")).decode()
    except Exception:                              # noqa: BLE001
        return None


parts = [
    "<h1>Parser failure gallery — PubTables-1M sample</h1>",
    f"<p>{len(rows)} sampled tables, grouped by failure class. "
    "Ground truth is shown as a shape rather than an overlay: the annotation is in cropped-table "
    "pixels and the parser works in PDF points, and the archive that maps between them does not "
    "fit locally. Drawing it anyway would be wrong and look authoritative.</p>",
]
for name in sorted(by_class, key=lambda k: -len(by_class[k])):
    group = sorted(by_class[name], key=lambda r: r["id"])[:per_class]
    parts.append(f"<h2>{html.escape(name)} <small>({len(by_class[name])} of {len(rows)})</small></h2>")
    parts.append('<div class="row">')
    for r in group:
        png = page_png(r["id"].split("_table_")[0])
        img = f'<img src="data:image/png;base64,{png}">' if png else "<div class=noimg>page not available</div>"
        parts.append(
            f'<figure>{img}<figcaption><b>{html.escape(r["id"])}</b><br>'
            f'stratum: {html.escape(r["stratum"])}<br>'
            f'ground truth: {r["gt_rows"]}&times;{r["gt_cols"]} grid, {r["gt_span"]} merged<br>'
            f'Nemesis: {r["pred_rows"]}&times;{r["pred_cols"]} '
            f'({r["n_tables_emitted"]} table(s) emitted, {r["n_proposed"]} region(s) proposed)<br>'
            f'GriTS-Top: <b>{r["grits_top"]:.3f}</b><br>'
            f'refusals: {html.escape(json.dumps(r["rejections"]))}'
            "</figcaption></figure>"
        )
    parts.append("</div>")

style = """
body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:2rem;max-width:1200px}
h2{margin-top:2.5rem;border-bottom:1px solid #ccc;padding-bottom:.3rem}
small{font-weight:400;color:#666}
.row{display:flex;gap:1.2rem;flex-wrap:wrap}
figure{margin:0;width:320px}
img{width:100%;border:1px solid #ddd}
.noimg{height:180px;display:grid;place-items:center;background:#f4f4f4;color:#999;border:1px solid #ddd}
figcaption{font-size:12px;color:#333;margin-top:.4rem}
"""
out = os.path.join(out_dir, "gallery.html")
with open(out, "w") as f:
    f.write(f"<!doctype html><meta charset=utf-8><title>Parser failure gallery</title><style>{style}</style>")
    f.write("".join(parts))

print(f"{len(rows)} results across {len(by_class)} failure classes")
for name in sorted(by_class, key=lambda k: -len(by_class[k])):
    print(f"   {len(by_class[name]):4d}  {name}")
print(f"\nwritten to {out}")
