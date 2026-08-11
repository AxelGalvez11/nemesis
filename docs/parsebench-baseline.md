# ParseBench baseline — 2026-08-11

The external, end-to-end parser benchmark. **Baseline only: the parser on `main`
was run unchanged and nothing was tuned against these numbers.**

Run: `run-llama/ParseBench` @ `facdaf0`, full dataset, 2,036 PDFs scored across
five dimensions. `LLAMACLOUD_BENCH_LLM_NORMALIZATION=off` (no LLM judge).
Vision lane unconfigured — this is the **native** lane.

## Results

| Dimension | Nemesis | scored on | note |
|---|--:|--:|---|
| Tables | **12.73** | 503/503 | GriTS+TRM composite |
| Charts | **0.83** | 568/568 | no chart extraction exists |
| Content Faithfulness | **62.06** | 506/506 | |
| Semantic Formatting | **11.70** | 476/476 | no character styling in the model |
| Visual Grounding | **42.05** | 458/500 | 42 inputs are `.jpg`, not PDFs |

**There is no single "Nemesis score" here and one must not be invented.** These
five measure different capabilities; ParseBench's published Overall is weighted
by its own leaderboard and cannot be reproduced by averaging these.

## Where Nemesis stands (ParseBench's own leaderboard)

```
parser                                      Tbl   Chrt  Faith    Fmt   Grnd   $/page
► Nemesis (native, local)                  12.7    0.8   62.1   11.7   42.0    0.00
Docling-models                             66.4   52.8   66.9    1.0   66.1     n/a
Firecrawl                                  55.9    0.0   74.4   25.2    0.0    0.90
Google Cloud Document AI                   55.1    1.4   83.7   50.5   61.3    1.00
AWS Textract                               84.6    6.0   74.8    3.7   70.4    1.50
Azure Document Intelligence (Layout)       86.0    1.6   84.9   51.9   73.8    1.00
Datalab Fast                               85.1   57.6   82.8   39.1   74.5    0.40
LlamaParse Cost Effective                  81.4   70.2   90.9   68.8   72.6    0.38
LlamaParse Agentic                         90.7   78.1   89.7   85.2   80.6    1.25
```

🔴 **Not like-for-like, and that is the point.** Every other row reads RENDERED
PAGES with a vision model or a paid API. Nemesis reads native text and vector
rulings, locally, at no per-page cost. It should be expected to lose wherever the
answer exists only in pixels. **Nemesis is behind on every dimension, including
ones where that excuse does not apply** — see the backlog.

## 🔴 The finding that matters most: geometry is strong, labels are weak

Visual Grounding decomposes, and the two halves disagree sharply:

```
localization  af1 85.64   precision 84.05   recall 88.76
classification                              23.62
```

Nemesis **finds the right rectangle and gives it the wrong name.** A sampled
failure: ground truth `Page-header`, Nemesis said `Text`, IoU **0.80** and
`localization_pass: True`. Per class:

```
Picture 36.2 · Section 15.1 · Table 10.9 · Text 8.8 · Page-header 0.0 · Page-footer 0.0
```

**Page headers and footers are 0.0 because Nemesis has no concept of them.** It
does not distinguish running furniture from body text anywhere in the model. That
is one missing classifier over geometry that already works — not a rewrite.

## 🔴 Nemesis injects text that is not in the document

`unexpected_sentence_percent` fails on **91.8%** of documents, and the dominant
cause is our own placeholder:

```
unexpected: 'figure - not examined' (1x)
```

`document-model.ts:523` emits `[Figure — not examined]` into `blockToText`, so a
literal sentence that appears nowhere in the source is injected into the extracted
text. The benchmark scores it as hallucination, and it is right to: every
consumer — chat, retrieval, Canvas, chunking — receives it as document content.
**This is a real defect found by an external benchmark, not a scoring artifact.**

## Failure taxonomy — from observed failures only

```
CONTENT
  missing_specific_word          26,539/105,369  (25.2%)   much of it CJK
  missing_specific_sentence      11,370/ 18,768  (60.6%)
  order (reading order)           7,911/ 13,087  (60.4%)
  unexpected_sentence_percent       462/    503  (91.8%)   ← our placeholder
  is_footer                         307/    307 (100.0%)   ← no furniture concept

FORMATTING          (DocBlock carries NO character-level styling)
  is_bold      93.0%   is_italic 93.0%   is_underline 100%
  is_sup      100.0%   is_mark  100.0%   is_latex   94.3%
  is_title     86.5%   title_hierarchy 93.0%

CHART
  chart_data_point            4,818/4,864 (99.1%)  "No tables found in content"

GROUNDING
  classification             13,759/13,759 (100% of class rules examined)
  order                         160/   637  (25.1%)
```

## Recorded scope limits — evidence, not excuses

- **Charts (0.83)** — no chart extraction of any kind. A chart is pixels; the
  native lane cannot see it.
- **Semantic Formatting (11.70)** — `DocBlock` has no bold/italic/underline/
  super/subscript. Note `Docling-models` scores **1.03** here, so this is
  characteristic of native parsers, but Google DocAI (50.5) and Mistral (66.4)
  show it is not inherent to the problem.
- **42 `.jpg` inputs in Visual Grounding** — correctly refused. Scored over
  458/500; a VLM reads all 500.
- **Borderless tables** — unchanged, still unsupported, still frozen.

## What changed in the harness (and did not change in the parser)

The first full run scored Tables at exactly **0.0000** across 503 documents.
False. ParseBench gates table scoring on the literal string `<table`, and no
markdown-pipe→HTML conversion exists in its metrics. The serializer emitted pipe
tables, so all **179 tables the parser did detect** were invisible. Rendering from
`cells` as HTML — the only form that can carry a span — moved it to **12.73**.

🔴 **That delta measures the serializer, not the parser.** The parser is
byte-identical.

## Reproduce

```bash
git clone https://github.com/run-llama/ParseBench.git
bench/parsebench/install.sh <checkout> <nemesis>/apps/web
cd <checkout> && uv sync --extra runners
export NEMESIS_WEB_DIR=<nemesis>/apps/web LLAMACLOUD_BENCH_LLM_NORMALIZATION=off
uv run parse-bench run nemesis_parse --max_concurrent 8
python3 bench/parsebench/analyze.py <checkout>/output/nemesis_parse
```
