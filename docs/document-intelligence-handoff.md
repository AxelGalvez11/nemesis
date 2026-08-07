# Document intelligence — handoff, 2026-08-06

**Why this file exists.** Production verification is blocked by Vercel's daily build cap, which is
outside our control. That must not become a reason to stop building. This file separates *what is
blocked on a deploy* from *what is blocked on nothing*, so the second list can be worked through
while the first waits.

**It does not change any status.** `docs/document-intelligence.md` §6.7 remains the one ledger, and
its four statuses (DONE · IN PROGRESS · BLOCKED · NOT STARTED) remain the only ones. Nothing here
promotes a phase. A phase whose code is finished and untested in production is still IN PROGRESS —
the "Live in production?" column carries that fact, and §8 below carries the queue of checks it is
waiting for.

---

## 1. Phase 1 — exactly what remains

Built, tested locally, unmerged and undeployed: the schema and claim/heartbeat/finish RPCs, the
status resolver, the enqueue decision, the shared parser, the resource and failure constants.

Four things are genuinely missing. Not "written but unverified" — **absent**.

| # | Missing | Why it is not optional | Local or blocked? |
|---|---|---|---|
| 1.1 | **The `worker_thread` entry point** | The lease cannot be renewed from the parsing thread. Measured: an inline heartbeat fired **0 of 49** times across 12,268 ms of silence; in a worker thread, **50 of 50**, worst gap 253 ms, ~4% overhead. Without the thread, every parse longer than one lease loses its own job to a competitor. | **Local.** The file can be written and a local `next build` can be inspected to confirm the entry is traced and emitted. That is a real check. It is *not* a substitute for a production load. |
| 1.2 | **The kick route** | The claim RPC exists; nothing calls it. Until something does, the queue is a table nobody reads. | **Local** to write and unit-test. Its behaviour under Vercel's runtime is deferred. |
| 1.3 | **The status UI** | `document-status.ts` resolves a truthful status and **has no caller outside its own test.** Confirmed by grep: the only non-test mention is a comment in `parse-worker.ts`. A student currently sees nothing about whether their file was read. | **Local.** |
| 1.4 | **Applying migration `20260806210000_document_parse_jobs.sql`** | Nothing queues without it. | **Blocked** — a production schema change. Dry-run verified: with the enqueue gate the claim predicate matches **0** of the 17 existing sources; without it, 16. |

**Phase 1 cannot reach DONE in this roadmap revision even after a deploy.** §6.4 requires that "a
failed page or batch retries without restarting the document". Per-unit retry is deferred with owner
approval, because DOCX has no reproducible unit identity before the canonical model exists. That is
a real unmet criterion and it stays recorded rather than quietly dropped.

---

> **Update, later the same day.** §3's canonical model was built, and with it the DOCX discard
> (§2) and the PDF figure blindness (§4) are fixed, wired into `parseDocument` **and** the upload
> route, and persisted as a `v2 units-blocks` envelope in `parsed_documents.structure`. §2's "the
> structure is thrown away" is no longer true, and §3's "owned by none of them" is resolved.
> Everything in §6 is still queued: nothing is deployed, and the SOLO benchmark still records no
> value. Measured results are in `docs/document-benchmark.md`; the headline is **1,089 real figures
> nobody has examined**, a number this system could not previously state at all.

## 2. Phase 3 — exactly what remains

**The ledger says IN PROGRESS and the ledger is right. The reader works; its output is thrown away.**

This is the correction that matters most in this handoff, because a summary of the last session
could easily read as "Phase 3 is built, awaiting deploy". It is not.

`readDocxStructure` produces blocks with heading levels, list markers, heading paths and real table
cells. `extractDocxText` then calls `renderDocx(structure)` and returns `{ title, text }` — **a
string.** The structure is computed and discarded at exactly the boundary the old tag strip used to
sit at. `extractDocxStructure` is exported and, verified by grep, **has zero consumers.**

So the measured recovery numbers (cells 8,345/8,355; numbered 2,116/2,266; tables 197/198) are true
statements about the reader and **not** statements about what any model, index or citation receives.
What they receive is markdown text — better markdown text than before, which is a genuine gain, but
still a flat string with no addressable units.

Remaining in Phase 3:

- **3.1** A canonical document model for the structure to survive into. See §3 — this is the real
  blocker and it is shared with Phases 2, 4 and 5.
- **3.2** DOCX emitting that model instead of a string.
- **3.3** Truthful locators: block index and heading path. **Never a page** — Word paginates at
  layout time, so a `.docx` page number is a fabricated locator that every downstream check would
  pass while pointing at nothing.
- **3.4** PPTX emitting the same model without losing notes, SmartArt, chart labels, media
  relationships, TIFF/EMF recovery or recurring-art filtering. Non-regression baseline recorded:
  the owner's Pharmacogenomics deck = **62,040 chars, 56 slide headings, 807 bullets**.
- **3.5** Slide rendering — needs an owner decision, deferred.

---

## 3. The gap that owns the others: there is no canonical Document model

**Phases 2, 3, 4 and 5 each assume it. None of them owns it.** That is the tightest constraint in
the roadmap, and it is blocked on nothing at all.

Today the shared parse output is:

```ts
interface ParsedDocument { kind; title; text: string; coverage; readBy?; skippedFigures }
```

`text` is the entire representation. Everything structural — the table grid, the heading hierarchy,
the list numbering, the figure beside the paragraph, the page a sentence sat on — is flattened
before it leaves the parser. Which means:

- Phase 3's structure has nowhere to go (§2).
- Phase 2's figures and geometry would have nowhere to go either, so building Phase 2 against
  `text` means writing PDF extraction twice.
- Phase 4 cannot "chunk by semantic/structural boundaries" because no boundaries survive.
- Phase 5 cannot produce a deterministic locator because there is nothing to locate.

**The model is therefore built first, with DOCX as its first producer** (the reader already exists)
**and PDF as its second.** This is a change of order from §6.4's phase numbering, not a change of
scope, and it is recorded here so the reordering is visible rather than silent.

---

## 4. Phase 2 — current baseline and implementation target

**Baseline, already measured. Do not re-measure it.** `apps/web/scripts/phase2-figure-baseline.mts`,
run over 120 real course PDFs / 952 pages:

| Measure | Value |
|---|---|
| Pages that are text-rich **and** carry a figure | **326 (34.2%)** |
| Figures on those pages | **1,807** |
| Files affected | **80 of 120** |
| Thin pages (already vision-routed) | 121 (12.7%) |
| Worst single file | `TDM- Cyclosporine and Tacrolimus 2026.pdf` — 35 pages, 708 figures |

**Two independent causes, and fixing either alone fixes nothing.**

1. **The routing rule.** Vision runs only where native text is thin. A page with three paragraphs and
   one critical diagram is "text-rich", so it is never looked at.
2. **The mechanism.** `unpdf` does not expose image operators at all. Even with the rule changed,
   nothing in the current extractor can tell that a figure is present. This is why the fix is
   pdf.js-based extraction, not a threshold tweak.

And a third, quieter one: `pdfCoverage` accepts no figure input, so the loss is currently invisible
to the honesty layer as well. **A page holding an unread diagram is reported as fully read.**

**Implementation target:**

- pdf.js extraction that emits the canonical model: per-page blocks with geometry, reading order,
  detected tables, and **figure blocks with bounding boxes**.
- Coverage extended so a page carrying an unexamined figure is *not* reported as complete. Under the
  rule "Unknown ≠ complete", this is the honesty fix and it lands before, not after, the vision work.
- Vision spent adaptively on pages the model says are visually load-bearing, merged with native text
  rather than replacing it.
- Query-time high-resolution reinspection, cached on (source version, unit, crop, parser version,
  model).

---

## 5. Phases 4–7 — what is locally executable now

| Phase | Locally executable now | Blocked |
|---|---|---|
| **4 — Source retrieval** | Structure-aware chunking over the canonical model; chunk-boundary and provenance tests; removing each verified cap in code. The cap audit is **already done** — every cap verified at its stated line. | Indexing real sources into `library_chunks` (needs the worker live). Retrieval quality against real queries. |
| **5 — Verified citations** | The locator type and its **validation**: a locator is only accepted if reopening it lands on the block it claims. Round-trip tests over real files. Rejecting model-supplied locations that do not verify. | The reader deep-link UI against production data. |
| **6 — Semantic extractors** | Extractors over the canonical model with provenance back to block ids. **Structural signals only** — heading text, table shape, position, emphasis. Never keyword lists: a subject-flavoured extractor passes every test we write and fails the law student. | Nothing, once the model exists. |
| **7 — Capacity / hardening** | **Almost entirely local, and the strongest candidate to genuinely close.** Adversarial fixtures: zip bombs, malformed containers, nested archives, a few-hundred-KB PDF declaring 100,000 pages, entry/media count abuse. `MAX_UNITS_PER_PARSE = 5,000` exists as the bound; what is missing is proof it holds **and** that exceeding it reaches coverage as a *truncation*, not an error. | Concurrency and memory behaviour under the real runtime. |

---

## 6. Deferred production checklist

**Every item here is blocked on Vercel's build cap or on a production schema change. None is
optional, and none may be counted as done by inference.** When deploys work again, this is the queue.

- [ ] **Deploy `main`.** Confirm by grepping the deployed bundle for a marker unique to the PR — never from a deploy badge, and never from a green check.
- [ ] **Verify the chat truncation fix (#443, `0a30b805`) live.** Re-run the owner's 9.6 MB / 57-slide deck. Old behaviour cut at slide 55 and the model reported slide 46.
- [ ] **Apply `20260806210000_document_parse_jobs.sql`.** Then re-run the claim predicate and confirm it still matches 0 rows in production, as the dry run predicted.
- [ ] **Confirm the worker-thread entry actually loads in the deployed function.** A local build trace is evidence the file is emitted; it is not evidence the platform loads it.
- [ ] **Verify one full round trip:** upload → enqueued → claimed → parsed → coverage recorded → status visible, with the browser closed mid-parse.
- [ ] **Verify a duplicate kick claims nothing** — two workers, one row, one parse.
- [ ] **Verify lease reclaim** — kill a worker mid-parse; the job returns after the lease expires, and `attempts` reflects it.
- [ ] **Verify the failure path records rather than vanishes** — a deliberately corrupt file leaves a `parse_failed_at`, a sanitized message, and no leaked signed URL.
- [ ] **Phase 0's partial-disclosure case.** Still unverified — no real partial fixture under 50 MiB exists. **Do not manufacture one.**
- [ ] **Re-check both CI signals.** GitHub Actions red with `steps_len: 0` is a quota lockout, not a test result; Vercel's `?upgradeToPro=build-rate-limit` is the cap. Neither is a failure and neither is a pass.
- [ ] **SOLO benchmark** for PDF, PPTX and DOCX — the gate for any phase reaching DONE.
- [ ] **MATCHED benchmark** — required before any sentence containing the word "parity", in either direction. Nothing MATCHED has been run.

### Added 2026-08-07, as Phases 1–7 were built out

- [ ] **Apply `20260807030000_source_chunk_retrieval.sql` to production**, whose `library_chunks` already holds 158 note rows. The round-trip harness proves the migration applies to an *empty* table of the same shape; the new unique index on `(parsed_document_id, chunker_version, embedding_version, chunk_index)` has never met existing data.
- [ ] **Apply `20260807031000_source_index_scheduler.sql`**, then decide separately whether to create its two Vault secrets. It is dormant without them, and creating them starts real embedding spend — an owner decision, not a deploy step.
- [ ] **Deploy the `source-index` function with JWT verification disabled**, so its own service-role check is the gate. Getting this wrong on a function of this shape has caused a production outage before (`nemesis-verify-jwt-deploy-trap`).
- [ ] **Confirm the first source chunks exist.** `select count(*) from library_chunks where origin_type = 'source'` should stop being 0.
- [ ] **Confirm search returns one.** The search route reports `sources: true` when the new function answered and `false` when it fell back to notes-only, so this is one field, not an inference.
- [ ] **Confirm the parse worker bundle LOADS**, not merely that it shipped. POST to `/api/documents/parse/worker`; an outcome of `no-worker-bundle` means the traced file is not loadable in the deployed runtime — the one thing `check-worker-trace.mjs` cannot tell you.
- [ ] **Decide where figure vision may run.** It is enabled only on the background worker lane and off on the synchronous upload route. Enabling it more widely multiplies spend on the one primitive the 2026-08-06 unit-economics audit found unmetered.
- [ ] **Describe one real figure.** Nothing has ever called the vision provider on a PDF figure. 246 of 305 routed figures produce PNG bytes locally and not one has been sent, so Phase 2's visual half is plumbing that is known to carry water and has never carried any.

---

## 7. Rules this handoff must not be read as relaxing

- Implemented ≠ merged ≠ deployed ≠ production-proven. Four distinct facts, tracked separately.
- Coverage counts must reconcile, and **Unknown is not complete**.
- **Never fabricate a locator a format cannot provide.** No page numbers for `.docx`.
- A worse retry never replaces a better parse.
- Never solve capacity by silently deleting content.
- No parity claim without MATCHED evidence.
