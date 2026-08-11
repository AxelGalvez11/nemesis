# External parser benchmarks

Reproducible evidence about the canonical PDF parser, from public evaluation
suites rather than a metric we invented. The 164-PDF Nemesis corpus stays the
product regression suite; this exists to answer the different question: **how
good is this parser outside the documents that drove its implementation?**

🔴 **Do not tune the parser to these numbers.** They are a baseline. A low score
on a document class we never claimed to support is a limitation to record, not a
defect to fix — and "make the benchmark go up" is how a guard gets calibrated on
the thing it was supposed to be independent of.

---

## The compatibility problem, first

Both of the obvious table/document benchmarks ship **page images, not PDFs**:

| suite | what it distributes | usable against this parser? |
|---|---|---|
| OmniDocBench | 984 jpg + 673 png, **0 PDFs** | **No** |
| PubTables-1M (structure) | cropped table jpgs + PASCAL VOC XML | **Only via the source PDFs** |
| ParseBench | **2,037 single-page PDFs** + rule JSONL | **Yes** |

The Nemesis parser reads a PDF's native text runs and its vector rulings.
Neither exists in a photograph of a page. Scoring it on rasterised pages would
measure OCR — a capability this lane does not have and does not claim — so the
adapters below either recover the real source documents or say plainly that the
suite cannot be run.

---

## 1. PubTables-1M + GriTS

Ground truth for table structure. The dataset is built from PubMed Central Open
Access and the filenames carry the PMC id, so the **source PDFs are
recoverable** and the real parser can be measured.

```bash
# 1. characterise every test table (30 MB annotations -> compact index)
python3 characterize.py <extracted-annotations-dir> index.jsonl

# 2. stratify BEFORE fetching anything; records ids + seed
python3 sample.py index.jsonl images_filelist.txt test_filelist.txt sample.jsonl 60

# 3. recover the source documents (throttled; attrition reported)
python3 fetch_pdfs.py sample.jsonl pdfs/ fetch_log.jsonl

# 4. run the parser, recording WHY as well as what
cd ../apps/web && npx tsx scripts/bench-dump-tables.mts <pdfs> nemesis_tables.jsonl

# 5. score with the official GriTS implementation
python3 score_grits.py sample.jsonl <annotations> nemesis_tables.jsonl grits_results.jsonl
```

`pubtables-sample.jsonl` is the frozen sample — **seed 20260811**, 360 tables,
60 per stratum. Re-running any parser change against these exact ids is the point
of committing it.

### Choices that bias the result, stated

- **Single-table articles only.** Ground truth is per cropped table; Nemesis
  emits N tables per page. Matching them needs the 3.7 GB PDF-coordinate archive
  or a document where the question does not arise. Sampling articles with exactly
  one table in the whole dataset makes identity unambiguous and **biases toward
  simpler documents**.
- **Best-match scoring.** Where Nemesis emits several tables, its best-scoring one
  is taken. This flatters the parser deliberately: a generous match that still
  scores badly is unambiguous.
- **GriTS-Con and GriTS-Loc are NOT computed.** Content needs the 4.17 GB
  `Structure_Table_Words`; localisation needs the 3.7 GB coordinate archive.
  Neither fits the available disk. Reported as not computed, never approximated.
- **Ruledness is not annotated** by PubTables-1M and is not invented here.
  Failures are reported by observable structure instead.

## 2. OmniDocBench — refusal correctness only

Not an OmniDocBench score, and its output must never be tabulated as one. The
images are wrapped as image-only PDFs to ask one safety question: given a page
with no text layer, does the parser **say so**, or return an empty structure that
reads downstream as "this document is blank"?

```bash
python3 omni_wrap.py OmniDocBench.json omni_pdfs/ 5
cd ../apps/web && npx tsx scripts/bench-refusal.mts omni_pdfs omni_pdfs/manifest.jsonl refusal.jsonl
```

## 3. ParseBench

Audited, **not run** — see `docs/parser-benchmarks.md` for the exact integration
requirements and why it is the recommended next benchmark rather than this one.

---

## Vendored code

`grits_official.py` is `src/grits.py` from
[microsoft/table-transformer](https://github.com/microsoft/table-transformer)
(MIT). **One edit**: its XML import is swapped to `defusedxml` — the metric
itself is untouched, and the function that used it is not on our path anyway.

Two integration details cost time and are recorded so they do not cost it again:
`factored_2dmss` indexes with `[i, j]` so it needs a numpy array, but modern
PyMuPDF's `Rect()` rejects an ndarray row — the grid must be an **object array
holding plain lists**. And `get_spanning_cell_rows_and_columns` returns a single
list, not a pair.
