# Per-format parser acceptance — measured, 2026-08-11

Every number here was produced by running real files through the **whole chain**:

```
real file → parser → canonical model → structureEnvelope → readStructureEnvelope → capabilities
```

The far side of persistence is the only side that counts. Structure in this
codebase has been computed and then discarded at a boundary **six times** —
three times at the client edge, once by a unit validator that rebuilt units
field-by-field and deleted `label`, once by two calendar decoders that each
dropped what the other added, and once (found in this pass) by a Word heading
path that serialised array holes to `null` and took three whole documents with
it. A parser that passes in memory tells you nothing about any of that.

Reproduce:

```bash
npx tsx scripts/office-capability-census.mts <manifest.jsonl> docx
```

## 🔴 What these counts do NOT say

Each cell is **"files in which at least one instance survived"**. That cannot
distinguish *"the parser drops footnotes"* from *"none of these 158 documents has
a footnote."* A 0% therefore means **not observed**, never **unsupported** —
proving a gap needs a file known to contain the thing, which is a separate
fixture task and is not done.

This distinction is not pedantic. In this same pass, 47 DOCX and 6 PPTX files
looked like a 23% parse-failure rate; they are 162-byte macOS Office stub files,
not documents, and refusing them is correct. Reporting that as a parser gap would
have been the identical category error.

## Corpus

| Format | Files seen | Real documents | Notes |
|---|---:|---:|---|
| PDF | 164 | 164 | The regression corpus. 1,474 pages. |
| DOCX | 205 | 158 | 47 are 162-byte macOS Office stubs. |
| PPTX | 29 | 23 | 6 are stubs. |
| XLSX | 0 | 0 | **Not measured — no sample available.** |
| CSV | 0 | 0 | **Not measured — no sample available.** |

## Matrix

Survival on the far side of persistence, as a share of real documents.

| Capability | PDF | DOCX | PPTX | XLSX | CSV |
|---|---:|---:|---:|---:|---:|
| text | 100% | 100% | 100% | — | — |
| document title | 100% | 100% | 65% | — | — |
| units > 1 | 100% | n/a¹ | 100% | — | — |
| unit label | n/a | n/a¹ | 65% | — | — |
| unit size (crop) | 100% | n/a¹ | 100% | — | — |
| headings | — ² | 11% | 65% | — | — |
| hierarchy (heading path) | — ² | 11% | 65% | — | — |
| list items | n/a³ | 65% | 0% | — | — |
| list markers | n/a³ | 65% | 0% | — | — |
| nested lists | n/a³ | 23% | 0% | — | — |
| tables (grid) | 34%⁴ | 46% | 26% | — | — |
| **cell model** | **100% of tables** | **46%** | 0% | — | — |
| **merged cells** | **14% of tables** | **20%** | 0% | — | — |
| table header rows | 1%⁵ | 2% | 26% | — | — |
| figures | 100%⁶ | 25% | 74% | — | — |
| geometry / locator | 100% | n/a¹ | 100% | — | — |
| equations | — | 3% | 0% | — | — |
| captions | 0% | 0% | 0% | — | — |
| speaker notes | n/a | n/a | 0%⁷ | — | — |

1. Word has no pages until something lays it out. One `body` unit, no size, no
   label — and `describeLocator` refuses to print a number for it. Absent here is
   correct, not a gap.
2. PDF headings are inferred from typography and are not separately counted in
   this census; `SourceCapabilities.headings` covers them.
3. The PDF lane does not classify list items; they arrive as paragraphs.
4. 59 of 164 files yield at least one table; 283 accepted across the corpus.
5. Low by design — a PDF's header row must be corroborated (distinct font, or
   reprinted on another fragment) before it is claimed, because `segmentsOf`
   skips header rows and an uncorroborated claim silently drops a data row.
6. Figure *detection*; description needs vision, which is off by default on the
   upload path, for cost. Undescribed means **unexamined**, and is counted.
7. PPTX notes are merged into slide text rather than emitted as `note` blocks.
   Not lost — not separately addressable. **Measured gap.**

## Known gaps, classified

The user's A–E classification: **A** parser never extracted it · **B** the model
cannot represent it · **C** persistence drops it · **D** deserialization drops it
· **E** consumers flatten it later.

| Gap | Class | Status |
|---|---|---|
| DOCX `gridSpan` / `vMerge` ignored | A | **fixed** — 56 → 0 ragged tables |
| DOCX heading path holes → whole doc dropped | A causing D | **fixed** — 3 → 0 lost |
| PPTX figures only exist if vision ran | A | **fixed** — 0 → 17 of 23 decks |
| PDF merged cells not represented | B | **fixed** — `DocCell` |
| PDF empty rows never trimmed | A | **fixed** — 24 phantom rows |
| PPTX speaker notes not addressable | A | open, measured |
| DOCX captions not classified | A or "none present" | **ambiguous — needs a fixture** |
| DOCX footnotes/endnotes | unknown | **not measured** |
| PDF list items not classified | A | open, known |
| Borderless (booktabs) tables | A | **recorded scope limit — do not "fix"** |

The last one is deliberate. See `docs/parser-benchmarks.md`: relaxing region
proposal to catch borderless tables re-opens "a grid asserted over prose relabels
every value in it", and a table false positive **deletes that page's prose**.

## The external baseline did not move, and must not

`bench/results/grits_results.jsonl` is frozen at 21.0% recall / GriTS-Top 0.049
on 357 Europe PMC papers. **None of this pass's fixes should change it**, because
those papers are borderless and the parser never proposes a region on them. Its
own numbers say so: mean GriTS-Top is **0.2354** on ground truths *with* spanning
cells and **0.2342** on ones without — statistically identical, which is only
possible if span fidelity is nowhere near the limiting factor there.

**A movement in that number is the alarm, not the win.**
