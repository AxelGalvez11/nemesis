"""
Characterise every PubTables-1M test table by its STRUCTURE, so the sample can be
stratified before anything is downloaded.

Stratifying first and streaming second is the whole point: taking whatever the
tar hands back first is arbitrary, not representative, and would quietly bias the
sample toward whatever order the archive happens to use.

Writes one compact JSON line per table. Nothing here reads Nemesis.
"""
import json
import os
import sys
# 🔴 defusedxml, NOT the stdlib parser. These XMLs are third-party data pulled off a
# dataset host; stdlib ElementTree resolves external entities and expands nested ones,
# so a hostile annotation could read local files or exhaust memory.
import defusedxml.ElementTree as ET
from collections import Counter

ann_dir, out_path = sys.argv[1], sys.argv[2]

# The object classes PubTables-1M annotates. `table spanning cell` is the merged-cell
# signal; `table projected row header` is a header row inside the body.
WANTED = {
    "table", "table column", "table row",
    "table column header", "table projected row header", "table spanning cell",
}

kinds = Counter()
written = 0
with open(out_path, "w") as out:
    for name in sorted(os.listdir(ann_dir)):
        if not name.endswith(".xml"):
            continue
        try:
            root = ET.parse(os.path.join(ann_dir, name)).getroot()
        except Exception:
            continue
        counts = Counter()
        table_box = None
        for obj in root.findall("object"):
            label = (obj.findtext("name") or "").strip()
            if label not in WANTED:
                continue
            counts[label] += 1
            if label == "table" and table_box is None:
                bb = obj.find("bndbox")
                if bb is not None:
                    table_box = [float(bb.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax")]
        size = root.find("size")
        rec = {
            "id": name[:-4],
            "pmc": name.split("_table_")[0],
            "table_index": int(name[:-4].split("_table_")[1]) if "_table_" in name else 0,
            "rows": counts["table row"],
            "cols": counts["table column"],
            "spanning": counts["table spanning cell"],
            "col_headers": counts["table column header"],
            "row_headers": counts["table projected row header"],
            "img_w": int(size.findtext("width")) if size is not None else 0,
            "img_h": int(size.findtext("height")) if size is not None else 0,
            "table_box": table_box,
        }
        kinds.update(counts)
        out.write(json.dumps(rec) + "\n")
        written += 1

print(f"characterised {written} tables")
print("object totals:", dict(kinds))
