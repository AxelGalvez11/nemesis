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

### 🔴 Baseline run 2026-08-06 — structure discarded by the DOCX tag strip

The Phase 3 baseline. **SOLO.** Run: `apps/web/scripts/phase3-docx-baseline.mts` over **124 real
Word documents** from the owner's own course folders, 16,997 paragraphs.

`docxXmlToText` turns `</w:p>` into a newline and deletes every other tag. All of the following is
present in the files, is read by the extractor, and is thrown away before any model, index or
citation sees it:

| Structure | Count | Files | What is lost |
|---|---|---|---|
| Table cells | **8,355** (198 tables) | 57 | Each becomes its own orphan line. **This is worse than dropping the table** — a grid read as loose lines answers confidently and wrongly. |
| Numbered paragraphs | **2,266** | **76 of 124 (61%)** | Numbering lives in `numbering.xml`, which is never opened. "What is step 4?" is unanswerable. |
| Headings | 123 | 17 | No hierarchy, and therefore no locator finer than "the file". |
| Hyperlinks | 116 | 21 | Targets live in the rels part; only the anchor text survives. |
| Figures | 149 | 40 | `<w:drawing>` / `<w:object>` dropped entirely. |

**103 of the 124 files (83%) lose structure.** Worst single file:
`P1_Medication_Evaluation_Template_2025.docx` — 10 tables, **1,860 cells**, which reach the model as
1,860 unlabelled lines.

Numbering is the most common loss and the most complete one: it is not degraded, it is absent, and
unlike headings it cannot be guessed back from the text.

### 🟢 Recovery run 2026-08-06 — the Word structure reader, over the same 124 files

`apps/web/lib/notebooks/docx-structure.ts`, measured by
`apps/web/scripts/phase3-docx-recovery.mts` against the baseline above.

| | Present | Recovered | Rate |
|---|---|---|---|
| Headings | 123 | 111 | 90% |
| Numbered paragraphs | 2,266 | 2,116 | 93% |
| Tables | 198 | 197 | 99% |
| Table cells | 8,355 | 8,345 | **100%** |

- **2,116 list items now carry a marker.** Previously zero — the numbers are not in the paragraph
  text at all, so no re-reading could recover them.
- **524 blocks know which section they are in.** Previously zero.
- 5,227 blocks produced across the corpus.

**Real files found a defect fixtures never would.** `Equations.docx` was silently losing **72% of
its content**: Word stores equations as OMML in a different namespace, so the characters live in
`<m:t>`, not `<w:t>` — 53 against 7 in that file. Clearance, half-life, extraction ratio and the
bioavailability identities were all disappearing while the surrounding paragraphs reported as read.
Fixed, and equations are now counted.

**🟢 RESOLVED — every remaining gap traced, and all of them are gains.** Seven of the 124 documents
render 82–97% of the old extractor's alphanumeric content. Each was diagnosed rather than rounded
away, and in every case the new reader is the correct one:

| Cause | Example | What the tag strip emitted |
|---|---|---|
| Form field codes | `Medication Error Reporting Form.docx` | `FORMCHECKBOX`, thirteen times |
| Bookmark / TOC ids | `IPT and PKPD Review Session.docx` | `477519233174Formulae` |
| Image field codes | `MTM Case Worksheet 1–3.docx` | `INCLUDEPICTURE`, a raw image URL, `MERGEFORMATINET` |
| Shape/textbox attributes | `Claude-by-Anthropic-for-Word.docx` | `rightcenterClaude`, `469963556851200748665287823Home` |

The last row is also a **measurement artifact, not a loss**: the tag strip fuses shape positioning
data onto the adjacent word, so the token `00Claude` never matches the correctly-separated `Claude`
the new reader produces. A token-set comparison scores that as missing when the content is present.

None of these is document content. The old extractor was putting field instructions, image URLs and
shape geometry into text a student reads and a model answers from.

**What remains before Phase 3 can be DONE:** PPTX must produce the canonical model without
regressing, and nothing here is deployed or SOLO-tested.

## Run: canonical model, 124 real Word documents (2026-08-06)

`apps/web/scripts/phase3-model-check.mts`. The reader's recovery was already measured; this measures
whether it survives the step that used to throw it away.

| Measure | Reader | Model | |
|---|---|---|---|
| headings | 111 | 111 | ✅ |
| list items | 2,116 | 2,116 | ✅ |
| tables | 197 | 197 | ✅ |
| table cells | 8,345 | 8,345 | ✅ |

5,227 blocks produced, 524 knowing their section, **0 fabricated unit locators** across every block
of every file, and no document lost words.

🔴 **Only 3 of 197 tables mark a header row.** The old renderer drew a header separator on all 197,
which promoted a data row to a column name in **98% of real tables** — a rubric whose first line is
a real criterion became a heading, and every answer drawn from it inherited that. Fixtures could not
have found this; almost every hand-written test table has a header.

## Run: PDF structural read, 120 real course PDFs / 952 pages (2026-08-06)

`apps/web/scripts/phase2-structure-check.mts`, against the same corpus as the Phase 2 baseline.

| Measure | Value |
|---|---|
| blocks | 9,587 (1,410 headings, 6,214 paragraphs, 1,963 figures) |
| files carrying figures | 89 of 120 |
| figures found | **1,963** — production's extractor exposes no image operators and sees 0 |
| …running art (repeats on ≥50% of pages) | 239 |
| …furniture (under 1% of the page) | 635 |
| **…genuinely unexamined** | **1,089** |
| pages whose paragraphs fall in two disjoint columns | 10 of 952 |
| fabricated unit locators | 0 |
| rects outside 0..1 | 0 |
| documents losing words against `unpdf` | **0** |

**1,089 is the number this system could not previously state at all.** It is now a countable,
disclosable gap: coverage gained a `not-examined` figure reason that counts as lost, so a page whose
text was fully read but whose diagram nobody looked at reports `partial`.

### Two column rules that only real geometry could correct

1. **Grouping lines on a shared baseline alone fuses a two-column page.** The left column's first
   line and the right column's first line sit on the same baseline, so every row came out as
   `L0 R0` and there was nothing left for the column rule to split. Line grouping now also requires
   horizontal adjacency, in ems so it holds at any type size.
2. **A gutter test alone calls a term-and-definition list two columns.** Such a list has a clean
   empty gutter and balanced sides, and reading it in column order returns every term first and
   every definition afterwards — permanently unpaired, and worse than the interleaving the rule
   exists to fix. The discriminator is that a typeset gutter is narrow beside its columns while a
   tab stop leaves a trough wider than the entries beside it.

### Open gaps in this phase, recorded rather than left implicit

- **Table detection from PDF geometry is not built**, deliberately. A grid asserted over ordinary
  prose relabels every value in it, and a wrong table is worse than no table.
- **`standardFontDataUrl` is not supplied** to the server-side pdf.js build; it warns on files using
  standard-14 fonts. Text loss against `unpdf` measured **zero**, so it is not blocking, but glyph
  mapping for those fonts is unverified.
- **Adaptive vision on the 1,089 unexamined figures, query-time high-resolution reinspection, and
  the render cache are unbuilt.** Only the honesty half of Phase 2 is done.
- **`library-block-drag.test.ts` failed once in a full-suite run and passes in isolation**, first
  observed after a lazy pdf.js import entered the suite's module graph. Two subsequent full runs
  passed. Recorded as an unexplained flake rather than dismissed.

## Run: fact extraction, 124 real Word documents (2026-08-06)

`apps/web/scripts/phase3-model-check.mts`, Phase 6 section.

| Fact kind | Count |
|---|---|
| table | 197 |
| outline | 111 |
| definition | 89 |
| procedure | 51 |
| date | 24 |
| **total** | **472** over 94 of 124 files |

Facts with valid provenance: **472 / 472**. Facts claiming a page on a `.docx`: **0**.

### 🔴 The definition extractor was cut twice, by real files, and both cuts are the result

| Rule | Definitions found | What the sample showed |
|---|---|---|
| dash **or colon**, single line | 925 | ~4 false positives per true one |
| dash only, single line | 265 | ~3 false positives per true one |
| dash only, **run of ≥3 siblings** | **89** | a clear majority genuine |

The colon marks a labelled **field** far more often than a meaning: `LinkedIn: …`,
`Company Name: ______`, `Question #1: What are…`, `Physical exam: BP today…`. And a single dashed
line in prose is an aside; a glossary is a **list**. Precision was chosen over recall deliberately —
a definition nobody extracted costs a student nothing, and a wrong one becomes a flashcard that
teaches something untrue.

A fixture corpus would not have found this. Almost every hand-written example of a definition is a
true one, so the false-positive rate is invisible until real documents are run.

### Field-agnosticism, asserted rather than assumed

Two fixtures — a contract-law syllabus and a shielded-metal-arc-welding manual — share no vocabulary
and produce the same five fact kinds. A weighting scheme is found in both without the word
*grading*: a table column of shares summing to a whole. The section label comes from the document
("Assessment" / "Marking Scheme"), never from us.

### Open gaps in this phase

- **Nothing consumes these facts yet.** No study material, calendar entry or answer is built from them.
- **English month names only.** Numeric and ISO date forms are language-independent and cover the
  rest; an ambiguous form like `03/04/2026` is deliberately not matched, because guessing puts a
  calendar entry a month out while looking entirely correct.
- **A trailing letter is not treated as an enumerator.** It is one in *Answer D* and a real term in
  *Vitamin D*, *Hepatitis B* and *Grade A*. The run rule handles answer options in practice.

## Run: adversarial and capacity fixtures (2026-08-06)

18 tests: `apps/web/lib/notebooks/hardening.test.ts` (13) and `office-unzip.test.ts` (5).

| Input | Behaviour |
|---|---|
| Archive bomb by declared size | refused before inflation |
| Archive bomb by entry count | refused at 20,000 entries |
| Truncated archive | readable refusal |
| Valid archive holding no Word document | names the format it expected |
| Random bytes named `.docx` | refused |
| Document past `MAX_UNITS_PER_PARSE` | read to the cap; the rest reported as **unread**, state `partial` |
| 100,000-page declaration | "5,000 of 100,000 pages could be read" |
| Corrupt PDF | verdict (`empty`), not an exception |
| Empty file | verdict, not an exception |
| Unsupported type | verdict, not an exception |

### 🔴 Three defects these fixtures found

1. **`MAX_UNITS_PER_PARSE` was enforced nowhere.** It was declared, had a unit test asserting its
   value, and no code path applied it. Cost tracks units rather than bytes, so the upload byte
   ceiling bounded nothing: a few hundred kilobytes of generated PDF can declare a hundred thousand
   pages.
2. **A PDF that would not open threw out of the parser and took the upload request with it.** The
   student saw a server error for a problem with their file.
3. **fflate's `invalid zip data` reached the upload response verbatim** for any truncated,
   mislabelled or renamed archive — a developer string presented as an explanation.

### Open gaps in this phase

- Bounded, entry-at-a-time Office reading is designed (`docs/source-ingestion-jobs.md`) and unbuilt;
  the parse side still holds the whole archive.
- An archive that **understates** `originalSize` is bounded only by `MAX_SOURCE_BYTES`. Closing that
  properly needs streaming inflation, not another sum.
- Concurrency and memory behaviour under the real runtime is unmeasured and blocked on a deploy.

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

---

## Run: the visual half of Phase 2 — 120 real course PDFs / 952 pages (2026-08-07)

Script: `apps/web/scripts/phase2-vision-routing.mts`. Same corpus as the 2026-08-06
structural run, so the numbers are directly comparable.

| | |
|---|---|
| Figures found | 1,963 |
| Unexamined before routing | 1,089 |
| **Selected for inspection** | **305** across 40 files |
| — because a large figure sits on a page dense with text | **302** |
| — because the page's text is thin (production's only signal) | 3 |
| Qualified and over the 40-per-document budget | 330 |
| **Converted to PNG without a rasterizer** | **246 (80.7%)**, 37.3 MB |
| No decodable pixels — recorded `unsupported` | 59 |

**302 of 305 were selected for the reason production is structurally blind to.**
That is the finding: routing on text sparsity alone does not merely miss some
figures, it misses almost exactly the ones that matter, because a page carrying
an argument in a diagram usually also carries prose.

### 🔴 `page.objs.has()` cost 75% of the figures, silently

The first run converted **78 of 305 (25.6%)**. The reader gated on
`page.objs.has(ref)` before reading the image, and pdf.js resolves image objects
*asynchronously after* `getOperatorList()` returns — so the check is a race the
reader loses most of the time. It loses it as "this figure had no pixels", which
is indistinguishable from a figure that genuinely has none. Awaiting the callback
form took it to 246.

A second defect fell out of the same change: the wait timer was `unref`ed, so
when the only outstanding work was an image object that never resolved, Node
emptied the event loop and **the await never settled** — the parse stopped
mid-document with no error at all.

**Not measured: description quality.** No `GEMINI_API_KEY` in this worktree, so
no figure has actually been described. That half is BLOCKED, not built-and-unverified.

**Known cost choice, stated rather than hidden:** a figure between 1% (the
furniture line) and 3% (the worth-looking line) of its page is examined by
nothing and keeps `not-examined`, which counts as lost. 784 figures are in that
band or over budget. Coverage therefore still reports those pages `partial`,
which is the truthful answer.

---

## Run: PPTX on the canonical model — 15 real decks / 490 slides (2026-08-07)

Script: `apps/web/scripts/phase3-pptx-check.mts`.

| | |
|---|---|
| Blocks | 5,163 |
| Headings | 313 |
| Renderer text vs model text | 246,994 → 261,962 chars |
| **Lines lost against the old renderer** | **0** |
| **Blocks whose locator fails to name their slide** | **0** |

Compared line by line, not by length: a re-shaping that drops one slide and
repeats another passes every length comparison ever written.

**Defect found:** a slide title that never appears in its own slide body was
`unshift`ed into the DOCUMENT's block list, so a late slide's heading landed at
the front of the deck. Every locator still said the right slide, so nothing
looked wrong — while reading order, chunking and "what comes next" were all
answering about somewhere else.

---

## Run: chunks into and out of the index — real Postgres (2026-08-07)

Script: `apps/web/scripts/phase4-index-roundtrip.mts`. A local Postgres 17 with
pgvector, built to production's schema column by column, then **the real
migration file applied unmodified**. 20 of 20 checks pass.

Every claim in Phase 4 is a claim about SQL — that a CHECK permits the row, that
a unique index makes re-indexing idempotent, that a LEFT JOIN is what lets a
source chunk out. An in-memory fake would have agreed with whatever the test
asserted, which is why one was not used.

**🔴 The harness caught a defect in the migration it was testing.** The ordering
put `origin_type = 'source'` first outright, so a source at similarity 0.000
ranked above a note at 1.000 — a perfect answer buried under an irrelevant one,
which is worse than the notes-only search it replaces. It is an additive
tie-break now (+0.05), and both directions are asserted: a tie goes to the
original, and a clearly better note still wins.

**Not proven:** that the migration applies to PRODUCTION, whose `library_chunks`
already holds 158 note rows. Deferred.

---

## Run: citation resolution — 168 real files, 1,462 resolutions (2026-08-07)

Script: `apps/web/scripts/phase5-citation-benchmark.mts`. Ground truth is
mechanical: a quote is lifted from a known block, so the right answer is known
exactly, with no labelling and no judgement call.

| Population | Tries | Right | **Wrong** | Refused |
|---|---|---|---|---|
| whole block quoted | 731 | 701 (95.9%) | **0** | 30 ambiguous |
| sentence from inside a block | 731 | 659 (90.2%) | **0** | 72 ambiguous |
| under 24 characters | 731 | — | **0 cited** | 731 |
| not in the document at all | 731 | — | **0 cited** | 731 |

**Zero wrong locations** is the number that matters. The refusals are repeated
boilerplate — a running header, a recurring instruction — where any answer would
be a guess, and a guess stored as a fact is what this layer exists to prevent.

🔴 **This measures the VERIFIER, not whether a model cites well.** That needs a
model in the loop, a question set, and a judgement about whether cited evidence
supports a claim. Reporting this as "citation accuracy" would be the
designed-versus-proven confusion one layer up.

---

## Run: what the facts build — 200 real files (2026-08-07)

Script: `apps/web/scripts/phase6-artifacts.mts`.

| | |
|---|---|
| Facts extracted | 2,385 |
| Flashcards | 147 across 35 files |
| Calendar candidates | 96 across 41 files |
| Note sections | 949 (259 with no text beneath them) |
| **Grading schemes** | **1** |
| Artifacts with no source blocks | **0** |
| Word artifacts claiming a page | **0** |
| Cards containing text not in the document | **0** |
| Facts that built nothing | 1,005 figure, 187 table |

### 🔴 The grading-scheme extractor found ZERO, and the reason was structural

Its shape test is right — a column of shares summing to a whole, which works for
a moot-court rubric and a weld inspection alike. But its only input was a `table`
block, and **PDF table detection is deliberately unbuilt**, so on the format
syllabi actually use it could never see anything. A rule with no reachable input
is not conservative; it does nothing.

Reading a run of sibling lines each ending in a percent finds **1** across 200
files. That is a small number and it is the honest one: most real syllabi put
weightings in a PDF table this system cannot yet detect, which makes PDF table
detection a Phase 2 gap with a measured Phase 6 cost.

---

## Run: adversarial fixtures through the INTEGRATED pipeline (2026-08-07)

`apps/web/lib/notebooks/pipeline-hardening.test.ts`. Each fixture goes
bytes → parse → model → chunk → rows → facts → artifacts. The database half is
proven separately, above, against a real Postgres.

**Defect found:** a chunk was reported `oversized` only when it held exactly one
block. A heading opens a chunk and never closes one, so the ordinary case — a
20,000-character paragraph preceded by its own heading — was carried whole and
reported as ordinary. The content was never at risk; the disclosure was, and a
chunk that will not retrieve well has to say so or it surfaces later as "search
is bad on this file".
