"""
Wrap a stratified sample of OmniDocBench page images as image-only PDFs.

🔴 THIS IS NOT AN OMNIDOCBENCH RUN AND ITS OUTPUT MUST NEVER BE TABULATED AS ONE.
OmniDocBench ships page IMAGES — 984 jpg and 673 png, and zero PDFs — while the
Nemesis parser reads a PDF's native text runs and vector rulings. Neither exists
in a photograph of a page, so the benchmark's actual metrics (text fidelity,
reading order, layout, table recognition) cannot be computed against this parser
at all. Scoring it would measure OCR, which this lane does not do and does not
claim to.

What the images CAN answer is a safety question worth asking: given a page with
no text layer, does Nemesis say so, or does it quietly return an empty structure
that reads downstream as "this document is blank"? A wrong answer there is the
silent-degradation failure this project keeps paying for, so it is measured.

Stratified across the ten `data_source` categories with a fixed seed, so the same
pages are used every time.
"""
import json
import os
import random
import sys
import urllib.parse
import urllib.request
from collections import defaultdict

import fitz

meta_path, out_dir, per_category = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(out_dir, exist_ok=True)
SEED = 20260811
BASE = "https://huggingface.co/datasets/opendatalab/OmniDocBench/resolve/main/images/"
UA = {"User-Agent": "nemesis-parser-benchmark/1.0 (research; parser evaluation)"}

pages = json.load(open(meta_path))
by_source = defaultdict(list)
for p in pages:
    attr = p.get("page_info", {}).get("page_attribute", {})
    name = p.get("page_info", {}).get("image_path")
    if name:
        by_source[attr.get("data_source", "?")].append((name, attr))

rng = random.Random(SEED)
chosen = []
for source in sorted(by_source):
    pool = sorted(by_source[source])
    rng.shuffle(pool)
    chosen.extend((name, attr, source) for name, attr in pool[:per_category])

manifest = []
for name, attr, source in chosen:
    dest = os.path.join(out_dir, name.rsplit(".", 1)[0] + ".pdf")
    if os.path.exists(dest):
        manifest.append({"file": dest, "source": source, "layout": attr.get("layout"), "image": name})
        continue
    try:
        req = urllib.request.Request(BASE + urllib.parse.quote(name), headers=UA)
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
        # An image-only PDF: exactly what a scanner produces, and exactly what a
        # native-text parser must recognise as unreadable rather than empty.
        doc = fitz.open()
        pix = fitz.Pixmap(data)
        page = doc.new_page(width=pix.width, height=pix.height)
        page.insert_image(fitz.Rect(0, 0, pix.width, pix.height), stream=data)
        doc.save(dest)
        doc.close()
        manifest.append({"file": dest, "source": source, "layout": attr.get("layout"), "image": name})
    except Exception as exc:                       # noqa: BLE001
        manifest.append({"image": name, "source": source, "error": str(exc)[:70]})

ok = [m for m in manifest if "file" in m]
with open(os.path.join(out_dir, "manifest.jsonl"), "w") as f:
    for m in manifest:
        f.write(json.dumps(m) + "\n")
print(f"seed {SEED} · {per_category} per category")
print(f"wrapped {len(ok)}/{len(chosen)} page images as image-only PDFs")
errs = [m for m in manifest if "error" in m]
if errs:
    print("failures:", errs[:3])
