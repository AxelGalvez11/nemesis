# Document normalization

**Goal, in one sentence:** store the smallest canonical representation that preserves all
academically meaningful content and acceptable visual fidelity.

Not "compress everything as hard as possible". The objective is bounded by what a student needs to
be able to read, cite and inspect.

---

## Why this exists — the measurement that started it

A real PHCY lecture, 37 ordinary slides, weighs **118.1 MiB**. Nothing about its content is unusual.

| | |
|---|---|
| `ppt/media` | 117.9 MiB — **99.9% of the package** |
| TIFFs | 57, totalling 113.6 MiB, **29.7 megapixels**, 4.01 bytes/pixel |
| TIFF encoding | all 57 **uncompressed**, chunky, photometric RGB |
| alpha | 53 fully opaque · 3 genuinely translucent · 1 three-channel |
| zip method | **all 68 media entries STORED — method 0, never deflated** |
| other media | 8 PNG, 2 JPG, **1 `.m4v` video** |

The file is **uncompressed twice over**: raw pixels inside zip entries that were never compressed
either. Re-deflating the identical bytes gives:

```
level 9 → 24.0 MiB in 7.5 s     (20.4% of original)
level 6 → 24.2 MiB in 2.4 s
```

**118.1 MiB → 24.0 MiB with every pixel bit-identical.** No quality judgement, nothing to argue
about in a fidelity gate. This lecture is the acceptance fixture for Tier 1.

---

## The tiers

Tiers are decided **per asset**, not per document. A deck can have one image at Tier 1 and another
at Tier 0 in the same pass.

### Tier 0 — already efficient

Detect and skip. Do not recompress for negligible savings.

Rule: estimate the saving before doing the work; if it is below **both** 10% of the package **and**
1 MiB absolute, do nothing and record `tier: 0`. For a zip this is answerable from the central
directory alone (compressed vs uncompressed size per entry) without inflating a byte.

Never touch an already-efficient asset merely because another codec exists.

### Tier 1 — lossless. Runs automatically whenever meaningful savings exist.

- efficient OOXML zip repacking (the big one — see the measurement above)
- TIFF → lossless PNG/WebP where it pays
- lossless PNG optimization
- remove redundant thumbnails, previews and cache artifacts
- deduplicate identical embedded assets **within** a document
- remove non-semantic metadata where safe
- PDF object-stream and image optimization **without rasterizing text or vectors**

Must preserve, and the verification gate checks each: extracted text, document structure, tables,
equations, speaker notes, links, vectors, transparency, audio/video, and the decoded raster pixels.

### Tier 2 — conservative perceptual compression

**Not implemented, deliberately.** Runs only after Tier 1 and only where it produces substantial
further savings without harming academic usability. Photographic images may be recompressed at
visually lossless quality; screenshots, diagrams, plots, equations and text-heavy figures usually
stay lossless. Transparency preserved where needed. No generational recompression.

🔴 **Do not build a lossy encoder until Tier 1 is proven and real files show Tier 2 is necessary.**
On the fixture above, Tier 1 alone reaches 24.0 MiB, which is cheap enough to render, parse, OCR and
retrieve from. Chasing a smaller number from there costs fidelity risk and buys nothing.

### Tier 3 — aggressive lossy. Unusual and policy-gated.

Very high-resolution photographic assets far above their displayed resolution; oversized embedded
lecture video; oversized speech audio. Whatever survives must still let a student inspect figures,
diagrams and text comfortably.

### Tier 4 — removal of source content. **This is not compression.**

`apps/web/lib/workspace/office-slim.ts` deletes every image from an oversized Office file so its
text can still be read. That is destructive degradation wearing compression's clothes, and today it
happens **silently**, in the browser, before upload
(`apps/web/lib/workspace/chat-attachments.ts:342`).

Under this policy it is the absolute last resort, and if it runs it must persist and expose:
assets removed, asset types, reason, and the resulting limitations. **The system must not later
answer questions as though the source were complete.**

On the fixture, slimming would have discarded all 57 figures to save a file that Tier 1 shrinks to
24 MiB with the pictures intact. So Tier 1 does not merely optimize — it recovers content the
current fallback destroys.

---

## Verification — a semantic diff, never "the file opens"

Run the real parser over the original and over the derivative and require equality of:

- slide / page / sheet counts
- extracted text, block for block
- tables, cells, formulas
- speaker notes
- hyperlinks
- media count (unless an intentional safe transform changed the representation, which is recorded)
- raster dimensions and decoded pixel content — **for Tier 1 these must be identical**
- every source locator
- full parser-output equivalence

**If verification fails, the original is kept and used, and the failure is recorded.** Never a
half-applied derivative.

---

## Storage lifecycle

```
upload original
  → normalize
  → verify fidelity
  → promote normalized file to canonical source
  → retain hashes + transformation metadata
  → keep original for a short rollback window
  → delete original after the policy window
```

For any **lossy** normalization the original is preserved indefinitely unless a policy says
otherwise.

🔴 **Recommendation: ship every step except the deletion in v1.** Deleting originals is
irreversible, and the standing constraint on this project is "I don't want a Library action capable
of accidentally destroying retrieval data." The rollback window is worth having; the automated
delete should be a separate, later, explicitly-enabled change, once the verification gate has been
watched holding on real files. Storage is cheap relative to an unrecoverable mistake.

### Idempotence

Re-ingesting an already-normalized source must not recompress it. Two mechanisms, both cheap:

1. Tier 0 detection alone makes a second pass a no-op — our own output is efficient by construction.
2. The normalized hash is recorded, so a file whose content hash equals a known `normalized_hash` is
   recognised as our own output and skipped outright.

### Provenance — persisted for every source

`original_hash`, `normalized_hash`, `original_bytes`, `normalized_bytes`, `normalizer_version`,
codecs and transforms used, assets transformed, assets skipped **and why**, whether every transform
was lossless or lossy, and the verification result.

Parse identity becomes `(user_id, content_hash, parser_version, normalizer_version)` — two
normalizer versions can produce different derivatives from the same original, so the normalizer
version has to participate or a stale parse is silently reused.

🔴 `content_hash` stays the hash of the **ORIGINAL** bytes. That is what makes a citation refer to
the logical source rather than to an implementation detail, and it is what keeps deduplication
anchored to what the student actually uploaded.

---

## Deduplication — and a privacy limit on it

Identical complete uploads must not consume storage twice; identical normalized derivatives should
be reusable. `library_sources` already carries `content_hash` with an index on
`(user_id, content_hash)`.

🔴 **Deduplication stays account-scoped, and that is a deliberate ceiling on the savings.** The
standing rule on this project: *"Do not introduce a global fingerprint lookup that can reveal,
directly or indirectly, whether another user has uploaded the same material."* A cross-account
content-addressed store is exactly such a lookup — even without exposing an API, a
storage-write-skipped timing difference leaks membership. So "storage saved globally" will be lower
than a naive design would report, on purpose.

Asset-level deduplication of repeated embedded media **across** documents is a later evaluation, and
must not complicate the first implementation.

---

## Security — mandatory, not optional

Raising the upload ceiling to 200 MiB raises what may be **stored**. It raises nothing else.
`MAX_INLINE_UPLOAD_BYTES` stays at 4 MiB; bytes still travel browser → storage → server, and the
server reads them back **from storage**. No handler may buffer a whole 200 MiB file because the
ceiling moved.

- content-based type validation — never extension or MIME alone
- zip / decompression bomb bounds
- total expanded-size cap
- entry and media count caps
- per-asset size cap
- nested-archive protection
- bounded CPU, memory and wall-clock
- **fail closed on a malformed container** — keep the original, record the failure

---

## Metrics

Instrumented so these are answerable: original bytes uploaded, canonical bytes stored, compression
ratio by format, Tier 1 savings, Tier 2 savings, normalization failure rate, share of sources
requiring destructive fallback, and storage saved per user and globally (subject to the
account-scoped dedup limit above).

---

## Status

| piece | state |
|---|---|
| upload ceiling 200 MiB (bucket + `MAX_SOURCE_BYTES`) | ✅ applied, `527d19ee` |
| XLSX storable at all | ✅ applied — the bucket allowlist had no spreadsheet entry |
| project-wide Supabase upload limit | 🔴 **still 50 MiB.** Dashboard → Project Settings → Storage. Measured: 49 MiB OK, 55 MiB `EntityTooLarge` |
| Tier 0 detection | 🔴 not built |
| Tier 1 lossless repack | 🔴 not built — measured at 118.1 → 24.0 MiB on the fixture |
| Tier 2/3 | 🔴 deliberately not built |
| Tier 4 disclosure | 🔴 `office-slim.ts` still removes figures silently |
| verification gate | 🔴 not built |
| provenance + metrics | 🔴 not built |
| lifecycle / original deletion | 🔴 not built — recommend deferring the delete |
