# End-to-end capability audit — what Nemesis actually does

**2026-08-16.** Run against the serving commit `fed263b2`, over the real production corpus, using the
real pure functions and the real teaching controller. Nothing here is a fixture and nothing is
estimated. Where a lane produces nothing, that is printed as a measurement rather than left out.

Reproduce with:

```
cd apps/web
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_KEY=... pnpm exec tsx scripts/capability-audit.ts
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
  pnpm exec tsx scripts/capability-audit-behaviour.ts
```

> **This is an audit. Nothing here was fixed.** Every finding is recorded as found. Three other
> workstreams were touching adjacent files at the time of the run, and a repair made mid-audit would
> have made the numbers unattributable.

---

## The one-sentence answer

Nemesis reliably turns **grids, numbered lists and labelled diagrams** into things to learn, and the
teaching controller decides between them competently — but almost nothing it learns comes from
**prose**, so seven of its ten kinds of knowledge and eleven of its fourteen ways of asking a question
are never reached on real material, and its measure of what matters has almost no range to it.

The most useful thing found: the part that *does* read prose is **built, working, and two defects
from reaching a learner** — it is not missing.

---

## 1. What survives ingestion

Six real production documents, chosen for spread of **shape** (see the corpus caveat in §7).

| Document | Shape | Units | Figures found / described | Knowledge | Objectives |
|---|---|---:|---:|---:|---:|
| Diabetes lecture 2 | lecture PDF | 275 | 8 / 0 | 46 | 95 |
| SOAP heart failure | slide deck PPTX | 188 | 9 / **9** | **0** | **0** |
| Derailleur gearing | spreadsheet XLSX | 4 | 0 / 0 | 52 | 93 |
| Pharmacogenomics problem set | Word DOCX | 45 | 0 / 0 | 61 | 116 |
| Exam 4 equation sheet | PDF | 4 | 0 / 0 | **0** | **0** |
| Immunology lecture | lecture PDF | 198 | 4 / 0 | 83 | 168 |
| **Total** | | | | **242** | **472** |

### 1.1 🔴 The headline: the deterministic extractor cannot read prose

`readKnowledgeObjects` has exactly **three** lanes:

1. **tables** — grids become associations and classifications
2. **figures** — labelled diagrams become spatial knowledge
3. **numbered lists** — become procedures

Running sentences produce nothing *here*. The measurement that proves it: the SOAP heart-failure deck
parsed **completely** — 188 units, 9 figures found and all 9 described — and the extractor returned
`refusals: no-tables=1` and **zero** knowledge objects. A learner who uploads that lecture gets a
canvas with nothing on it.

> **Correction, made during this audit.** An earlier draft of this document said "nothing anywhere
> reads sentences." That is **false**, and the Causal workstream falsified it with end-to-end
> measurements while this was being written. A model-driven prose lane does exist — deliberately
> outside `readKnowledgeObjects`, which is kept model-free so downstream failures stay unambiguous —
> at `mechanismsFor` → `constructCausalKnowledge` → `parseCausalTerritory` → `validateCausalEdges`.
> It runs on every canvas open, and driven end to end today it returned grounded causal knowledge
> with verbatim quotes anchored to real units. See §1.3 for why it nevertheless produces nothing in
> production. The correction matters because it changes the recommended work from *"build a prose
> extractor"* to *"repair the one that exists"*.

The deterministic gap is still real, and it still explains the six other empty types below.

### 1.2 🔴 Seven of ten knowledge types are never produced

Across all 242 objects from all six documents:

| Type | Count | | Type | Count |
|---|---:|---|---|---:|
| association | 191 | | causal | **0** |
| classification | 48 | | algorithm | **0** |
| procedure | 3 | | conceptual_system | **0** |
| | | | spatial | **0** |
| | | | temporal | **0** |
| | | | conditional_rule | **0** |
| | | | synthesis | **0** |

The types that are missing are precisely the ones that live in prose: causes, systems, sequences in
time, "when this rule applies and when it doesn't."

### 1.3 🔴 Zero causal edges corpus-wide — a reachability failure, not a missing extractor

Not one cause-and-effect relation from any of the six documents (the Causal workstream confirmed the
same over fourteen parses: association 295, classification 82, procedure 3, causal **0**).

The extractor is **not** missing, and it is **not** a precision problem. Driven end to end today
against the owner's real diabetes lecture it produced validated, grounded causal knowledge — quotes
anchored to real units, e.g. *"an alteration in the synthesis, release, or function of endogenous
insulin — causes — impairment in the ability to maintain normal glucose homeostasis"*. Two measured
defects stop that ever reaching a learner:

1. **The seam.** `mechanismsFor` is handed the canonical parses as `contexts`, declares them, and
   **never reads them** — it passes `canvas.sources` instead. Those stored excerpts are stale: **555
   of 790** production canvas excerpts carry no `unitId`, and an excerpt with no unit is refused as
   unanchorable. On **4 of the 11** canvases holding material every causal edge is refused before the
   model's reading is even consulted — and those four are the real lectures.
2. **Non-determinism.** `CAUSAL_EXTRACTION_TEMPERATURE = 0` is documented as mandatory for this lane
   and has **zero callers**; the chat transport has no temperature field at all. Measured on an
   identical prompt and document: 6, 7, 10, 16, 26 and 37 edges across runs.

The lane has completed exactly **once** in all of production, and the single causal row in the
database is a synthetic test sentence.

### 1.4 Three of fourteen ways to ask a question are reachable

Of `CognitiveOperation`'s fourteen values, real material produces objectives with only three
capabilities: **recall** (242), **discriminate** (53), **sequence** (9). `predict`, `explain`,
`calculate`, `reconstruct`, `locate`, `diagnose`, `synthesize`, `apply`, `inspect`, `classify` and
`revise` are never reached.

### 1.5 Objective quality is visibly poor where the procedure lane fires

Real labels produced from the real documents:

```
Where SCREENING AND DIAGNOSIS starts
Step 2 of SCREENING AND DIAGNOSIS
Where a. ANTIMUT requires activation by CYP2D6, so genetic differences cou…
```

The procedure lane is treating a section heading, and a prose answer inside a problem set, as if they
were the steps of a protocol. These are stageable objectives — a learner can be asked them.

By contrast the grid lane produces good ones, including on the non-pharmacy document:

```
Given Chainring teeth, produce Gear ratio
Given Gear ratio, produce Chainring teeth
Given Cassette cog teeth, produce Gear ratio
```

---

## 2. Does Nemesis know what is important?

**Barely.** Across 242 objects:

| Standing | Count | Share |
|---|---:|---:|
| central | **1** | 0.4% |
| supporting | 36 | 15% |
| peripheral | 89 | 37% |
| **no reading at all** | **116** | **48%** |

Nearly half the corpus could not be placed in its own document (`cue-not-traceable`), and of the half
that could, exactly **one object in six documents** is rated central.

### 2.1 🔴 Why: emphasis is recovered from no document at all

Every single document reports the blind spot `emphasis-not-recovered` — 22, 31, 25, 48 objects
respectively. Bold, highlighting and typographic emphasis is the strongest and most direct statement a
lecturer makes about what matters, and it survives ingestion on **none** of the six.

`central` requires two independent observations agreeing. With emphasis gone, the observations
available are mostly heading position and repetition, and two rarely agree. The design is right —
one count promoting "Campus" or "Instructor" above a diagnostic threshold is a real failure the
corroboration rule prevents — but the input it needs is not arriving.

The practical consequence: **the high-yield ranking cannot currently be built on this signal**,
because on real material the signal is almost constant.

---

## 3. Can the controller even see the important material?

The model is briefed on at most **40** objectives per turn (`BRIEF_LIMIT`, added to bound a measured
~59,000-token prompt). `windowOf` orders un-acted-on before acted-on, then slices.

**Importance is not consulted anywhere in that ordering.**

| Document | Stageable | Briefed | Never seen on a turn |
|---|---:|---:|---:|
| Immunology lecture | 168 | 40 | **128** |
| Pharmacogenomics problem set | 116 | 40 | **76** |
| Diabetes lecture 2 | 95 | 40 | **55** |
| Derailleur gearing | 93 | 40 | **53** |

On the diabetes lecture the two central objectives happen to fall inside the window. That is luck of
array order, not design — nothing arranges for it.

**So the window, not the model, is the real gate on high-yield behaviour.** Even a perfect importance
signal would not change what gets taught until the window is ordered by it.

---

## 4. Figures

### 4.1 Describing a figure and being able to teach from it are different capabilities

The SOAP deck is the proof: **9 figures found, 9 described, 0 knowledge objects.**

`figuresFromUnits` requires `unit.figure.labels` — a structured list of named parts — and
`isOccludable` refuses anything with fewer than two. A description is prose; labels are a separate
machine-readable line the vision reply must also carry. A perfectly described diagram with no label
line teaches nothing.

So the figure chain has **two** broken links, not one:

1. On the Mistral OCR lane, figures are not described at all (0 of 8, 0 of 4) — the known defect, with
   an agent on it.
2. On the vendor lane, figures **are** described (9 of 9) and still produce no knowledge, because
   labels are absent.

Fixing the first does not fix the second.

### 4.2 🔴 Generating a diagram is not a move Nemesis can make

The controller's action space is eleven verbs: ask, probe, teach, simplify, correct, contrast,
harder, easier, advance, defer, revisit. **None of them produces a visual.** There is no
diagram-generation capability anywhere in `lib/learn`.

The question "should Nemesis draw a diagram here?" therefore cannot be asked, let alone answered by
the model. Reusing a *source* figure is built (`figure-knowledge.ts` → `locate` objectives →
`FigureOcclusion`); generating a new one is not.

---

## 5. "Teach me X" with no document

`?ask=<topic>` from the front door lands in `beginOrAnswer`:

- If the text reads as an ordinary question → it is answered as **chat** (`session.askGeneral`).
- Otherwise → `session.begin(topic)`, which sets the canvas **title** and opens it.

With no sources attached, extraction has nothing to run on: zero knowledge, zero objectives.

**Web search already exists.** `askCanvasChat` calls `shouldSearchWeb` and, when it fires,
`searchWebContext` — real retrieval, with sources returned alongside the answer. What it produces is
**prose set aside for reading**: no knowledge objects, no objectives, no path into the Canvas policy.

So the missing piece is not search. It is **search → knowledge substrate**. The architecture the
owner sketched — *information → knowledge substrate → adaptive Canvas*, ingestion source varying and
engine fixed — is exactly what the code is shaped for, and the first half of the second ingestion
source is already built and paid for.

(Related, found by the PR triage running alongside this audit: `shouldSearchWeb` currently matches
*"who are you"*, so small talk triggers a paid search. Two open PRs fix it differently — #351 is a
targeted change, #452 a rewrite — and they conflict. That one needs an owner decision.)

---

## 5b. What the controller actually decides — simulated learners on real material

Four scenarios over the diabetes lecture's 95 objectives. Same document, same objectives, same
starting state; only the learner's evidence and the attention budget change, so any difference is
attributable to the input that differs. ~70 real model decisions in total.

### 5b.1 🟢 The drill trap is genuinely fixed — and the old policy proves it by contrast

A learner who answers the same objective **wrong every single time**:

| Controller | What it did across 8 turns |
|---|---|
| **The model (default)** | `retrieve`×7, `teach`×1, spread across **seven different objectives**. It came back to the failed one once — to *teach* it, not to ask it again. |
| The old structured policy | `show_correction`×8, **all eight on the same objective**, with a byte-identical sentence each time. |

The second row is not a hypothetical: it is what the structured policy produced, given that same
input, on a run where the model call had failed and the fallback ran. **The reason the fallback ran
is irrelevant to what it then did** — §5b.6 shows that trigger was an artifact of my rig, but the
eight identical corrections are the structured policy's genuine behaviour on this input, and it is
the behaviour a learner would meet any time the model arm refuses.

### 5b.2 🔴 The time budget changes nothing

Identical learner, identical evidence, only the remaining time differs:

| | Nearly out of time (2 min left) | Three hours left |
|---|---|---|
| 1 | retrieve · central · A1C target | retrieve · central · A1C target |
| 2 | retrieve · central · A1C target (reverse) | retrieve · central · A1C target (reverse) |
| 3 | retrieve · SCREENING starts | retrieve · SCREENING starts |
| 4 | teach · A1C conversion | retrieve · SCREENING step 2 |
| 5 | retrieve · SCREENING step 2 | retrieve · SCREENING step 3 |
| 6 | retrieve · SCREENING step 3 | retrieve · A1C conversion pair |

Two minutes and three hours produce the same lesson. There is no triage, no compression, no change of
depth. **The crammer behaviour the owner specified is not observable**, and this test was more
generous than production — the runtime passes `availableMs: null` always, so a real learner cannot
even express "I have 30 minutes."

### 5b.3 ⚪ `advance`, `defer` and `revisit` were never exercised — and the scenarios are why

Across ~70 decisions the controller emitted only `retrieve`, `teach` and `show_correction`, with
`passed over 0` everywhere.

**This is not evidence the verbs are broken, and should not be read as such.** Every scenario left at
least 87 untouched objectives inside a 40-item window, so the controller always had fresh material in
front of it and no reason to set anything aside. Declining to defer when there is nothing worth
deferring is correct behaviour, not a dead verb.

What is true is narrower: **their behaviour has not yet been exercised.** The scenario that would do
it is one where the briefed window contains only objectives the learner has already met or is
currently failing — `actedOn` covering nearly all 95. That is a gap in this audit's coverage, not a
finding about the code.

### 5b.4 🟢 Importance IS used where it exists

Every scenario opened with the two `central` objectives, in both time conditions, unprompted. The
signal works. §2's problem is that there is almost none of it — one central object in 242.

### 5b.5 Latency

Median **2.6–3.4 s** per decision across scenarios, worst observed 4.2 s. (An earlier single
measurement of 5,955 ms was not representative.)

### 5b.6 An artifact of the rig, recorded so nobody re-derives it as a defect

Firing 32 model calls back-to-back produced `model-unreachable` refusals on the last six, which fell
back to the structured policy and reproduced the drill loop. **Spaced 3.5 s apart, zero fallbacks.**
That was rate limiting caused by the harness, not a product defect, and it is written down here
because it looks exactly like one.

---

## 6. Learner signals — collected vs. read

| Signal | Collected | Reaches the teaching model |
|---|---|---|
| answer correctness / verdict | yes | yes |
| attempt history | yes | yes |
| named misconceptions | yes | yes |
| time since last evidence | yes | yes |
| response latency | yes | **yes** (was dead until 2026-08-16) |
| scaffolding / help level | yes | yes |
| terminology lookups (friction) | yes | yes |
| predicted retrievability | derived | yes |
| prerequisites / blocked dependents | derived | yes |
| source importance | derived | yes — but see §2, it has no range |
| active session time | yes | yes |
| time on current objective | derived | yes |
| available study time | **no** | passed as `null` |
| partial correctness | yes | yes |
| confidence | recorded | deliberately unread |

The one genuine gap is **available study time**: the runtime passes `availableMs: null` because
nothing knows how long the sitting has. The controller is told this in words so an absent bound
cannot read as an unlimited one — which is correct — but it means the "I have 30 minutes" case the
owner describes cannot currently be expressed by a learner at all.

---

## 7. What this audit could not test

**Domain generality.** Eighteen of the twenty parsed production sources are pharmacy material. The
corpus contains exactly one non-pharmacy document (a derailleur-gearing spreadsheet, which works
well) and one equation sheet (which produces nothing). Shape generality was tested — PDF, PPTX, XLSX,
DOCX — and holds. **The field-agnostic claim remains untested on real non-pharmacy content**, and
that is a gap in the corpus, not a defect in the code.

---

## 8. Findings in priority order

**What works.** The teaching controller itself is the strongest part of the system. It escapes the
drill trap, uses importance when importance exists, declines honestly when nothing is owed, and
decides in about three seconds. Nothing below is a criticism of it — every item is something
*upstream* of it, starving it or fencing it in.

| # | Finding | Consequence |
|---|---|---|
| 1 | The causal prose lane is built and works, but is fed stale excerpts — 555 of 790 unanchorable — and is untemperatured | Zero causal knowledge in production; the lane has completed **once**, ever |
| 2 | The deterministic extractor reads grids, lists and labelled figures only | 6 further knowledge types and 11 of 14 question forms are unreachable; a grid-free deck yields nothing |
| 3 | Emphasis recovered from zero documents | Importance has no dynamic range: 1 central in 242 |
| 4 | Brief window ignores importance and truncates by up to 128 | Even a good yield signal would not change teaching |
| 5 | Time budget changes nothing, and cannot be supplied anyway | The crammer behaviour is unobservable; `availableMs` is always `null` |
| 6 | Described figures still produce no knowledge without a label line | 9/9 described → 0 teachable |
| 7 | Diagram generation absent from the action space | The visual-format decision cannot be made |
| 8 | Web search exists; nothing turns its result into knowledge | "Teach me X" gives a prose answer, never a lesson |
| 9 | Procedure lane mints objectives from headings and prose answers | Learners can be asked incoherent questions |

Not in the table, because the evidence does not support it: `advance` / `defer` / `revisit` went
unused across ~70 decisions, but no scenario created a reason to use them. See §5b.3.

### The dependency between them

**1 is the cheapest large win** — the capability exists and is two defects away from working, and it
is already being fixed as this is written.

**3 is the root of the yield problem.** 4 is a one-file change but worthless until 3 is fixed, since
ordering by a near-constant reorders nothing; and 5 is partly downstream of 4, because a controller
that cannot see the important material cannot triage toward it under pressure.

**2 is the biggest piece of work and should be scoped after 1 lands**, because 1 will show how well a
model-driven lane reading real sentences actually performs — which is the same question 2 has to
answer, over more knowledge types.

Suggested order: **repair the causal lane → recover emphasis → order the window by importance → let a
learner say how long they have → then scope the wider prose lane.** Findings 6–9 are independent and
can run in parallel.
