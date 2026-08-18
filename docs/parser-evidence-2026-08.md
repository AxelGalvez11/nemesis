# What the router actually does, measured on documents nobody here chose

**Status: evidence, not a proposal.** Nothing in production routing changed. This
records what a corpus of 535 openly-licensed documents says about decisions that
were previously calibrated against sixteen fixtures this project generated.

## Why this exists

The cheap-first router shipped with a headline of **76.9% of PDFs avoiding the paid
parser**. That number came from eight PDF fixtures written by the same author as the
detector they were testing. A fixture like that proves the code does what it was
written to do. It is not evidence about the world.

## The corpus

`apps/web/scripts/corpus/sources.json` pins four public repositories at exact
commits. `corpus-fetch.mts` reproduces it byte-for-byte; nothing is vendored.

| source | licence | what it contributes |
|---|---|---|
| py-pdf/sample-files | CC-BY-SA-4.0 | constructed pathologies: forms, rotation, CMYK, Arabic, PDF/A |
| docling-project/docling | MIT | real papers, plus DOCX/PPTX/XLSX |
| Unstructured-IO/unstructured | Apache-2.0 | real business and government documents |
| openpreserve/format-corpus | CC-BY / mixed | preservation corpus: scans, damage, dead producers |

**535 documents · 8,970 units.** Fields represented include chemistry, aerospace,
soil science, perinatal health, oncology patient information, machine learning and
government administration — which is the point. A corpus scoped to one field would
pick a parser that is good at that field.

## Result: the route

Run with `vendorAllowed: false`, so the router decides exactly as it does in
production and records the escalation it wanted without anyone paying for it.

| format | files | native | would escalate | failed | native share |
|---|--:|--:|--:|--:|--:|
| pdf | 439 | 241 | 119 | 79 | **66.9%** |
| docx | 55 | 52 | 3 | 0 | **94.5%** |
| pptx | 22 | 17 | 1 | 4 | **94.4%** |
| xlsx | 19 | 18 | 0 | 1 | **100%** |
| **all** | **535** | **328** | **123** | **84** | **72.7%** |

**The fixture number was optimistic, and by roughly the amount you would fear.**
76.9% → 66.9% on PDFs. The Office claim survives contact with real files almost
intact: 100% on fixtures, 94–100% here.

Escalation reasons, all 123:

```
 94  no-text-layer          a scan; there is no cheap alternative
 18  corrupt-text-layer     the text decodes to a private or replacement alphabet
  6  glyph-substitution     the broken-ligature signature
  3  tables                 a Word file declares more tables than we recovered
  1  figures
  1  pages-beyond-vision-budget
```

🔴 **Three quarters of all escalation is scans.** No parser choice changes that: a
page with no text layer has to be read by something that looks at pixels. The
signals this project invented — corruption, glyph scars, lost grids — account for
**24 of 123**. That is worth knowing before anyone builds more of them.

At corrected OCR 4 pricing the 816 units routed to a vendor are **$3.26**. Under the
wrong price the same work read as $0.82.

## Result: quality, measured without a vendor

`columnInterleave` reads a parse's own geometry and counts how often the reading
order crosses a column gutter. It needs no second opinion, so it runs over the whole
corpus for nothing.

**36 of 241 two-column pages (14.9%) are read across the gutter**, across 19
documents, in every source — not only the deliberately-damaged ones.

🔴 **AND THAT NUMBER IS 75% PRECISE, MEASURED BY LOOKING AT EIGHT OF THEM.** Six were
real: columns fused mid-sentence (*"Report any redness, crop top when it is pain,
swelling or wound comfortable to do so"* — a breast-surgery patient leaflet), a
contents page alternating left and right entries, figure captions emitted out of
order. Two were false: sparse pages whose only two "columns" were a running header
and a page number.

So roughly **11% of two-column pages are genuinely mis-ordered**, from an eight-page
hand check. The sample is small and it is stated rather than rounded away.

### What the detector got wrong first, and how that was found

Two false-positive classes, both found by reading the output rather than by testing:

1. **Orphaned fragments.** A page of single-column German mathematics was called
   two-column: body text at x≈0.15, subscripts stranded at x≈0.87. Fixed by
   requiring each side to carry a fifth of the unit's characters.
2. **Diagram labels.** A table-structure figure was called two-column: cell labels
   (`C C C C C NL`, `2`) clustered left and right with plenty of characters between
   them. Fixed by requiring each side's median block to be a line (25 characters),
   not a token.

Before those guards the same corpus reported **37.3%**. The first number a detector
gives you is not a measurement.

🔴 **The remaining false positives are NOT being tuned away, deliberately.** Both
share a shape — sparse pages whose columns are headers — and a minimum-block guard
would remove them. It would also be fitted to the same eight pages the precision
estimate came from, which would leave a better-looking number and no way to know
whether it were true.

## What this does and does not license

**Does:**

- The 76.9% figure should not be quoted again. 66.9% on PDFs, 72.7% overall.
- Reading order is a real, measured defect at roughly 11% of two-column pages —
  consistent with `docs/column-segmentation.md`, which repaired column *fusion* and
  recorded ordering as unfixed and unclaimed.
- Scans dominate escalation. Effort spent on more corruption detectors is effort
  spent on a quarter of the problem.

**Does not:**

- Nothing here compares Nemesis to Mistral, LlamaParse, Docling, MinerU or
  PaddleOCR-VL. This container has no vendor keys, and a comparison would need the
  owner's money as well as their permission.
- An 11% ordering defect does not by itself justify adopting another parser. It
  justifies finding out whether another parser fixes it — which is the next
  measurement, not the next migration.

## Also found

- **A malformed PDF can kill the parsing process through a working `try`/`catch`.**
  pdf.js rejected a detached promise (`FormatError: Illegal character: 41`) and Node
  terminated the sweep at document 176 of 535. In production this is contained — the
  parse runs in a worker thread and `parse-run.ts` handles its `error` and `exit`
  events — so one learner's document fails and nobody else is affected. It does mean
  the file fails outright rather than reaching the vendor that might have read it.
- **84 of 535 documents (15.7%) failed to parse at all**, concentrated in the
  preservation corpus (19.2%) and the constructed-pathology set (23.5%), against
  9.4–9.9% for the two real-world sets. These corpora are adversarial by design.

## Reproducing

```
cd apps/web
npx tsx scripts/corpus-fetch.mts
npx tsx scripts/corpus-measure.mts --jsonl rows.jsonl
npx tsx scripts/order-spot.mts <a flagged file>   # look before believing
```
