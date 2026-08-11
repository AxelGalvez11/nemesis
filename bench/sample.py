"""
A reproducible, stratified PubTables-1M sample — chosen BEFORE anything is fetched.

🔴 TWO CONSTRAINTS SHAPE THIS, AND BOTH ARE STATED IN THE REPORT RATHER THAN
HIDDEN IN THE SAMPLING.

  UNAMBIGUOUS IDENTITY.  Ground truth is per cropped table image; Nemesis emits N
    tables per page from the source PDF. Matching them needs either the 3.7 GB
    PDF-coordinate archive or a document where the question does not arise. This
    samples only articles with EXACTLY ONE table in the entire dataset — across
    train, val and test — so "the table" is unambiguous. That biases toward
    simpler articles and the report must say so.

  RULEDNESS IS NOT ANNOTATED.  PubTables-1M does not record whether a table is
    drawn with rules, and this does not invent the label. Strata are the
    structural facts the annotations actually contain: size, merged cells,
    header shape.

Every id chosen is written out, with the seed, so any future parser change is
measured against exactly this sample.
"""
import json
import random
import sys
from collections import Counter, defaultdict

index_path, images_filelist, test_filelist, out_path = sys.argv[1:5]
per_stratum = int(sys.argv[5]) if len(sys.argv) > 5 else 60
SEED = 20260811

# How many tables each article has ANYWHERE in the dataset.
tables_per_article = Counter()
for line in open(images_filelist):
    name = line.strip().split("/")[-1]
    if "_table_" in name:
        tables_per_article[name.split("_table_")[0]] += 1

in_test = {line.strip().split("/")[-1].rsplit(".", 1)[0] for line in open(test_filelist)}

records = []
for line in open(index_path):
    r = json.loads(line)
    if r["id"] not in in_test:
        continue
    if tables_per_article.get(r["pmc"], 0) != 1:
        continue                      # ambiguous identity — excluded, and counted below
    records.append(r)

# ── strata, from annotated structure only ────────────────────────────────────
def strata_of(r):
    out = []
    if r["spanning"] > 0:
        out.append("merged-cells")
    if r["rows"] >= 20:
        out.append("many-rows")
    if r["cols"] >= 8:
        out.append("many-columns")
    if r["row_headers"] > 0:
        out.append("projected-row-headers")
    if r["col_headers"] > 1:
        out.append("multi-row-header")
    if r["spanning"] == 0 and r["rows"] <= 12 and 2 <= r["cols"] <= 5:
        out.append("simple-grid")
    if not out:
        out.append("other")
    return out

buckets = defaultdict(list)
for r in records:
    for s in strata_of(r):
        buckets[s].append(r)

rng = random.Random(SEED)
chosen, seen = [], set()
for name in sorted(buckets):
    pool = sorted(buckets[name], key=lambda r: r["id"])
    rng.shuffle(pool)
    taken = 0
    for r in pool:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        chosen.append({**r, "stratum": name})
        taken += 1
        if taken >= per_stratum:
            break

with open(out_path, "w") as out:
    for r in sorted(chosen, key=lambda r: r["id"]):
        out.write(json.dumps(r) + "\n")

print(f"seed {SEED}  ·  per stratum {per_stratum}")
print(f"test tables            {len(in_test)}")
print(f"  of which single-table articles {len(records)}  ({100*len(records)/max(len(in_test),1):.1f}%)")
print(f"sampled                {len(chosen)} tables from {len({r['pmc'] for r in chosen})} articles")
for name in sorted(buckets):
    got = sum(1 for r in chosen if r["stratum"] == name)
    print(f"   {name:24s} pool {len(buckets[name]):6d}   sampled {got}")
print(f"\nwritten to {out_path}")
