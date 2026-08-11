# The Nemesis golden acceptance source

`acceptance-course.html` → `build-acceptance-pdf.sh` → a real PDF, uploaded through the real
product, parsed by the real parser, stored in the real table.

🔴 **Synthetic content, real pipeline.** Every word is invented so the correct semantic result is
not a matter of opinion. Nothing else is synthetic. A hand-authored *fixture* proves nothing about
the boundaries that keep failing in this codebase; a hand-authored *document* travelling the real
path exercises every one of them.

## Expected result — the whole point of the artifact

| | expected | proves |
|---|---|---|
| schedule candidates | **2** | Exam 1 → 2026-09-12 09:00 local, Assignment 1 → 2026-09-18 23:59 local |
| associations | **3** | one per Key Terms table row, read from the table's structure |
| causal statements | **1** | light intensity → rate, with a limiting condition |
| invented events | **0** | "may be rescheduled" and "usually held in spring" must NOT become entries |

Structural expectations: heading hierarchy survives; the table survives as a grid (`tables: true`);
the figure survives as a figure even while uninterpreted; list items are not merged into paragraphs.

## Running it

```bash
./build-acceptance-pdf.sh              # revision = UTC timestamp
./build-acceptance-pdf.sh A2           # or name it
```

🔴 **A unique revision per run is load-bearing.** Ingestion keys on the file's content hash, so
re-uploading identical bytes is answered from the existing parse and tests nothing. The revision
is stamped into the page so each run is a genuine end-to-end exercise.

Upload the PDF through the product — Library → Library tools → *Import notes or documents*. Do
**not** insert it into the database and do **not** call the parser directly; the boundaries
between those two points are exactly what this exists to test.

Then read the stored row back (`apps/web/scripts/source-context-acceptance.mts`) and compare
against the table above.

---

## First real run — revision A2, 2026-08-11

Uploaded through the product (Library → Library tools → Import), parsed by the production parser,
read back from `parsed_documents`. **The document paid for itself on its first run** by revealing
two real gaps that no fixture could have shown.

| | expected | actual |
|---|---|---|
| shape | `units-blocks` | ✅ `units-blocks`, `state: parsed` |
| text | all of it | ✅ both dated lines, both negatives, all three terms |
| page anchors | every block | ✅ 9/9 blocks carry a rect; 8/9 a heading path |
| **tables** | **1 grid** | ❌ **`table_count: 0`** — the ruled table was flattened into a paragraph |
| **headings** | **5** | ❌ **2** — "Course Schedule", "Key Terms", "Laboratory Notes" and "Light intensity" were absorbed into the paragraph that follows them |

### What this means

🔴 **Associations cannot be table-derived today.** The table is drawn with real vector rules and
still comes back as prose, so an extractor that claimed to read the grid would be lying. This is
consistent with the other production syllabus, which also reports `table_count: 0` — and with the
table lane being built but switched off. Until that lane is on, an association extractor has to
work from text and must **say** that is what it did.

🔴 **Heading detection is unreliable at this scale.** Three of five headings merged into the
following paragraph — including "Course Schedule", which is exactly the section a schedule
extractor would want as context. Section context is therefore not yet dependable evidence.

✅ **Schedule extraction is unblocked.** Both dated lines survive intact inside one block, with a
rect and a heading path, which is everything a candidate needs for provenance.
