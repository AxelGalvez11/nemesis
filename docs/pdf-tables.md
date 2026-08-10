# How Nemesis reads a table out of a PDF

The decision and the measurements behind it. `parsing-architecture.md` is the
wider format-by-format picture; this is the PDF-table lane specifically, which
changed direction on 2026-08-10.

**Status: implemented, wired behind `detectTables` + `DOCLING_LAYOUT_ONNX`, OFF.
Model distribution is unsolved — see §6.**

---

## 1. What changed, and why the old decision was still correct

The plan of record was a Python `docling-serve` container. That was the right
call on its evidence: Docling's PDF pipeline was measured at **2.4–6.2 GB peak
RSS**, against a worker function configured for 3,009 MB, and no arrangement of
that arithmetic fits.

The measurement was right and the conclusion was too narrow. **That memory
figure is PyTorch's runtime, not the model.** Docling publishes its layout model
as ONNX — `docling-project/docling-layout-heron-onnx`, Apache-2.0, **171 MB, one
file** — and `onnxruntime-node` runs it directly in the worker we already have.

Measured on a real 24-page course document of 8-column drug charts:

| | our lane before | Python docling | **ONNX in Node** |
|---|---|---|---|
| tables | 0 | 28 | **26 + 2 correctly refused** |
| time | 1.0 s | 97 s | 15.1 s |
| peak RSS | — | 2.4–6.2 GB | **604 MB** |
| Python | no | **yes** | **no** |

## 2. The three jobs, and why they are separate

Each stage does only what it can do without guessing.

1. **`layout-onnx.ts` — WHERE.** RT-DETRv2, 17 labels. Says "a table is here".
   It does not read anything.
2. **`table-grid.ts` — THE CELLS.** Boundaries come from the ruling lines the
   PDF itself draws, recovered from its path operations.
3. **`structure.ts` — THE CONTENTS.** The same exact `TextItem`s pdf.js already
   extracted, dropped into cells by their centre point.

> 🔴 **No model ever re-reads a character.** This is the property the whole
> arrangement exists to preserve. A vision pass over the pixels could turn
> `3.125 mg` into `31.25 mg`, and nothing downstream could tell — a confidently
> wrong number is indistinguishable from a right one. Here the characters come
> from the file and only the *arrangement* comes from a model, so that class of
> error cannot occur.

## 3. What it refuses, and why refusing is the feature

A region with no recoverable grid produces **no table** and is counted in
`tableRegionsUnread`. On the drug chart that is 2 of 28: the Top-35 list (a real
list, better served as list items) and a scanned page (no vector geometry
exists). Neither is guessed at.

`tableRegionsUnread` leaves the reader as a **coverage fact, not a statistic**.
A page with prose around an unreadable table would otherwise report `complete`.

## 4. The traps, all of which look like success

Every one of these produced plausible output while being wrong. They are the
reason this file exists.

| Trap | What it looks like | Guard |
|---|---|---|
| `orig_target_sizes` is **(width, height)**, not the (height, width) HuggingFace's reference RT-DETR post-processing documents | Correct labels, high scores, believable rectangles — in a transposed space | `readRegions` throws when a box exceeds the page |
| The `images` input is **uint8**, not float32 (the quantized graph folds /255 and mean/std in) | — | ONNX rejects float32 outright; a loud failure, so safe |
| A ruled line is drawn as **many short per-cell segments** (~24 on a real page), so testing segments individually rejects every interior line | **Columns perfect, all rows gone.** Measured: 7 tables/44 cells instead of 26/561 | segments are UNIONED per line |
| Summing segment lengths instead of unioning | One 727 pt line measures 7,270 pt, so any line "spans the table" | `unionLength` |
| Building the rect from **raster pixels** instead of page points | A plausible rectangle reporting `w=0.32` for a full-width table | asserted in `pdf-tables-check.mts` |
| A failed model load caching its rejected promise | One transient read error becomes "every page of every document fails" until redeploy | `sessionPromise` nulled on rejection |

## 5. Double emission — the check that must stay

The text a table consumes is **removed from the paragraph flow**. If it were
not, the same cells would exist twice: once as a grid, once as the flattened
prose they replaced. Because a table is **atomic to the chunker**, that
duplicate lands in its own chunk that retrieval can still find — the document
gets bigger *and* worse, and nothing in the output says so.

`scripts/pdf-tables-check.mts` guards this with the character ratio:

```
                    lane OFF     lane ON
  tables                   0          26
  paragraphs             294          58
  characters          67,513      69,579     ratio 1.03  ✅
```

A ratio materially above ~1.35 means double emission. The paragraph collapse
(294 → 58) is the same fact seen from the other side.

## 6. Not done, and not claimed

* **Model distribution is unsolved.** 171 MB will not go in a Vercel bundle. It
  needs blob storage with a cold-start fetch, or a deployment layer. This is the
  real blocker to switching the lane on, and it is a deploy decision rather than
  a coding one.
* **Only `table` regions are consumed.** The model also reports `picture`,
  `list_item`, `formula`, `code` and more, and each already has an owner in
  `structure.ts`. Taking them without removing the existing producer would emit
  the same content twice under two block kinds. `list_item` (42 on one page of
  the drug chart) is the obvious next one and is deliberately a separate change.
* **Unruled tables are not handled.** Columns implied by whitespace yield no
  grid and are refused. Whether that matters is a corpus question —
  `scripts/pdf-table-coverage.mts` answers it, and separates "no rulings at
  all" (needs TableFormer or vision) from "rules present, grid rejected" (a
  threshold to tune), because conflating those two could buy a 213 MB model to
  fix a constant.
* **Table blocks are emitted after a page's prose, not interleaved.** On
  reference charts that are essentially all table this costs nothing, and each
  table's rect still carries its true position. Ordering by vertical position is
  the correct fix and was kept out of the change that made tables exist at all.
* **Nothing has run in production.** Every number here is local.
