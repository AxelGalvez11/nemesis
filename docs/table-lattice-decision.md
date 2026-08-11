# Table structure: which missing primitive actually changes the result

> **Shipped on `feat/ruled-table-lattice`.** Option A was accepted and built. What
> the experiment predicted mostly held; three things it did not predict are
> recorded in §8, because they are the parts a future reader will need. Corpus
> gate and Gate D results are in §9.


**Decision: Option A — the geometry we already persist is sufficient for ruled
tables. Do not ship the 171 MB layout model to fix Gate D.**

Measured against the real PHCY 2119 syllabus and three sibling syllabi. Every
number below is re-derivable with:

```
npx tsx scripts/table-lattice-experiment.mts <file.pdf> [--rows]
```

---

## 1. What the table/layout code actually is

| component | file | what it produces |
|---|---|---|
| layout detection | `apps/web/lib/pdf/layout-onnx.ts` | `{label, score, box}` — **a rectangle and a class name. Nothing else.** |
| cell reconstruction | `apps/web/lib/pdf/table-grid.ts` | rows, columns, cells — **deterministic geometry, no model** |
| the gate | `apps/web/lib/pdf/structure.ts:196` | `options.detectTables ? layoutModelPath() : null` |
| canonical shape | `DocBlock.table: DocTable { headerRows, rows: string[][] }` | already exists |

**The 171 MB artifact is a layout detector and only a layout detector.** It runs
`docling-layout-heron` (RT-DETRv2, 17 classes, Apache-2.0) and returns bounding
boxes. It does not emit rows, columns, or cells, and it never re-reads a
character — cell *contents* are the same pdf.js `TextItem`s the parser already
extracted.

**Why it is off:** `DOCLING_LAYOUT_ONNX` is unset. The blocker is distribution —
171 MB will not go in a Vercel bundle — which is a deploy decision, not a coding
one. It is not off because it is broken.

**TableFormer is not present.** Not in the codebase, not downloaded, not
referenced except in comments describing what *would* be needed for unruled
tables. The 342 MB `docling-models` in the HuggingFace cache is the PyTorch
bundle from the bake-off and cannot run in Node.

**Why the syllabus produced zero tables:** the lane is off, so no regions were
ever produced, so `tableFromRegion` was never called. The cell recovery has
never run in this codebase's life. It was not failing; it was unreachable.

**Execution environment:** `readPdfStructure` runs inside the Vercel route
`/api/documents/parse/worker` and in `lib/notebooks/parse-document.ts`. Turning
the model on there means a 171 MB artifact, the `onnxruntime-node` native addon,
~470 ms one-time load, ~370 MB resident, ~0.7 s/page, on every PDF parse.

---

## 2. What the canonical parse preserved

The schedule is **pages 11–22**, not 6–13. On every one of those pages:

```
119 horizontal rulings · 84 vertical rulings · 7 stable column bands
x=105 Date · 150 Time · 215 Topic · 300 Instructor · 375 Hours · 415 Campus · 480 UT-5/LO
```

**Nothing was destroyed. The grid is drawn in the file and we were not reading
it.** What the canonical model stored instead was reading-order interleaving of
the columns:

```
"1.1.1, 1.1.2, 1.1.7, 3.1.1,, 3.2.8, Physiology/ 3.2.9, 8:-9:50 Patho DM 3.3.1, CST/ 8-6 (type 1, pre- George 2"
```

Every coordinate needed to undo that was already on disk.

---

## 3. Geometry-only reconstruction — the result

Region detection from the ruling lattice, cells from `tableFromRegion`
**unchanged**, no model anywhere:

| | |
|---|---|
| tables recovered | **14** (pages 5, 8, 11–22) |
| **false positives on the 12 prose pages** | **0** |
| exams | **4/4** — 8-17, 8-31, 9-14, 9-28 |
| iRATs | **6/6** — 8-14, 8-20, 8-27, 9-8, 9-10, 9-22 |
| session rows | 47 |
| date cell resolved | **47/47** |

Pages 5 and 8 are not false positives: they are the **grading scale** and the
**late-penalty table**, both recovered correctly, and both correctly excluded
from the schedule because they have no date column.

### A false positive here is content loss, not a precision statistic

This is why the two-sided test is the experiment rather than a footnote. When a
region is claimed, `readPage` **removes the text it covers from the paragraph
flow**:

```js
if (consumed.size > 0) { const kept = items.filter((i) => !consumed.has(i)); items.length = 0; items.push(...kept); }
```

That is correct — it stops the same words being emitted twice. But it means a
lane that fires on a page of prose does not add a junk table *beside* good
paragraphs; it **deletes that page's paragraphs** and re-emits them as a mangled
grid, which is then what gets chunked, indexed and cited. And because the lattice
lane costs nothing, it would run on every PDF.

Measured with `scripts/table-lattice-fp.mts`, which judges each claim by shape
(a real table's rows have several short filled cells; prose forced into a grid
has one very long cell per row):

```
4 syllabi · 96 pages examined · 46 regions claimed · 0 prose-shaped claims
```

### Two defects found in region finding, both real

1. **A page border is a drawn rectangle**, so "the bounding box of all rulings"
   is the whole page *on every page*. A table that ends mid-page then fails the
   60%-of-region coverage test and comes back as one column. **This is how Exam 4
   was lost** — page 22 is half schedule, half prose.
2. **That border is emitted five to seven times over**, so a sweep counting raw
   rulings is at depth 10 before any table exists. Only distinct *clustered*
   column positions are countable.

The discriminator is `≥3 distinct column positions coexisting`. That is not a
tuned threshold — three positions bound two columns, and two columns is what
`gridWithin` already requires before calling something a grid.

### The date ambiguity dissolves; it was never a regex problem

`8-17` (a date) and `8:-9:50 CST/ 9-10:50 EST` (a time) are neighbouring tokens
in the flattened page and **different cells** in the recovered one. Reading the
column the table's own header calls "Date" needs no new heuristic.

One residual: a 20pt-wide cell word-wraps `9-28` into `9-2` / `8`, joining as
`"9-2 8"`. Stripping whitespace *inside a known date cell* is safe; doing it over
free prose would not be. This is a cell-scoped repair, not a global one.

---

## 4. ML comparison — **NOT RUN**

**The ONNX export is not on this machine.** `~/.cache/huggingface/.../docling-layout-heron`
holds `model.safetensors` (PyTorch, 171 MB); the code needs
`docling-layout-heron-onnx`, which would have to be re-downloaded. No runtime,
RSS, or recall figure for the model lane is reported here, and none should be
inferred.

What *can* be stated without running it, from the code:

- The model contributes **only the region**. Cell recovery is `table-grid.ts` in
  both paths — the same code just measured at 100% on this document.
- Therefore **enabling the model could not have produced a better grid than
  geometry did here.** It would have produced the same cells from a less exact
  region, since a detector box is approximate and the rulings are the table's
  true extent.
- Existing corpus data (`docs/pdf-tables.md` §7, 164 PDFs, 322 model-detected
  regions): **only 3.4% had no rulings at all.** That 3.4% is the entire
  population a second model would serve.

---

## 5. Generalization — three sibling syllabi

Run on the other three Fall-2026 syllabi, table recovery held. Two real limits
surfaced, and **neither is in the grid**:

| file | tables | with date col | rows dated |
|---|---:|---:|---|
| PHCY 2119 | 14 | 12 | 47/47 |
| PHCY 2109 | 6 | 4 | 36/36 |
| PHCY 2114 | 12 | 10 | **53/68** |
| PHCY 2105 | 14 | **0** | — |

- **PHCY 2114**: the 15 misses are all `8/17/26` — a format the experiment's toy
  date reader does not accept. The cells are correct.
- **PHCY 2105**: its schedule tables are recovered correctly and are
  table-shaped (4.0–4.8 filled cells per row), but **the continuation pages carry
  no header row at all**, so no column can be named as the date column. PHCY 2119
  repeats its header on every page, which is why it worked.

Two requirements follow, and both belong in the production design rather than in
this experiment:

1. **A table that spans pages must carry its header forward.**
2. **The in-cell date reader must be the real one, not a strict format match.**
   PHCY 2105 writes dates as `Week 1 Tuesday, August 11th` and `August 17, 2026`
   *inside* a cell that also holds other text. The experiment's deliberately
   minimal `^M-D$` reader exists only to prove that the *column* removes the
   ambiguity; production should run the existing `findDateMentions` **scoped to
   the date cell**. Scoping is the win — not a narrower pattern.

---

## 6. Recommendation

**Option A**, scoped honestly:

> Add a ruling-lattice region lane to `readPdfStructure`, upstream of the model
> gate. It costs nothing to run, needs no artifact, and recovers ruled tables —
> which is ~96.6% of the tables in the measured corpus. The layout model remains
> the only path to **unruled** tables and stays behind its flag for that purpose.

Table recovery belongs to ingestion, not to syllabus extraction. Once
`DocumentModel` carries real `table` blocks, Calendar, retrieval, citations and
Canvas all get rows and cells without any of them owning a parser.

### `parseCapabilities.tables` must split

One boolean cannot carry this. Detection and structure are now genuinely
different facts, produced by different mechanisms with different availability:

```ts
tableRegions: boolean   // we can tell a table is there
tableStructure: boolean // we recovered rows and cells a consumer can reason over
```

`tableStructure` is what the schedule consumer requires. Reporting
`tables: true` for a page where a table was merely *detected* would be exactly
the "degraded but silent" failure this codebase keeps hitting.

🔴 **`tableRegions` is not derivable today, and must not be added as a
placeholder.** `parseCapabilities` reads the persisted model, and the envelope is
only `{ v, shape, title, text, model }`. The count of detected-but-unrecovered
regions (`tableRegionsUnread`) reaches the **coverage record**, never the
structure envelope. So the split is only honest once that value is plumbed
through — until then `tableStructure` is the one fact the parse can support, and
claiming the other would be inventing a capability signal.

### Composition with the model lane must be specified before either is built

If the lattice lane sits upstream of the model gate, **both lanes mutate the same
`items` array**. With the model on, it would see a page whose table text has
already been consumed and could emit an overlapping region — producing the same
content twice under two block kinds, which is the precise failure `structure.ts`
documents avoiding. The rule: **the lattice claims regions first; the model runs
only over page area the lattice did not claim.**

---

## 7. Gate D is still red, and a parser change alone will not fix it

**This is the finding that matters most for the next slice.** With the
lattice-recovered model grafted in — 14 table blocks, `capabilities.tables =
true`, all 4 exams and all 6 iRATs present as clean table-row segments —
`scheduleCandidatesFrom` produced **2 candidates and zero assessments.**

The reason is in `segmentsOf`: it re-joins a recovered row into one string.

```
"8-17 | - | Exam 1 (George 24/ Moore 12 = 36 questions) | - | - | - | -"
```

That hands the date reader back the exact ambiguity the grid had just removed.
**The structure was recovered and then discarded at the consumer boundary** —
the same failure this pipeline has now made four times, one layer further down.

### Smallest next slice

1. **Parser** — ruling-lattice region lane; multi-page header carry-forward;
   `tableRegions` / `tableStructure` capabilities.
2. **Consumer** — `ScheduleSegment` carries `cells: string[]` and `columns:
   string[]` alongside `text`; the date is read from the named column, and
   `text` stays verbatim for evidence.

Only after both does Gate D pass. Then, and not before:
`ScheduleCandidate → verification → approval → Calendar → provenance →
idempotency → the downstream Calendar question`.

### Unproven

- The lattice lane in production. Everything here is local.
- **Behaviour on non-syllabus documents — 4 files is not a corpus.** All four are
  from one school and share a template, so the zero-false-positive result is
  weaker evidence than the page count suggests. The release gate before the
  parser change merges is a two-sided sweep over the same 164 PDFs
  `pdf-table-coverage.mts` used, and the gate is **zero prose pages claimed** —
  not "false positives reported as a number". A single false positive deletes a
  page of prose from a real student's document.
- Year resolution. The experiment was told `2026`; production must derive it.
- Multi-page header carry-forward and cell-scoped `findDateMentions` are both
  designs, not measurements. Neither has been built or run.

---

## 8. What the experiment got wrong

Three things only showed up once the lane ran over the whole corpus rather than
one document. All three are now covered by tests.

**Merged cells are not a broken grid, and the naive crossing test called them
one.** The experiment's rule was "no text may cross an interior boundary". Real
tables merge cells constantly — a syllabus row reading `August 17, 2026 | Exam 2`
legitimately covers two column slots — and that rule rejected **ten real tables
in one file, including every page of its schedule**. The fix is to ask whether a
rule is *actually drawn* at that row: crossing an undrawn boundary is a merged
cell and permitted; crossing a drawn one is a contradiction between geometry and
content. Without this half the check is a recall disaster; with it, precision
holds.

**"Every cell in row 0 is filled" is not evidence of a header.** Publishing it as
`columns` labelled a real schedule's date column *"Week 1 Tuesday, August 11th"* —
a data row promoted to the names of the columns, with every value beneath it
inheriting the label. A first row now has to earn it: either it is set in a
different font from its data, or it is reprinted at the top of another fragment
with the same column geometry. When neither holds, no names are published.

**A region can be larger than the page.** 17 of 336 candidates fall outside it and
one covers **614× the page area** — rulings in a coordinate space the page never
uses, so every boundary derived from them is meaningless. But real files also
overhang by a few points, and rejecting those cost genuine tables; a tenth of the
page separates the two by orders of magnitude.

## 9. Results

**Corpus gate — 164 PDFs, 1,474 pages.** The gate is not "zero false positives":
a false table is destructive, so the number that matters is whether any character
present in the file stops being present in the model. Every file is parsed both
ways and compared.

| | |
|---|---|
| tables accepted | 275, in 56 files |
| candidates refused | 773 — `too-few-columns` 649, `outside-page` 55, `text-crosses-column-rule` 42, `content-unaccounted` 18, `text-crosses-row-rule` 9 |
| **files losing content** | **0** |
| runtime | 20.6 s → 19.8 s (**−4.1%**) |
| peak RSS | 1,023 MB, unchanged by the lane |

The lane is *faster* because a table is fewer blocks than the prose it replaces
(−487 blocks across the corpus). `too-few-columns` dominates the refusals because
every page border is proposed and immediately refused; that is the cheap path
working, not a near miss.

🔴 **Comparing WORDS does not work here and believing it did produced 32 false
failures.** The two lanes tokenise the same characters differently on purpose:
the paragraph lane runs neighbouring runs together into `IntroductionDr. Farrar
(Memphis)3.1.4,` while the table lane puts `Introduction` and `Dr. Farrar` in
their own cells — which is the entire point. At word level that reads as a loss
when it is the improvement. Characters cannot be re-split.

**Gate D — per document, not aggregated.**

| syllabus | exams | iRATs | candidates | dated | provenance | date/time confusion |
|---|---|---|---|---|---|---|
| PHCY 2119 | **4/4** | **6/6** | 49 | 48 | 49/49 | 0 |
| PHCY 2114 | **7/7** | — | 68 | 67 | 68/68 | 0 |
| PHCY 2109 | **8/8** | — | 30 | 30 | 30/30 | 0 |
| PHCY 2105 | **8/8** | — | 39 | 38 | 39/39 | 0 |

PHCY 2105 recovers its assessments with **no column names at all** — its schedule
never prints a header, so the fallback path carries it. That is the honest
outcome: names are absent rather than invented, and extraction still works
because it does not depend on them.

## 10. Still not supported

**Unruled tables.** A table whose columns are implied by whitespace has no
geometry to read, and nothing detects one — so Nemesis does not merely fail to
parse them, it cannot tell they are there. Measured earlier at 3.4% of
model-detected regions. `tableStructure: true` therefore means "at least one
table was recovered and validated" and can never mean "nothing was missed".

The layout model remains the only path to that population and stays behind
`DOCLING_LAYOUT_ONNX`, now running only over page area the lattice did not claim.
