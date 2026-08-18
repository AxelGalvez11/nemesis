# Where Nemesis spends, and why

**Status: shipped 2026-08-18 (PR #681).** This is the settled decision, not an options
paper. Every number below was measured by a script in this repository or read off
production; the scripts are named so anyone can re-run them.

The governing rule, from the owner:

> Use the cheapest operation that preserves enough information for Nemesis to make the
> correct next teaching decision. Escalate only when missing structure, uncertainty, or
> quality failure justifies more expensive compute.

And two more that shape every file below:

> Models interpret ambiguity. Code handles certainty.
>
> Cache what is stable. Retrieve instead of regenerate. Escalate the difficult part, not
> the entire workload.

---

## 1. The shape

Every subsystem obeys the same economics and keeps its own measurable conditions. There
is deliberately **no universal router** — one would make a change to PDF handling a change
to voice handling.

```
deterministic / local
    ↓ if insufficient
cheap specialised service
    ↓ if insufficient
cheap general model
    ↓ if insufficient
stronger / specialised model
```

The one rule with no exceptions: **nothing calls a model to decide whether to call a
model.** Every routing decision in this document is arithmetic over characters,
rectangles, counts and hashes.

---

## 2. Documents

### 2.1 What it used to do

`parseDocument` gave the vendor first refusal on every file it handled:

```ts
if (vendorFor(kind)) {                       // pdf → mistral, docx/pptx → llamaparse
  const read = await parseWithVendor(…)      // billed per page, before a local byte
  if (read) return read
}
```

A clean, digitally generated lecture with a perfect text layer was sent to Mistral OCR and
billed per page for a result the file already contained. Mistral and LlamaParse earned
their positions on real evidence and keep them for the documents that evidence is about;
what was never true is that *every* document is one of those.

### 2.2 What it does now

**PDF** (`lib/pdf/preflight.ts`). The file's own structure is read first — free, local,
and a pass the vendor lane was already paying for a *second* time inside
`readFigureSource`. `preflightPdf` then names a reason before anything is billed:

| Signal | Route | Why the specialist is worth it |
|---|---|---|
| the structural reader threw | vendor, whole | no structure, no figures, no geometry to judge |
| >0.2% of characters are replacement / control / private-use glyphs | vendor, whole | the text layer decodes to a private alphabet |
| >0.2% of words carry a digit inside them | vendor, whole | the broken-ligature scar (`ac1on`, `contraindica1ons`) |
| any ruled region produced no grid | vendor, whole | a lost table is content the learner never sees |
| every page has no text layer | vendor, whole | the whole document is pixels |
| some pages have no text layer | **cheap page lane** | already escalated page-wise, to Gemini, under a ledger |
| …and the ledger cannot pay for them | vendor, **page-wise** | only the pages the cheap lane cannot cover |
| none of the above | **native** | nobody is paid |

**Calibration** (`scripts/make-preflight-corpus.mjs` → `scripts/preflight-calibrate.mts`).
Clean documents sit at a corruption and scar share of **0.00000**; the broken-font class
sits at **0.02535**. Both thresholds sit an order of magnitude clear of each edge, and
`preflight.test.ts` fails if either edge moves into the gap.

**Result: 10 of 13 corpus files (76.9%) avoid the paid parser.** Escalated documents also
got cheaper *and* faster, because the second full structural pass is gone.

**DOCX and PPTX** (`lib/notebooks/office-preflight.ts`). `judgeMistralRead` already asked
"did the vendor's read lose something the file declares?" and threw the vendor's answer
away when it did — so production was paying for reads whose outcome was decided before the
call. `preflightOffice` asks the same question of *our* read, first, using the same gate.
For PPTX the decision happens **before a single figure is sent to vision**.

**Result: 8 of 8 real OOXML files stay local** — 12/12 Word tables, 4/4 Word pictures, 8/8
deck pictures, 19,281 characters of speaker notes, all recovered natively
(`scripts/make-office-corpus.mts` → `scripts/office-calibrate.mts`).

**XLSX and CSV** are unchanged: exact cells, formulas, merges and references were never
going to an optical model, and no evidence suggests they should.

### 2.3 Page-level escalation, and why it is safe

The owner's constraint: *do not ship it unless provenance, page numbering, citations,
tables, figures and reconstruction remain correct.* Exactly one cause survives that test —
a page whose entire content is a picture, which continues nothing from the page before it
because there is no text layer to continue from.

`pageEscalationSafe` encodes that. A broken font is a property of the *document*; a table
can span a page break; a structural read that never happened has no page list. All three
escalate whole.

`remapUnits` translates the slice's page numbers back to the document's, and is tested
from both directions — a slice sent as pages 12, 19 and 31 comes back as pages 0, 1 and 2,
and filing that reply without translating it produces a document that is well-formed,
self-consistent and wrong everywhere a citation points.

**The finding worth recording: page-level escalation was already shipped in Nemesis.**
`readPdfPagesWithVision` + `withVisionText` cut exactly the thin pages out with pdf-lib,
read them, and splice each transcript back under its own original page number. The
mechanism was never missing. What made it moot was the whole-document vendor call running
ahead of it.

### 2.4 The check on the cheap route

`lib/notebooks/parse-shadow.ts`. A cheap parser saying "good enough" is only safe if
something checks. A sampled fraction of cheap-route parses also go to the vendor,
afterwards, for comparison only.

* **bounded** — `claim_parse_shadow_run` takes one of the day's slots in SQL, so two
  workers cannot both spend the last one
* **observable** — every run writes a row, including the ones that find nothing; a
  false-pass *rate* is meaningless without its denominator
* **never the learner's result** — the parse is recorded and the placement linked before a
  shadow byte is sent
* **switchable** — `PARSE_SHADOW_RATE=0`, no deploy
* **not permanent** — nothing in the routing path reads these rows

The comparison is by **kind**, not by character count. `serious` means the cheap read has
*none* of a kind the vendor found, or is missing most of the text at the ratio the measured
failures actually sat at (1.85× on the drug chart, 2.9× on the speaker-notes deck). Finding
one more list item is `minor`, because a rate that counts style differences as losses is a
number nobody can act on.

The sample is drawn from the content hash rather than a random number, so it is a stable
uniform subset: the same file is always in it or always out.

### 2.5 Parse once

`parsed_documents` has been keyed `(user_id, content_hash, parser_version)` since the day
it was created, under a comment saying exactly what the key is for. But
`record_parsed_document` consults it at **write** time, which deduplicates the row and not
the work.

Production the day this shipped: **21 sources carry a hash, 19 of the hashes are
distinct.** One upload in ten was being paid for twice, in a library of twenty-one files.

Both lanes now ask before spending. A failed parse is never reused — that would make one
bad day permanent, with every retry finding the failure and declining to try. A partial
parse *is* reused: it is a resting state, not a failure.

**Per user, deliberately.** Cross-user deduplication is the obvious next saving and is not
taken: it would mean one person's parse becoming the answer served to another, which is a
change to what user data is rather than an optimisation.

---

## 3. Teaching

### 3.1 Focused retrieval

`groundingBlock` sends up to **120,000 characters** — about thirty thousand tokens — and
nine of the twelve canvas prompt builders called it. Three of those read the whole document
once to produce something durable (the lesson, the knowledge territory, the causal
extraction) and keep doing so. The other six run **every turn**.

`lib/learn/canvas-focus-material.ts` picks a turn's material from three facts the document
already carries, in this order:

1. **the citations the page itself made** — every block declares the excerpt ids it was
   built from, so the blocks teaching an objective *name* the evidence behind it. Exact,
   not a heuristic.
2. **their neighbours in reading order** — a prerequisite usually sits immediately before
   the thing it is a prerequisite for.
3. **vocabulary overlap** with the objective, the question and the learner's own words,
   through the same `contentWords` matcher course filing already uses.

Deterministic and free. An embedding call or a "which excerpts matter" model step would
spend money on every turn to save money on every turn.

Citations are never dropped for a weaker match, reading order is restored before rendering,
a turn with nothing to go on still gets material rather than none, and the omission is
stated in the prompt so a model holding a subset is never set up to invent a citation.

**Measured on production:** 24 canvases, 14 carrying material, **average material shipped
per turn 13,481 characters**, worst case the full 120,000 cap. The per-turn ceiling is now
**12,000**, and the average selection is well under it.

### 3.2 Prompt caching

Providers price a request by its longest common prefix with a recent one; DeepSeek's cached
input is **$0.0028/M against $0.14/M — fifty times cheaper**, and `llm-cost.ts` already
bills the two shares separately.

Before: a ~630-character identity in the system message, then the most volatile sentence in
the request at the top of the user message, and ~2,500 characters of block shape, term
rules, visual rules and citation rules — byte-identical on every turn — sitting after it,
uncacheable.

After: each job's invariant rules move into its system message. The teaching prompt's stable
prefix is **2,566 characters, byte-identical across turns**, with `CANVAS_SYSTEM` first so
the identity is a common prefix *across* jobs too.

Nothing is reworded. Nothing volatile is frozen — a scope of block ids and an objective id
inside a JSON schema both stay in the user message, because freezing either would be a
teaching change wearing a cost justification.

### 3.3 Model escalation

Canvas cognition already ran on the cheapest path. What it had no way to do was escalate,
so a turn the cheap model got wrong was a dead end the learner read as "try again".

Two named reasons, both failures the system already detects on its own:

* `cheap-model-unusable-output` — the answer did not survive the parser the caller was
  going to run anyway
* `judgement-did-not-settle` — the judge came back below `TRUSTED_ENOUGH_TO_UPDATE_STATE`,
  so by construction its verdict may not move what Nemesis believes about the learner; the
  turn produced an observation and no claim

**Deliberately not a reason: repairing a misconception.** It is the most tempting candidate
and there is no measurement that a stronger model does it better.

The rescue rung is `deepseek-reasoner`, which the valve maps to the **same Flash model with
thinking enabled at the same per-token price** — so the whole cost is the reasoning tokens.
A cascade that jumped to `deepseek-v4-pro` would skip a rung costing almost nothing for one
at 3.1× input and output.

**A plan raises the ceiling on rescues and never the default.** An ordinary turn uses the
cheap model on every plan, asserted on all of them.

---

## 4. Vision

The triage was already right — `planFigureVision` routes on structure rather than on
subject matter, `VisionLedger` reserves before spending, and per-document and per-user-day
caps have been in SQL since `20260815T10`.

What was missing: **nothing reused an answer.** Every parse sent every qualifying figure
again — a reparse after a parser upgrade, the same diagram on a lecture's summary and recap
slides, the same figure in the handout and the deck, the same crest on eighty files.

`figure_descriptions` is keyed on `figureContentKey` — a hash of the *normalized* pixels,
the same identity the figure asset store already uses, so a TIFF and a PNG of one diagram
converge on one row. Per learner.

**The cache is consulted before the ledger is debited.** A figure we already know about
costs neither a call nor a unit of the document's budget, so a deck of repeated diagrams no
longer exhausts its allowance on pictures it has answers for.

The parse runs on a worker thread that holds no credentials by design, so it asks over the
port it already uses and the parent answers from the database. An unanswered question is a
miss after two seconds, never a hang. An empty stored description is a miss too: storing
"the model had nothing to say" would freeze one bad reply into every document that picture
ever appears in.

---

## 5. Audio and voice

Already close to right: batch rather than streaming, cheapest-viable provider first
(xAI at $0.10/hr ahead of AssemblyAI at $0.17/hr), speech-to-speech never used as the
brain, TTS capped at 600 characters and enforced server-side.

What was missing was the **top rung**: an existing device transcript. Every rung Nemesis had
was a paid provider. `nemesis-transcribe` now accepts a `deviceTranscript` and, when it is
trustworthy, uses it — nothing is sent anywhere, no provider is billed, and the reservation
is settled at **zero seconds** so the learner's paid allowance is returned in full.

"Trustworthy" is a measurement, not a claim. Accepting a bad transcript is permanent: the
audio object is deleted the moment one is accepted. The floor is **four characters per
second**, about a third of the slowest ordinary delivery — it accepts a quiet seminar with
long pauses and refuses a transcript that stopped after the first minute.

---

## 6. Web grounding

A chat turn that searched, a follow-up that searched the same thing and a reload that
searched it again were three billed searches for one question, and nothing looked.

`nemesis-search` now checks a per-learner cache first. **The window is twenty minutes, not
a day**, because this lane also serves questions about *now* — a longer cache would answer
today's news with yesterday's.

A cache hit is **recorded and not metered**: the event is written so the hit rate is
countable, and the learner's daily and monthly unit counters are untouched, because a search
nobody paid for must not spend somebody's allowance.

The Canvas never searched the web — every canvas route decision carries `searchWeb: false`,
so canvas grounding comes from durable sources only. Course material and external evidence
stay distinct by construction.

---

## 7. Deterministic rendering

Unchanged, and it was already right. `canvas-visual.ts` accepts a constrained *semantic*
request — an equation, a relationship graph, a quantitative series — and trusted renderers
own every pixel. The model never supplies HTML, SVG, Mermaid, JavaScript or renderer
configuration, and `visual-route.ts` answers `prose` for most knowledge because most
knowledge needs no picture. No image model is in the teaching path at all.

---

## 8. Bounds

Every expensive subsystem now has one.

| Subsystem | Bound | Where |
|---|---|---|
| vision | per-document units, per-user daily units, reserve-then-settle | `20260815T10` |
| **paid parsers** | **per-user daily documents, claimed in SQL** | **`20260818T40`** |
| page-wise escalation | 24 pages | `MAX_ESCALATED_PAGES` |
| shadow evaluation | daily slots claimed in SQL, size cap, sample rate | `20260818T20` |
| model escalation | per turn (one), per session (by plan) | `canvas-escalation.ts` |
| model tokens | daily + monthly, by plan | `nemesis-llm` |
| web search | daily + monthly units, by plan | `nemesis-search` |
| TTS | 600 characters, enforced server-side | `nemesis-speak` |
| STT | 3 hours per recording, monthly seconds by plan | `nemesis-transcribe` |

**Every one fails safe towards the learner.** Past the parser cap a document is read
locally, with coverage saying honestly what it could not recover — never refused. A failed
vendor call leaves a readable document behind. A cache that cannot be read is a cache that
misses.

---

## 9. Telemetry

`usage_events` already carried `cost_usd`, `price_rev` and `provider` for the model valve
and for search. A parallel costs table would mean two answers to "what did this month
cost", so this **extends** it rather than replacing it.

What was missing:

1. **Three providers counted nowhere.** Mistral OCR and LlamaParse are billed per page and
   no column, log line or metric had ever recorded a page of either. Gemini vision was
   counted in *units* with no price attached anywhere.
2. **A scope.** Every existing row is keyed to a person and a day, so "why did this lecture
   cost forty cents" had no query behind it.

`ai_spend_report` now answers by learner, day, provider, operation, source and canvas.

Spend rows carry `cost_credits: 0` on purpose — `usage_events` serves both the learner's
meter and our bill, and a non-zero value would silently spend somebody's entitlement on work
they never asked for (a shadow evaluation, most obviously). An unknown provider reports as
**unpriced** rather than as $0.00, and unpriced calls are counted separately instead of
summed as zero.

---

## 10. What would change these decisions

* **The PDF thresholds** move if `scripts/preflight-calibrate.mts` over a larger corpus
  shows the gap closing. Today it spans 0.00000 to 0.02535; a threshold inside a narrower
  gap is a number chosen to fit two documents.
* **The Office decision** moves if `parse_shadow_evals` shows a `serious` rate above noise
  on `native-read-sufficient`. It is a claim that nothing measurable is missing on *this
  file*, not a claim that our parser is better.
* **Cross-user parse and figure deduplication** is the next large saving and is an owner
  decision, not an engineering one: it changes what user data is.
* **`repair_misconception` as an escalation reason** becomes defensible the moment
  `strategy-outcomes.ts` can show a difference.
* **The vision price** (`UNIT_PRICE_USD.gemini_vision`) is the row to distrust first: Gemini
  bills images as input tokens, so a per-image price is an average over a token count that
  varies with resolution.
