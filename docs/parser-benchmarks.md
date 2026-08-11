# Parser scorecard — how good is the parser outside our own documents?

Baseline, established 2026-08-11 on `feat/ruled-table-lattice`. Harness and
frozen samples in [`bench/`](../bench/README.md); raw per-document results in
`bench/results/`.

🔴 **There is no single accuracy number here, deliberately.** "Nemesis parser
accuracy = 94.7%" would average a capability we have strong evidence for against
one we have just discovered we barely have.

🔴 **Nothing was tuned to these results.** They are a baseline taken before any
decision about what to build next.

---

## 0. The finding that shapes everything else

**Two of the three benchmarks cannot be run against this parser at all**, and
that is a fact about the parser's architecture rather than a gap in the harness.

| suite | distributes | usable |
|---|---|---|
| OmniDocBench | 984 jpg + 673 png, **zero PDFs** | **No** |
| PubTables-1M (structure) | cropped table jpgs + XML | **Only via recovered source PDFs** |
| ParseBench | **2,037 single-page PDFs** | Yes — audited, not run |

Nemesis reads a PDF's **native text runs and its vector rulings**. Neither
exists in a photograph of a page. Scoring it on rasterised pages would measure
OCR — a capability this lane does not have and has never claimed. PubTables-1M
was made usable by recovering the **source documents** from PubMed Central, which
is possible because its filenames carry the PMC id.

---

## 1. Nemesis regression corpus — the product suite

164 real PDFs, the documents Nemesis actually receives. This stays the release
gate and is **not** replaced by anything below.

| | |
|---|---|
| PDFs / pages | 164 / 1,474 |
| text preservation | **0 files lost a character** |
| duplicate text | **0 files**, worst char ratio **1.000** |
| tables accepted | 275 in 56 files |
| tables refused | 773 (649 of them page borders) |
| destructive false claims | **0** |
| parser crashes | **0** |
| runtime | 19.9 s → **13.5 ms/page** |
| peak RSS | 845 MB (node process, two parses in one run) |

## 2. PubTables-1M + GriTS — table structure

**Sample:** seed `20260811`, 360 tables, 60 per stratum, ids frozen in
`bench/pubtables-sample.jsonl`. **357/360 source PDFs recovered** (attrition:
2× HTTP 500, 1× 429). 4,031 pages parsed, **0 parse errors**.

### Result

| | |
|---|---|
| documents where a table was recovered | **75 / 357 (21.0%)** |
| regions proposed → accepted | 1,503 → **160 (10.6%)** |
| **GriTS-Top, all 357** (a miss scores 0) | **0.049** |
| GriTS-Top, the 75 recovered | 0.235 |
| **exact grid match** | **1 / 75** |

GriTS-Con and GriTS-Loc are **NOT COMPUTED** — they need a 4.17 GB words archive
and a 3.7 GB coordinate archive that do not fit the available disk. Not
approximated, not estimated.

### By stratum

| stratum | n | recovered | GriTS-Top |
|---|---:|---:|---:|
| projected row headers | 59 | 21 | 0.062 |
| other | 60 | 16 | 0.090 |
| many columns | 60 | 13 | 0.034 |
| merged cells | 60 | 11 | 0.057 |
| simple grid | 59 | 7 | 0.041 |
| many rows | 59 | 7 | 0.010 |

### Failure classes

| class | n |
|---|---:|
| proposed then refused — too few columns | 53 |
| **recovered with the wrong grid shape** | 48 |
| **no region proposed at all** | 43 |
| recovered but merged cells lost | 26 |
| proposed then refused — text crosses a column rule | 13 |
| proposed then refused — content unaccounted | 4 |
| **recovered exactly** | **1** |

### What this actually says

**The dominant failure is region proposal, not cell recovery.** PubMed tables are
booktabs — a rule above and below the header, one at the bottom, and **no
vertical rules**. The lattice requires **three coexisting vertical positions**
before it proposes a region, so most of these tables are never offered to the
grid builder at all. 350 of 357 documents do have *some* vertical rule
somewhere — figure borders, headers — which is why so many regions are proposed
(1,503) and so few survive (160).

This is a **scope limit, not a bug**, and it is the direct consequence of the
choice recorded in `docs/table-lattice-decision.md`: draw the region from lines
the document actually draws, and refuse when it draws none.

🔴 **Two biases in this measurement flatter the parser and must be read with the
numbers.** Only single-table articles were sampled (identity is then unambiguous
without the 3.7 GB coordinate archive) — that favours simpler documents. And
where Nemesis emitted several tables, its **best-scoring** one was taken.

## 3. OmniDocBench — refusal correctness only

**NOT an OmniDocBench score.** Its metrics cannot be computed against this
parser. Its images were used for one safety question: given a page with no text
layer, does the parser *say so*, or return an empty structure that reads
downstream as a blank document?

50 pages, 5 from each of the 10 `data_source` categories, seed `20260811`:

**50/50 correctly reported as carrying no readable text. 0 crashes. 0 pages
returned text that is not in the file.**

## 4. ParseBench — **NOT RUN**

Audited only. It is the **most relevant** of the three to what Nemesis actually
needs — whether parsed structure stays useful to an agent — and it is the one
benchmark here that ships real PDFs.

- Dataset `llamaindex/ParseBench`: **2,037 single-page PDFs** + 5 rule files
  (503 table rules, 16,325 layout, 141,322 text-content).
- Evaluation is **deterministic and rule-based** — no LLM judge, so no API cost
  or nondeterminism.
- Apache-2.0.

**What it would take:** `uv sync --extra runners`, plus a provider shim
implementing their `InferenceRequest`/`InferenceResult` contract — Nemesis is
TypeScript, so the shim must shell out to a Node entry point and render
`DocumentModel` into their expected markup. That is the "substantial unrelated
infrastructure" this task was told not to block on.

**Recommended as the next parser-quality benchmark.**

---

## 5. Scorecard

Only dimensions with real ground truth. Blank means **not measured**, which is
different from zero.

| dimension | evidence | result |
|---|---|---|
| **TEXT** — content preservation | Nemesis corpus, char-level, both directions | **0 files lost or duplicated** |
| **TEXT** — reading order | — | *not measured — no ground truth available* |
| **LAYOUT** — headings / paragraphs | — | *not measured* |
| **LAYOUT** — coordinates | Nemesis corpus | every block carries a rect |
| **TABLES** — detection | PubTables-1M, 357 | **21.0%** of documents |
| **TABLES** — grid topology | GriTS-Top, official impl | **0.049** overall · 0.235 recovered |
| **TABLES** — exact structure | GriTS-Top ≥ 0.99 | **1 / 75** |
| **TABLES** — merged cells | 26 recovered-but-merge-lost | `DocTable` cannot express a span |
| **TABLES** — content fidelity | — | *GriTS-Con not computed (4.17 GB archive)* |
| **TABLES** — localisation | — | *GriTS-Loc not computed (3.7 GB archive)* |
| **SAFETY** — destructive false claims | Nemesis corpus, 1,474 pages | **0** |
| **SAFETY** — duplicate content | char ratio | **1.000** |
| **SAFETY** — refusal on no-text pages | 50 OmniDocBench pages | **50/50** |
| **SAFETY** — crashes | 1,474 + 4,031 pages | **0** |
| **PERFORMANCE** — ms/page | Nemesis corpus | **13.5** |
| **PERFORMANCE** — peak RSS | Nemesis corpus | 845 MB |
| **PERFORMANCE** — artifacts required | — | **none** (no model, no native addon on this lane) |

## 6. Parser limitations, concretely

**Supported, with evidence**
- Tables ruled with **drawn vertical lines** — 209 of 261 accepted tables on our
  corpus get their columns from drawn rules.
- Tables where columns are unruled but rows are ruled *and* a region was
  proposed — `inferColumns` supplies the other 52.
- Multi-page and multi-fragment tables, with column names carried forward.
- Pages with no text layer: correctly reported as unreadable, never as empty.

**Not supported, now measured**
- **Borderless / booktabs tables.** No vertical rules means no region is
  proposed. This is the single biggest gap and it dominates scientific
  publishing: 43 of 357 sampled documents proposed nothing at all, and most of
  the 239 "proposed then refused" were refused because the proposal came from
  something that was not the table.
- **Merged cells.** `DocTable` has no span field; a merged cell puts its text in
  the top-left slot it occupies. Measured cost: a single merge costs ~0.17
  GriTS-Top, and 26 sampled tables were recovered with merges lost.
- **Wrong grid shape on recovery** — 48 cases. Recovering *a* table is not
  recovering *the* table.
- **Reading order and layout quality** — no ground truth, so no claim either way.

## 7. Capability calibration

The benchmarks **confirm** the wording already shipped and sharpen why it
matters. `parseCapabilities.tableStructure` means:

> this stored document contains table structure that passed the parser's
> validation

It does **not** mean the parser found every table. On this sample it would read
`true` for 75 documents, and in 74 of those the recovered grid does not match the
annotated one exactly. A document-wide flag cannot express that, which is exactly
why it must not be read as completeness.

🔴 **This is the argument against adding `tableRegions`.** A second boolean would
imply the parser knows what it missed. It does not: an unruled table produces no
region, no rejection and no signal of any kind.

## 8. Recommended permanent suite

**Per parser PR — fast, seconds**
- `apps/web/lib/pdf/*.test.ts` (unit)
- the four real syllabi through `scripts/gate-d.mts`
- a fixed 20-document slice of the Nemesis corpus through `scripts/lattice-corpus.mts`

**Pre-release — minutes**
- the full 164-PDF corpus gate (**hard gate: zero content lost, zero duplicated**)
- the frozen 360-table PubTables sample (**regression gate: GriTS-Top must not fall**)
- the 50-page refusal check (**hard gate: 50/50**)
- ParseBench, once integrated

Nothing here needs to run on an ordinary frontend PR.

## 9. What this does *not* justify

**It does not justify reaching for the layout model.** The model finds regions,
which is exactly the step that fails here — but it was rejected for ruled tables
on grounds of cost and distribution, and this measurement changes the *scope* of
that decision, not its economics. The honest options for borderless tables are a
separate decision informed by these numbers, and this task was explicitly not to
make it.

🔴 **And do not "fix" this by letting the lattice accept horizontal-only
regions.** That re-opens the failure `structure.ts` documents refusing: a grid
asserted over prose relabels every value in it. The corpus gate that currently
reads zero destructive claims is what would pay for it.
