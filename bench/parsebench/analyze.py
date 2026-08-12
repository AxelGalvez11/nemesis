"""Read a ParseBench run and report the five dimensions plus a failure taxonomy.

🔴 THIS READS PARSEBENCH'S OWN REPORTS. It computes no metric of its own — every
number here is one ParseBench already produced. Its only job is to put the five
dimensions in one place and group the failures ParseBench recorded into classes,
so a reader sees WHAT broke rather than a single average.

🔴 THE TAXONOMY IS BUILT FROM OBSERVED RULE TYPES, NOT FROM A LIST I IMAGINED.
Classes come from the `type` field of the rules that actually failed. A class with
no failures is not printed, because an empty bucket in a report reads as evidence
that the thing was checked and found clean.

    python3 analyze.py <parsebench-checkout>/output/nemesis_parse
"""

from __future__ import annotations

import collections
import json
import pathlib
import sys

# ParseBench's own headline metric per dimension, and what the leaderboard calls it.
HEADLINE = {
    "table": ("table", "Tables"),
    "chart": ("chart", "Charts"),
    "text_content": ("content_faithfulness", "Content Faithfulness"),
    "text_formatting": ("semantic_formatting", "Semantic Formatting"),
    "layout": ("visual_grounding", "Visual Grounding"),
}


def pct(x: float | None) -> str:
    return "  n/a " if x is None else f"{100 * x:6.2f}"


def headline_value(report: dict, dimension: str) -> float | None:
    """The score ParseBench itself reports for this dimension."""
    metrics = report.get("aggregate_metrics", {})
    key, _ = HEADLINE[dimension]
    for candidate in (key, f"avg_{key}", f"avg_{key}_score"):
        if candidate in metrics:
            return metrics[candidate]
    # Dimensions whose headline is a rule pass rate.
    for candidate in ("avg_rule_pass_rate", "avg_grits_con", "mAP@[.50:.95]", "avg_mAP@[.50:.95]"):
        if candidate in metrics:
            return metrics[candidate]
    return None


def main(root: pathlib.Path) -> None:
    print(f"\n{'=' * 78}\nPARSEBENCH — nemesis_parse\n{'=' * 78}")
    print(f"{'dimension':22} {'score':>7}  examples  failed  notes")

    scores: dict[str, float | None] = {}
    for dimension in HEADLINE:
        path = root / dimension / "_evaluation_report.json"
        if not path.exists():
            print(f"{HEADLINE[dimension][1]:22} {'NOT RUN':>7}")
            continue
        report = json.loads(path.read_text())
        value = headline_value(report, dimension)
        scores[dimension] = value
        note = ""
        if report["failed"]:
            note = "🔴 evaluation errors — not a parser score"
        print(
            f"{HEADLINE[dimension][1]:22} {pct(value)}  {report['total_examples']:8}  "
            f"{report['failed']:6}  {note}"
        )

    known = [v for v in scores.values() if v is not None]
    if known:
        print(f"\n{'Overall (mean of dimensions)':22} {pct(sum(known) / len(known))}")
        print("🔴 This mean is NOT ParseBench's published Overall — that is a weighted")
        print("   figure computed by its own leaderboard. Compare dimensions, not this.")

    # ── failure taxonomy, from the rules that actually failed ────────────────
    print(f"\n{'=' * 78}\nFAILURE TAXONOMY — from observed failures only\n{'=' * 78}")
    for dimension in HEADLINE:
        path = root / dimension / "_evaluation_report.json"
        if not path.exists():
            continue
        report = json.loads(path.read_text())
        failures: collections.Counter[str] = collections.Counter()
        totals: collections.Counter[str] = collections.Counter()
        examples: dict[str, str] = {}
        for example in report.get("per_example_results", []):
            metrics = example.get("metrics")
            if not isinstance(metrics, list):
                continue
            for metric in metrics:
                for rule in (metric.get("metadata") or {}).get("rule_results", []) or []:
                    kind = str(rule.get("type", "unknown"))
                    totals[kind] += 1
                    if not rule.get("passed"):
                        failures[kind] += 1
                        examples.setdefault(kind, str(rule.get("explanation", ""))[:150])
        if not failures:
            continue
        print(f"\n{HEADLINE[dimension][1]}")
        for kind, count in failures.most_common():
            share = 100 * count / totals[kind] if totals[kind] else 0
            print(f"  {kind:34} {count:6} / {totals[kind]:6} failed ({share:5.1f}%)")
            if examples.get(kind):
                print(f"      e.g. {examples[kind]}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    main(pathlib.Path(sys.argv[1]))
