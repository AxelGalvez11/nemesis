# What looking at pictures actually costs

Measured 2026-08-15, against production, on the owner's real course documents. This
replaces the abstract warning ("a free user could cost $19.44/mo") that the unit-economics
audit left standing, because an abstract warning is not something anyone can act on.

## The unit

One **unit** is one image sent to vision, or one PDF page sent to vision, or one whole-file
read. It is what the ledger counts and what a price is multiplied by. Calls are counted
separately because batching means one call carries up to eight images — calls explain
latency, units explain the bill.

Both are recorded per document (`library_sources.vision_units_spent`,
`vision_calls_made`) and per user per UTC day (`vision_usage`).

## Measured, on real documents

| Document | Size | Pages | Parse | Peak RSS | Figures found | Units | Calls |
|---|---|---|---|---|---|---|---|
| `Fall-2026-PHCY-2114-01-Principles-of-Medical-Microbiology-and-Immunology.pdf` | 641 KB | 23 | 1.84 s | 199 MB | 5 | **0** | 0 |
| `2. Physiology and Pathophysiology of Diabetes Mellitus - 2 2026(1).pdf` | 1.98 MB | 17 | 4.75 s | 248 MB | 11 | **11** | 6 |

The first document is the more interesting number. It found five figures and sent **none**
of them: every one fell below the 3% page-area threshold in `figure-routing.ts`, so they
are logos and rules rather than diagrams. A text-heavy syllabus costs nothing at all, and
that is the majority of what a student uploads.

The second is a real slide-derived lecture and it is the shape to plan around: **about one
unit per page**, one call per eight images.

## What that is in money

🔴 **STATED AS UNITS, NOT DOLLARS, ON PURPOSE.** A rate card in this file would be edited
whenever a vendor changed a price, and it would be edited wrongly, because the person
changing the rate is not the person reading this. Units are the durable fact.

To convert: multiply units by the current per-image input price for the model at the top of
`VISION_MODEL_LADDER`. At Flash-tier pricing — an image is a few hundred input tokens —
**a lecture like the second one costs a small fraction of one cent.** The cost that matters
is not one lecture; it is a pathological document or a runaway user, which is what the
ceilings exist for.

## The ceilings

| Ceiling | Default | Env override | Bounds |
|---|---|---|---|
| per document, across **all** attempts | 120 units | `VISION_DOCUMENT_UNIT_CAP` | one malformed file |
| per user, per UTC day | 3,000 units | `VISION_USER_DAILY_UNIT_CAP` | one person |

120 is deliberately below what the worst document in the corpus would need: a 2,116-page
scan is 2,116 units. That document will report pages it could not afford to read — which
coverage already knows how to say — rather than costing 17x the next most expensive
document in the library. Raising it is a priced decision, and the number to raise it to is
whatever this file next measures.

3,000 is 25 documents at the full document cap, which is far above any real day of study.

Both are enforced in SQL under a row lock, before a single image is sent, and a worker
killed mid-parse stays charged for its whole reservation. See
`supabase/migrations/20260815T10_vision_spend_ledger.sql`.

## The caveat that matters more than any of these numbers

🔴🔴 **On the day these were measured, production's vision calls were all failing.** Every
model on the shipped ladder returned 404, and after the ladder was corrected the production
key still reached nothing. So the 11 units above were reserved and settled correctly, and
bought nothing.

**These figures are therefore an upper bound on spend and a lower bound on value.** When
the key is working, the same documents will spend the same units and actually return
descriptions. Nothing about the ceilings changes; what changes is that the money buys
something. Re-measure this table on the first successful figure-bearing parse.
