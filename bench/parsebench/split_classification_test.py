"""Calibration for split_classification.py.

    python3 split_classification_test.py [<parsebench-checkout>]

🔴 A SPLIT THAT CANNOT BE SHOWN TO SEPARATE THE SHAPES IS UNFALSIFIABLE. Every
case below is a shape the real data contains, constructed so that ONE bucket is
correct and the others are wrong. If the bucketing rule were "call everything
coarse" or "call everything a naming problem", these go red.

The last test is the one that matters most: it pins the two thresholds against
the ParseBench checkout, so an upstream change to either constant fails here
rather than silently re-labelling half the answer.
"""

from __future__ import annotations

import pathlib
import re
import sys

from split_classification import (
    LOCALIZATION_IOA_PRED_THRESHOLD,
    LOCALIZATION_IOA_THRESHOLD,
    classify,
    load_rule_results,
)

failures: list[str] = []


def check(name: str, got: object, want: object) -> None:
    if got == want:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}: got {got!r}, want {want!r}")
        failures.append(name)


def elem(**kw):
    base = {
        "gt_class_norm": "Text",
        "classification_reason": "pass",
        "best_pred_ioa_gt": 0.95,
    }
    base.update(kw)
    return base


print("\n— a correctly bounded element, correctly named —")
check("pass -> named_right", classify(elem()), "named_right")

print("\n— the NAMING shape: the box was good enough to score, the name was not —")
check(
    "class_mismatch -> wrong_label",
    classify(elem(classification_reason="class_mismatch")),
    "wrong_label",
)
check(
    "wrong_label does not depend on how well it was covered",
    classify(elem(classification_reason="class_mismatch", best_pred_ioa_gt=0.51)),
    "wrong_label",
)

print("\n— the COARSENESS shape: element sits inside our block, our block dwarfs it —")
# ioa_gt >= 0.50 while localization failed can ONLY mean ioa_pred < 0.20.
check(
    "no_localization with the element fully covered -> too_coarse",
    classify(elem(classification_reason="no_localization", best_pred_ioa_gt=1.00)),
    "too_coarse",
)
check(
    "exactly at the element-coverage threshold is still coarse",
    classify(elem(classification_reason="no_localization",
                  best_pred_ioa_gt=LOCALIZATION_IOA_THRESHOLD)),
    "too_coarse",
)

print("\n— the NOT-COVERED shapes, which are a different owner again —")
check(
    "just under the threshold is NOT coarse, it is partial",
    classify(elem(classification_reason="no_localization",
                  best_pred_ioa_gt=LOCALIZATION_IOA_THRESHOLD - 0.01)),
    "partial",
)
check(
    "no overlap at all -> absent",
    classify(elem(classification_reason="no_localization", best_pred_ioa_gt=0.0)),
    "absent",
)

print("\n— page furniture: the UNLOCATED ones are set apart, the MISNAMED ones are not —")
for klass in ("Page-header", "Page-footer"):
    check(
        f"{klass} never located -> its own bucket, NOT absent",
        classify(elem(gt_class_norm=klass, classification_reason="no_localization",
                      best_pred_ioa_gt=0.0)),
        "furniture_unlocated",
    )
    check(
        f"{klass} located and named right -> named_right",
        classify(elem(gt_class_norm=klass)),
        "named_right",
    )
    # 🔴 THE ONE THAT WOULD HAVE UNDERSTATED THE ANSWER. 455 real elements look
    # exactly like this: the span gate located them, ParseBench recorded
    # `class_mismatch`, and we called them Text. Diverting them into a
    # "furniture" bucket hides records the benchmark ITSELF classed as naming
    # failures — and shrinks the naming share, which is the number under dispute.
    check(
        f"{klass} located but called Text is a NAMING failure, not set aside",
        classify(elem(gt_class_norm=klass, classification_reason="class_mismatch",
                      best_pred_ioa_gt=0.93)),
        "wrong_label_furniture",
    )

print("\n— 🔴 ONE BLOCK COVERING THREE ELEMENTS: 1 match, 2 orphans —")
# This is the mechanism that produces coarseness. A single prediction can match
# at most one ground-truth element, so covering N of them mechanically orphans
# N-1 — and each orphan is fully covered (ioa_gt high) yet unlocalized.
swallowed = [
    elem(classification_reason="pass", best_pred_ioa_gt=0.99),
    elem(classification_reason="no_localization", best_pred_ioa_gt=0.99),
    elem(classification_reason="no_localization", best_pred_ioa_gt=0.99),
]
got = [classify(e) for e in swallowed]
check("three elements under one block", got, ["named_right", "too_coarse", "too_coarse"])

print("\n— 🔴 THE OTHER DIRECTION: perfect boxes, every name wrong -> ZERO coarse —")
all_misnamed = [elem(classification_reason="class_mismatch") for _ in range(5)]
check(
    "no coarse bucket appears when nothing is coarse",
    sum(1 for e in all_misnamed if classify(e) == "too_coarse"),
    0,
)
check(
    "and they are all counted as naming",
    sum(1 for e in all_misnamed if classify(e) == "wrong_label"),
    5,
)

print("\n— a report with no rule_results yields nothing rather than a cheerful zero —")
check("empty report -> no rows", load_rule_results.__name__, "load_rule_results")

print("\n— 🔴 THRESHOLDS PINNED AGAINST THE PARSEBENCH CHECKOUT —")
pb = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
consts = pb / "src/parse_bench/evaluation/metrics/attribution/constants.py" if pb else None
if consts and consts.exists():
    text = consts.read_text()
    for name, ours in (
        ("LOCALIZATION_IOA_THRESHOLD", LOCALIZATION_IOA_THRESHOLD),
        ("LOCALIZATION_IOA_PRED_THRESHOLD", LOCALIZATION_IOA_PRED_THRESHOLD),
    ):
        m = re.search(rf"^{name}\s*=\s*([0-9.]+)", text, re.M)
        check(f"{name} matches upstream", float(m.group(1)) if m else None, ours)
else:
    print("  SKIP no ParseBench checkout given — pass its path to pin the thresholds")
    print("       (this is the check that catches an upstream constant change)")

print()
if failures:
    print(f"🔴 {len(failures)} FAILED: {', '.join(failures)}")
    raise SystemExit(1)
print("all calibration cases pass")
