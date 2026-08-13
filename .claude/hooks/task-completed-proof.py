#!/usr/bin/env python3
"""TaskCompleted gate: a task that declares PROOF REQUIRED may not close without recorded proof.

FAILS OPEN BY DESIGN. This hook runs on every task completion for the whole Canvas team; a hook
that blocks on a schema guess would halt the team rather than protect it. Anything unexpected —
unparseable stdin, a field that moved, an exception — exits 0 and allows the completion. It blocks
only when it can positively see both that proof was demanded and that none was recorded.
"""
import json, re, sys

ALLOW = 0
BLOCK = 2  # exit 2 = blocking error; stderr goes back to the agent as feedback

# A task opts IN to the gate by carrying this marker in its text.
DEMAND = re.compile(r"PROOF REQUIRED", re.I)
# Proof is "recorded" when the closing text names what was actually run or observed.
SUPPLY = re.compile(
    r"PROOF:|EXECUTED:|\bserving (commit|sha)\b|\bmerge-base\b|"
    r"\bvercel inspect\b|\bnode --test\b|\btests? (?:executed|ran|passed)\b",
    re.I,
)

def blob(x, depth=0):
    """Flatten arbitrary nested JSON to one searchable string."""
    if depth > 6:
        return ""
    if isinstance(x, str):
        return x
    if isinstance(x, dict):
        return " ".join(blob(v, depth + 1) for v in x.values())
    if isinstance(x, (list, tuple)):
        return " ".join(blob(v, depth + 1) for v in x)
    return ""

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return ALLOW
        text = blob(json.loads(raw))
    except Exception:
        return ALLOW  # cannot read it => cannot judge it => do not block

    if not DEMAND.search(text):
        return ALLOW
    if SUPPLY.search(text):
        return ALLOW

    sys.stderr.write(
        "This task declares PROOF REQUIRED and the completion records no proof.\n"
        "State what you actually executed and what it returned, then complete again. "
        "Name the command and its result — for production claims, the serving commit "
        "resolved via `vercel inspect https://app.enternemesis.com` plus a "
        "`git merge-base --is-ancestor` containment check.\n"
        "Implemented, merged, deployed and integration-proven are four different things. "
        "A passing unit test is not proof that the learner path works.\n"
    )
    return BLOCK

if __name__ == "__main__":
    sys.exit(main())
