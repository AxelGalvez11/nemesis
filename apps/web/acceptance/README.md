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
