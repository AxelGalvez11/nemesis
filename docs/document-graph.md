# Ingestion architecture: audit, then phases

**This EXTENDS `document-intelligence.md` §6, it does not supersede it.** §6 remains the
governing phase list and progress ledger. §6.1 already states this architecture's core
target in four parts (complete native extraction, adaptive vision, query-time
reinspection, caching keyed on five things) and §6.3 already says native and visual
results are *merged, never alternatives*. Nothing here contradicts that. What this file
adds is the **representation** those phases were missing a name for — the SourceGraph and
the semantic layer above it — plus an audit of what is really in the tree today.

Written 2026-08-10, against `e933e010`.

---

## Part 1 — Audit

### The one-sentence finding

**The DocumentGraph already exists, is well built, and is thrown away at the boundary
between the server and every interactive consumer.** `packages/shared/src/document-model.ts`
is a real document AST — units → blocks, typed kinds, geometry, heading paths, tables kept
as grids, figures whose description is deliberately separate from their caption. It is
computed on upload, it is persisted, and it is **not in the extraction route's JSON
response**, so the client type never had a field for it and no interactive consumer has
ever seen it.

This is the fourth occurrence of a pattern already recorded three times in this repo
(function boundary, persistence boundary, route boundary). The fourth is the **client/wire
boundary**, and it is the most expensive of the four because the consumer on the far side
is Canvas.

### 1. What can remain unchanged

Most of it. This is not a rewrite.

| Component | Verdict |
|---|---|
| `packages/shared/src/document-model.ts` | **Keep as the SourceGraph.** Add optional fields only. |
| `document-chunks.ts` | **Keep.** Already chunks on structural seams, never splits a table, heading opens a chunk. |
| `extraction-coverage.ts` | **Keep, and it is the model for how to add anything new.** Disjoint counts that must sum, state derived not asserted, a reader that drops unknown fields loudly. |
| `docx-structure.ts`, `pptx-shapes.ts`, `office.ts` | **Keep untouched.** These beat Docling on their formats, measured. |
| `structure.ts`, `geometry.ts`, `table-grid.ts`, `layout-onnx.ts`, `rasterize.ts` | **Keep.** The rasterizer and layout detector are the foundation the router needs; they already exist. |
| `parse-router.ts` | **Keep, rename mentally.** It is a *format* router. It is not, and should not become, the page/region router. |
| `source-chunks.ts` | **Keep.** Provenance is already columns, not text prefixes. |
| `parse-worker.ts`, `parse-enqueue.ts`, job claim/lease/backoff SQL | **Keep.** Durable job orchestration with attempts, leases and idempotency already exists and already survives a worker dying mid-document. |

### 2. Where a DocumentGraph/AST already effectively exists

`DocumentModel` = `{ format, title, units[], blocks[] }`.

It **already has**, against the target element shape:

| Target field | Today |
|---|---|
| `element_id` | `DocBlock.id`, positional, assigned in one place |
| `page` | `DocBlock.unit` + `DocUnit.kind` — and `describeLocator` **refuses to print "page" for a `body` unit**, so a .docx can never acquire a fabricated page number |
| `type` | `DocBlockKind` — heading, paragraph, listItem, table, figure, caption, equation, note |
| `text` | `DocBlock.text` |
| `bbox` | `DocBlock.rect`, unit-relative 0..1, top-left origin, **never invented** |
| `reading_order` | array order |
| tables retain rows/cells | `DocTable.rows[][]` + `headerRows`, where **0 is the honest default** |
| lists retain hierarchy | `marker` + `depth` |
| figures linked to captions | `DocFigure` beside `DocBlock.text`, and `blockToText` keeps them distinguishable |

It **does not have**: `parent_id`/`children` (hierarchy is implicit in `headingPath`),
`confidence`, `provenance`/`source_method`, `image_asset_id`, typed `relationships`,
`document_id`. Element kinds missing from the target list: chart, diagram, footnote, code,
callout/sidebar, annotation, and table row/cell as addressable things.

**The single most important existing property**, and the reason this model is worth
extending rather than replacing: `blockToText` renders a figure as
`[Figure: caption]\n<description>` and the comment says why — *"A figure's text is not its
description. The caption is what the document says; the description is what a model said
about it. Merging them makes an inference indistinguishable from the source."* That is
exactly the transcription/interpretation separation the directive asks for. It exists
today, for figures only. The work is generalising it, not inventing it.

### 3. Where information is currently lost

Ordered by cost.

**(a) The whole model, at the extraction route's response.** `extract/file/route.ts`
returns `{ kind, title, text, bytes, readBy?, skippedFigures?, coverage, parsedDocumentId? }`.
The model is computed and handed to `persistParse` — it is in the *persistence* payload,
never the response body. `ExtractedFile` therefore has no `model` field, and chat, Canvas,
Library import and syllabus import all receive a flat string.

**(b) Canvas re-derives structure from that string with a regular expression.**
`buildExcerpts` splits on blank lines and runs `/^#{1,6}\s+(.+?)\s*$/` to recover
headings — headings the model already held as typed blocks with a level and a full
ancestor path. Consequences that are live in production today:

- A table reaches Canvas as a paragraph of pipe characters, because `blockToText`
  rendered the grid to markdown and `buildExcerpts` has no idea that block was atomic.
  The chunker protects tables; this path does not.
- A figure reaches Canvas as the literal string `[Figure — not examined]` with no way to
  tell it from prose.
- Every excerpt's `label` is a best-effort scrape, where `headingPath` was exact.

**(c) Vision-read text becomes indistinguishable from native text.** `withVisionText`
folds transcribed pages back in as `kind: "note"` blocks. That is the right *shape* — one
representation, merged, not two — but `note` is an overloaded kind, not a provenance
field. Once a block is a `note`, nothing downstream can answer "did a model read this, or
did the file say it?" This is the highest-value missing field and it has a real producer
today.

**(d) Layout classifications, at the page loop.** `readPdfStructure` receives the full
17-label region set from `layout-onnx.ts` and consumes **only `table` regions**. The rest —
`picture`, `formula`, `list_item`, `section_header`, `caption`, `footnote`, `code` — are
computed and dropped. The comment says why, and it is correct reasoning: each already has
an owner, and taking them without removing the existing producer double-emits. But the
*classification itself* is thrown away, and that classification is precisely what a
page/region router needs.

**(e) Everything about an image, except its transcription.** See (4).

### 4. Current image handling

A photo is one vision call and a string.

```
kind === "image"  →  readWithVision(bytes, PHOTO_PROMPT)  →  { text, readBy, coverage }
```

`model` is never set. There is no unit, no block, no rect, no figure record. `PHOTO_PROMPT`
asks for markdown-preserved transcription plus a bracketed description for diagrams, so the
*information* is often there — it is just in an unstructured string with no way to tell a
transcription from a description.

There is **no image classification, no orientation detection, no deskew, no page-boundary
detection, no perspective correction, and no quality assessment.** A photographed page and
a photograph of a whiteboard and a screenshot are the same code path.

This is the largest greenfield in the directive, and notably it is *not* a regression to
fix — it is a capability that was never built.

### 5. Current scanned-PDF behaviour

There is no OCR. What exists is a vision fallback with a measured routing rule.

- `THIN_PAGE_CHARS = 120` — below this a page "has not really been read". Set from the real
  corpus, and deliberately a floor on characters rather than a test for zero, because a page
  with a 49-character heading over a full-page screenshot is as lost as an empty one.
- `MAX_VISION_PAGES = 40` per document; excess is **counted and disclosed**, never dropped
  silently.
- Whole-document fallback when the text layer is entirely empty.
- `native-probe.ts` answers "did page N have words of its own" using the same predicate, so
  the two lanes cannot disagree about what "native" means.

The gap the directive names is real: this routes on **text sparsity alone**. A page with
plenty of words and a load-bearing diagram is never examined. Measured over 120 real course
PDFs: 1,089 pieces of real content nobody has looked at, on pages coverage would otherwise
call complete. `not-examined` exists as a figure reason specifically so those documents read
`partial` instead of `complete`.

### 6. How table/model inference is currently deployed

**In-process, in the Node worker. There is no Python and no container.**

`onnxruntime-node` loads a 171 MB RT-DETRv2 layout model; `@napi-rs/canvas` rasterizes the
page; `table-grid.ts` recovers cells from the PDF's own ruling lines. Measured: 541 MB RSS,
~0.7 s/page, 79.2% of 322 real table regions recovered. Merged as #462, **inert** — the lane
is off until `DOCLING_LAYOUT_ONNX` points at weights.

> **This is where the directive's infrastructure constraint needs splitting, and the
> distinction matters or we will build a service we do not need.** "Do not force every model
> into a Vercel function" is correct for **Docling**, which needs 2.4–6.2 GB against a
> 3,009 MB worker — that is why `docling-client.ts` talks to a sidecar over HTTP. It is
> **wrong for the ONNX lane**, which is proven to run in-process at a third of the budget.
> The only open question there is *model distribution* — 171 MB will not go in a Vercel
> bundle, so it needs blob storage plus a cold-start fetch, or a deploy layer. That is a
> deployment decision, not a service build.

So: two model lanes, deliberately, with different hosting answers. Heavy OCR/VLM work
belongs in a worker/sidecar. Layout detection does not.

### 7. Where the page/region routing layer should live

**Inside `readPdfStructure`'s per-page loop, which already receives exactly the input a
router needs and currently discards most of it.**

That loop already: rasterizes the page, runs the layout model, gets 17 typed regions with
boxes and scores, and holds the page's native `TextItem`s with coordinates. Everything
needed to classify a region — is there native text under this box, is this a table, is this
a picture, how confident is the detector — is in scope at that point. The router is not new
infrastructure; it is *surfacing a classification the code already computes and drops*.

Two consequences worth stating:

- **`parse-router.ts` is the wrong altitude and must not grow into this.** It routes whole
  documents by format. A per-region router inside it would have no access to page pixels.
- **Images have no structural pass at all**, so the photo classifier is genuinely new code.
  It should emit the *same region shape* so both formats feed one downstream — otherwise
  there are two vocabularies and the reconciliation logic gets written twice.

### 8. The smallest migration that enables this

**Put the model on the wire and let Canvas consume it.** That is the whole of phase 1.

It is the smallest change that is also load-bearing: it proves the SourceGraph → consumer
path that every later phase depends on, it fixes a live production defect (tables reaching
Canvas as pipe-soup), and it touches no parser, needs no migration, hosts no model and adds
no lane.

What makes it safe:

- `buildExcerpts(sourceId, text)` **stays**, as the fallback for images, for the PDF
  fallback path where no model exists, and for responses from older deployments. A missing
  model means "unknown", never "no structure" — the same rule `coverage` already follows.
- Canvases already in storage lack the new fields. Commit `83ae2d48` solved exactly this
  shape for free-response answers; reuse that pattern rather than inventing a second one.
- Response size roughly doubles when a model is present, because blocks carry the same text
  as `text`. At `TEXT_CAP = 200,000` that is a ~400 KB worst case on a *response* (the
  4.5 MB Vercel limit is on request bodies). If it ever bites, `parsedDocumentId` is already
  in the response and the persisted envelope is already readable — `readStructureEnvelope`
  has a working consumer in the cite route — so fetch-by-reference is a drop-in escape
  hatch, not a redesign.

---

## Part 2 — Phases

Each phase is independently shippable and independently valuable. No phase requires the
next one to have been designed.

### Phase 1 — the graph reaches its consumer *(smallest production-safe foundation)*

`model?: DocumentModel` on `ExtractedFile` and in the extract route's response.
`buildExcerptsFromModel(sourceId, model)` beside the string version. Canvas prefers the
model path. A table becomes one excerpt, not pipe-soup. A figure is identifiable as a
figure.

No migration, no new lane, no model hosting.

### Phase 2 — provenance as a field

`DocBlock.source?: "native" | "ocr" | "vision" | "deterministic" | "inferred"`.
`withVisionText` stops overloading `kind: "note"` and sets `source: "vision"` on a block
whose kind is what it actually is. Coverage already distinguishes native from vision at the
*unit* level; this is the same fact at block level, where citations live.

**Deliberately no `confidence` yet.** Nothing produces a real score today, and a field that
is always absent or always 1.0 trains every consumer to ignore it. It lands with OCR, the
first producer with an actual number.

### Phase 3 — the region router surfaces its classification

`readPdfStructure` stops discarding non-table regions. Each becomes a typed region on the
model with its box, its detector score, and whether native text sits under it. Still no new
extraction — this phase only stops throwing away a decision.

The routing rule stops being "is this page thin" and becomes "does this *region* have
trustworthy native text". That is the change that lets a text-rich page with one
load-bearing diagram get looked at.

### Phase 4 — OCR, as an escalation the router requests

A real OCR lane for regions the router marks as raster text, deployed as a worker (not in a
request). This is where `confidence` arrives, and where reconciliation arrives with it: when
two methods disagree the disagreement is **preserved and flagged**, never silently resolved.

### Phase 5 — photo ingestion as a first-class source

Image classification (document_photo / handwriting / whiteboard / diagram / chart /
screenshot / photograph), then preprocessing where it helps (orientation, boundary, crop,
deskew, dewarp, quality), then the corrected image through the same region pipeline as a
scanned page. An arbitrary photo is **not** reduced to OCR text — some images mean something
only visually.

### Phase 6 — the semantic learning layer

A representation derived *from* the SourceGraph, never replacing it: concepts, objectives,
relationships, prerequisites, comparisons, rules, exceptions, mechanisms, retrieval-worthy
facts, misconceptions, visual relationships, assessment operations. Every node keeps a
pointer to the source elements it came from.

This is what Canvas consumes, together with the learner model — not raw chunks and not
pages. The design question it answers is *"what learning operations could Nemesis perform on
this material?"*, and it is the reason the SourceGraph must stay faithful: a diagram becomes
a label-retrieval interaction, a table becomes concept-by-dimension retrieval, an equation
becomes explain/predict/rearrange/calculate — and each keeps the original evidence beneath
it.

### Phase 7 — evidence resolution end to end

`file → page/slide/sheet → element → bbox/cell/figure`, resolvable for any answer. The
pieces exist (rects, block ids, chunk `blockIds`, the cite route); this phase makes it
complete and makes cell-level and figure-crop citations real.

---

## What this deliberately does not do

- **Does not replace `DocumentModel` with a new AST.** Extending it keeps every producer,
  every test and every measured number valid.
- **Does not make Markdown canonical.** It already is not — `documentToText` derives the
  string from the model, never the reverse.
- **Does not build a model service for the ONNX lane.** See (6).
- **Does not add fields with no producer.** Every field lands with the code that fills it.
- **Does not add subject-matter rules.** The pipeline classifies by structure — a grading
  table, a dosing table and a payment schedule are one problem. A law student and a
  mechanical engineering student get the same parser, and that is the design test.
