# Phase 1 runtime feasibility spike — measurements

> Run 2026-08-06 on the owner's Mac (M-series, macOS 25.3, Node via `tsx`, Deno 2.9.4).
> Scripts: `apps/web/scripts/worker-runtime-spike.mts`, `worker-lease-spike.mts`,
> `worker-io-spike.mts`. Every number below was produced by running one of them; nothing here
> is estimated.

## The question

The recording worker (#433) is a Supabase Edge Function (Deno). If the document parsers run there,
Phase 1 reuses that pattern wholesale. The one thing we may **not** do is weaken a parser to fit a
runtime, so the runtime has to be chosen against measurements.

## 1. Parse cost, real files, one process per file

`process.resourceUsage().maxRSS`, calibrated against `memoryUsage().rss` because macOS reports
`ru_maxrss` in bytes and Linux in kilobytes.

| Kind | Fixture | Size | Time | Units | Text | Peak RSS |
|---|---|---|---|---|---|---|
| PDF | `HTN_therapeutics_-_chronic_HTN_-_Havrda_2pp_color.pdf` | 10.8 MB | 368 ms | 25 pages | 21,672 ch | **323 MB** |
| PPTX | `2025_MFoDA_TCA_OXPHOS_final_for_Bb.pptx` | 11.8 MB | 151 ms | 32 slides | 13,386 ch | **144 MB** |
| DOCX | `2025_Faculty_Copy_Handout_Pain_Inflamm_Fever.docx` | 3.0 MB | 8 ms | 1 document | 6,910 ch | **90 MB** |
| PPTX | `Listening_&_Empathic_Responding_2025.pptx` | 33.5 MB | 50 ms | 25 slides | 8,788 ch | **190 MB** |
| PDF | `Orange_Book_46th_ed_-_2026.pdf` | 13.0 MB | **12,267 ms** | **2,116 pages** | 200,000 ch (capped) | **808 MB** |

**Page count drives cost, not file size.** A 33.5 MB deck parses in 50 ms; a 13 MB PDF with 2,116
pages takes 12 seconds and 808 MB. Any capacity rule written against megabytes will be wrong.

## 2. Deno runs the stack — and still does not fit

Same dependencies (`npm:unpdf`, `npm:fflate`) under Deno 2.9.4:

| Fixture | Deno time | Deno RSS | Node time | Node RSS |
|---|---|---|---|---|
| 10.8 MB / 25 pages | 190 ms | 145 MB | 368 ms | 323 MB |
| 11.8 MB PPTX | 27 ms | 93 MB | 151 ms | 144 MB |
| 13 MB / 2,116 pages | 10,131 ms | **959 MB** | 12,267 ms | **808 MB** |

Deno is *faster and leaner* than Node here, and it loads the dependencies (with a warning that
`npm:canvas@2.11.2` is a native optional dep, unused for text extraction).

**It still does not matter.** Supabase Edge Functions cap memory at 256 MB. The heavy document needs
**959 MB in Deno** — roughly 3.7× the cap — and even the modest 25-page lecture needs 145 MB, leaving
almost no headroom before the vision pass allocates page slices on top.

> **Decision: the parse does not run on Supabase Edge.** Not because Deno cannot execute the
> parsers — it demonstrably can — but because the memory ceiling is below the measured requirement.
> The database half of the recording-worker pattern (lease, backoff, cron recovery) is kept exactly;
> only the execution host changes, to a Node runtime that already runs this code today.

## 3. 🔴 A lease cannot be renewed from the thread that parses

The parsers are CPU-bound and synchronous *inside* their async wrappers, so there is no await point
for a timer to fire at. Measured with a 250 ms heartbeat across the 12.3-second parse:

| Mode | Parse | Heartbeats fired | Longest silence | Verdict |
|---|---|---|---|---|
| Inline (main thread) | 12,267 ms | **0 of 49 expected** | **12,268 ms** | lease cannot be renewed |
| `worker_thread` | 12,749 ms | **50 of 50 expected** | 253 ms | renewal on schedule |

Threading costs **~4% wall time** and buys a lease TTL that can be short. This is the difference
between "the TTL must exceed the worst document any student ever uploads" — a number we do not
control — and "the TTL is 60 seconds and a dead worker is reclaimed in 60 seconds."

> **Decision: the parse runs in a `worker_thread`; the main thread owns the lease.**

## 4. Cancellation

`extractPdfText` cannot observe an `AbortSignal` — synchronous CPU has nothing to throw at. The
worker-thread equivalent does work:

| Measurement | Value |
|---|---|
| Terminate requested at | 1,502 ms into the parse |
| Worker actually stopped at | 1,511 ms |
| **Time to reclaim** | **9 ms** |
| Parse would otherwise have taken | ~12,300 ms |

The vision path is separate and already better off: `readWithVision` accepts an `AbortSignal`
(`lib/vision/gemini.ts`), because it is network-bound and does have await points.

## 5. Storage access from outside a request

Service-role range read of a real `library-sources` object, no request context:

```
GET /storage/v1/object/library-sources/<user>/<uuid>.pdf   range: bytes=0-7
http=206  bytes=8  magic=25 50 44 46 2d 31 2e 37   (%PDF-1.7)
```

**206 Partial Content** — range requests are honoured, which is what the bounded-fetch path needs so
a size check is not paid after the bytes are already in memory.

Two incidental findings worth recording: object paths are nested (`<user_id>/<uuid>.ext`), so
`encodeURIComponent` on a whole path breaks it (a 400 the first time); and listing at prefix `""`
returns per-user folders, not files.

## 6. Gemini — not exercised here, and why that is not a gap

`GEMINI_API_KEY` exists only in the web app's Vercel Preview and Production environments, never
locally, so this spike could not call it. That is acceptable evidence-wise for one specific reason:
**the chosen runtime is the same Vercel Node runtime the current synchronous extract route already
runs in**, and that route already calls Gemini in production on every scanned PDF. Moving the call
from a request handler to a background handler in the same runtime does not introduce a new access
path.

It is still listed as an open item in the PR rather than a pass, because "should work" is not
"observed working". It gets confirmed during the controlled cutover, on a preview deploy, before the
flag is turned on.

## Summary

| Question | Answer |
|---|---|
| Dependencies run in Node | ✅ |
| Dependencies run in Deno | ✅ (warns on native `canvas`, unused) |
| Supabase Edge can host the parse | ❌ **959 MB measured vs 256 MB cap** |
| Execution time | 8 ms – 12.3 s, driven by unit count |
| Peak memory | 90 MB – 808 MB, driven by unit count |
| Lease renewable while parsing | ❌ inline · ✅ `worker_thread` |
| Cancellation | ✅ 9 ms to reclaim |
| Storage access | ✅ 206, ranges honoured |
| Gemini access | ⚠️ not exercised locally — same runtime as today's route |
