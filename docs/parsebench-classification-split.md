# What the layout naming gap actually is — 2026-08-13

ParseBench scores our layout work on two separate things: **localization** (did we
draw the right rectangle?) and **classification** (did we give it the right name?).
The gap between them is stark — and it was described to the owner as

> *"an engineering gap — a classifier over geometry that already works."*

**That description is wrong for about 88% of the gap.** This document measures the
split instead of arguing it.

## The answer

Over all **13,672** ground-truth elements the benchmark scored:

| | count | share of the deficit | |
|---|--:|--:|---|
| named right | 3,341 | — | we found it and named it correctly |
| **a NAMING problem** | **1,200** | **11.6%** | the box was fine, the name was wrong |
| **a COARSENESS problem** | **7,443** | **72.0%** | our block covers it but is **more than 5× its size** |
| **NOT COVERED** | 1,346 | 13.0% | we cover less than half of it (998) or nothing at all (348) |
| furniture never located | 342 | 3.3% | header/footer matched by a different gate — no claim made |

**A classifier cannot fix a block that swallows the element whole.** There is no
label that is correct for a block covering three things, so 72% of the deficit is
not addressable by naming at all. It is block granularity — how our parser decides
where one piece of a page ends and the next begins.

### The single number that tells the story

For elements we failed to match, we asked how much of the element our nearest block
actually covers:

```
min 0.000   p10 0.380   p25 0.857   MEDIAN 1.000   p75 1.000   p90 1.000
5,616 elements are at least 99% inside one of our blocks — and score zero
```

**The median unmatched element is entirely inside one of our blocks.** We are not
missing these. We are drawing one rectangle around several of them.

## Why "too coarse" is not our word

ParseBench passes localization only when **both** of its coverage tests hold:

```
localization_pass  ==  (ioa_gt >= 0.50)   AND   (ioa_pred >= 0.20)
                       how much of the          how much of OUR BLOCK
                       ELEMENT is in ours       is in the element
```

So when a match failed while the element is still ≥50% inside our block, the half
that failed can only be the second — under 20% of our block lies in the element,
i.e. **our block is more than five times the area of the thing it covers.**

🔴 **That threshold is the scorer's, not ours.** This is what turns the question
from a judgement call into a measurement.

### And the conclusion does not depend on where the line is drawn

| element-coverage cut | coarse | not covered |
|---|--:|--:|
| ≥ 0.30 | 8,116 (92.3%) | 673 |
| ≥ 0.50 ← the benchmark's own | 7,443 (84.7%) | 1,346 |
| ≥ 0.70 | 7,067 (80.4%) | 1,722 |
| ≥ 0.90 | 6,426 (73.1%) | 2,363 |
| ≥ 0.99 (swallowed whole) | 5,616 (63.9%) | 3,173 |

Even at the most conservative possible reading — counting only elements our block
covers **entirely** — coarseness is still the largest cause by a wide margin.

## 🔴 The distribution, not the mean

A mean hid a bimodal result once on this project and that is what froze this lane.
So: per document, what share of that document's own deficit does each cause explain?

```
                            min   p25  median  p75   max    explains NONE   explains ALL
coarseness                 0.00  0.42   0.64  0.83  1.00      30 / 384        4 / 384
naming                     0.00  0.05   0.13  0.25  1.00      43 / 384        5 / 384
```

**Coarseness is the majority cause in the median document, not an artefact of a few
extreme ones.** It explains none of the deficit in only 30 of 384 documents. This is
a broad, uniform property of how we segment pages — unlike the Content Faithfulness
−0.51, which was 222 documents better and 92 worse.

## The positive control: this run reproduces the numbers exactly

A split computed from a run that did not reproduce the quoted numbers would not
describe the number the owner was given. It reproduced them to the digit:

| | before/after run (#485) | this run | |
|---|--:|--:|---|
| Localization (af1) | 90.83 | **90.83** | ✅ |
| Classification | 28.30 | **28.30** | ✅ |
| Visual Grounding | 48.90 | **48.90** | ✅ |
| documents scored | 450 of 500 | **450 of 500** | ✅ |
| F1 Page-header / Page-footer | 0.00 / 0.00 | **0.00 / 0.00** | ✅ |

🔴 **Micro versus macro.** The 28.30 above is ParseBench's macro average over
documents. The split in this document is the **micro** figure — every element
pooled — which is **24.44%** named right. Both come from this one run. A reader
checking 3,341 / 13,672 against "28.30" should expect the ~4-point difference.

### 🔴 Four files on the parse path changed since that run, and each was checked

The previous session established the benchmark's dependencies were byte-identical
across 104 commits. **That is no longer true**, so the reproduction is evidence
rather than a tautology:

| change | can it move a layout number? |
|---|---|
| `pdf/structure.ts` (#510) | **No.** Adds a per-page breakdown of unread table regions and derives the existing total from it. No rectangle, block or label changes. |
| `pdf/parsebench-output.ts` (#567) | **No, on this corpus.** It taught the renderer to say `Page-header`/`Page-footer`. Measured below: we predict furniture on **zero** of these documents, so there is nothing for it to report. |
| `notebooks/parse-document.ts` (b340b566) | **Not here.** It stopped image-only PDFs being discarded whole. They now survive the parser — but still carry no layout pages, so the layout adapter still rejects them. |
| `shared/document-model.ts`, `docling-adapter.ts` | **No.** Coverage/locality and DOCX-PPTX paths; neither is on the PDF layout lane. |

**Same 50 failures as before, but 8 of them now fail for a different reason.** The
42 `.jpg` inputs are correctly refused; the 8 image-only PDFs used to be thrown away
by `parseDocument` and now survive it, yet produce no page rectangles for layout to
score. Nobody should read "50 failures, unchanged" as "b340b566 did nothing".

### The single-page claim, finally measured

#567 rests on the claim that furniture cannot be detected here. Verified from our own
parser's output across all 500 documents rather than asserted:

```
documents reporting exactly 1 page   450
documents reporting 0 pages            8   (the image-only ones)
documents reporting 2 or more          0
Page-header / Page-footer PREDICTED    0   across the entire corpus
```

**So #567 provably could not move this score, and provably did not.** It remains a
fix against a latent loss — on a real multi-page document the parser does emit
`Page-footer`, and before #567 that would have been reported as ordinary text.

## The naming half that IS real, and where it lives

Of 797 ground-truth headers and footers, **455 were located** by ParseBench's span
gate and **none were named correctly** — we called them `Text` or `Section`. That is
a genuine naming failure, recorded by the benchmark itself. It is counted in the
1,200 above, and it is **unclosable on this corpus**: running furniture is identified
by repetition across pages, and these documents have one page each.

The rest of the naming failures are ordinary confusions:

```
339  truth Text        -> we said Section       61  truth Table   -> we said Text
231  truth Section     -> we said Text          46  truth Text    -> we said Picture
212  truth Page-header -> we said Text          27  truth Picture -> we said Text
158  truth Page-footer -> we said Text
```

The `Text ↔ Section` pair is 570 of 1,200 — heading-versus-body, both directions.

## What the coarse blocks swallow

```
5,021  Text        1,793  Section        615  Picture        14  Table
```

Body text is where we merge hardest, which is consistent with the failure being
paragraph/column segmentation rather than anything to do with labels.

## 🔴 The evidence is preserved this time

Both previous runs produced this per-element detail and neither kept it — which is
the only reason the question went unanswered for two days. The harness writes it to
`_evaluation_report.json` on **every** run, inside
`per_example_results[].metrics[].metadata.rule_results`.

```
bench/results/parsebench-layout-elements.jsonl.gz   13,672 records, 347 KB
bench/parsebench/split_classification.py            the grouping, no metric of its own
bench/parsebench/split_classification_test.py       19 calibration cases
```

The upstream 53 MB `_evaluation_report.json` is the source and is **not** committed.
To regenerate the table from a rerun:

```bash
python3 bench/parsebench/split_classification.py \
  <parsebench-checkout>/output/nemesis_parse \
  --jsonl bench/results/parsebench-layout-elements.jsonl
```

### The instrument was calibrated by breaking it

A split that cannot be shown to separate the shapes is unfalsifiable. Each defect
was reintroduced and confirmed red:

```
coarseness never detected (the "it's all a classifier" claim)  -> 3 RED
every unmatched element called coarse                          -> 2 RED
a threshold drifting away from upstream                        -> 1 RED
page furniture set aside whole                                 -> 4 RED
restored                                                       -> 19 PASS
```

🔴 **The fourth one was a real defect in the first version of this analysis**, caught
in review: setting furniture aside as a category hid 455 elements the benchmark had
*already* classed as naming failures, and understated the naming share as 7.8%
instead of 11.6%. The buckets now split furniture by whether it was located.

## Spend: zero, confirmed rather than inherited

- `LLAMACLOUD_BENCH_LLM_NORMALIZATION=off` was **set explicitly**. Its default is
  `judge`, which calls Anthropic Haiku — "it was off last time" is not a control.
- Installed **without** `--extra runners`, so `anthropic`, `openai` and
  `google-genai` are not present in the environment at all. The judge could not run
  even if the flag were wrong; it would raise an import error.
- The layout evaluator is pure geometry — numpy IoU/IoA matrices. No model call
  exists on this path.
- The Nemesis side is local parsing. `visionConfigured: false` on every result.

## Scope

**Layout dimension only** — classification and localization exist in no other
dimension, so the other four could not inform this question. Tables, Charts, Content
Faithfulness and Semantic Formatting are unchanged from
`parser-repairs-before-after.md` and were not rerun.

Run: `run-llama/ParseBench` @ `facdaf0` (identical to both prior runs), Nemesis @
`e82e346b`, 500 layout documents, 450 scored.
