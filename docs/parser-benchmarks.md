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
| ParseBench | **2,037 single-page PDFs** | Yes — **run twice**, see §4 |

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

## 4. ParseBench — **RUN TWICE**

🔴 **THIS SECTION SAID "NOT RUN" UNTIL 2026-08-13, AND IT WAS FALSE FOR A DAY.**
The benchmark was run on 2026-08-11 and again on 2026-08-12. The sentence stayed
because the *run* landed on **#485 (merged)** while the *baseline record* —
`docs/parsebench-baseline.md` — lives on **#483, which is still open.** For a
day this file and `parser-repairs-before-after.md`, sitting beside it in the same
directory, contradicted each other, and a team lead read this one and repeated
it to the owner as fact.

**A document is an instrument, and a stale one answers confidently.** If you
find a claim here you cannot trace to a committed result file, distrust this
file before you distrust the parser.

🔴 **AND DO NOT DECIDE WHETHER WORK SHIPPED WITH `git branch --contains`.** This
repo squash-merges, so a merged PR's branch tip is *never* an ancestor of `main`.
`bench/rerun-after-fixes` looks unmerged by that test and is not. Use
`gh pr view <n> --json mergedAt`.

- Dataset `llamaindex/ParseBench`: **2,037 single-page PDFs** + 5 rule files
  (503 table rules, 16,325 layout, 141,322 text-content). 2,036 scored.
- Evaluation is **deterministic and rule-based**. The one LLM component —
  `LLAMACLOUD_BENCH_LLM_NORMALIZATION`, which defaults to `judge` and calls Haiku
  to fuzzy-match chart labels — was set to `off` for both runs. **No API spend,
  and chart scores are therefore not leaderboard-comparable.**
- Vision lane **off** (no key configured), so these are **native-lane** numbers:
  what the parser recovers from real text runs and vector rulings, never OCR.
- Apache-2.0. Harness: `bench/parsebench/`.

### Results

| dimension | #483 baseline | #485 after four repairs |
|---|--:|--:|
| Tables | 12.73 | 12.73 |
| Charts | 0.83 | 0.83 |
| Content Faithfulness | 62.06 | 61.55 |
| Semantic Formatting | 11.70 | 12.20 |
| Visual Grounding | 42.05 | **48.90** |
| — localization (af1) | 85.64 | **90.83** |
| — classification | 23.62 | **28.30** |
| — no hallucinated sentence | 44.48 | **52.98** |

**The two columns are comparable and that was checked, not assumed.** The
instrument — `bench/parsebench/`, `apps/web/lib/pdf/parsebench-output.ts` and
`apps/web/scripts/parsebench-parse.mts` — is byte-identical between the two
branches. Same metric set, same serializer, same ontology.

🔴 **NEVER RECORD A SINGLE "NEMESIS PARSEBENCH SCORE."** The five dimensions
measure different capabilities and ParseBench's own Overall is leaderboard-weighted,
not an average. Averaging a 90.83 with a 0.83 describes no parser that exists.

🔴 **AND THE ONE MEAN HERE HIDES A BIMODAL RESULT.** Content Faithfulness
"−0.51" is **222 documents better, 92 worse, 192 unchanged.** Every large gain is
a multi-column document; every large drop is a scanned one that stopped emitting
`[Figure — not examined]` as though it were prose. The parser got **much better
where it can read and honest where it cannot** — and the mean says "slightly
worse". See `parser-repairs-before-after.md`.

### Currency — do these numbers still describe `main`?

**Yes, as of `a3ef845e`, verified by dependency diff rather than a rerun.**
`main` moved 104 commits after the #485 measurement. Every module the benchmark
actually reads is byte-identical across that span:

```
bench/parsebench/**                        IDENTICAL   harness, provider, layout adapter
apps/web/scripts/parsebench-parse.mts      IDENTICAL   the CLI
apps/web/lib/pdf/parsebench-output.ts      IDENTICAL   the serializer
blockToText                                IDENTICAL   (md5 equal)
DocBlockKind union                         IDENTICAL   the label vocabulary
apps/web/package.json, shared/package.json IDENTICAL   no dependency bump
```

The parser-owned files that *did* change are off this path or additive:
`structure.ts` adds `tableRegionsUnreadByUnit` — a per-page breakdown whose sum
is arithmetically the old total, with `assemble(pages)` untouched;
`document-model.ts` and `parse-document.ts` add XLSX/CSV, and ParseBench is 100%
PDF on four of five dimensions; `extraction-coverage.ts` and `source-*.ts` are
coverage reporting the serializer does not import.

The one behavioural change on the PDF path is **#486's fix**: an image-only
document now returns `no-text` carrying its model, where it used to return a bare
`empty`. **Both are `ok: false`, and the CLI emits `pages: []`, `layout_pages: []`,
`markdown: ""` for either** — so the benchmark's input is byte-identical and the
scores cannot have moved. Only our internal reason label changed.

**Re-run when any file in that block changes.** Until then a rerun would spend
hours to reproduce numbers that provably cannot have moved.

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
| **EXTERNAL** — table structure | ParseBench, 2,036 | **12.73** |
| **EXTERNAL** — chart data | ParseBench, 2,036 | **0.83** (extracts none) |
| **EXTERNAL** — content faithfulness | ParseBench, 2,036 | **61.55** |
| **EXTERNAL** — semantic formatting | ParseBench, 2,036 | **12.20** |
| **EXTERNAL** — visual grounding | ParseBench, 2,036 | **48.90** |
| **EXTERNAL** — · finding the region | ParseBench, af1 | **90.83** |
| **EXTERNAL** — · naming the region | ParseBench, classification | **28.30** |

### Where that sits against other parsers

🔴 **PROVENANCE, BECAUSE THIS REPO HAS WITHDRAWN FOUR COMPETITOR CLAIMS (#451).**
Every row except Nemesis is **ParseBench's own published leaderboard figure**. We
did **not** run those parsers ourselves and must not say we did. Only the Nemesis
row is our measurement.

```
parser                                 Tbl   Chrt  Faith    Fmt   Grnd   $/page
► Nemesis (native, local)             12.7    0.8   61.6   12.2   48.9    0.00
Docling-models                        66.4   52.8   66.9    1.0   66.1     n/a
Firecrawl                             55.9    0.0   74.4   25.2    0.0    0.90
Google Cloud Document AI              55.1    1.4   83.7   50.5   61.3    1.00
AWS Textract                          84.6    6.0   74.8    3.7   70.4    1.50
Azure Document Intelligence (Layout)  86.0    1.6   84.9   51.9   73.8    1.00
Datalab Fast                          85.1   57.6   82.8   39.1   74.5    0.40
LlamaParse Cost Effective             81.4   70.2   90.9   68.8   72.6    0.38
LlamaParse Agentic                    90.7   78.1   89.7   85.2   80.6    1.25
```

🔴 **NOT LIKE-FOR-LIKE, AND THAT IS THE POINT.** Every other row reads **rendered
pages with a vision model or a paid API**. Nemesis reads native text runs and
vector rulings, locally, at **no per-page cost**. It should be expected to lose
wherever the answer exists only in pixels.

🔴 **And it is still behind on dimensions where that excuse does not apply.**
Tables and Semantic Formatting are recoverable from native text and rulings
alone. Docling scores **1.03** on Semantic Formatting, so a weak score there is
characteristic of native parsers — but Google DocAI (50.5) and Mistral (66.4)
show it is not inherent to the problem. **Do not soften this.**

**The cost column is not decoration.** At $1.25/page a single 300-page textbook
costs $375 to parse once. Nemesis's unit economics already have one unmetered
model primitive; adopting a per-page paid parser as the default lane is a
different business, not a quality upgrade. Any "catch up to LlamaParse" proposal
has to carry that number with it.

🔴 **THE SHAPE OF THE RESULT IS THE FINDING, NOT THE RANKING.** Localization
**90.83** against classification **28.30** on the same blocks means the parser
**finds the right rectangle and gives it the wrong name.** Per-class F1:
Picture 36.2 · Section 15.1 · Table 10.9 · Text 8.8 · **Page-header 0.0 ·
Page-footer 0.0.** That is one missing classifier over geometry that already
works — a far cheaper gap to close than a geometry gap would have been.

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
- ParseBench (integrated; `bench/parsebench/`) — **re-run only when a file in the
  §4 currency block changes.** A rerun that cannot move is hours spent to restate
  a number.

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

---

## 10. "Is the parser top tier?" — the answer, and why half of it is a scope question

Asked by the owner, 2026-08-13. Answered here so it is not re-derived.

**No.** On the one external suite this parser can be scored on, it is behind
LlamaParse Agentic and Docling on all five dimensions (§5). That is measured, by
us, against a public benchmark we did not design and did not tune to.

**But the gap is two different gaps, and they have different answers.**

| | what it is | what closes it |
|---|---|---|
| **Naming** — classification 28.3 while localization is 90.8; Page-header/footer F1 **0.00** | the parser finds the right rectangle and calls it the wrong thing | a classifier over geometry that already works. **An engineering gap.** |
| **Reading pixels** — Charts 0.83, scanned pages refused | there is no text layer and no ruling to read | OCR / a vision lane. **A product scope decision, not a quality gap.** |

🔴 **"Top tier" as the field measures it is partly unanswerable by construction.**
Two of the three standard suites ship **photographs of pages** (§0). A parser that
reads native text runs and vector rulings scores zero on a photograph — not
because it is bad, but because there is nothing there for it to read. Until
someone decides whether Nemesis should read images at all, no honest total exists.
**Do not let anyone produce one by averaging.**

🔴 **And "top tier at parsing" is not obviously the goal.** These benchmarks score
fidelity to a page. Nemesis's question is whether a learner can be taught from
what survived — which is why **coverage honesty** (`ExtractionCoverage`, the trust
verdict, per-unit loss) is load-bearing in a way a leaderboard place is not. A
parser that silently mis-reads a table at 90 is worse for a student than one that
refuses it at 12, because the first tells a learner they are weak on material the
parser got wrong. **A source gap is not a learner gap**, and that invariant is
worth more here than five points of Semantic Formatting.

**Ranked by measured evidence, if quality work resumes:**

1. **Page-header / page-footer classification** — 0.00 F1, and `is_footer` fails
   100%. 🔴 Both stayed 0.00 after the repairs *as predicted*: all 458 layout
   documents are single-page and furniture is detected from repetition **across**
   pages. The position-only rule that would have moved the number was measured and
   **refused** — it relabels headings as furniture. Moving this needs multi-page
   evidence, not a threshold.
2. **Block granularity** — when a ground-truth element goes unmatched, mean IoU is
   **0.001** against mean IoA **0.840**: our blocks *cover* the element and are far
   coarser than it. This is the dominant remaining classification limit.
3. **Borderless tables** — no vertical rules means no region is proposed, so there
   is no rejection and **no signal of any kind**. Dominates scientific publishing.
   🔴 See §9 before reaching for the obvious fix.
4. **Merged cells** — `DocTable` has no span field; one merge costs ~0.17 GriTS-Top.

**Frozen and untouched:** charts, OCR, inline formatting.
