#!/usr/bin/env bash
# Install the Nemesis pipeline into a ParseBench checkout.
#
# 🔴 EVERYTHING HERE IS ADDITIVE. Nothing in ParseBench is edited except two
# registration lists — no evaluator, no metric, no test case, no ground truth is
# touched, so the benchmark scores Nemesis exactly as it scores everything else.
#
#   ./install.sh /path/to/ParseBench /path/to/nemesis/apps/web
#
# Then, from the ParseBench checkout:
#   export NEMESIS_WEB_DIR=/path/to/nemesis/apps/web
#   uv run parse-bench run nemesis_parse --test     # prove the adapter first
#   uv run parse-bench run nemesis_parse            # full benchmark
set -euo pipefail

PB="${1:?usage: install.sh <parsebench-checkout> <nemesis-apps-web>}"
WEB="${2:?usage: install.sh <parsebench-checkout> <nemesis-apps-web>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -d "$PB/src/parse_bench" ] || { echo "not a ParseBench checkout: $PB" >&2; exit 1; }
[ -f "$WEB/scripts/parsebench-parse.mts" ] || { echo "not a Nemesis apps/web: $WEB" >&2; exit 1; }

cp "$HERE/nemesis_provider.py" "$PB/src/parse_bench/inference/providers/parse/nemesis.py"

python3 - "$PB" "$HERE" <<'PY'
import pathlib, sys
pb, here = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])

# 1. lazy-import list for providers
p = pb / "src/parse_bench/inference/providers/parse/__init__.py"
s = p.read_text()
if '"nemesis"' not in s:
    s = s.replace('    "oi_parser",\n]', '    "oi_parser",\n    "nemesis",\n]')
    p.write_text(s)

# 2. pipeline registration
q = pb / "src/parse_bench/inference/pipelines/parse.py"
t = q.read_text()
if "nemesis_parse" not in t:
    t = t.rstrip("\n") + (
        "\n\n    # Nemesis (canonical structural parser — native PDF text + vector rulings)\n"
        "    from parse_bench.inference.providers.parse.nemesis import register_nemesis_pipelines\n\n"
        "    register_nemesis_pipelines(register_fn)\n"
    )
    q.write_text(t)

# 3. a LayoutDetectionModel member, the way every other provider has one.
#    LayoutOutput.model is REQUIRED and typed as that enum, so without this the
#    layout dimension fails validation on every example — which is what the
#    --test run is for.
m = pb / "src/parse_bench/schemas/layout_detection_output.py"
ms = m.read_text()
if "NEMESIS_LAYOUT" not in ms:
    ms = ms.replace(
        '    DOCLING_PARSE_LAYOUT = "docling_parse_layout"',
        '    DOCLING_PARSE_LAYOUT = "docling_parse_layout"\n    NEMESIS_LAYOUT = "nemesis_layout"',
    )
    m.write_text(ms)

# 4. layout adapter — must live in ParseBench's own adapters module, because
#    importing the adapter registry from a provider is a circular import.
a = pb / "src/parse_bench/evaluation/layout_adapters/adapters.py"
body = a.read_text()
if "NemesisParseLayoutAdapter" not in body:
    add = (here / "nemesis_layout_adapter.py").read_text()
    add = add[add.index("def _content("):]          # drop the docstring and its import
    a.write_text(body.rstrip("\n") + "\n\n\n# ── Nemesis ──────────────────────────────────────────────\n" + add)
print("installed")
PY

echo "NEMESIS_WEB_DIR=$WEB"
