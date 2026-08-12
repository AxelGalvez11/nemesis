# Degraded parse — where the truth disappears

**Characterization only. No parser was changed to produce this document.** Measured 2026-08-12 by
`apps/web/scripts/degradation-matrix.mts`, which takes one real file per case through the whole
chain and records what each boundary still knows.

The question is not "what score does the parser get". It is:

> Starting only from what survives persistence, can Nemesis determine what it recovered, what it
> knowingly failed to recover, and whether downstream learning may safely rely on it?

---

## 0. The chain, and the five classes of loss

```
parser outcome → coverage → canonical model → parsed_documents
      → structure envelope → capabilities → source context → learning consumer
```

Every collapse below is classified as one of the owner's five, because they need different fixes:

| class | meaning | fix lives in |
|---|---|---|
| **never-recovered** | the parser never had the fact | the parser |
| **discarded** | recovered, then thrown away before storage | the write boundary |
| **hidden** | recovered *and persisted*, but the consumer's representation cannot express it | the read boundary |
| **stale-summary** | persisted correctly, but a derived column reports otherwise | the field |
| **retained-refusal** | explicitly unsupported and correctly carried as such | nothing — this is the target |

---

## 1. The boundary matrix

Eight cases. `✓` the fact is knowable here, `·` it is not, `~` knowable but only as an unlabelled count.

| fact the parser knew | parser | coverage | model | stored row | capabilities | source context | consumer verdict |
|---|---|---|---|---|---|---|---|
| there is readable text | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| units/pages exist | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| a table survived as a grid | ✓ | · | ✓ | ✓ | ✓ | ✓ | ✓ |
| a cell is *absent* vs *empty* | ✓ | · | ✓ | ✓ | · | **·** | **·** |
| a figure was FOUND | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| a figure was **not described** | ✓ | ✓ | · | ✓ | · | **·** | **·** |
| *why* it was not described | ✓ | ✓ | · | ✓ | · | **·** | **·** |
| pages were left unread | ✓ | ✓ | · | ✓ | · | **·** | **·** |
| content was seen and not converted | ✓ | ~ | · | ~ | · | **·** | **·** |
| *what kind* of content that was | ✓ | **·** | · | **·** | · | · | · |
| text was truncated | ✓ | ✓ | · | ✓ | · | **·** | **·** |
| reading order is trustworthy | **·** | **·** | · | · | · | · | · |
| the document is genuinely empty | ✓ | · | · | **·** | · | · | · |

**The single widest column of loss is `source context`.** `SourceContext` carries `capabilities`,
`quality`, `title`, `units` — and **no coverage at all**
(`apps/web/lib/sources/source-context.ts:241`). Every fact about what Nemesis *knowingly failed to
recover* is persisted correctly in `parsed_documents.coverage` and then simply does not cross into
the layer consumers read.

---

## 2. Measured, per case

| case | coverage.state | ParseQuality | what the consumer actually sees |
|---|---|---|---|
| clean 2-column PDF | `complete` | `full` | 2 units, readable — **and the columns are interleaved** |
| PDF + undescribed figure | `partial` | `full` | 4 units, 3 readable; **no hint a figure went unread** |
| image-only scan | `failed` | `failed` | 1 unit, 0 readable, `needsVision=true`, figure + geometry present |
| blank PDF | — | — | **no row is written at all** |
| XLSX + chart | `partial` | `full` | a healthy grid; **no hint a chart exists** |
| CSV, delimiter refused | `partial` | `full` | **a normal-looking 1-column table** |
| CSV, ragged row | `complete` | `full` | a grid whose short row reads as empty, not absent |
| empty CSV | — | — | **no row is written at all** |

---

## 3. Concrete collapse bugs

### C1 — coverage does not cross the extraction boundary · **hidden**

`unitsUnread`, `figures.described/skipped/reasons`, `unreadableRegions` and `truncation` are all
written to `parsed_documents.coverage` and none reaches `SourceContext`. Three separate cases above
(undescribed figure, unread chart, refused columns) all report `quality: "full"` to a consumer.

**This is one boundary and it causes most of the matrix's right-hand emptiness.** It is also exactly
why *unsupported ≠ absent* currently fails: at the consumer, unsupported content **is** absent.

### C2 — the *kind* of unsupported content is discarded · **discarded**

Both grid parsers build a labelled list — `{ kind: "ambiguous-delimiter", count: 1 }`,
`{ kind: "unsupported-number-format", count: 3 }` — and `csvCoverage`/`xlsxCoverage` reduce it to a
single integer on the way into coverage. So `unreadableRegions: 1` survives and *"a delimiter we
could not determine"* does not.

This is the one place where **the persisted evidence is genuinely insufficient**, not merely
unexposed. Everything else below can be derived from what is already stored.

### C3 — absent cell vs empty cell · **hidden**

`DocCell[]` knows a short row has no third cell; `rows: string[][]` is rectangular and pads it.
`CanonicalSourceTable` exposes only `rows`. Proven in production on 2026-08-12: the stored cells say
absent, `cellAtRef` returns `""`. Nothing throws.

### C4 — `ParseQuality: "failed"` means two different things · **stale-summary**

A scanned page (structure, geometry, a figure, no text) and a genuinely broken parse both score
`failed`. **But the evidence distinguishes them**: `needsVision(capabilities)` is `true` for the
first and `false` for the second, and the scan has a decoding model where the failure has none. The
label is too narrow; the stored evidence is not.

### C5 — broken reading order has no signal anywhere · **never-recovered**

On the generated two-column fixture the splitter does not fire: both columns merge into one block
spanning 75% of the page width, and the sentences interleave —

> "Sediment transport begins when the **Suspension becomes dominant once the** bed shear stress
> exceeds the critical **shear velocity approaches the settling** …"

— while `coverage.state` is `complete` and `ParseQuality` is `full`. Every downstream consumer is
told this document was recovered perfectly.

🔴 **Caveat, deliberately not resolved here:** this is one generated fixture. Whether the splitter
also fails on real multi-column coursework is a parser question, and this slice does not touch
parsers. The *characterization* finding stands regardless: **there is no field anywhere in the chain
that could report a reading-order problem**, so if it happens, nothing can say so.

### C6 — a genuinely empty document persists nothing · **discarded**

`empty` writes no row, so "never uploaded" and "uploaded and genuinely empty" are indistinguishable
downstream. (`no-text` was fixed in #486 and does persist; `empty` was left alone, correctly at the
time, but it means the chain cannot express *"we looked, and there was nothing"*.)

### C7 — `state=partial` and `quality=full` disagree by design · not a bug, but a gap

`parseQuality` deliberately ignores `coverage.state`, and the reasoning is sound and documented: three
undescribed figures should not mark a 197-block parse degraded. **The consequence is that neither
field alone answers "is this safe to teach from"** — and no third field combines them.

---

## 4. Authoritative vs stale persisted fields

| field | verdict | note |
|---|---|---|
| `structure` (envelope) | **authoritative** | the source of truth for everything structural |
| `coverage` | **authoritative** | complete and correct; simply unread downstream |
| `doc_kind` | **authoritative** | now guarded against the DB CHECK |
| `state` / `complete` | **authoritative** | derived in SQL from coverage, cannot disagree |
| `unit_count` | **authoritative, easily misread** | units the parser *walked*, not structure persisted. A row with `unit_count: 24` and one flat string has been seen in production |
| `visual_count` | **authoritative, easily misread** | figures **described**, not found. A scan storing 0 is correct |
| `table_count` | 🔴 **DEAD** | declared in the migration, **written by nothing, read by nothing**; every production row is 0, including a DOCX with two real tables |
| `parser_version` | authoritative | |

**Nothing may be concluded from `table_count`.** It is the one field that would actively mislead a
derivation function, which is why it must be filled or dropped before anything reads it.

---

## 5. Can one pure function produce the authoritative view?

**Yes — for everything except one input, which must first be persisted.**

`deriveParseQuality(row)` over `{ structure, coverage, doc_kind }` can already determine:

- **what content was found** — `capabilitiesOfStored(structure)`, plus the envelope's own text
- **what structure was found** — the same capability set
- **what was attempted and failed** — `unitsUnread > 0`, `figures.reasons["vision-unavailable"]`
- **what was never attempted** — `figures.reasons["not-examined"]`, which is *distinct* from failure
- **whether a second reader would rescue it** — `needsVision(capabilities)`, already pure and derived
- **whether anything was cut** — `truncation`
- **that *something* was unsupported** — `unreadableRegions > 0`

It **cannot** determine **what** was unsupported, because only a count is stored (**C2**).

### The three learning verdicts, and whether they are derivable today

| verdict | derivable now? | from |
|---|---|---|
| **safe to teach from** | ✅ yes | text present · `unitsUnread === 0` · no `extract` truncation · `unreadableRegions === 0` |
| **usable, but incomplete** | ✅ yes | text present **and** any of unread units / skipped figures / unreadable regions / truncation |
| **referenceable structure, not enough to teach from** | ✅ yes | no text **and** `semanticUnits` — the scan case, already separated by `needsVision` |
| *and why it is incomplete* | ❌ **no** | needs C2 |

So the answer to the owner's question is: **one pure function is possible now for the three-way
verdict, and a fourth output — the reason — needs one small piece of evidence that already exists in
memory and is thrown away on the way to storage.**

---

## 6. The smallest next slice

In dependency order. Nothing here improves a parser.

1. **Persist the `unsupported` kinds** (C2). Both grid parsers already build
   `{ kind, count }[]`; `csvCoverage`/`xlsxCoverage` sum it to an integer. Carry the list into
   `ExtractionCoverage` as an optional field beside `unreadableRegions` — the contract already
   permits additive optional fields, and absent reads the same as "none recorded".
2. **One `deriveParseQuality(storedRow)`** returning the three verdicts plus reasons. Pure, no new
   column, no second status to disagree with the first.
3. **Carry it across the extraction boundary** (C1) — `SourceContext` gains the derived verdict, not
   raw coverage, so consumers branch on a decided answer rather than re-deriving one.

Deliberately **not** in this slice: absent-vs-empty (C3) needs a `CanonicalSourceTable` decision;
reading order (C5) is parser work; `table_count` (already spawned separately); the empty-document row
(C6) is a route decision.

---

## 7. Calibrated tests this slice needs

Each must **fail** when the distinction is lost — that is the whole point, and two guards written
this week passed while proving nothing until they were deliberately broken.

| test | breaks when |
|---|---|
| an undescribed figure is not "safe to teach from" | coverage stops crossing the boundary |
| a scan is "referenceable, not teachable" and a blank is not | `needsVision` collapses into `failed` |
| a refused CSV delimiter reports its reason by name | the `unsupported` kind is summed away again |
| an XLSX chart reports *chart*, not just a count | same |
| `unitsUnread > 0` never reads as complete | someone consults `quality` alone |
| "not attempted" and "attempted and failed" produce different verdicts | the two figure reasons merge |
| a document with no row is distinguishable from one with an empty row | C6 is closed |
