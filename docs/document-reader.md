# The Nemesis document reader

> Written 2026-08-05, before any UI changed, because the owner asked for the current
> preview to be identified and for it to be said plainly which parts are being replaced.

## 1. What the preview is today, in plain English

When you click a file in Nemesis today, you are not looking at Nemesis. You are looking at
**Chrome's own document viewer, wearing a Nemesis-shaped hole in the page.**

There are exactly **two** places that show a stored file, and both do the same thing: they ask
Supabase for a temporary web address for the file, and then hand that address to the browser
inside an `<iframe>` — a small window on the page that shows another website. What appears
inside that window is drawn entirely by Chrome. Its grey toolbar, its zoom buttons, its page
counter, its "download" and "print" icons: none of it is ours, none of it matches our design,
and none of it can be changed by us.

| # | Where | File | What it does now |
|---|---|---|---|
| 1 | Library → click a source file | `apps/web/components/workspace/library-v2/docs-source.tsx` | PDF → browser iframe. Image → plain `<img>`. Audio → plain `<audio>`. Word/PowerPoint → a link that says "Open the original", which downloads it out of Nemesis entirely. |
| 2 | Chat → click an attachment | `apps/web/components/workspace/sessions/attachment-preview-dialog.tsx` | Same again, in a popup: PDF → browser iframe, image → `<img>`, everything else → a Download button. |

The second one is easy to forget because it is not a page — it is a dialog — but it is the one a
student hits most, because most files arrive through chat.

**What is actually wrong with it, beyond looks:**

- **It is a dead end.** The file is displayed and nothing else. You cannot select a sentence and
  ask about it, turn a paragraph into flashcards, or see which of your notes came from this page.
  The document sits in a box with no connection to the rest of Nemesis.
- **Word and PowerPoint files cannot be seen at all.** They are offered as downloads. A student's
  lecture deck — the single most common academic file there is — opens in PowerPoint, not in
  Nemesis.
- **Citations cannot land anywhere.** When Nemesis says something came from page 7, there is
  nothing to click, because an iframe cannot be told to go to page 7 and highlight a passage.
- **The browser's viewer is different on every machine.** Chrome, Safari, Firefox and Edge each
  draw their own. So the product looks different depending on what the student happens to use.

## 2. What is being replaced, and what is deliberately kept

**Replaced — the display layer only:**

- the `<iframe>` in `docs-source.tsx` (PDF)
- the `<iframe>` in `attachment-preview-dialog.tsx` (PDF)
- the bare `<img>` in both files (replaced by a real image reader: zoom, rotate, region select)
- the "this file type doesn't preview" dead end for Word and PowerPoint

**Kept exactly as-is — nothing in the pipeline is touched:**

- uploading (`browser → private bucket → library_sources row`, PR #409)
- storage, buckets, and the temporary-address mechanism (`librarySourceUrl`)
- parsing and extraction (`/api/notebooks/extract/file` and everything under it)
- **source IDs.** `library_sources.id` remains the identity of a filed document, and the existing
  `/library?source=<id>` link keeps working — it now redirects into the reader rather than 404ing.

The reader is a **new way of looking at bytes we already have.** It does not change how they got
there.

## 3. Three representations, and which one you are looking at

The owner's requirement is that a document is stored three ways and that these never get
collapsed into one flattened blob:

| Representation | What it is | What it powers | Status today |
|---|---|---|---|
| **1. Original file** | the exact bytes that were uploaded | Source mode, download, citation of record | ✅ live — `library_sources` + the private buckets |
| **2. Visual** | what the document *looks* like, page by page | the reader's canvas | ✅ for PDF and images (drawn on demand by PDF.js, so nothing extra is stored) · ⛔ for PowerPoint (see §5) |
| **3. Structured content** | headings, paragraphs, tables, figures, with measured page numbers | search, retrieval, the AI | 🟡 the table exists (`parsed_documents`, migration `20260805040000`) and **is applied to production, with zero rows and no writer in the codebase** |

That last line is the honest state and it decides how Reading mode works in this change.
Since nothing populates `parsed_documents` yet, **Reading mode does not invent a reconstruction
and does not pretend a parse exists.** For PDFs it derives its structure in the browser from the
document's own text layer — real, measured geometry (font sizes, positions, reading direction),
never a model's guess. When the ingestion job lands and starts writing `parsed_documents`, the
reader reads that instead; the mode does not change, only where its input comes from.

**Source mode is always authoritative. Reading mode is always derived, and says so.**

## 4. The reader itself

One shell, every file type:

```
┌──────────────────────────────────────────────────────────────────────┐
│ filename · course     [Source|Reading]   search   3/40   − 100% +  ⋯ │
├────────────┬────────────────────────────────────────┬────────────────┤
│ Outline    │                                        │ Ask about this │
│ Pages      │            the document                │ Explain        │
│ (thumbs)   │      (white canvas, quiet room)        │ Citations      │
│            │                                        │ Linked notes   │
│            │                                        │ Course metadata│
└────────────┴────────────────────────────────────────┴────────────────┘
```

- **PDF** — PDF.js, our controls only. Selectable text, page thumbnails, in-page search, zoom,
  fit-width, `?page=7` anchors, and highlighting of a cited passage. The browser's own PDF toolbar
  never appears, because the browser's PDF viewer is never used.
- **Images and scans** — zoom, rotate, drag-to-select a region and ask about just that region.
- **DOCX** — converted to clean semantic HTML (headings, lists, tables, images) and shown like a
  documentation page, not like Word.
- **PPTX** — slides, outline and speaker notes, from the deck's real contents.

## 5. The one thing that is blocked, stated rather than fudged

The owner asked for **rendered slide images** for PowerPoint. That is not possible inside our
current hosting: turning a slide into a picture needs a layout engine (LibreOffice), which cannot
run in a Vercel function. `docs/document-intelligence.md` §4 records this as a hard constraint and
§6 defers it pending a decision about a separate rendering worker.

So this change delivers, for PPTX: the original file, the extracted per-slide text, the speaker
notes, the deck's embedded pictures, and a faithful-as-possible **HTML reconstruction** of each
slide. The reconstruction is labelled as a reconstruction in the interface. It is **not** presented
as a render of the slide, because it isn't one — a slide whose diagram is drawn from shapes will
show its text and not its drawing. Real rasters arrive when the rendering worker does.
