# Docling + PDF.js vs the Nemesis parsers — a bake-off

> **Status: measured locally. Not merged, not deployed, nothing switched on.**
> The experimental lane exists behind a per-format flag that is **off**. With no
> environment set, every format is read by the parser that reads it today.
> Run 2026-08-07 against 345 real course files.

## What this is

An evaluation, not a migration. The question was whether Docling should become
the general document-parsing stack, and the instruction was to answer it by
measurement rather than by architecture diagram — so the current parsers are
untouched and reachable, and the new lane had to earn every claim.

## How to read the numbers

Fourteen scoring dimensions were requested. Most of them **cannot be scored
without labelled ground truth**, and there are no labels for 345 files. Rather
than fill fourteen cells with a model's opinion of its own output — the exact
failure [`document-benchmark.md`](./document-benchmark.md) exists to prevent —
every dimension below is tagged with the kind of evidence behind it:

| Tag | Meaning |
|---|---|
| **MEASURED** | A count or a clock. No judgement, no labels needed. Runs over the whole corpus. |
| **DIFFERENTIAL** | The two parsers disagree; the disagreement is the finding. Verified by hand on a named sample, with N stated. |
| **UNSCORED** | Needs labels that do not exist. Said so rather than guessed. |

**This is a Nemesis-vs-Docling comparison only.** It is the SOLO half of the
benchmark. Nothing here compares against ChatGPT or Claude, and nothing here
supports the word "parity" — four such comparisons were withdrawn as unverified
in #451 and this document does not add a fifth.

## The corpus

345 real files: **164 PDF (1,474 pages), 158 DOCX, 23 PPTX.**

Excluded: **53 Word/PowerPoint `~$` lock stubs.** These are 162-byte files Office
writes while a document is open. They are not documents. Docling fails them
closed with a named error, which is correct behaviour, but scoring them would
have been scoring a corpus artefact.

Also present and used deliberately: 7 scanned PDFs, a 104-page lecture, a 124 MB
PowerPoint deck, and a set of legal/administrative PDFs that are the corpus's
only non-pharmacy discipline — used as the "would this work for a law student"
check on the adapter, per the standing field-agnostic rule.

---

## Three columns, not two

The scorecard has a third column, and it is the one that keeps the comparison
honest:

```
docling_results.jsonl   what Docling detected
adapter_results.jsonl   what survived into our DocumentModel      <- the third column
nemesis_results.jsonl   what we produce today
```

"Docling found 33 tables, Nemesis found 0" is not yet an argument for Docling.
What matters is how many survive the crossing into our model. Scoring Docling's
raw output against our final output would credit Docling for anything our own
adapter then dropped.

---

## Two traps that would have produced false conclusions

Both were found by running real files, and both are invisible if you take the
obvious integration path.

### 1. The coordinate origin changes **within a single document**

Docling's `BoundingBox` carries a `coord_origin` field. The Pydantic default is
`TOPLEFT`, but the PDF pipeline **always emits `BOTTOMLEFT`** — while table cell
boxes in the same file arrive `TOPLEFT`. Reading the default, or assuming one
origin per document, flips every rectangle vertically. That is invisible in a
text diff and catastrophic in a citation that highlights a region.

The adapter reads `coord_origin` **per box**, and a test asserts that a
`BOTTOMLEFT` box and a `TOPLEFT` box describing the same physical rectangle
resolve to the same `DocRect`.

### 2. The Markdown export silently drops the lecturer's script

Docling recovers PPTX speaker notes **perfectly** — on a real 14-slide deck it
returned 14 note items totalling **13,101 characters, exactly matching
python-pptx ground truth**. But those notes live in `ContentLayer.NOTES`, and
`export_to_markdown()` defaults to `included_content_layers = {BODY}`.

**Every speaker note vanishes if you integrate through Markdown** — which is the
most common way people integrate Docling. `export_to_dict()` keeps them.

This is why the adapter consumes the JSON export, and why speaker notes map to
`note` rather than `paragraph`: a note is what the lecturer *said*, and
flattening it into slide text would let a quotation attribute an aside to the
slide itself.

---

## Format by format

### PDF — Docling wins, and it is not close

**MEASURED**, 93 PDFs completed at time of writing:

| | Nemesis | Docling → adapter |
|---|---:|---:|
| tables | **0** | **33** |
| table cells | 0 | 937 |
| cells in marked header rows | 0 | 95 |
| list items | **0** | **224** |
| …carrying a real marker | 0 | 115 |
| headings | 107 | 201 |
| captions | 0 | 10 |

Our PDF lane produces **no tables and no list items at all**. That is not a
tuning gap, it is an absent capability — PDF table detection was deliberately
never built, and the grading-scheme extractor returning 1 across 200 files was a
downstream symptom of it.

**The bigger finding is OCR.** Memory records the scan lane as *"OCR NOT BUILT"*
(#436, open). Docling ships RapidOCR by default:

| scanned document | Nemesis | Docling |
|---|---:|---:|
| 3-page complaint | 73 chars (`state=failed`) | **7,251 chars** |
| 2-page record | 48 chars (`state=failed`) | **4,373 chars** |
| 1-page assessment form | 23 chars (`state=failed`) | **1,309 chars + a 5×8 table grid** |

Spot-checked by reading the output: the OCR recovers correct headings, correct
dates and lot numbers, and a real table grid from a **scanned** form. There are
character-level errors ("Diphtheria" → ")iphtheria") but the text is
overwhelmingly usable.

Nemesis is **honest** about these — it reports `state=failed` rather than a
silent empty parse, which is the coverage layer working exactly as designed. But
honest failure is still failure. Docling closes a lane we have not built.

**Caveat, stated plainly:** only **7 of 164** PDFs in this corpus are scans. The
capability is decisive; its frequency here is low.

#### Figures — UNSCORED, and the raw counts must not be quoted

The corpus totals say Nemesis 375 figures vs Docling 176 on the same PDFs. That
reads as a Nemesis win. **It is not a comparison at all** — the two numbers count
different things. Ours counts image *draw operations* from the pdf.js operator
list; Docling's counts things its layout model believes are figures.

Settled by hand on `exam6.pdf` (N=1), where we report 29 and Docling reports 5:

```
29 figure blocks, 6 distinct sizes
  x20  4.4% x 2.1%   <- the same small image, on all 3 pages
  x 4  46.6% x 2.4%
  ...
26 of 29 sit at a size that repeats.
```

Twenty of our twenty-nine "figures" are one repeated icon. **Our number is
inflated by decoration.** Docling's 5 is closer to what a student would call a
figure.

**It does NOT have a cost consequence, and it is worth saying why.** The obvious
inference — inflated figure count means inflated vision spend — is wrong, and it
was checked rather than assumed. `planFigureVision` only routes a figure covering
**≥3% of its page** (`WORTH_LOOKING_AREA`), or any figure on a page with under
120 characters of text. The repeated icon is 4.4% × 2.1% = **0.09% of the page**,
and these pages carry ~800 characters. Measured on the same file:

```
figure BLOCKS detected     : 29
would be sent to vision    : 0
blocks below the threshold : 29 of 29
```

**Zero vision calls.** The routing is smarter than the raw count implies. What is
wrong is the *count as a comparison metric*, not the spend — the PDF lane has no
SHA-1 content dedupe the way the PPTX lane does, but the area filter makes that
academic for decoration. Left as-is.

#### Two-column reading order — DIFFERENTIAL, N=2 files, and it does not go one way

**39 of 155 digital PDFs are two-column** (classified independently of both
parsers, by looking for a vertical gutter that text lines respect). A quarter of
the corpus, so the class matters.

Hand-read on two of them:

- **`Aqueous degradation of clindamycin.pdf` — our parser interleaves the
  columns, on every paragraph of two separate pages.** Real output:
  *"…containing 10mg./ml. cholesteryl **pH less than 4 was establishe**"* and
  *"…Peak 2 may represent **ability of the substituent on th**"*. Left-column text
  glued to right-column text mid-sentence. It reads fluently and is nonsense —
  the worst possible failure, because nothing downstream can detect it.
- **`The Emerging Role of Pharmacists as Social Media Influencers.pdf` — clean.**
  Every paragraph coherent and complete.

So the interleave is **real and reproducible, but not universal**. Do not report
it as "our PDF lane cannot do two columns"; report it as a failure mode that
fires on some real documents and is invisible when it does. Memory records a
two-column interleave being fixed once before, in a way that broke tables — this
is either a regression or a case that fix never covered.

Docling on the same pages did not interleave, but produced noisy fragments from
chart axis labels ("6", "2 MIN.", "T") on the figure-heavy page. Neither output
is clean; they are wrong in different ways.

### DOCX — genuinely split, and forcing a winner would be wrong

**MEASURED**, all 158 DOCX:

| | Nemesis | Docling → adapter |
|---|---:|---:|
| text characters | 604,460 | 601,715 |
| list items | 2,497 | 2,512 |
| **…carrying a real marker** | **2,497 (100%)** | 1,710 (68%) |
| tables | 231 | 229 |
| table cells | 9,014 | 9,608 |
| **cells in marked header rows** | 13 | **1,038** |
| **figures** | **0** | **196** |
| equations | 0 | 19 |

Read that table carefully — it does not have a winner.

- **Our numbering is better.** Every one of 2,497 list items carries a resolved
  marker, because `docx-structure.ts` reads `numbering.xml` through both
  indirections (`w:num` → `w:abstractNum` → `w:lvl`) and keeps per-level running
  counters. Docling produces a marker for 68%.
- **Docling's header rows are better by two orders of magnitude** — 1,038 marked
  header cells against our 13. A rubric whose header row is unmarked reads as
  data, which is the "confidently wrong" failure the canonical model warns about.
- **Docling recovers 196 figures where we recover none.** Our DOCX lane never
  unzips `word/media/*` at all, and — worse — **does not disclose the omission**.
  A picture-only assignment brief currently reads as an empty document with no
  coverage entry saying so.

**Text fidelity is a wash** (604k vs 602k characters). The adapter's apparent
96k-character shortfall was checked and is **not a loss**: cell text moves into
`DocTable.rows` rather than staying loose prose. Blocks + grids recover **111% of
Docling's raw character count** — nothing is dropped.

### PPTX — ours, decisively

Our PPTX lane wins on the thing a lecture is actually for. Speaker notes are
reached through **each slide's own relationships** rather than by filename index,
and SmartArt and chart text are recovered the same way. Images are deduped by
SHA-1 content hash, so a crest on 71 slides is one picture, and glyph filtering
is by pixels rather than bytes.

Docling *can* do speaker notes — the 13,101-character exact match above proves
it — so this is an argument about integration, not capability. But our lane also
carries chart and diagram text that Docling's PPTX backend does not surface, and
it has honest per-deck coverage (`slides`, `notesPages`, `charts`, `diagrams`,
`imagesFound/Readable/Unreadable/Glyphs/DroppedToCap`).

**What is genuinely weak in our PPTX lane, and Docling would fix:**
- Tables never become grids — cell text is emitted as ordinary bullets.
- **No geometry at all.** `a:off`, `a:ext` and `p:sldSz` are unparsed repo-wide.
- The model is built by splitting an already-rendered Markdown string, so block
  text literally contains `- First bullet`, `## Slide 3: …`, `**Cmax**`.
- Multi-line speaker notes shatter, because the wrapper string is split on `\n`.

Those are real defects, but they are **defects in our renderer, fixable in our
own code**, and they do not outweigh losing notes/charts/diagrams and a working
dedupe.

---

## What PDF.js should be responsible for

There are **four PDF engines in the tree today** — pdfjs-dist 6.2.108 in two
different builds (browser modern, Node legacy), `unpdf` with its own embedded
pdf.js, and `pdf-lib` for vision page slicing. Adding Docling's `pypdfium2` makes
five. A design that assumes "one pdf.js" is already wrong.

PDF.js should keep exactly the jobs it is uniquely good at and give up the rest:

**Keep:**
- **The reader.** Page rasterisation, the selectable text layer, thumbnails, the
  document's own bookmarks. Nothing else can do this in a browser.
- **Page geometry and region interaction for citations.** This is the citation
  path and it must stay client-side and instant.
- **Figure geometry via the operator list.** This is a capability *nothing else
  in the tree has* — a hand-written replay of the save/restore/transform stack
  giving each image draw a real box — and it is how a figure gets cropped.
- **Embedded image bytes** (`page.objs.get`), which is how a figure becomes PNG
  bytes for a vision call.

**Give up:** structural extraction. We currently run **two structure engines that
cannot agree** — a server one (`lib/pdf/geometry.ts` + `structure.ts`) and a
browser one (`lib/reader/pdf-blocks.ts` + `pdf-columns.ts`) — with different
origins and different block kinds. That is the low-level layout work the
instruction says to stop building, and it is what Docling replaces.

One gap PDF.js leaves open either way: **there is no server-side rasterizer.**
`structure.ts` never calls `page.render`, so cropping an arbitrary page region to
an image on the server is not currently possible.

---

## The operational consequence of Docling being Python

**It must be a separate service. It must not be embedded in Next.js.** This is
settled by a measurement, not a preference.

Peak resident memory for a Docling run, from the project's own technical report
(arXiv 2408.09869, Table 1), 225 pages, OCR disabled:

| backend | pages/sec (M3 Max, 4 threads) | peak RSS |
|---|---:|---:|
| `docling-parse` (native) | 1.27 | **6.20 GB** |
| `pypdfium2` | 2.18 | **2.56 GB** |

Locally observed in this run: **1.6 GB peak RSS** for the batch process, and a
**1.0 GB** virtualenv before models. Model weights add ~506 MiB (layout +
TableFormer). The official CPU container image is **4.4 GB**.

That rules out Vercel functions and most Lambda configurations. It also rules out
spawning a Python child process from a Next.js route.

**The boundary is `docling-serve`** — the project's own MIT-licensed FastAPI
wrapper, published as `ghcr.io/docling-project/docling-serve-cpu`. It has a
versioned `/v1` API, a real async task queue (`/v1/convert/source/async` →
`/v1/status/poll/{id}` → `/v1/result/{id}`), WebSocket status, optional Redis/RQ
workers, and `X-Api-Key` auth. Nemesis already has a background document worker
with job semantics; this slots in beside it as one more provider behind a
network call with a timeout and a fallback.

> 🔴 **The server's defaults are unsafe and the client must not trust them.**
> `DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT` ships at **604800 seconds — seven days** —
> and `MAX_NUM_PAGES` and `MAX_FILE_SIZE` are **unset by default**. The client in
> `docling-client.ts` sets its own 120 s timeout and 32 MB cap, which apply
> however the service happens to be configured.

**Licensing is clean.** `docling`, `docling-core`, `docling-parse`,
`docling-ibm-models` and `docling-serve` are all **MIT**. The two model weights
that run on every PDF (`ds4sd/docling-models`: RT-DETR layout + TableFormer) are
**CDLA-Permissive-2.0 / Apache-2.0**. No copyleft, no non-commercial clause,
nothing that touches a closed commercial SaaS. Governance moved from IBM to the
**LF AI & Data Foundation** (April 2025); the hosted "Docling for IBM watsonx"
offering runs the same open stack rather than a held-back fork.

Two risks worth naming: releases are **commit-triggered, not calendar-based**
(8 releases in 27 days), so both `docling` and `docling-core` must be pinned —
the schema types live in the separately-versioned `docling-core`. And Python 3.14
does not resolve; the service needs 3.12.

---

## Recommendation, in plain English

**PDF → Docling.** Our PDF reader finds no tables and no lists at all, and cannot
read a scanned page. Docling finds both and reads scans out of the box. This is
the change that matters.

**DOCX → keep ours, and take two specific things from Docling.** Our Word reader
is genuinely better where it counts most — it gets the numbering right on every
single list item, which Docling manages on two-thirds. But it misses two things
badly: it never notices pictures (196 of them across your files, currently
invisible *and* undisclosed), and it almost never spots which row of a table is
the header, which makes a grading rubric read like data. Fix those two in our own
code rather than switching owner.

**PPTX → keep ours.** It is the only one that reliably pulls out the lecturer's
speaker notes, the text inside charts, and SmartArt diagrams — and it is smart
enough to notice the same logo on seventy slides is one picture, not seventy. Our
weaknesses here (tables flattened, no slide geometry, formatting characters
leaking into the text) are our own bugs and are fixable without a new dependency.

**PDF.js → the reader and the pictures, not the structure.** It should keep doing
what only it can do: showing pages, letting a student select text, and working out
exactly where on a page a picture sits so it can be cropped. It should stop being
a document-structure parser — that is the from-scratch layout work worth stopping.

**What stays:** all three current parsers, in full. Nothing is deleted. The Word
and PowerPoint readers stay because they win. The PDF reader stays because it is
the fallback whenever the service is unreachable, and because a student's upload
must always be read by something.

**What could eventually retire:** only the PDF *structure* half — the two
disagreeing structure engines — and only after the Docling lane has actually run
in production on real uploads. Nothing retires on the strength of this document.

**Is the dependency worth it?** **Yes, for PDF specifically.** It buys two things
we do not have and would otherwise have to build: table extraction and OCR. The
cost is honest — a separate Python service with about 4.4 GB of container and
2–6 GB of RAM per worker — and the licence is genuinely clean. It is not worth it
as a *general* replacement, because for Word and PowerPoint we would be trading a
better parser for a worse one.

---

## What this document does NOT establish

- **Retrieval quality.** Measured only as a **proxy** — chunk counts, whether a
  chunk knows its heading path, whether its blocks carry geometry. Real retrieval
  needs embeddings and a live index, and `20260807030000_source_chunk_retrieval`
  is unapplied. Embedding the corpus would also start real spend.
- **Reading order in general.** UNSCORED — there is no ground-truth ordering to
  diff against. Two-column behaviour was hand-read on **2 files only**, and the
  two disagreed with each other. That is a signal, not a rate.
- **Equation fidelity.** UNSCORED beyond counts. Docling produced 19 equations on
  DOCX where we produce 0, but nobody has checked whether the 19 are right.
- **Anything about a production deployment.** The service has never run outside
  this machine. No upload has ever been routed to it.
- **Anything about competitors.** SOLO half only.
