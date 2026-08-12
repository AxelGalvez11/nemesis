# Parser repairs — before / after, one frozen ParseBench rerun

Four repairs, each gated on the 165-PDF Nemesis corpus before this benchmark ran.
The parser was not tuned against these numbers.

## The five dimensions

| Dimension | Baseline | After | Δ |
|---|--:|--:|--:|
| Tables | 12.73 | 12.73 | +0.00 |
| Charts | 0.83 | 0.83 | +0.00 |
| Content Faithfulness | 62.06 | 61.55 | **−0.51** |
| Semantic Formatting | 11.70 | 12.20 | +0.50 |
| Visual Grounding | 42.05 | **48.90** | **+6.85** |

## The measures the repairs actually targeted

| | Baseline | After | Δ |
|---|--:|--:|--:|
| Localization (af1) | 85.64 | **90.83** | +5.19 |
| Classification | 23.62 | **28.30** | +4.68 |
| Reading order | 44.77 | 48.56 | +3.80 |
| No hallucinated sentence | 44.48 | **52.98** | **+8.50** |
| F1 Page-header | 0.00 | 0.00 | +0.00 |
| F1 Page-footer | 0.00 | 0.00 | +0.00 |

🔴 **PAGE-HEADER AND PAGE-FOOTER DID NOT MOVE, EXACTLY AS PREDICTED.** All 458
layout documents are single-page, and furniture is detected from repetition
ACROSS pages. Detecting it from position on one page would relabel headings as
furniture — measured, refused, and unchanged by the score staying at zero.

## 🔴 The Content Faithfulness mean hides a bimodal result

Per-document, 506 compared:

```
better 222 · worse 92 · unchanged 192
```

| biggest gains | | biggest drops | |
|---|--:|---|--:|
| multicolumns__oromo | +50.8 | multilang__cnnm | −28.6 |
| multicolumns__drill | +45.7 | ocr__ord-4000 | −22.3 |
| multicolumns__anual_2col | +44.9 | ocr__newspaperonecol | −22.3 |
| multicolumns__blackrock_2col | +44.4 | ocr__link | −22.3 |
| multicolumns__2colbolds | +43.5 | handwritting__manualunderline | −22.3 |

Every large gain is a multi-column document — fix 3. Every large drop is a
SCANNED document, which now emits nothing instead of emitting
`[Figure — not examined]` as if it were prose. **Reporting −0.51 alone would
describe a parser that got slightly worse; what happened is that it got much
better where it can read and honest where it cannot.**

## 🔴 Layout evaluation failures 42 → 50, and why that is a correction

The 8 new failures are `3col`, `abstract`, `5878` and five like them. Measured:

```
3col.pdf       units=1 blocks=1 realTextChars=0  {"figure":1}
abstract.pdf   units=1 blocks=1 realTextChars=0  {"figure":1}
5878.pdf       units=1 blocks=1 realTextChars=0  {"figure":1}
```

They are image-only pages with **zero real text characters**. They previously
produced a parse only because the figure placeholder was counted as text. Now
`parseDocument` reports them as empty, which is what they are.

🔴 **FOLLOW-UP, NOT FIXED HERE:** an image-only document now returns
`ok: false, reason: "empty"`, so a caller may store nothing and lose the figure
inventory and coverage record with it. The honest answer for these pages is the
vision lane, which was off for this run.

## Corpus safety, all four repairs

| gate | result |
|---|---|
| figure placeholder — content changed | 0 of 165 (2,982 placeholders removed) |
| furniture — model shrank | 0 of 165 |
| column gutter — characters lost/duplicated | 0 |
| column gutter — no-gutter pages changed | 0 |
| classification — text / identity / structure changed | 0 / 0 / 0 |
| crashes across every gate | 0 |

## What is still unresolved

- **Genuine sequence errors.** Fix 3 repaired segmentation, not ordering; the
  count of truly out-of-sequence pairs rose 6 → 8 on the diagnosed sample. No
  reading-order improvement is claimed despite the +3.80 above.
- **Block granularity.** When a ground-truth element goes unmatched, mean IoU is
  0.001 against mean IoA 0.840 — our blocks cover the element and are far
  coarser than it. That is the dominant remaining classification limit.
- **Frozen and untouched:** borderless tables, charts, OCR, inline formatting,
  XLSX/CSV.
