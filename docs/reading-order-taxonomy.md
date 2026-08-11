# Reading order: the failure taxonomy, measured

**The premise did not hold.** "Reading order 44.80" is overwhelmingly not a
sequencing defect. Measured on ParseBench's own `order` rules:

| what the failure actually is | share |
|---|--:|
| expected text NOT FOUND in our output | **99.0%** (7,832) |
| found, but OUT OF SEQUENCE — a true ordering defect | **0.6%** (44, in 35 docs) |
| other (no content produced at all) | 0.4% (35) |

An `order` rule fails when either side is missing, so missing text fails it
vacuously. Building a column-reordering algorithm would have addressed 0.6% of
these while risking the 99% that are already correctly sequenced.

## Where the "not found" failures live

| category | failures | share | docs |
|---|--:|--:|--:|
| text_multicolumns | 2,870 | 36.6% | 96 |
| text_ocr | 2,484 | 31.7% | 109 |
| text_multilang | 797 | 10.2% | 39 |
| text_simple | 567 | 7.2% | 69 |
| text_dense | 484 | 6.2% | 13 |
| text_misc | 477 | 6.1% | 20 |
| text_handwritting | 151 | 1.9% | 13 |

`text_ocr` is scanned pages with no text layer — a recorded scope limit, and the
vision lane was off for this run. CJK accounts for only 5.6% of the not-found
failures, so language is not the story either.

## Multi-column, diagnosed properly

540 order rules across 14 multi-column documents:

```
both strings present            147   of which OUT OF SEQUENCE:  6
'before' text not matched       196   of which a SHORT prefix DOES appear: 109
'after'  text not matched       197
```

**109 of 196 "missing" sentences are present but FRAGMENTED** — extracted, then
broken into pieces that do not sit next to each other. That is not absence and it
is not ordering; it is a segmentation defect.

## The root cause, in one line of code

`apps/web/lib/pdf/geometry.ts:106`

```ts
const adjacent = last && item.x - right(last) <= Math.max(item.height * LINE_GAP_EMS, 2);
```

with `LINE_GAP_EMS = 2.5`. A run may join the previous run on the same baseline if
the horizontal gap is under **2.5 × its own font height**.

🔴 **THE LICENCE TO CROSS A COLUMN GUTTER SCALES WITH THE FONT SIZE OF THE TEXT,
BUT A GUTTER IS A PROPERTY OF THE PAGE.** At 10pt body size the licence is 25pt —
narrower than a typical gutter, so body columns split correctly, which is why this
was never noticed. At 20pt — a title or a section heading — it is 50pt, wide
enough to weld the two columns together.

So the blocks most likely to fuse two columns are exactly the largest ones: the
titles and headings that anchor a document's structure.

### Proof, from a real failing document

`text_multicolumns__2col_paper.pdf`, a two-column paper with a full-width title:

```
y=0.089 x=0.130 w=0.328  "Mind Your Tone: Investigating"
y=0.090 x=0.588 w=0.294  "Since these powerful LLMs are accessed"
y=0.105 x=0.132 w=0.751  "How Prompt Politeness Affects through a natural
                          language interface, there are also"
```

The third block spans **75% of the page width**: the title's second line has been
merged with the right column's body text. The document's own title is destroyed,
and everything after it is interleaved.

## What the fix must be, and what it must not be

Bound the join by the page's geometry rather than by the item's type size. The
gutter does not get wider because the headline is bigger.

Two things any candidate must prove, per the standing requirement:

1. it repairs these measured cases;
2. it does not reorder or re-split single-column documents that are already
   correct — verified on the 165-PDF corpus with zero content loss.

Not in scope, and not the cause: OCR (31.7% of failures is a recorded limit),
CJK (5.6%), and mojibake — measured at **1 document in 381**, after an initial
over-generalisation from a single example. Font data (`standardFontDataUrl`,
`cMapUrl`, `useSystemFonts`) was tested against that document and changed
nothing: the PDF has no ToUnicode map and the text is unrecoverable natively.
