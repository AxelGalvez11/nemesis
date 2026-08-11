# ParseBench — external end-to-end parser baseline

ParseBench (`run-llama/ParseBench`, Apache-2.0) is the **general document-parser**
benchmark in the hierarchy. It is not a replacement for the other two:

| Suite | Question it answers | Gate |
|---|---|---|
| Nemesis corpus (164 real course PDFs) | Does a change break the documents Nemesis actually handles? | **Product regression. Zero destructive content loss is a hard requirement.** |
| PubTables-1M + GriTS (frozen sample) | How well are tables discovered and reconstructed on a table-specific benchmark? | Frozen baseline. Movement is an alarm. |
| ParseBench | How good is Nemesis end-to-end versus established parsers? | External reference. |

They measure different things and must never be collapsed into one "parser score".

## Run it

```bash
git clone https://github.com/run-llama/ParseBench.git
./install.sh /path/to/ParseBench /path/to/nemesis/apps/web
cd /path/to/ParseBench && uv sync --extra runners
export NEMESIS_WEB_DIR=/path/to/nemesis/apps/web
uv run parse-bench run nemesis_parse --test   # prove the adapter first
uv run parse-bench run nemesis_parse          # full benchmark
```

## What the integration is, exactly

```
PDF bytes → parseDocument (THE PRODUCTION ENTRY POINT) → DocumentModel
          → toParseBench (apps/web/lib/pdf/parsebench-output.ts, pure rename)
          → ParseBench schema
```

`parseDocument` is what the upload route and the document worker call. There is no
benchmark-only parser, and `toParseBench` takes a `DocumentModel` and nothing else —
it structurally cannot see a test-case id, a ground truth, or a file name.

The install is **purely additive**: 4 files, ~113 insertions, 0 deletions. Two
registration lists, one `LayoutDetectionModel` enum member (every provider has one),
and one layout adapter appended to ParseBench's own adapters module. No evaluator,
metric, test case or ground truth is forked, edited or reimplemented.

The layout adapter exists for one reason: Nemesis stores rectangles UNIT-RELATIVE
(0..1, top-left origin) because a rect is a crop request against a render whose
resolution is chosen at query time. ParseBench's predictions are absolute. It
multiplies. Docling's adapter makes the identical conversion.

## 🔴 Two things to know before reading any number

**The LLM judge is OFF.** `LLAMACLOUD_BENCH_LLM_NORMALIZATION` defaults to `judge`
and calls Anthropic Haiku to fuzzy-match CHART labels and values. Runs here set it
to `off`, so chart scores are not directly leaderboard-comparable. For Nemesis
specifically this cannot change the result — it extracts no chart data, so there is
nothing for a normalizer to normalize — but the flag must be stated, not assumed.

**The vision lane is off.** `parseDocument` falls back to a vision model on pages
with no text layer. With no key configured that cannot run, so a scanned page
yields nothing. Every result carries `visionConfigured` so this is visible in the
output rather than discovered later. This is the NATIVE lane baseline.
