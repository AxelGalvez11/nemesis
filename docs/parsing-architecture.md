# How Nemesis reads a document

This is the settled decision, not an options paper. The comparison that produced it
is `docling-bakeoff.md`; read that for the numbers and the traps. This file records
what owns what, why, and what would have to be true to change it.

**Status: implemented behind a per-format flag that is OFF. Nothing here is running in
production.** See §7 for exactly what is and is not done.

---

## 1. The decision

| Format | Structure comes from | Why |
|---|---|---|
| **PDF** | **Docling** | Our lane finds **0 tables and 0 list items** across all 164 corpus PDFs. Docling finds 349 tables (18,550 cells) and 5,249 list items. It also reads scanned pages we cannot read at all — 73 characters against 7,251 on the same file. |
| **DOCX** | **Ours** | Our numbering resolves **2,497 of 2,497** list markers; Docling manages 1,710. We read `numbering.xml` through both indirections and it does not. Text volume is a wash (604,460 vs 601,715 characters). |
| **PPTX** | **Ours** | We extract more text than Docling on **23 decks out of 23**, no exceptions — speaker notes through each slide's own relationships, plus chart and SmartArt text, plus SHA-1 image dedupe. |
| **Images** | **Ours (vision)** | A photograph is a vision call, not a document parse. Routing one to a layout model spends money for no structure. The router refuses it explicitly. |

Nothing is deleted. Every parser that exists today still exists and still runs by
default. The flag is **per format** because a single global switch would force a
format to change owner just because another format did.

## 2. What PDF.js is for now

PDF.js used to be a second structure engine, competing with the first. On the Docling
lane it is not. It contributes exactly three things, and each is something Docling
cannot do:

1. **Reader rendering, text selection and page geometry.** Unchanged. This was always
   PDF.js's job and it stays its job.
2. **The native-vs-OCR answer.** Docling's JSON export carries no OCR signal at all —
   a key sweep over all 322 corpus exports found none. So a page RapidOCR rescued from
   pixels is indistinguishable, in Docling's output, from a page with real embedded
   text. `lib/pdf/native-probe.ts` answers "did page N have words of its own" with the
   *same predicate the native lane already uses* (`pageTextLength`, `THIN_PAGE_CHARS`).
   A second threshold would let one page be "read natively" on one lane and "a picture"
   on the other, and the two coverage records would stop being comparable.
3. **Embedded image bytes.** Docling detects pictures and never looks at one.
   `lib/pdf/figure-match.ts` pairs Docling's rectangles with the pixels PDF.js already
   decoded, so the existing vision pass — the 3%-of-page area filter, the 40-per-document
   budget — runs unchanged over a Docling model.

What it does **not** contribute on that lane: blocks, reading order, headings, tables,
lists. Those come from Docling or they do not come at all.

> 🔴 Without (3), routing PDFs to Docling would be a **regression**. We currently
> describe figures; Docling never does. A straight swap would trade "0 tables, figures
> described" for "349 tables, no figure ever described", and every Docling-parsed PDF
> would sit at coverage state `partial` forever with nothing able to move it.

## 3. Where the Python lives

A separate container running `docling-serve`, reached over HTTP. Never a Python process
spawned from Next.js, and never inside a request.

The reason is memory, and it is measured, not assumed: 2.42–2.56 GB peak RSS with the
pypdfium backend and 6.16–6.20 GB with the native one (Docling technical report,
arXiv 2408.09869, Table 1). The worker function is configured for 3,009 MB total. There
is no arrangement of that arithmetic that fits.

**Every limit is ours, because the server's defaults are unsafe.** `docling-serve` ships
`MAX_DOCUMENT_TIMEOUT=604800` — seven days — and leaves `MAX_NUM_PAGES` and
`MAX_FILE_SIZE` unset entirely. The client sets its own control timeout (30 s per
request), task budget (900 s per document across all attempts), upload cap (32 MB) and
unit cap (`MAX_UNITS_PER_PARSE`, 5,000). None of them depend on how the service happens
to be configured.

Licensing is clean: all code MIT, and the two models that run on every PDF
(`ds4sd/docling-models`) are CDLA-Permissive-2.0 / Apache-2.0. No copyleft, no
non-commercial restriction. Governance is LF AI & Data.

## 4. Why the conversion is submitted asynchronously

This is a correctness decision, not an optimisation.

The worker's ceiling is 300 s and it aborts itself at 240 s. Docling's measured
distribution over 154 real course PDFs is median 12.8 s, p90 65 s, p95 99 s, p99 145 s,
**slowest 297 s**. One blocking request cannot cover that inside one invocation.

And the files that would miss are not a random tail. **The 297 s document is 17 pages
carrying 15 tables — table detection is the entire cost.** Our own PDF lane finds zero
tables. So "wait, give up, fall back to ours" would systematically lose exactly the
documents this lane exists to read properly.

So: `POST /v1/convert/file/async` returns a task id immediately. The worker stores it
against the row, polls for as long as its own deadline allows, and if the conversion is
still running when the invocation must end, it leaves the id in place and hands the job
back. The next attempt resumes the same task. Nothing is computed twice; the lease,
backoff, attempt limit and idempotency are untouched.

> The migration that adds the two columns is **optional**. `claim_document_parses`
> returns `s.*`, so they appear the moment the table has them and are simply absent
> until then. A deployment without the migration still routes to Docling and still
> parses correctly — it just cannot resume, so long documents fall back to the built-in
> parser. A missing column and a missing function both read as "resume unavailable",
> never as an error.

## 5. The bounds, and who enforces each

| Bound | Value | Enforced by |
|---|---|---|
| Upload size | 32 MB | `docling-client.ts`, before any request |
| One request | 30 s | `docling-client.ts` (`AbortSignal.timeout`) |
| One document, all attempts | 900 s | `docling-client.ts` (`taskBudgetMs`), checked each poll |
| This invocation's share | `240 s − elapsed − 45 s` | the worker route, computed per job |
| Units per parse | 5,000 | `parse-docling.ts`, disclosed as unread |
| Text | `TEXT_CAP` | `parse-docling.ts`, disclosed as a truncation record |
| Attempts | 5 | SQL (`document_parse_max_attempts`) — one copy, in the claim predicate |
| Jobs per invocation | 1 | `parse-worker.ts` (`JOBS_PER_RUN`) |

**Concurrency is the one bound we do not own end to end, and that must be said plainly.**
`JOBS_PER_RUN = 1` bounds a single invocation. It does not bound the fleet: pg_cron fires
every minute and the kick route can fire alongside it, so several workers can be in flight
against one sidecar. What actually bounds the sidecar is the sidecar's own queue
(`DOCLING_SERVE_MAX_SYNC_WORKERS` / the async task queue), which has to be configured on
the container and is not visible from here. Until that is set deliberately, the global
concurrency limit is "however many workers happen to be running", and the p99 latency
measured on an idle laptop is not the latency a queued task will see.

## 6. What the student is told

Unchanged, and this was the largest single piece of work in the integration.

A third-party "success" is not our "complete". Docling reports `ConversionStatus.SUCCESS`
for documents it understood partially — measured, it does so on 8 corpus files where it
declared more units than it filled (one 26-slide deck came back with 2 slides empty).
`parse-docling.ts` is the only door into the app, and it always builds an
`ExtractionCoverage` record:

* a page Docling produced no blocks for is **unread**, whatever its text layer says;
* a page with no native text that Docling did read is **vision**, not native;
* a picture nobody looked at is **`not-examined`**, which correctly makes the document
  `partial`. It is not marked `decorative` — that means "we know it is a bullet or a
  rule", and we do not know that;
* units past the cap are **truncated and counted**, never silently dropped;
* **a PDF with no native-text page map is refused outright** and falls back to our own
  parser, because grading it would mean reporting a rescued scan as though it had a real
  text layer.

Source hashes, source identity and course placement are untouched by any of this. The
content hash is SHA-256 over the original uploaded bytes and no parser feeds it, so
changing which program reads a document cannot move a hash, a source or a course. That
is what makes the routing decision reversible rather than a data migration.

## 7. Status

**Implemented and locally tested**, flag off:
the async client, the worker integration with resume, the unit/text/timeout bounds, the
coverage builder and its consumer, the native/OCR split, the figure-pixel matcher, and the
optional migration.

**Not done, and not claimed:**

* Nothing has run against a real `docling-serve` container. Every test uses a stubbed
  HTTP layer or saved JSON exports. The wire format is taken from the project's published
  API documentation, not from a live handshake.
* The end-to-end answer-quality benchmark (parse → chunks → index → retrieval → answer →
  citation) has not been run. Extraction counts are not answer quality, and this document
  claims nothing about the latter.
* Nothing is merged and nothing is deployed. `main` itself still carries Phases 1–7 with
  two unapplied migrations, so "current production behaviour" is not what this branch
  compares against — a local baseline is not a production baseline.

## 8. What would change the decision

* **PDF back to ours** if we built table and list extraction and it measured competitive.
  That is the work Docling is being adopted to avoid, so this is a deliberate buy rather
  than a build.
* **DOCX or PPTX to Docling** if it ever beat us on markers or on deck text. It does not
  today, on any file measured.
* **Away from a sidecar** if Docling ever shipped something that fits in a function's
  memory. Nothing suggests it will.
