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
>
> **Consequences for this document, which was written school-first and is wrong in places:**
> - The visual schema's `educationalRelevance` is a domain judgement leaking into the core. The core
>   field is *importance to understanding this document*; "is this worth a flashcard" belongs upstairs.
> - The benchmark corpus in §6 Stage 4 is all academic. It must span fields **and formats** —
>   contracts, invoices, filings, manuals, resumes, forms — not twelve lecture files.
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

Revised after review. Each stage ships alone and is worth shipping alone.

### Stage 0 — MEASURED 2026-08-05. It is a live bug, and it outranks everything below.

Probed the deployed route directly. No credentials needed: if the request reaches our handler it
returns *our* 401; if the platform rejects it, it never gets there.

```
POST https://app.enternemesis.com/api/notebooks/extract/file
  3.0 MB  -> 401   (our handler; our auth rejection)
  4.0 MB  -> 401   (our handler)
  4.4 MB  -> 401   (our handler)
  4.6 MB  -> 413   x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE
  6.0 MB  -> 413   x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE
```

**The real upload ceiling is ~4.5 MB, not 25 MB.** The 413 is Vercel's, at the edge, as `text/plain` —
`server: Vercel`, `content-length: 93`. Our route's own 413 (`route.ts:109`) never fires.

What the student sees: `chat-attachments.ts:243` does `response.json().catch(() => null)`. Vercel's
plain-text body is not JSON, so `body` is null and the thrown message is the generic fallback —
**"Couldn't read lecture.pdf."** No reason, no size, no advice.

Meanwhile `notebook-sources-dialog.tsx:225` tells them *"up to 25 MB"*.

And the browser-side media stripper only engages above `OFFICE_SLIM_THRESHOLD_BYTES = 24 MB`
(`office-slim.ts:23`) — calibrated to the ceiling that doesn't exist. A 10 MB PowerPoint is **not**
slimmed, because 10 < 24, and then dies at 4.5 MB. The one mechanism that could have saved it is
gated on the wrong number.

A typical lecture PDF or deck is 5–30 MB. So for a large share of real academic files, ingestion does
not degrade — **it fails outright, with an error that explains nothing.** This is very likely the
single largest contributor to "document ingestion is our biggest weakness", and no amount of better
parsing downstream would have touched it.

**Fix (Stage 1 below).** The bytes should not transit the function body at all. The chat lane
*already* uploads originals straight to the `library-sources` bucket
(`chat-attachments.ts:164-190`) — that path has no 4.5 MB limit. Upload first, then hand the route a
storage key instead of a file, and have it fetch the bytes server-side. Every lane converges on the
same change, the 25 MB ceiling becomes true, and the slim threshold can drop to something that helps.

### Stage 1 — tell the truth about what was read (S, no migration)

The route already computes a full `coverage` tally and the client throws it away. Add the field to the
type, put one plain sentence in front of the student and one in the model's prompt:
*"37 of 40 slides read; 12 pictures kept, 3 in a format we can't read."*

No bucket, no migration, no schema. Fixes a live honesty bug and takes a day.

### Stage 2 — make the item rules discipline-neutral (S)

`EXAM_ITEM_RULES` currently instructs the model to build a clinical vignette — a patient, a lab result,
"the drug this one gets confused with". One leaf file, both test lanes. Also fold in `FIGURE_PROMPT`,
which asks the model to judge whether an image "carries teaching content" and is biased toward labelled
schematics — an art-history plate or a photographed apparatus loses.

Widen `TestQuestion` with a type discriminator so engineering can ask for a number.

### Stage 3 — keep the figures (M, migration)

Bucket `document-visuals` + table `document_visuals`. Written by the service role — the route already
resolves a `userId` at line 87 and discards it. Rows carry location, natural size, content hash, role and
Gemini's description. **The id comes back in the response** so a screen can find it.

Corpus must include a non-English lecture and a right-to-left document *before* it is used as a baseline.

### Stage 4 — the debug view (M)

`/dev-preview/extract`: drop a file, see four panes — units, visuals, coverage, and the exact bytes that
go on the wire. This is what makes every later claim checkable instead of arguable.

### Stage 5 — occlusion and flashcards from a stored figure (M)

A "from a document" picker in the occlusion editor. **Copies the bytes into `study-images`** at card
creation — the only shape that works on the phone without a native release.

### Stage 6 — the typed document model + real PPTX tables (L, split in two)

The model and serializer land first with a byte-identical golden test proving nothing changed. Fidelity
gains (real table grids, slide order from `presentation.xml` rather than filename) land second, where the
diff is readable.

### Stage 7 — PDF page rasters (M) · Stage 8 — PDF geometry (L)

PDFium-WASM for pixels; `unpdf` ^1.8 for per-item transforms, which is what finally gives headings,
two-column reading order and boxes. Both need a preview deploy to prove — the WASM load path cannot be
verified locally.

### Stage 9 — the generators read the model (L, split)

Chunk study material at unit boundaries with the omission disclosed, and carry provenance onto every
generated card and question. Re-price `workload-cost.ts:657`, which assumes exactly 9,000 characters.

### Deferred, needs a decision

Slide rendering / SmartArt-as-drawn / vector figures — needs LibreOffice in a container.

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

## 8. What stays

Nothing here is a rewrite. These were built against the owner's real 121-deck corpus and measured:
the PowerPoint part-walking through each slide's own `.rels`; EMF and TIFF recovery; content-hash
de-duplication; the PDF page slicer; and the occlusion box pipeline, whose contract — *the model returns
fractions, the client measures the real image* — is already right.

The pipeline just has to stop throwing the pictures away.
