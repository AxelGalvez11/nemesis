# Does a vision model close the layout gap? — 2026-08-13

#573 measured our layout deficit over 10,331 elements and split it in two:
**72% is a block too coarse to have any correct name**, **11.6% is a wrong name**,
13% is not covered. The question this test was commissioned to answer:

> **Does a vision model close the 72% coarseness deficit, or only the 11.6%
> naming one?**

## The answer: neither, and not because the model is weak

**Turning our vision lane on changes no rectangle and no label on any of the 18
documents tested — zero of 18, on both of the two shapes production runs.** The
coarseness deficit and the naming deficit are both exactly what they were.

This is not a close call or a small effect. It is a property of how the code is
wired, for two independent reasons, either of which alone would be sufficient:

**1. On a page that has text, the vision lane is never asked anything.**
Before any PDF vision call, `planPdfRead` looks at how much text each page
already has. A page with 120 characters or more is "readable" and vision is
skipped. Every one of these 18 documents is entirely readable by that test — the
thinnest has 836 characters — so the vision reader is never invoked. Measured on
the real code path with a real key present: **0 calls on 18 of 18 documents.**

**2. When it IS invoked, it returns words, never rectangles.** The vision lane's
output is a transcript. That text is folded into the document as a `note` block
with **no rectangle attached**, and our benchmark adapter emits a prediction only
where a rectangle exists. So vision text produces no box at all — it cannot split
a block that is too coarse, cannot move one, and cannot rename one. It also
cannot *hurt* the score: an item with no rectangle produces no prediction rather
than a wrong one.

**Neither reason depends on which 18 documents were chosen.** They are properties
of the code path. The documents are a demonstration, not an estimate.

## What was actually run

Both arms fresh on the same documents, on today's parser — deliberately **not**
compared against the archived #483 numbers, because the parser has changed since
(#469, #470) and "vision helped" and "the parser changed" would be the same
number.

Production has **two shapes**, and running only one would have been the wrong
test:

| shape | what it is | vision calls, 18 docs |
|---|---|--:|
| **upload** | the synchronous upload route; deliberately does not look at figures | **0** |
| **worker** | the background document worker, which passes `lookAtFigures: true` | **5** |

| comparison | vision calls | rectangles or labels changed | prediction text changed |
|---|--:|--:|--:|
| no-vision vs **live** vision, upload shape | 0 | **0 of 18** | 0 of 18 |
| no-vision vs **live** vision, worker shape | 5 paid | **0 of 18** | 0 of 18 |
| no-vision vs **forced** description on every figure | 5 | **0 of 18** | 5 of 18 |

The third row is the one that carries the capability claim. On the live run the
model looked at the figures it was sent and answered `none` to all of them —
correctly, they are logos and decorative photography, and the prompt says to
answer exactly that. So the live run alone could be dismissed as "it never really
tried". The third row removes that objection: a real description is **forced**
onto every routed figure, the text of five documents changes as a result, and
**not one rectangle and not one label moves.**

### Why this is a diff and not a score

ParseBench scores layout from exactly two things per prediction — a rectangle and
a label. If that set is identical between two arms, every localization and
classification number is identical, necessarily rather than probably. Re-running
a scorer could not produce a stronger claim and would add the risk of
re-implementing a metric.

### The positive control, so a null result is readable

A run that reports "no calls happened" is worthless unless the counter is known
to move. On an image-only PDF (a page rasterised so it has no text layer):

| arm | result |
|---|---|
| no vision | the parse returns **empty — no text**, and no layout items at all |
| vision on | **1 call**, `gemini-3.5-flash`, text recovered — and **one** layout item: a `Picture` covering the whole page, its own text empty |

The counter moves, so its zeros mean something. And the shape of that one item is
the finding again from the other side: where vision is the *only* reader, our
layout prediction is a **single page-sized rectangle** — the most coarse
prediction possible.

## The deficit on these 18 documents, per document

Sampled from where we score worst, so this sample is deliberately more
coarseness-heavy than the corpus (84.8% here against 72% overall). The last
column is the change vision made.

```
document                                       elem coarse  name notcov   ok coarse%  name%   Δ
076523s007lbl_p2                                198    196     1      0    0   99.0%   0.5%   0
2024-Ford-Integrated-Sustainability-...          116    100     2      0   12   96.2%   1.9%   0
2024-SSI-Report_p40                             115    114     0      0    0   99.1%   0.0%   0
20240402_072920_TS0U_5JAN8NIL1XY3DOFS.1_p26      66     32    11      7   16   64.0%  22.0%   0
20240402_072920_TS0U_5JAN8NIL1XY3DOFS.1_p39      45     21    14      2    8   56.8%  37.8%   0
20240924_000946_P40U_HOWLKAL1IL81NTE2.1_p37      47     18    14      2   13   52.9%  41.2%   0
20240924_070512_J91U_42Q6TLWFIWP8X3M7.3_p7       60     35    12      2   11   71.4%  24.5%   0
240226-annual-report-and-accounts-2023_p3        50     23    11      3   11   59.0%  28.2%   0
938c3dc8-b424-40fc-836b-101415d323cd_p18         48     11    11      4   10   28.9%  28.9%   0
Annual-Report-FY-2023-24_p37                     58     13    21     21    2   23.2%  37.5%   0
AnnualReport2024-BBRI-att4_p18                   89     79     1      3    6   95.2%   1.2%   0
Apple_Environmental_Progress_Report_2025_p16     96     72     2      3   19   93.5%   2.6%   0
OTC_TATLY_2023_p9                                77     71     1      1    3   95.9%   1.4%   0
Starhill-Annual-Report-2024_p37                  42     13    12      2   15   48.1%  44.4%   0
accenture-fiscal-2024-annual-report_p16          60     39    12      0    9   76.5%  23.5%   0
ar2025e_11_p5                                   137    118     3      0   16   97.5%   2.5%   0
pdf_f270146f8ca7_p17                            111    104     1      0    5   98.1%   0.9%   0
venofer-prescribing-information_p1              112     97     1      6    8   93.3%   1.0%   0

1,527 elements, deficit 1,363 — coarseness 1,156 (84.8%), naming 130 (9.5%),
not covered 56 (4.1%). Change from vision: 0 in every document.
```

**The distribution is reported rather than a mean** because a mean hid a bimodal
result on this exact benchmark once. Here the per-document change is not merely
small on average — it is zero in every single document, because the predictions
are identical objects.

## Scope, stated rather than implied

- **Every document in this suite is a single page.** This speaks to segmentation
  and naming only. It says **nothing** about running headers and footers, which
  are recognised by repetition *across* pages and score zero for that reason.
- **This is not a competitor run.** No vendor SDK is installed. It is
  Nemesis-with-vision against Nemesis-without-vision, nothing else.
- **The LLM judge is off.** Geometry and label scoring only.
- **18 documents, not 20** — the local benchmark data holds 90 of the 500 PDFs and
  18 of those have a scored per-element record. The conclusion does not rest on
  the sample size, for the reason given at the top: it is a property of the code
  path, and 18 documents demonstrate it rather than estimate it.

## Spend

| | |
|---|--:|
| projected before the first paid call | **~$0.05** (worst case < $0.50) |
| Gemini calls actually made | **6** |
| tokens billed (`usageMetadata`, the provider's own count) | 12,586 in · 3,835 out |
| estimated actual cost | **~$0.018** |

Owner's stop threshold was $2.00. The projection came from the dry run's own
counts rather than from a per-page price, which is why it was 40× under.

Most of those output tokens are the model's internal reasoning, not its answer:
the reply that cost 929 output tokens was, in full, `1. none\n2. none\n3. none`.

## What this does and does not settle

**Settled:** paying per page for the vision lane *we have* would buy nothing on
layout. It is a fallback for pages with no text, and it works as one — the
positive control shows it recovering a page that would otherwise be empty. That
is a real capability and this test does not diminish it. It is simply not a
segmentation engine.

**Not settled, and this test could not settle it:** whether a vision model *asked
for bounding boxes* would segment better than our geometry does. That is a
different experiment — a new prompt, a new response parser, and a scoring path —
which is new code rather than a measurement of existing code. It should be
commissioned deliberately if the roadmap wants it, and its result must never be
reported as "Nemesis with vision", because it would not be Nemesis.

## Reproducing it

```bash
cd apps/web
# $0 — which lane would production choose, and would it call anything?
tsx scripts/vision-route-probe.mts <file.pdf> ...
# one document, one arm; writes its result the moment it finishes
tsx scripts/vision-arm.mts <off|stub|live> <file.pdf> [--figures] [--capture] --out <path>
# a whole arm, resumably: a document whose result exists is skipped, never re-paid
scripts/vision-run.sh <off|stub|live> <upload|worker> <listfile> <outdir>
# the comparison
python3 bench/parsebench/vision_arm_compare.py <resultsdir> <armA> <armB>
```

Per-document results, the captured provider reply, and the positive control are
under `bench/results/vision-mini/`.
