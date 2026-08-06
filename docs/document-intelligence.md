# Document intelligence — audit, research, and plan

> **Scope, set by the owner 2026-08-05, and it governs everything below.**
>
> **The parser is UNIVERSAL. School is a layer on top of it, not a property of it.**
>
> A file must first be understood as a *document* — a contract, an invoice, a financial report, a
> technical manual, a government PDF, a resume, a research paper, a scanned form, a lecture — before
> anything decides what a student might do with it. Nothing in the extraction, chunking, indexing or
> citation layers may assume education.
>
> ```
>   UNIVERSAL DOCUMENT INTELLIGENCE
>     parse structure/layout/content · preserve provenance · index the original · retrieve and reason
>                                    │
>                                    ▼
>   DOMAIN / WORKFLOW LAYER  (what is this document FOR?)
>     syllabus  -> offer calendar extraction
>     lecture   -> Teach me / Notes / Flashcards / Test
>     paper     -> methods, results, evidence
>     contract  -> clauses and obligations
>     report    -> metrics and tables
>     manual    -> procedural answers
> ```
>
> **The quality bar:** upload an arbitrary document to Nemesis, ChatGPT and Claude, and Nemesis should
> extract and reason over essentially the same important information, with accurate citations.
> **This is the goal, not a description of today.** Nothing here has been measured against it — see
> [`document-benchmark.md`](./document-benchmark.md), which has no recorded values yet.
>
> **🔴 Before repeating any comparison to ChatGPT or Claude, read §6.2.** It lists which claims are
> supported and which were withdrawn on 2026-08-06 as unverified or false. Claims about our own
> quality are checkable against this repo; claims about anyone else's are not, unless we ran them.
>
> **Consequences for this document, which was written school-first and is wrong in places:**
> - The visual schema's `educationalRelevance` is a domain judgement leaking into the core. The core
>   field is *importance to understanding this document*; "is this worth a flashcard" belongs upstairs.
> - The benchmark corpus must span fields **and formats** — contracts, invoices, filings, manuals,
>   resumes, forms — not twelve lecture files. §8 and `document-benchmark.md` carry this now; the
>   near-term academic corpus gates the phases, the universal corpus is the eventual bar.
> - **Spreadsheets are not supported at all today.** `kindFor`/`sniffKind` know only pdf/docx/pptx/
>   image, so an .xlsx is refused outright. A universal parser has to answer for that.

Written 2026-08-05. Sixteen agents: six auditing the live pipeline lane by lane, six researching
what current document systems actually document, one architect, three adversarial reviewers.
Every claim below carries a `file:line` or a URL. Where something is inference, it says so.

---

## 1. The one-sentence version

**Nemesis reads pictures, writes down what it saw, and then deletes the picture.**

Everything the owner reported — diagrams missing from notes, no automatic occlusion cards, no sense
of when an image matters — follows from that single fact. It is not a judgement failure. By the time
anything downstream could judge, there is nothing left to judge.

---

## 2. What happens today

There is exactly one extraction chokepoint, `apps/web/app/api/notebooks/extract/file/route.ts`,
and five client lanes feed it. Its own header comment states the design:

> The file bytes are never stored — text in, text out.

```
 FIVE CLIENT LANES
  1 chat            components/workspace/sessions/composer.tsx:591
                     -> lib/workspace/chat-attachments.ts:377 prepareChatAttachments
                        |- :381 Promise.all(persistChatAttachment)   <- ORIGINAL bytes to a bucket
                        '- :387 Promise.all(extractFile)             <- text only
  2 library import  components/workspace/library/use-library-import.ts:120
  3 coursework      components/workspace/onboarding/use-coursework-import.ts:133
  4 notebook src    components/workspace/notebooks/notebook-source-actions.ts:32
  5 syllabus        lib/workspace/syllabus-import.ts:64  (+ mobile documents.ts:80, photos.ts:114)
        |
        |  >24 MB office file: the BROWSER unzips it and DELETES
        |  ppt|word/(media|fonts|embeddings)/  (office-slim.ts:36)
        v
 +-------------------------------------------------------------------------------+
 | POST /api/notebooks/extract/file                                              |
 |  :87  verifyDeviceKey -> {ok, userId}      *** userId RESOLVED THEN DISCARDED |
 |  :108 MAX_BYTES 25 MB                                                          |
 |  :116 defensive copy (pdf.js DETACHES the buffer it is handed)                 |
 |  :120 kindFor(name, mime) else sniffKind(magic bytes)                          |
 +-------------------------------------------------------------------------------+
    |            |                    |                         |
  image        pdf                  docx                      pptx
    |            |                    |                         |
    |    lib/pdf/extract.ts:48        |          lib/notebooks/office.ts:187
    |    unpdf 0.12.2 keeps ONLY      |           |- unzipBounded (400 MB / 20k entries)
    |    item.str + hasEOL —          |           |- slide order by FILENAME
    |    transform / width /          |           |- charts, SmartArt, notes via each
    |    fontName are DISCARDED       |           |   slide's OWN .rels
    |    inside unpdf itself          |           |- EMF -> PNG, TIFF -> PNG recovery
    |            |                    |           |- planSlideMedia: sha1 dedupe, size
    |    pages.ts:111 planPdfRead     |           |   filter, recurring label, cap 120
    |    text | whole | pages(40)     |           '- office.ts:291 DELETE every
    |            v                    |               unplanned entry
    |    vision.ts readPdfPagesWith-  |                       |
    |    Vision (pdf-lib slices,      |        route.ts:213 describeFiguresWithVision
    |    8/batch, 3 concurrent)       |        (base64 -> Gemini, batches of 8)
    v            v                    v                       |
  readWithVision(PHOTO_PROMPT)        |        :220 pptxTextWithFigures
  lib/vision/gemini.ts:174            |        merges "[Figure: ...]" INTO THE STRING
    |            |                    |                       v
    |            |                    |   *** deck.imageBytes GARBAGE COLLECTED ***
    '------------+--------------------+-----------------------'
                 v
   route.ts:237 capText(text, TEXT_CAP = 200_000)   <- blunt slice(0, cap)
                 v
   route.ts:289 json({ kind, title, text, bytes:NUMBER, readBy?, skippedFigures?, coverage? })
                 |
                 v
   chat-attachments.ts:241  ExtractedFile = { text, title, readBy? }
        *** coverage AND skippedFigures DROPPED HERE — ZERO consumers repo-wide ***
                 |
   +-------------+-------------------------+------------------------+
   v                         v                                      v
 fitAttachmentBlocks    use-library-import: the librarian      notebook_sources.content
 (60k/file, 150k total)  is ASKED TO GUESS {page}|{slide}
   v                       v
 chat_messages.meta     library_provenance.location            library_chunks
                        (an UNVERIFIED model claim)            (kind='note' ONLY —
                                                                stored originals are
                                                                NEVER indexed)

 STUDY SIDE — never sees any of the above structure
  study-artifact-content.ts:187,193   material.slice(0, 9_000)   <- SILENT truncation
  study-artifact-content.ts:52        toQuestion REBUILDS {q, options, answer, why},
                                       dropping every other field
  agent-tools.ts:1065                 add_flashcards writes {front, back, deck_id, card_type} —
                                       no source path
  occlusion-editor.tsx:66             the ONLY image source in the entire app is a
                                       manual pick / drop / paste
```

---

## 3. Where information is lost

Twenty-six loss points were catalogued. These are the ones that matter.

### Fatal

| What is lost | Where | Why |
|---|---|---|
| **Every figure's pixels** | `office.ts:291` | Un-planned entries deleted; planned ones die with the request. Nothing downstream ever sees an image. |
| **Every PDF page's pixels** | `lib/pdf/vision.ts` | Picture pages are transcribed to prose. No raster is ever produced or kept. |
| **All PDF geometry** | inside `unpdf` 0.12.2 | The library keeps `item.str` and `hasEOL` and throws away `transform`, `width`, `fontName` before our code runs. So: no headings, no columns, no reading order, no boxes. |
| **DOCX structure entirely** | `office-text.ts:65-73` | A regex tag-strip. Headings, lists, tables, images, all flattened. Tracked deletions and field codes leak *in*. |
| **Shape-built diagrams** | `slide-media.ts` MIME table | The media path accepts gif/jpeg/png/webp only. A diagram drawn from arrows and text boxes — the *most common* kind in engineering, law and CS decks — is not a file and is never seen. |

### Major

| What is lost | Where | Why |
|---|---|---|
| Table relationships | `office-text.ts` | PPTX table cells become bullets. A drug/mechanism/effect table, a case/holding table, a materials/yield-strength table — all become an unlabelled list. |
| Honesty about coverage | `chat-attachments.ts:241` | The route computes a full `coverage` tally and the client type doesn't include the field. **Zero consumers repo-wide.** A 40-of-300-page read presents as complete. |
| 91% of long study material | `study-artifact-content.ts:187,193` | `.slice(0, 9_000)` with no notice to the model or the student. A test "on your 200-card deck" is written from the first 9,000 characters. |
| Provenance | `use-library-import.ts` | The page/slide number on a citation is *the model's guess*, stored as if measured. |
| Media on big office files | `office-slim.ts:36` | Over 24 MB the browser strips `ppt/media/` before upload. Correct as a size fix; currently indistinguishable from "this deck had no pictures". |

---

## 4. Research: documented vs inferred

**Documented** (cited in the full research payload):

- Gemini accepts PDFs natively and *sees page images as well as text*; it supports JSON-schema-constrained
  output and returns object-detection boxes normalised to a 0–1000 grid.
- Anthropic and OpenAI both document native PDF input with page limits and size limits.
- Docling, Marker, MinerU and Surya all emit figure crops **with page coordinates** — the exact capability
  we lack. All four are **Python**. None has a JS path.
- PDFium compiled to WebAssembly (`@embedpdf/pdfium`, MIT wrapper over Apache-2.0 PDFium, ~4.7 MB)
  renders PDF pages to rasters **in Node, with no native binary**.
- `unpdf` ^1.8 exposes `extractTextItems`, which returns per-item transforms — the geometry 0.12.2 discards.

**Inference, not documented:**

- That a Vercel Node function can complete PDFium rasterisation of a large scan inside 300 s. Unmeasured.
- That Gemini's box accuracy is good enough for automatic occlusion without review. Our own occlusion
  module was built assuming it is *not*, and makes the client measure the real image.

**Hard constraint the research settled:** there is **no way to render a PowerPoint slide to an image
inside a Vercel function.** It needs a layout engine (LibreOffice). That means composited slides,
SmartArt-as-drawn, and true-vector EMF/WMF/SVG require a separate deploy target (Vercel Sandbox with a
LibreOffice image, roughly half a cent per deck). **This is out of scope for the staged plan and should
be decided separately.**

---

## 5. What the reviewers broke

The first plan did not survive review. Three findings changed it materially.

**1. The proposed identity key was write-only.** Visuals were to be grouped by a hash of the uploaded
bytes — but that hash was never returned to any client, and for big office files the browser strips media
before upload so the hash isn't even of the original file. Stage 1 would have written rows **no screen
could ever find**.

**2. Occlusion cards cannot read from a new bucket.** Both surfaces hardcode the bucket name —
`study-cloud-store.ts:589` on web, `cloudStudy.ts:435` on the phone. Verified by hand. A key pointing at
any other bucket renders nothing, and fixing the phone means a **native App Store release**. So figures
must be *copied into* `study-images` when a card is made.

**3. "Field-agnostic" was audited as vocabulary, not behaviour.** Removing medical words is necessary and
not sufficient. The real biases are in numbers with no words in them:

| Signal | Value | Who it fails |
|---|---|---|
| Page-is-a-picture floor | `< 120 chars` (`pages.ts:37`) | A Chinese or Japanese page says far more in 120 characters than an English one — a full paragraph gets re-read as a picture, and a mojibake page passes as read |
| Token budget | `CHARS_PER_TOKEN = 4` (`workload-cost.ts:286`) | CJK runs 1–1.7 chars/token, so budgets are off by 3–4× |
| Repetition = decoration | `>60% of slides` (`slide-media.ts:38`) | A build-up diagram repeated across 8 slides is deleted as furniture |
| Reading order | order by ascending x | Reverses Arabic, Hebrew and Persian |
| Question format | one-best-answer only (`item-writing.ts:12`) | Sourced from the NBME guide *for the Health Sciences*. No numeric answers for engineering, no multi-select |
| House style | *"Write in simple technical English"* (`study-ai-extras.ts:43`) | Owner-set 2026-07-28. A Spanish lecture gets English cards. **Owner's call, not mine to change.** |

---

## 6. Plan

> **Superseded and rewritten 2026-08-06 by the owner.** This section used to hold a Stage 0–9 list.
> That list is gone, not because it was wrong — most of it was right and all of it is accounted for —
> but because a second numbering scheme living beside the owner's is how a repo ends up with two
> governing plans and a session that follows the stale one. **The Phase order below is the only
> plan.** §6.6 maps every old stage into it so nothing is lost, and **§6.7 is the progress ledger** —
> the one place a phase's status is recorded, and the only place the words DONE / IN PROGRESS /
> BLOCKED / NOT STARTED may be used about a phase.

### 6.1 The target, stated precisely

The gap between Nemesis and a top-tier general system is that they are given *the page*, and we are
given *the page's text*. Everything about where the words sat — the table grid, the two columns, the
heading hierarchy, the diagram beside the paragraph — is discarded before any model sees it.

**But "render every page and put the images in the request" is not the fix, and must not be built.**
Vision costs tokens, misreads dense pages, and runs into context limits. Hundreds of page images in
one request is a worse system than the one we have, not a better one. The target is four things
together:

1. **Complete native extraction and rendering for every unit.** Every page, slide or sheet gets both
   a native pass and a rendered image. Nothing is skipped at ingest because it looked simple.
2. **Adaptive high-detail vision for units that are visually complex or uncertain.** Detail is spent
   where the native pass is thin, contradictory, or structurally hard — not uniformly.
3. **Query-time high-resolution reinspection.** When retrieval selects a page or region, that page or
   region can be re-examined at full detail *then*, against the actual question. This is what keeps
   ingest cost bounded without capping what can be answered.
4. **Caching keyed on source version, unit, crop, parser version and model.** Re-inspection is only
   affordable if the second look at the same crop is free. All five parts of the key matter: a new
   parser version or a new model invalidates, a re-uploaded file invalidates, a different crop does
   not collide.

**Native and visual results are merged, never treated as alternatives.** A page with three paragraphs
and one critical diagram must keep both. A scanned page with weak OCR must keep the visual evidence
*and* the record that its text is uncertain.

### 6.2 What we may and may not claim

Claims about our own quality are checkable against the code. Claims about anyone else's are not,
unless we ran them. Several claims made in conversation on 2026-08-06 are corrected here so they
cannot be repeated from a stale doc.

| Claim | Status |
|---|---|
| ChatGPT/OpenAI and Claude give the model both extracted text and page images for PDFs | **Supported.** |
| Our ingest lane gives the model flattened text and invokes vision selectively | **Supported.** Verified in `apps/web/lib/pdf/extract.ts` and the extract route. |
| We therefore lose layout, columns, tables, visual hierarchy and diagrams on text-rich pages | **Supported.** Follows from the above. |
| Phase 2 should produce one native-plus-visual representation | **Supported.** §6.1. |
| "Page images solve it for free" | **WITHDRAWN.** They cost tokens, misread dense pages, and hit context limits. See §6.1. |
| "ChatGPT and Claude quietly cut long documents" | **WITHDRAWN — unverified.** Their published APIs have size, page and context limits, but we have not tested how their consumer apps disclose truncation. We may say *we are building explicit coverage reporting*. We may not say competitors hide truncation. |
| "Their documents disappear after the answer" | **WITHDRAWN — false.** ChatGPT Projects retain files and sources across chats; Claude has persistent project and file workflows. |
| "Nemesis already has exact citations" | **WITHDRAWN — premature.** Some stored locations are model-supplied, not validated. The reader and deep-link UI exist; citation *correctness* is Phase 5. |
| "PowerPoint is already better than either competitor" | **REPHRASED.** We preserve speaker notes, SmartArt, chart labels, media relationships, TIFF/EMF recovery and recurring-art filtering — a real native-format advantage. We lack rendered-slide visual reasoning and have run no matched comparison. Promising, not proven. |
| "One change, not ten" | **WITHDRAWN.** Rendering is the largest single visible gain and is not sufficient alone. See §6.3. |

**The accurate description, to be used until the benchmark in `docs/document-benchmark.md` passes:**

> Nemesis is already designed around a persistent academic workflow, but ChatGPT and Claude remain
> ahead at understanding the visual meaning of an individual document. The document-intelligence
> roadmap is closing that gap without sacrificing organization, provenance, or processing honesty.

**Nemesis's actual differentiation** is not "we keep your file" — everyone keeps your file. It is
semester-wide academic organization; sources connected to courses; notes, decks, tests, recordings and
calendar events all derived from one source; a dedicated reader; source-to-study provenance; and
ongoing agent workflows rather than isolated document question-answering.

### 6.3 A seamless system needs all of these

Rendering pages is the largest visible intelligence gain. It is not sufficient by itself. Top-tier
requires: background processing · native and visual representations · a stable canonical structure ·
original-source indexing · retrieval across the complete document · verified provenance · progress,
retries and recovery · and no silent downstream truncation.

### 6.4 Phase order and acceptance

> **Status lives in §6.7, not here.** These entries state what each phase *is* and what would count as
> acceptance. Where it currently stands — and whether it is live — is recorded once, in the ledger.
> Two copies of a status is how a phase comes to be described as finished in one paragraph and
> unstarted in another.

**Phase 0 — Truthfulness.** PR #442. `ExtractionCoverage` in `packages/shared` is the canonical
contract and the only coverage shape permitted; rescued parser code adapts to it rather than
introducing a second. Disclosure reaches the student and the model.

**Phase 0b — Durable persistence.** PR #447 (schema, applied as
`20260806173152`) and #446 (runtime). A parse survives reload; re-parsing the same bytes is idempotent
(verified: two POSTs, one row, `attempts=2`); `complete` cannot disagree with `coverage` because a
CHECK constraint ties them.

**Phase 1 — Document worker.** Move parsing out of the upload request. Acceptance:

- Upload returns without waiting for the full parse.
- Processing survives refresh and navigation.
- Jobs have leases, retries, idempotency, progress and recovery.
- A failed page or batch retries without restarting the whole document.
- Uploading several lectures at once does not overwhelm the app.
- A source is not marked ready until parsing *and* indexing are genuinely ready.

**Phase 2 — Canonical native-plus-visual PDF understanding.** Not page images stapled to the existing
flat string. Every PDF page preserves: native text · geometry and reading order · font and style
signals · page dimensions and rotation · ordered blocks · tables and figures · a rendered page image ·
vision/OCR findings · extraction method and confidence · stable page/block/region locators · coverage
and failures. Native and visual merged, per §6.1.

**Phase 3 — Office fidelity.** Native structure *plus* rendered appearance. DOCX: headings, lists,
tables, images, captions, hyperlinks, page and section structure, footnotes, reading order — replacing
today's regex tag strip. PPTX: keep the existing native advantages and add the rendered slide, so the
model can reason about spatial relationships, arrows, callouts and overall composition.

**Phase 4 — Original-source retrieval.** Index the canonical source directly; derived notes must not
be the only searchable representation. Remove silent dependence on every cap below. A model's context
may be bounded — the stored source and the searchable index may not be silently incomplete.

| Cap | Value | Where |
|---|---|---|
| `TEXT_CAP` | 200,000 chars | `apps/web/lib/pdf/extract.ts:18` |
| `MAX_ATTACHMENT_CHARS` | 60,000 chars | `apps/web/lib/workspace/chat-attachments.ts:37` — the chat handoff, **per file** |
| `MAX_TOTAL_CHARS` | 150,000 chars | `apps/web/lib/workspace/chat-attachments.ts:38` — the chat handoff, per turn |
| `MATERIAL_CHAR_LIMIT` | 9,000 chars | `apps/web/lib/workload-cost.ts:315` **and** `apps/web/lib/workspace/study-artifact-content.ts:44` — defined twice |
| `LIBRARIAN_TEXT_CHARS` | 60,000 chars | `apps/web/lib/workspace/library-librarian.ts:39` |
| `DOC_LIMIT` | 40 docs/tick | `supabase/functions/library-index/index.ts:41` |
| `MAX_CHUNKS_PER_DOC` | 60 chunks | `supabase/functions/library-index/index.ts:42` |
| fixed vision-page limit | 40 pages | PDF vision fallback |

🔴 **The two chat-handoff caps were missing from this table until 2026-08-06, and their absence is
the exact failure the table exists to prevent.** They are the boundary *after* extraction: a document
can be read completely, recorded as `complete`, and still reach the model with its ending removed.
The per-file cap sat **below** the per-turn budget, so a single ordinary lecture — 57 slides, 62,040
characters — lost its last slides to save 3.3% of itself while 88,000 characters of that same turn's
budget went unspent. PR #443 corrects the arithmetic and the wording of the notice. **It is listed
here anyway, and must stay listed**: the immediate bug and the standing obligation are different
things. Every cap on this line has to remain justified, observable, and disclosed when it changes
what can be answered — a fix does not retire the entry, it only changes the value.

Two general rules this row makes concrete:

- **A cap after the parse is still a cap on understanding.** Auditing only the extraction lane would
  have declared this document fully understood on the same day it was being cut.
- **Disclosure must be in the document's own units.** The cut *was* announced, in characters. The
  model could not map "60,000 of 62,040 characters" onto a lecture, so it named slide 46 when the
  real boundary was slide 55. A confident wrong location is worse than no location.

Salvage note: `supabase/migrations/20260805040000_source_indexing.sql` already drafts this schema
(`library_chunks.origin_type`, a one-origin CHECK). It is **unapplied**, and #447 rewrote part of it in
terms of `parsed_document_id`. Reconcile it; do not rewrite it.

**Phase 5 — Verified citations.** Chat answers, notes, cards, tests and syllabus events cite canonical
source locations. A citation is not accepted until: its source version exists · its page/slide/block
locator exists · it opens the correct location · and the cited evidence supports the generated claim.
Not complete until tested through the reader.

**Phase 6 — Semantic extractors.** 🔴 **This phase was missing from this list until 2026-08-06** — the
numbering ran 5 → 7, and a phase that is not written down is a phase nobody schedules. It is restored
here with its original meaning from the owner's eight, not re-scoped: it is where *document*
understanding becomes *academic* understanding.

The extractors: learning objectives · key concepts · definitions · processes and pathways · equations ·
important figures and tables · dates and deadlines · grading rules · exam information · assignments ·
required readings · syllabus events · instructor emphasis where the evidence supports it.

Two constraints make this a phase rather than a prompt:

- **Every extracted fact keeps a locator back to the source blocks it came from.** Without that, a
  semantic extractor is just a second summary corpus that cannot be checked, cannot be re-derived when
  the parser improves, and cannot be cited. It would recreate the problem Phase 5 exists to solve, one
  layer up.
- **Structure before inference.** Where the document states something structurally — a heading that
  says "Learning objectives", a table of due dates — that is read, not guessed at. A model is for the
  cases where deterministic structure genuinely does not exist.

Derived artifacts (notes, decks, tests, calendar events) inherit provenance *and* course identity from
the source rather than carrying copied labels.

Carried in from old Stage 2, still unfixed and still a correctness bug: `EXAM_ITEM_RULES` writes
clinical vignettes, which fails the law-student / mechanical-engineering test in `CLAUDE.md`. Field
neutrality belongs to this phase because this is where generated material acquires its shape.

**Phase 7 — Capacity.** Large files, including the 123.8 MB immunology deck. Explicitly not earlier:
file-size policy is not the primary quality problem, and raising the limit before Phase 1 exists would
only move the failure.

### 6.5 Seamless, defined behaviourally

Ingestion feels seamless when a student can do all twelve. This is the acceptance list for the
programme as a whole, not for any one phase.

1. Upload a supported document.
2. Immediately see that it was accepted.
3. Navigate away while it processes.
4. See meaningful progress.
5. Return after refresh, or on another client.
6. Know whether processing was complete or partial.
7. Ask about information from any part of the source.
8. Retrieve from tables, diagrams, images and speaker notes.
9. Open the exact supporting page or slide.
10. Generate notes, flashcards, tests and calendar items from the complete source.
11. Retry failures without uploading again.
12. Never receive a confident implication that unread content was processed.

### 6.6 Where the old stages went

| Old stage | Now |
|---|---|
| 0 — the 4.5 MB ceiling | **Done.** By-reference ingest; `MAX_SOURCE_BYTES` is the real limit. |
| 1 — tell the truth about what was read | **Done.** Phase 0 (#442) + Phase 0b (#447). |
| 2 — discipline-neutral item rules | **Phase 6.** Was "carried, unscheduled" while Phase 6 was missing from §6.4; now that the phase is restored it has a home. Still a live correctness bug: `EXAM_ITEM_RULES` writes clinical vignettes, which fails the law-student/mech-eng test. |
| 3 — keep the figures | Phase 2. Figures become part of the canonical unit record rather than a side table. |
| 4 — the debug view | Phase 1. `/dev-preview/extract` is how a job's output is inspected, and how the benchmark reads results. Build it with the worker, not after. |
| 5 — occlusion from a stored figure | Domain layer, after Phase 2. |
| 6 — typed document model · real PPTX tables | Phase 2 (model) · Phase 3 (PPTX). |
| 7 — PDF page rasters · 8 — PDF geometry | Phase 2, merged. They were never separable: geometry without pixels cannot check itself. |
| 9 — generators read the model | Phase 4 (retrieval) + Phase 5 (provenance). Includes re-pricing `workload-cost.ts`, which assumes exactly 9,000 characters. |
| Deferred — slide rendering / SmartArt-as-drawn | Phase 3, still needs an owner decision (LibreOffice in a container). |

### 6.7 Progress ledger

**Five different things are routinely confused, so this table separates them.** Designed ≠ coded ≠
merged ≠ deployed ≠ proven on real documents. A phase is **DONE** only when its acceptance criteria
are *proven*, not when its code merges and not when its tests pass.

Statuses are exactly four: **DONE · IN PROGRESS · BLOCKED · NOT STARTED**.

| Phase | Status | Live in production? | Benchmark evidence | Blocking gap |
|---|---|---|---|---|
| 0 — Truthfulness | DONE | **Yes** — `95ecd9e3` (#442), carried live by `cc5093fe`. Proven by grepping the deployed bundle for `reader-coverage-note` and `Incomplete source`, never from a deploy badge. | SOLO not run. The *complete* case is live-accepted on a real 12-page syllabus. **The partial case is unverified**: no real partial fixture under 50 MiB exists. | Nothing blocks the phase; the partial-disclosure claim stays open until a genuine partial is measured — **do not manufacture one**. |
| 0b — Durable parse | DONE | **Yes** — `ab3e7178` (#447) schema applied as `20260806173152`; runtime carried by `cc5093fe`. | SOLO not run. Live acceptance: same file POSTed twice → **1** row, `attempts=2`, `state=parsed`, `complete=true`, coverage `complete` 12/12 native; RLS cross-user read returns 0. | None. |
| Immediate — chat handoff truncation | IN PROGRESS | **No.** The defect is live; the fix is not. | Reproduced on the owner's real 9.6 MB / 57-slide deck: cut at slide 55, model reported slide 46. | PR #443 conflicts with `main` and needs a rebase. |
| 1 — Document worker | IN PROGRESS | No | Runtime chosen by measurement (`docs/document-worker-spike.md`): Supabase Edge disqualified at 959 MB Deno / 808 MB Node against a 256 MB cap. Lease heartbeat 0/49 inline vs 50/50 in a `worker_thread`. | PR #454 is foundation only — worker endpoint, `worker_thread` execution, kick, cron recovery, status API and cutover are unbuilt. |
| 2 — PDF native + visual | NOT STARTED | No | Baseline measured: `pdfCoverage` accepts no figure input at all, so a diagram lost from a text-rich page is invisible to the honesty layer as well as the parser. | Depends on Phase 1. |
| 3 — Office fidelity | NOT STARTED | No | Baseline measured: DOCX is a regex tag strip; PPTX is genuinely strong (notes, SmartArt, charts, tables, TIFF/EMF, glyph filtering). | Depends on Phase 2's canonical model. Slide rendering needs an owner decision. |
| 4 — Source retrieval | NOT STARTED | No | Baseline: `parsed_documents` = 1 row; `library_chunks where origin_type='source'` = 0. Only notes are indexed. | Depends on Phases 2–3. |
| 5 — Verified citations | NOT STARTED | No | None. Some stored locations are model-supplied. | Depends on Phase 4. |
| 6 — Semantic extractors | NOT STARTED | No | None. | Was missing from this document entirely until 2026-08-06. Depends on Phase 5's locators. |
| 7 — Capacity | NOT STARTED | No | Measured on the real 123.8 MB deck: old fetch path peaked at 676 MiB RSS (5.73×); after #434/#435, 391 MiB (3.31×). Parse side still holds the whole archive (+121 MiB, 99.7% of it media). | Depends on Phase 1. Bounded entry-at-a-time Office reader is designed (`docs/source-ingestion-jobs.md`) and unbuilt. |

**Benchmark status, both halves: not run.** `docs/document-benchmark.md` records no value for any
metric. Therefore no parity claim of any kind is currently supported, in either direction.

**Two CI signals are currently unavailable and must not be read as failures**: GitHub Actions returns
red with **zero steps executed** (a quota lockout, not a test result), and Vercel's `nemesis-web`
check fails to `?upgradeToPro=build-rate-limit` (the daily build cap). Local test runs are the gate
until both clear, and production verification of any phase is blocked in the meantime.

---

## 7. The upload ceiling, and why 50 MB is the wrong thing to argue about

Owner's question: should 50 MB be the long-term user-facing limit, given that real decks and
especially recordings exceed it — and will raising it force another redesign?

**The transport is already future-proof. The processing is not.** Those are different problems and
only one of them has a ceiling worth arguing about.

| Layer | Today | What raising the limit costs |
|---|---|---|
| Browser → storage | one `.upload()` call | For files past a few hundred MB, switch to **resumable (TUS)** uploads. Client change, same architecture — and it also buys resume-after-drop, which matters more on a phone than the limit does. |
| Bucket ceiling | 50 MB policy | One line of SQL. |
| `MAX_SOURCE_BYTES` | 50 MB constant | One constant. **Nothing in the ingestion path reads it to decide *how* a file travels** — that is what makes it movable. |
| **Server reads + parses it** | **inline, in a 300 s function** | **This is the wall.** A 500 MB PDF will exhaust either the time or the memory of a serverless function, and no constant fixes that. |

So the honest answer is: **the number can move today; the *request* cannot.** As long as ingestion is
something that happens *during an HTTP request*, the ceiling is set by whatever fits in 300 seconds —
and that is a moving target we do not control.

**The fix is the one already approved: make ingestion a job, not a request.** That single change
retires the ceiling permanently, and it is the same change the external rendering worker needs, and
the same change that separates parse-and-index from generate. Three of the owner's requirements
collapse into one piece of work.

```
device ──upload──> private bucket ──> library_sources row (status: pending)
                                             │
                                             ▼
                                    ┌────────────────────┐
                                    │  ingestion job     │   not an HTTP request
                                    │  (queue + worker)  │   no 300 s ceiling
                                    └────────────────────┘
                                             │
                        ┌────────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                 structured doc         stored visuals        coverage report
                        │
                        ▼
                  status: ready   ──>  available to Nemesis
                                       (NOTHING is generated yet)
```

**Recommendation:** hold 50 MB while ingestion is synchronous, present it as what it is, and raise it
when the job lands rather than by editing a constant and hoping. Recordings should not go through the
document extractor at all — they already have a transcription path.

### The rendering worker interface

Deliberately minimal, per the owner's instruction not to overbuild. The point is that the
implementation behind it — LibreOffice today, something better later — can be replaced without any
caller changing.

```ts
/** Faithful page/slide rasters for content that embedded-image extraction cannot
 *  represent: SmartArt, grouped shapes, charts, vector diagrams, composited layouts. */
export interface RenderRequest {
  sourceId: string;                    // resolved server-side; never a path
  kind: "pdf" | "pptx" | "docx";
  pages?: number[];                    // omit for all; the caller usually knows which are worth it
  dpi?: number;                        // default chosen by the worker, reported back
}

export interface RenderedPage {
  index: number;                       // 1-based page/slide number
  storagePath: string;                 // the worker writes the raster; callers get a reference
  width: number;                       // natural pixels — image occlusion needs the true size
  height: number;
}

export interface RenderResult {
  pages: RenderedPage[];
  /** What the renderer could NOT do, so a partial render is never presented as complete. */
  missing: Array<{ index: number; reason: string }>;
  renderer: string;                    // e.g. "libreoffice-7.6" — provenance for benchmarking
  dpi: number;
}

export interface DocumentRenderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
```

Three properties worth keeping: it takes a **sourceId**, not bytes, so the worker fetches from
storage like everything else; it returns **storage paths**, not images, so nothing large crosses a
response boundary; and it reports **`missing`** explicitly, because a renderer that silently drops a
slide is indistinguishable from a deck that never had one.

**Benchmark before adopting.** LibreOffice is acceptable *if it proves faithful* on the owner's real
121-deck corpus — SmartArt, grouped shapes and charts specifically. Same rule for Docling: it must
beat what the PPTX part-walking already extracts, measured on that corpus, before it replaces
anything.

## 8. Source indexing

Migration: `supabase/migrations/20260805040000_source_indexing.sql`. Validated against the live
database inside a rolled-back transaction: it applies cleanly and **zero existing note chunks violate
the new constraint.**

### Three layers, three identities

```
  original file      physical identity  = content_hash (sha256 of the bytes)
       │
       ▼
  structured parse   parse identity     = parsed_documents.id  (content_hash, parser_version)
       │                                  ← the CANONICAL representation
       ▼
  retrieval chunks   disposable         = library_chunks       (chunker_version, embedding_version)

  library placement  attachment identity = library_sources.id  (folder, course, title — runs alongside)
```

**The chunk table is not the document.** `parsed_documents.structure` holds the full parse — units
(pages/slides/sheets), headings, paragraphs, lists, tables, figures, captions, cell ranges. Chunks
exist to be thrown away and rebuilt when chunking or embedding improves. Nothing may come to treat a
chunk as the canonical text of anything.

**The same file in two folders** is two `library_sources` rows, one parse, one set of chunks. Each
placement keeps its own folder, course and title; the bytes and the expensive parse are paid for
once. Deduplication is **within a user** on purpose — a global hash table would let one account learn
that another had uploaded a particular file.

### Three versions, three columns

| Column | Bump it when | Then re-run |
|---|---|---|
| `parser_version` | PDF geometry, DOCX walker, slide rendering improves | parse → chunk → embed |
| `chunker_version` | chunk boundaries or sizing change | chunk → embed |
| `embedding_version` | a better embedding model | embed only |

Collapsing these into one "index version" would make targeted reprocessing impossible. A new
`parser_version` deliberately produces a **new** `parsed_documents` row rather than overwriting, which
is what makes *"reprocess everything parsed by version X"* answerable without touching the original.

### Provenance is columns, not markers

`[[page 7]]` and `## Slide 12` are fine during extraction; they are not a citation system. Each chunk
carries `origin_type`, `source_id`/`document_id`, `parsed_document_id`, `unit_kind`, `unit_index`,
`unit_label`, `cell_range`, `heading_path[]`, `chunk_index` and the three versions — **queryable, not
inferred from prose.**

`unit_kind` makes a page, a slide and a spreadsheet sheet the same shape of answer. `'document'` is
the honest value for a file with no meaningful subdivision, which is better than inventing page 1.
`heading_path` is what lets a result reconstruct **document → unit → section → chunk** rather than
being a floating block of text, and it is what adjacent-context expansion will walk.

**A locator is only ever written when it was measured.** If the parser knows the chunk came from PDF
page 7, that is persisted. A model is never asked where something came from and never has its guess
stored as though it were measured — which is exactly what `library_provenance.location` does today.

### Retrieval policy

A `library_chunks_one_origin` CHECK guarantees every row is exactly one of source or note, so ranking
has something trustworthy to rank on.

- **Originals are canonical evidence by default** — not because a query was classified as "factual",
  but because a derived text may never silently stand in for what it was derived from.
- Notes remain valuable for synthesis, organisation, query expansion, concept links, and the
  student's own context, and appear in results freely.
- **Where a claim can be grounded in the original, cite the original.** Where it exists only in a
  note, cite the note. Where Nemesis *inferred* rather than copied it, say so — never present a
  synthesis as something the source stated.

### Indexing is deterministic infrastructure

`store → parse → chunk → embed`. **No model writes anything on this path** — no librarian prose, no
notes, no cards, no tests, no edits to existing notes. A document becomes searchable without a single
generated artifact, which is the precondition for making generation opt-in at all.

### Spreadsheets are documents, not CSV

`.xlsx` is refused outright today — `kindFor`/`sniffKind` know only pdf/docx/pptx/image. Real support
means workbook → sheets → tables → cells: sheet names, coordinates and ranges, header rows, merged
cells, displayed values, and formulas where they carry meaning. The target is answering *"why did
revenue fall in Q3?"* while citing a sheet and range — which the schema already accommodates through
`unit_kind='sheet'`, `unit_label` and `cell_range`.

### Visual elements are generic

The core parser exposes visual elements — charts, diagrams, scanned pages, screenshots, forms,
equations, visually-encoded tables — **without judging their importance.** Extracting text is not the
same as understanding a document. Whether a diagram matters educationally, legally or financially is
a question for the domain layer above; the parser's job is to make sure it still exists to be asked
about.

### Benchmark

**The instrument lives in [`docs/document-benchmark.md`](./document-benchmark.md). That file is the
only benchmark definition; this paragraph states the scope it has to grow into.**

Two corpora, and they are not in tension — one is runnable now, the other is the eventual bar.

- **Near-term, runnable today:** the owner's real academic corpus — syllabi, lecture decks, scanned
  and multi-column and table-heavy material. This is what gates each phase, because it is what we
  actually have and can re-run on every change.
- **Long-term, the real bar:** difficult documents across **academic/scientific, legal,
  finance/business, technical manuals, healthcare, government forms, resumes, scanned documents,
  presentations and spreadsheets**. Successful ingestion is not the bar; parity with top
  general-purpose systems on an *arbitrary* document is. A parser that only passes on lectures has
  proved the domain layer, not the parser — which is what §8's whole premise rules out.

Measured on structural fidelity, table fidelity, visual-content recovery, citation and location
accuracy, retrieval recall, and question-answering accuracy.

## 9. What stays

Nothing here is a rewrite. These were built against the owner's real 121-deck corpus and measured:
the PowerPoint part-walking through each slide's own `.rels`; EMF and TIFF recovery; content-hash
de-duplication; the PDF page slicer; and the occlusion box pipeline, whose contract — *the model returns
fractions, the client measures the real image* — is already right.

The pipeline just has to stop throwing the pictures away.
