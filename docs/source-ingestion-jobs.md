# Source ingestion as a durable job

Design, 2026-08-06. Written before the code, per the owner's instruction.

Companion to [document-normalization.md](./document-normalization.md). That document
covers *what* an optimised derivative is; this one covers *where parsing runs, how it
is bounded, and what happens when it half-works*.

---

## 1. The problem, in numbers

A lecture upload is parsed inside the HTTP request that asks for it. Measured against
the owner's real 118 MiB immunology deck (37 slides, 68 media parts):

| | |
|---|---|
| file | 118.1 MiB (123,799,463 bytes) |
| entries | 180, of which 68 are media |
| inflated total | 118.32 MiB |
| **media** | **117.9 MiB — 99.7% of the package** |
| **text (all XML: slides, notes, rels, charts, content types)** | **0.4 MiB — 0.3%** |
| **largest single entry** | **20.26 MiB** (`ppt/media/image31.tiff`) |
| median media part | 0.69 MiB |

Peak RSS through the current path was **676 MiB (5.73× the file)**. PR #434/#435 took
the fetch side from three full-size copies to one, landing at **391 MiB (3.31×)**. The
remainder is the parse: `unzipBounded` inflates all 180 entries at once, costing
**+121 MiB**, of which 117.9 MiB is pictures nobody is holding on purpose.

The function instance is 2 GB and **Fluid Compute shares one instance across concurrent
requests**. So the failure mode is not "a big upload is slow" — it is *two* big uploads
running out of memory and taking unrelated requests down with them.

**The target is not the smallest possible number. It is bounded memory with
`dropped = 0`:** peak scales with the largest single asset (20 MiB here), not with the
package (118 MiB), and every entry is still accounted for.

---

## 2. Where the work runs

### The job system is reused; the runtime is not

`recording_jobs` (#433) already solved durability: a row that outlives the page, a
per-job lease, `for update skip locked` claiming, per-stage backoff, resume-from-failed-
stage retry, RLS that lets the student *watch* but never *write*, and a pg_cron safety
net behind a direct kick. **All of that is copied structurally.** Divergence there would
be a second job system, which is what the owner ruled out.

The **worker runtime** is a separate question, and here this design departs from
`recording-worker`:

| | recording-worker | source ingestion |
|---|---|---|
| runtime | Supabase Edge Function (Deno) | Vercel route handler (Node) |
| what it does | orchestrates; delegates transcription + composition to other services | CPU-bound parsing itself |

`recording-worker` can live in Deno because it barely computes — it calls a transcription
provider and an LLM. Source ingestion *is* the computation, and the parsers
(`lib/notebooks/office.ts`, `lib/pdf/extract.ts` and its unpdf dependency) are Node-
resident. Porting them to Deno would be a rewrite of the exact code whose defects have
only ever been found by running real course files through it. That is a bad trade.

**The ingestion worker is therefore a Next.js route handler**, `POST /api/library/ingest/worker`,
with `maxDuration = 300`, reachable only with a shared worker secret. It is driven by the
same job table, the same claim RPC, and the same cron kick — pg_net can call a Vercel URL
as readily as a Supabase one.

**What actually keeps ingestion out of the way of page loads is the claim limit.**
`claim_source_ingest_jobs(p_limit)` is a hard cap on how many parses exist at once,
enforced in the database, under our control, and true regardless of how Vercel bundles
anything.

It is tempting to add "and each route gets its own function and its own instance pool, so
Fluid Compute never shares an instance between ingestion and a page load". That may well
be true — Next.js on Vercel typically emits a function per route handler — but **it was
not verifiable from the deployment API and is therefore not relied on here.** Automatic
function grouping exists, and a design resting on an unverified runtime property is the
kind of comment that goes stale silently. §9.4 measures the thing that matters directly:
whether concurrent large jobs disturb unrelated requests. If they do, the answer is to
lower `p_limit`, not to appeal to isolation.

### The upload request after this change

```
browser → storage (direct, never through an API body)
        → POST /api/library/sources           creates the row + the job, returns immediately
        → (kick the worker, fire and forget)
        → watches the job row over RLS
```

No parse happens in a request the user is waiting on. The response is a job id.

---

## 3. Stages

Every stage is a real transition the worker actually makes. A progress list is only worth
reading if a stage changing means something changed — the `recording_jobs` comment makes
this point and it applies unchanged.

| stage | what happens | durable output |
|---|---|---|
| `queued` | row exists, not yet claimed | — |
| `inventory` | ONE sequential stream of the object: sha256 as bytes pass, every entry walked, per-entry facts computed, central directory cross-checked at the end | `content_hash`, full `inventory` jsonb |
| `text` | the XML parts — slides/document/sheets, `_rels`, notes, charts, diagrams, content types | document structure |
| `assets` | the entries the plan selected, fetched **one at a time** by HTTP range and released before the next | figure facts / descriptions |
| `persist` | `parsed_documents` upsert + `library_chunks` write | `parsed_document_id` |
| `ready` | done | — |

**No `indexing` stage.** Embeddings stay off per the owner's standing instruction, and a
stage that does nothing is exactly the fabricated progress this pattern exists to avoid.
It gets added when embeddings are turned on, not before.

**`uploading` is not a stage** — the bytes are in the browser until storage has them, so
there is nothing durable to record against. Same reasoning as `recording_jobs`.

---

## 4. Bounded reading: one stream, then targeted reads

### Why not "range-read the text and skip the media"

Because a 118 MiB deck would then parse in about 0.4 MiB and report success having never
looked at a single figure. That is `office-slim.ts` again with a new mechanism — the same
silent loss, at a different layer. **Rejected explicitly.**

### Phase A — the directory first, by range read

**A zip's central directory is at the END of the file, and it must be read BEFORE the
stream, not during it.**

The earlier draft of this design had one sequential pass that hashed, inflated
entry-by-entry, and "cross-checked against the central directory when it arrives at the
end of the same stream". That is wrong in a way worth recording, because it is the same
mistake as `unzipBounded`'s deleted post-inflation sum: **a check positioned after the
cost it exists to prevent.** By the time the directory arrives at byte 123,799,463, every
local-header claim has already been trusted — already inflated against, already allocated
against. Learning at the end that entry 31 lied is information you can no longer act on.

It is also the only way the per-entry ratio guard in §7 — the genuinely new protection
here — can work at all. Catching an entry that inflates past its declared size requires
having an authoritative declared size *at that entry*, before inflating it.

So the first I/O is a range read of the last ~64 KiB: End of Central Directory, then the
central directory itself. Verified working against the real object (`accept-ranges: bytes`,
206, 65,536 bytes returned). That yields the authoritative name list, sizes and methods
before a single entry is touched — which `orderSlideFiles` and `planSlideMedia` want
anyway, since both need the whole name list up front.

### Phase B — one sequential stream, validated against the directory

1. **Hash.** sha256 updated as bytes pass. Never buffered. This is the document's identity
   and the idempotency key.
2. **Inflate entry by entry** with fflate's streaming `Unzip`, holding one at a time.
   Peak = largest entry (20.26 MiB here).
3. **Validate each local header against the directory entry, before inflating it.** A
   disagreement stops that entry rather than being noticed afterwards.
4. **Record every entry**: name, compressed size, declared size, actual inflated size,
   method, disposition, and reason.
5. **Compute per-asset facts** while the entry is in hand — mime, dimensions, content key.
   Facts are tens of bytes; the bytes are dropped unless small and needed.

One transfer, no per-entry latency, complete inventory, and every bound checked at the
entry it applies to.

### Phase C — targeted range reads

The media plan (which figures are worth describing) needs facts for *all* assets before it
can choose, and phase B produced exactly that. The chosen set is small and already capped,
so pass 2 fetches just those by HTTP range — verified supported: `accept-ranges: bytes`,
206 responses, and HEAD returns `content-length` for free.

Range reads are the optimisation here, not the mechanism. The completeness guarantee comes
from phase B, which visits every entry the directory declared.

### Peak memory

```
peak  ≈  largest single entry  +  its decode working set  +  inventory
      ≈  20.26 MiB             +  ~20 MiB (TIFF → RGBA)   +  <1 MiB
```

Independent of package size. A 200 MiB deck of similarly-sized assets costs the same as a
118 MiB one.

---

## 5. Completeness

**The invariant: Nemesis may never present a partial read as a whole one.**

Every entry in the package lands in the inventory with exactly one disposition:

| disposition | meaning |
|---|---|
| `read` | content extracted and used |
| `inventoried` | seen, measured, deliberately not extracted — **a reason string is required, not optional** |
| `unsupported` | a real part in a format this parser cannot read — recorded with what it was |
| `failed` | we tried and could not — recorded with why |

`inventoried` carries a mandatory reason for a specific reason: it is the disposition most
likely to quietly absorb things nobody actually decided to skip. "We saw it and chose not
to read it" is only an honest statement if someone wrote down why. A blank reason fails
the same check that an unbalanced count does.

Two things follow, and both are enforced rather than described:

```
entries_total == read + inventoried + unsupported + failed      -- arithmetic identity
dropped       == unsupported + failed
```

`dropped > 0` ⇒ `parsed_documents.source_completeness = 'degraded'`, with
`degradation_reason` and the per-entry detail. A degraded document is still delivered —
it is useful — but it says so, and that statement travels into retrieval and into model
context so the answer can say "the figures on slide 12 were unreadable" instead of
reasoning from their absence.

**Coverage is computed from the ORIGINAL inventory, never from what survived.** That is
precisely the bug that made `office-slim.ts` dangerous: it counted the zero images
remaining after the strip and called that complete coverage.

---

## 6. Idempotency and retries

Four independent guards, because tab closes, refreshes, double-clicks, cron races and
worker restarts are all normal.

1. **One live job per source.** Partial unique index on `source_id` where
   `status = 'processing'`. A second POST returns the existing job instead of making a
   twin.
2. **Atomic claim.** `claim_source_ingest_jobs` uses `for update skip locked` and a
   per-job lease. The cron and a direct kick racing each other means the loser takes
   nothing — not that the work runs twice.
3. **Content identity short-circuit.** `parsed_documents` already carries
   `unique (user_id, content_hash, parser_version)`. Once `inventory` has the hash, an
   existing row for that triple means the parse is already done: the job skips to
   `persist` and links.

   🔴 **Be precise about what this saves: the PARSE, not the TRANSFER.** The authoritative
   hash comes out of the phase-B stream, so a re-upload of the same lecture still reads
   118 MiB before discovering there was nothing to do. That is the right trade — a second
   hash-only pass would cost the same transfer to save nothing — but the doc should not
   imply a saving it does not deliver. `library_sources.content_hash` may be populated by
   the browser at upload time; if so it can be used as a *hint* to skip early, never as
   the identity, because a client-supplied hash is a claim.
4. **Per-stage resume.** Retry resumes from `failed_stage`, not from the beginning —
   inherited from `recording_jobs`, and it matters more here: the `assets` stage keeps
   `assets_done`, so a worker that dies on asset 40 of 68 resumes at 40.

   That counter is only meaningful if the ordering is stable across restarts, so it
   indexes into **the central directory order persisted with the job**, never a re-derived
   iteration order. An object-key order that happens to be stable today is exactly the
   kind of thing that works until it doesn't.

`persist` is an upsert on the unique index, so even a duplicated final write converges.

---

## 7. Resource limits and failure modes

A 200 MiB valid deck and a decompression bomb must not be treated alike. Entry-at-a-time
reading makes that distinction possible for the first time — the old code could only sum
header claims before inflating everything, or sum actual sizes after.

| guard | bound | why |
|---|---|---|
| entry count | 20,000 | a zip can attack by count; a 500-slide deck runs to a few thousand parts |
| per-entry inflated | 64 MiB, **provisional** | see below |
| per-entry ratio | actual vs declared | **the new one.** An entry that inflates past its own header claim is caught *at that entry*, before the next is touched |
| total inflated | `UNZIP_MAX_TOTAL_BYTES` | a memory budget set by the instance, never a multiple of the upload ceiling |
| wall clock | worker deadline, stage-aware | a stage that runs out of time yields rather than dying, and is re-claimed |
| concurrency | claim `p_limit` | the explicit cap on how many parses run at once |

🔴 **The per-entry cap is derived from a sample of one deck and is labelled provisional
until a second real fixture exists.** "Three times the largest entry observed" is the same
reasoning shape as the "the route already refuses more than 25 MB" comment just deleted for
going stale — a number justified by a circumstance rather than by a constraint. The
constraint that does bound it is the DECODE working set, which is what actually threatens
the instance: the deck's TIFFs run about 4 bytes per pixel, so a 64 MiB entry decodes to
roughly 64 MiB of RGBA, and the two together are the ~128 MiB that must fit beside
everything else. When the second fixture lands, re-derive it from that relationship rather
than from the biggest file anyone has seen.

Failure taxonomy, kept distinct because they mean different things to a student:

- `oversized` — over the product ceiling. Refused before any body is read (#435).
- `corrupt` — not a readable package. Nothing persisted, job `failed`.
- `bomb_suspected` — a bound was broken in a way an honest file does not break. Nothing
  persisted, job `failed`, logged loudly.
- `unsupported_format` — we know what it is and cannot read it. Recorded as such.
- `partial` — the document parsed but some assets did not. Job `ready`,
  `source_completeness = degraded`, `dropped > 0`. **Never silent.**

---

## 8. What the student sees

The Library row exists from the moment the upload lands, showing its real stage — the
`recording_jobs` precedent, where the note appears immediately rather than materialising
minutes later. The page reads the job row directly over RLS; it never holds a request
open and never owns the pipeline.

No percentages. Counts only, because counts are observed: "reading 41 of 68 figures".

---

## 9. Verification, before this is called done

Local numbers were wrong once already in this exact area — #434 measured 12.5 MiB and
313 ms locally and timed out at 300 seconds in production, because cancelling a large
undici body drains it instead of hanging up. So:

1. Peak RSS against the real 118 MiB lecture, entry-at-a-time, sampled as `rss` deltas —
   **target: peak tracks the largest asset, not the package.**
2. The same against a second real Office fixture of a different shape (docx, xlsx).
3. Inventory arithmetic on the real deck: 180 entries accounted for, `dropped = 0`,
   68 media parts inventoried, 37 slides.
4. **Concurrent large jobs** — several 118 MiB parses at once, confirming they neither
   exceed the instance nor disturb unrelated requests.
5. A deliberately corrupt package and a bomb: distinct failure codes, nothing persisted.
6. The whole flow **in production**, not locally: upload → job → worker → parsed document.

---

## 10. Status

| piece | state |
|---|---|
| bounded source fetch | ✅ #434 + #435, merged, deployed, production-verified |
| this design | ✅ this document |
| `source_ingest_jobs` table + claim/retry RPCs | 🔴 not started |
| entry-at-a-time Office reader | 🔴 not started |
| ingestion worker route | 🔴 not started |
| job creation on upload + stage UI | 🔴 not started |
| memory + concurrency verification | 🔴 not started |
| 200 MiB user-facing ceiling (#432) | ⛔ gated on all of the above |
