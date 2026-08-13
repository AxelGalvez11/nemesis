"""Split the ParseBench layout classification deficit into its causes.

    python3 split_classification.py <parsebench-checkout>/output/nemesis_parse [--jsonl OUT]

🔴 THIS COMPUTES NO METRIC OF ITS OWN. Every field it reads was recorded by
ParseBench's own layout evaluator, and the two numbers it compares against are
ParseBench's own constants. Its only job is to GROUP per-element outcomes the
benchmark already decided, so a reader sees WHICH failure happened instead of
one averaged number. Nothing here re-matches a box or re-scores a label.

WHY THE SPLIT IS POSSIBLE, AND WHY IT IS NOT A JUDGEMENT CALL
-------------------------------------------------------------
For an ordinary (non-furniture) element ParseBench passes localization only when
BOTH of its coverage tests hold:

    localization_pass  ==  (ioa_gt >= 0.50)      AND   (ioa_pred >= 0.20)
                           how much of the             how much of OUR BLOCK
                           ELEMENT lies inside         lies inside the element
                           our block

So when localization FAILED while `ioa_gt` is still >= 0.50 — the element is
comfortably inside one of our blocks — the half that failed can only be
`ioa_pred`. That means under 20% of our block lies in the element, i.e. our
block is **more than five times the area of the thing it covers**.

🔴 "Too coarse" is therefore the SCORER'S threshold, not one this file invents.
That is the whole reason the question is answerable rather than arguable.

THE THIRD BUCKET IS NOT OPTIONAL
--------------------------------
An element that is not covered at all fails for a different reason and belongs
to a different owner. Folding it into either of the other two would aim a fix at
the wrong lane, so it is reported separately even when it is small.

PAGE FURNITURE IS SCORED THROUGH A DIFFERENT GATE
-------------------------------------------------
`Page-header`/`Page-footer` are matched by `_build_page_furniture_group`, a
span-coverage rule rather than the two-threshold test above. The deduction in
this file DOES NOT HOLD for them, so they are counted apart and never mixed into
the coarse/absent split.
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys
from typing import Any

# ParseBench's own constants — evaluation/metrics/attribution/constants.py.
# Mirrored here (not imported) so this script runs without the venv; the
# calibration test pins them against the checkout so they cannot drift silently.
LOCALIZATION_IOA_THRESHOLD = 0.50       # of the ELEMENT, inside our block
LOCALIZATION_IOA_PRED_THRESHOLD = 0.20  # of OUR BLOCK, inside the element

PAGE_FURNITURE_CLASSES = {"Page-header", "Page-footer"}

RULE_METRIC = "layout_element_rule_pass_rate"

# The buckets, in report order, with the plain-English question each answers.
BUCKETS = [
    ("named_right", "found it and named it right"),
    ("wrong_label", "bounded well enough to score, WRONG NAME"),
    ("wrong_label_furniture", "running header/footer, located, called something else"),
    ("too_coarse", "our block covers it but is >5x its size"),
    ("partial", "we touch it but cover less than half of it"),
    ("absent", "nothing of ours overlaps it at all"),
    ("furniture_unlocated", "header/footer we never located — a different gate"),
]

# The two naming buckets, and everything that is a deficit.
NAMING = ("wrong_label", "wrong_label_furniture")


def classify(rule: dict[str, Any]) -> str:
    """Bucket one ground-truth element from what the evaluator recorded.

    Reads only `gt_class_norm`, `classification_reason` and `best_pred_ioa_gt`
    — three fields ParseBench wrote. No geometry is recomputed.
    """
    reason = rule.get("classification_reason")

    if str(rule.get("gt_class_norm") or "").strip() in PAGE_FURNITURE_CLASSES:
        # 🔴 FURNITURE IS SPLIT, NOT SET ASIDE WHOLE. When localization passed,
        # `class_mismatch` is ParseBench's own verdict that the box was fine and
        # the NAME was wrong — that is a naming failure whatever gate matched the
        # box, and burying it under "furniture" would shrink the naming number by
        # hiding records the benchmark had already classed as naming.
        # Only the UNLOCATED ones are set apart, because the coarse/not-covered
        # deduction below relies on the two-threshold test, which they did not use.
        if reason == "class_mismatch":
            return "wrong_label_furniture"
        if reason == "pass":
            return "named_right"
        return "furniture_unlocated"

    if reason == "pass":
        return "named_right"
    if reason == "class_mismatch":
        # Localization passed, so the box was good enough by the scorer's own
        # test. The only thing wrong is the name.
        return "wrong_label"

    # reason == "no_localization": at least one coverage test failed.
    ioa_gt = float(rule.get("best_pred_ioa_gt") or 0.0)
    if ioa_gt >= LOCALIZATION_IOA_THRESHOLD:
        # The element IS inside one of our blocks, yet localization failed, so
        # ioa_pred must be under 0.20. Our block is >5x the element.
        return "too_coarse"
    if ioa_gt > 0.0:
        return "partial"
    return "absent"


def load_rule_results(report_path: pathlib.Path) -> list[dict[str, Any]]:
    """Pull every per-element record out of a ParseBench evaluation report.

    🔴 These live in `per_example_results[].metrics[].metadata.rule_results` and
    are written by the harness on EVERY run. Both previous Nemesis runs produced
    them and neither preserved them, which is the only reason this question went
    unanswered.
    """
    report = json.loads(report_path.read_text())
    rows: list[dict[str, Any]] = []
    for example in report.get("per_example_results", []):
        if not example.get("success"):
            continue
        for metric in example.get("metrics", []):
            if metric.get("metric_name") != RULE_METRIC:
                continue
            for rule in metric.get("metadata", {}).get("rule_results", []):
                rows.append({"document": example.get("test_id") or example.get("example_id"), **rule})
    return rows


def pct(n: int, d: int) -> str:
    return "   n/a" if d == 0 else f"{100.0 * n / d:5.1f}%"


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("output_dir", help="<parsebench-checkout>/output/nemesis_parse")
    ap.add_argument("--jsonl", help="write the per-element table here (the preserved evidence)")
    args = ap.parse_args(argv)

    # A multi-group run nests the report under `layout/`; a `--group layout` run
    # writes it at the pipeline root. Accept both rather than depend on how the
    # run happened to be invoked.
    root = pathlib.Path(args.output_dir)
    for candidate in (root / "layout" / "_evaluation_report.json", root / "_evaluation_report.json"):
        if candidate.exists():
            report_path = candidate
            break
    else:
        print(f"no layout evaluation report under {root}", file=sys.stderr)
        return 1

    rows = load_rule_results(report_path)
    if not rows:
        print("🔴 report contains no rule_results — nothing to split", file=sys.stderr)
        return 1

    buckets = collections.Counter(classify(r) for r in rows)
    total = len(rows)
    deficit = total - buckets["named_right"]

    print(f"\n{'=' * 76}\nCLASSIFICATION OUTCOME PER GROUND-TRUTH ELEMENT\n{'=' * 76}")
    print("🔴 This is the MICRO figure — every element pooled. ParseBench's headline")
    print("   28.30 is the MACRO average over documents. Both come from this run.")
    print(f"\n{'bucket':22} {'count':>7} {'of all':>7} {'of deficit':>11}  what it means")
    for key, meaning in BUCKETS:
        n = buckets[key]
        of_def = "     —" if key == "named_right" else pct(n, deficit)
        print(f"{key:22} {n:7d} {pct(n, total):>7} {of_def:>11}  {meaning}")
    print(f"{'-' * 76}\n{'TOTAL':22} {total:7d}")
    print(f"\nnamed right: {buckets['named_right']}  ({pct(buckets['named_right'], total)})"
          f"        THE DEFICIT: {deficit}  ({pct(deficit, total)})")

    naming = sum(buckets[k] for k in NAMING)
    coarse = buckets["too_coarse"]
    uncovered = buckets["partial"] + buckets["absent"]
    other = buckets["furniture_unlocated"]

    print(f"\n{'=' * 76}\nTHE DEFICIT, SPLIT — ALL {total} SCORED ELEMENTS\n{'=' * 76}")
    print(f"  a NAMING problem       {naming:6d}  {pct(naming, deficit)}   correctly bounded, WRONG NAME")
    print(f"      of which furniture {buckets['wrong_label_furniture']:6d}          "
          f"(located by the span gate, called Text)")
    print(f"  a COARSENESS problem   {coarse:6d}  {pct(coarse, deficit)}   our block is >5x the element it covers")
    print(f"  NOT COVERED            {uncovered:6d}  {pct(uncovered, deficit)}   "
          f"(partial {buckets['partial']}, absent {buckets['absent']})")
    print(f"  furniture never located{other:6d}  {pct(other, deficit)}   different gate — no deduction made")

    # The same split with furniture removed entirely, because furniture is
    # unclosable on a single-page corpus and a reader may want it out.
    nf_deficit = deficit - buckets["wrong_label_furniture"] - other
    print(f"\n— the same split with page furniture removed ({nf_deficit} elements) —")
    print(f"  NAMING {buckets['wrong_label']:6d}  {pct(buckets['wrong_label'], nf_deficit)}"
          f"   COARSENESS {coarse:6d}  {pct(coarse, nf_deficit)}"
          f"   NOT COVERED {uncovered:6d}  {pct(uncovered, nf_deficit)}")

    # ── distribution, never the aggregate alone ──────────────────────────────
    per_doc: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for r in rows:
        per_doc[r["document"]][classify(r)] += 1

    print(f"\n{'=' * 76}\nDISTRIBUTION ACROSS DOCUMENTS — is one cause uniform or concentrated?\n{'=' * 76}")
    for key in ("naming", "too_coarse"):
        shares = []
        for doc, c in per_doc.items():
            d = sum(c.values()) - c["named_right"]
            if d > 0:
                got = sum(c[k] for k in NAMING) if key == "naming" else c[key]
                shares.append(got / d)
        if not shares:
            continue
        shares.sort()
        n = len(shares)
        docs_with_none = sum(1 for s in shares if s == 0.0)
        docs_with_all = sum(1 for s in shares if s == 1.0)
        print(f"\n{key}: share of each document's own deficit ({n} documents with a deficit)")
        print(f"  min {shares[0]:.2f}  p25 {shares[n // 4]:.2f}  median {shares[n // 2]:.2f}  "
              f"p75 {shares[3 * n // 4]:.2f}  max {shares[-1]:.2f}")
        print(f"  documents where this cause explains NONE of the deficit: {docs_with_none} / {n}")
        print(f"  documents where this cause explains ALL  of the deficit: {docs_with_all} / {n}")

    # ── which classes are misnamed, and as what ──────────────────────────────
    print(f"\n{'=' * 76}\nWRONG LABEL — what it was, what we called it (top 12)\n{'=' * 76}")
    confusion = collections.Counter(
        (r.get("gt_class_norm"), r.get("best_pred_class_norm"))
        for r in rows
        if classify(r) in NAMING
    )
    for (gt, pred), n in confusion.most_common(12):
        print(f"  {n:6d}  truth {str(gt):16} -> we said {pred}")

    print(f"\n{'=' * 76}\nCOARSE BLOCKS — which element classes we swallow (top 12)\n{'=' * 76}")
    coarse_by_class = collections.Counter(
        r.get("gt_class_norm") for r in rows if classify(r) == "too_coarse"
    )
    for gt, n in coarse_by_class.most_common(12):
        print(f"  {n:6d}  {gt}")

    if args.jsonl:
        out = pathlib.Path(args.jsonl)
        out.parent.mkdir(parents=True, exist_ok=True)
        keep = (
            "document", "element_id", "page", "gt_class", "gt_class_norm",
            "best_pred_class_norm", "best_pred_ioa_gt", "best_pred_iou",
            "localization_pass", "localization_reason",
            "classification_pass", "classification_reason",
        )
        with out.open("w") as fh:
            for r in rows:
                fh.write(json.dumps({**{k: r.get(k) for k in keep}, "bucket": classify(r)}) + "\n")
        print(f"\npreserved {len(rows)} per-element records -> {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
