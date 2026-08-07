# The document-intelligence benchmark

> **Set by the owner 2026-08-06.** This file is the *only* benchmark definition for document
> intelligence. [`document-intelligence.md`](./document-intelligence.md) §8 states the scope this has
> to grow into; §6.4 states the phases it gates.

## The rule this exists to enforce

**An architectural comparison cannot establish parity.** Neither can a handful of good summaries, a
green test suite, or a model producing a plausible answer. Parity is a measurement against the same
files and the same questions, with the outputs saved.

Until this benchmark passes, the accurate public description is the one in §6.2:

> Nemesis is already designed around a persistent academic workflow, but ChatGPT and Claude remain
> ahead at understanding the visual meaning of an individual document. The document-intelligence
> roadmap is closing that gap without sacrificing organization, provenance, or processing honesty.

## Two halves, and why the split is load-bearing

Every metric below is tagged **SOLO** or **MATCHED**.

- **SOLO** metrics are absolute. They compare our output against ground truth we labelled from the
  file itself. They need no competitor and can run on every change. **These gate the phases.**
- **MATCHED** metrics are relative. They require running the same corpus and the same questions
  through Nemesis, ChatGPT and Claude, and saving all three outputs. **These, and only these, gate
  the word "parity."**

The split is written down because the SOLO half is the half that is easy to run — and a future
session that runs it, sees good numbers, and announces parity would be making exactly the unsupported
claim this document exists to prevent. **Passing the SOLO half means our own phase is done. It does
not mean we caught anyone.**

## Corpus

Real files first. Synthetic fixtures are for regression, never for establishing a baseline.

| Set | Files | Exercises |
|---|---|---|
| Syllabi | Fall 2026 syllabi | irregular schedules, date extraction, tables |
| Lectures | Diabetes 1 and 2 | dense slides, speaker notes, figures |
| Lectures | BIOL415 1 and 2 | second discipline, different deck conventions |
| **PDF — text** | a lecture or paper with a real text layer | the baseline case; catches regressions in the ordinary path |
| **PDF — two-column** | an academic paper | reading order; the column interleave that broke tables when fixed once already |
| **PDF — tables** | a syllabus or data-heavy handout | grid recovery, row/column identity |
| **PDF — scanned** | a photographed or scanned handout | the OCR lane |
| **PDF — mixed text + diagram** | a page with full paragraphs *and* a load-bearing figure | 🔴 **the shape the current parser cannot even see it is missing**: the page is not thin, so it never reaches vision, and `pdfCoverage` has no figure field to record the loss |
| **PDF — very long** | the 13 MB / 2,116-page document from the worker spike | unit-count cost (12.3 s), `TEXT_CAP` as a fraction of the whole, chunk volume |
| **DOCX — structured** | a real assignment brief or course handbook | headings and hierarchy — **the format had no corpus entry at all until 2026-08-06** |
| **DOCX — numbered lists** | a document with ordered and nested lists | numbering lives in `numbering.xml`; a tag strip loses "1., 2., 3." entirely |
| **DOCX — complex tables** | a grading rubric or schedule grid | 🔴 cells currently survive as orphan lines, which reads *confidently wrong* rather than absent |
| **DOCX — figures** | a document with embedded images and captions | figure recovery and caption association |
| Large deck | the 123.8 MB immunology deck | **Phase 7 only** — after the large-file/repacking work. Not before. |
| **Adversarial** | truncated zip, corrupt PDF, Office archive with a bad central directory, a decompression bomb, an image with hostile dimensions | fail *closed* and *named*: `oversized` / `corrupt` / `bomb_suspected` / `unsupported_format` / `partial` — never a silent empty parse |
| **Duplicate** | the same bytes uploaded twice, and the same file placed in two folders | idempotency: one parse, one row, two placements; a worse retry must not replace a better parse |
| Fixtures | generated regression cases | **regression only.** A generated fixture never establishes a baseline. |

🔴 **Word had no entry in this table until 2026-08-06**, while Phase 3 exists specifically to rebuild
Word extraction. A benchmark missing the format a phase is about cannot gate that phase — the four
DOCX rows above are what makes Phase 3 measurable rather than assertable.

Two corpus rules carried from §8, both learned the hard way:

- A non-English document and a right-to-left document must be in the set **before** it is used as a
  baseline. A baseline that has only ever seen English is a baseline that will silently encode
  English assumptions.
- Real files find defects fixtures cannot. The reader work found five that way — a straight
  apostrophe matching nothing, an invariant tested in code points while offsets indexed code units,
  a two-column interleave whose fix broke tables, TIFF pictures vanishing silently, and duplicate
  outline ids. Keep real files in the loop.

## Questions

The corpus is only half the instrument. Questions must be chosen so the **evidence sits somewhere
specific**, because that is what distinguishes a system that read the document from one that read the
first few pages and wrote something plausible.

At least one question whose evidence occurs:

1. On the final page — catches truncation.
2. In a table — catches grid flattening.
3. Inside a diagram — catches text-only extraction.
4. In speaker notes — catches slide-surface-only extraction.
5. In a two-column section — catches reading-order failure.
6. Across distant sections — catches chunk-local retrieval.
7. In a scanned page — catches the missing OCR lane.
8. In a figure label — catches figures kept as pixels but never read.
9. In an irregular syllabus schedule — catches date parsing that only handles the tidy case.
10. Under a specific Word heading — catches hierarchy loss, and is the only way to tell a real DOCX
    locator from an invented one.
11. At a specific position in a Word numbered list ("what is step 4?") — catches numbering that lives
    in `numbering.xml` and is never opened.
12. In a Word table cell identified by its row *and* column — catches a grid flattened into orphan
    lines, which answers confidently and wrongly rather than not at all.

**Ground truth is labelled before the run, not after.** A expected answer written after seeing the
output is not ground truth; it is a rationalisation.

## Metrics

| Metric | Kind | Definition |
|---|---|---|
| Unit coverage | SOLO | units read ÷ units present. Ground truth from the file's own page/slide count. |
| Last-page recall | SOLO | question 1 answered correctly from the real final page. |
| Table accuracy | SOLO | cells recovered in the right row/column against a labelled grid. |
| Diagram / image accuracy | SOLO | facts recovered from figure content against a labelled description. |
| Reading-order accuracy | SOLO | sequence of blocks against labelled human reading order. |
| Speaker-note recall | SOLO | notes recovered ÷ notes present. |
| Retrieval recall@k | SOLO | does the retrieved set contain the labelled evidence unit, at k = 1, 5, 20. |
| Citation locator accuracy | SOLO | the citation resolves, and opens the labelled location in the reader. Mechanical — no judgement. |
| Citation support | SOLO | the cited evidence actually supports the claim. Judgement; label it. |
| Syllabus-date accuracy | SOLO | extracted dates against the labelled schedule, including the irregular rows. |
| Note / flashcard source coverage | SOLO | share of the source represented in generated material — catches `MATERIAL_CHAR_LIMIT` silently deciding what gets studied. |
| Upload-to-ready time | SOLO | accepted → genuinely queryable. The number the student feels. |
| Peak memory | SOLO | **not observable from outside the function** — must be instrumented inside the worker and recorded on the job row, or it cannot be reported at all. Do not estimate it. |
| Cost | SOLO | tokens and storage per document, split native vs vision vs re-inspection. |
| Failure disclosure | SOLO | when coverage is partial, is the gap stated — to the student *and* in the model's prompt. A pass here is honesty, not accuracy. |
| **Relative accuracy on any metric above** | **MATCHED** | same file, same question, three systems, all outputs saved. |

## Protocol

1. Label ground truth for the fixture. Commit the labels.
2. Run Nemesis. Record every metric, including the failures.
3. For MATCHED metrics only: run the identical file and identical question text through ChatGPT and
   Claude. **Save the prompts and the outputs**, not a summary of them.
4. Record the run with the parser version and the model, so a number can be attributed to a build.
5. Publish failures alongside passes. A benchmark that only ever reports improvements is a marketing
   document.

## Status

### 🔴 Baseline run 2026-08-06 — figures lost on text-rich PDF pages

The first recorded measurement. **SOLO, and it is a baseline of the defect, not of a fix.**
Run: `apps/web/scripts/phase2-figure-baseline.mts` over **120 real academic PDFs** from the owner's
own course folders — not fixtures.

Production routes a page to vision only when it holds fewer than `THIN_PAGE_CHARS` (120) characters
of its own. A page with several paragraphs *and* a load-bearing diagram is not thin, so it is never
sent — and `pdfCoverage` has no figure field, so nothing records that anything was missed. The page
is counted as fully read.

| | Pages | Share |
|---|---|---|
| Total pages | 952 | |
| Thin — vision reads these today | 121 | 12.7% |
| Text-rich | 831 | 87.3% |
| **Text-rich AND carrying a figure** | **326** | **34.2% of every page** |

- **1,807 figures** sit on those 326 pages.
- **80 of the 120 files (67%) contain at least one.**
- Worst single file: `TDM- Cyclosporine and Tacrolimus 2026.pdf` — 35 pages, **708 figures**.

**What this number is and is not.** It is the count of pages where production's own routing rule
guarantees a figure is never looked at, measured with pdf.js operator lists (`paintImageXObject`
and friends) — which the production extractor, `unpdf`, does not expose at all. That is the
mechanism: we cannot currently *see* these figures, so we cannot report them either. It is **not**
a claim that all 1,807 figures are load-bearing; decorative marks are counted too, and separating
them is part of Phase 2's work (`ExtractionCoverage` already draws that distinction for PPTX, where
a decorative skip is deliberately not a gap).

This is the number Phase 2 has to move, and the number any "we read your lecture" claim currently
has to answer for.

### Everything else

No other metric has a recorded value.

Per-phase status is **not** duplicated here — it lives once, in
[`document-intelligence.md`](./document-intelligence.md) §6.7. This file records what a run measured;
the ledger records what that measurement means for a phase.

| Half | State |
|---|---|
| SOLO | not run — corpus not yet labelled |
| MATCHED | not run — requires access and matched prompts |

**Therefore: no parity claim of any kind is currently supported.**
