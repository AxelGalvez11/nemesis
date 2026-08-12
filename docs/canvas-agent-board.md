# Canvas agent board

**The authoritative task board for every Canvas lane.** Chat memory is not shared and does not
survive; this file is. If you are Parser, Runtime, UI or Integration Claude, everything you need to
start is here — what you own, why it matters, what must stay true, and what you must not touch.

> Maintained by Brain (cognitive architecture lead). Brain defines *meaning*; it does not implement
> another lane's work. If a task here is wrong, say so — a contract that does not survive contact
> with the implementation is a Brain defect, not an implementation inconvenience.

**Last recomputed from repository reality: 2026-08-12, after #494–#499 all merged.**

```
Parser perceives · Brain understands · Runtime executes · UI expresses · Canvas is what the learner sees
```

## The one fact that reframes everything

**The gate is open as of 2026-08-12, and the loop is still unproven.** Both halves matter.

`learner_evidence` held **0 rows** because the only code path that writes evidence was gated on the
policy owning the whole page, and the strict ownership router grants that for **0 of 6 canvases and
0 of 11 sources**, by design. A correctness gate with no alternative path is an off switch.
`RUNTIME-001` (#494) removed it and is live in production.

**What has NOT happened: a single real learner evidence row.** Merged is not deployed, deployed is
not served, and served is not proven. `INTEGRATION-001` is the only thing that can close that gap,
and until it does, every claim about diagnosis, sequencing, yield or Minimap state is architecture
rather than observed behaviour.

## Status at a glance

| Task | Owner | Status | Blocks |
|---|---|---|---|
| `BRAIN-001` performance identity readable | Brain | ✅ **MERGED** (#498) | — |
| `BRAIN-002` response identity required by type | Brain | ✅ **MERGED** (#498) | — |
| `BRAIN-003` causal objectives + task contract | Brain | **READY** — dependencies merged | UI-002 |
| `RUNTIME-001` compositional task hosting | Runtime | ✅ **MERGED** (#494) — the gate is open | — |
| `RUNTIME-003` a task targeting a SET of objectives | Runtime | **READY** — assigned | every causal operation |
| `RUNTIME-002` one answer, one response identity | Runtime | ✅ **ACCEPTED** — Brain's defect report retracted | — |
| `PARSER-001` derived verdict crosses the boundary | Parser | **CLAIMED** — 3rd of 3 slices | BRAIN capability gate |
| `PARSER-002` persist the unsupported *kinds* | Parser | **IN PROGRESS** — 1st slice | PARSER-001 |
| `UI-001` three uncertainties stay distinct | UI | **READY** | — |
| `UI-002` Minimap surface | UI | **BLOCKED** | — |
| `INTEGRATION-001` first real end-to-end trace | Integration | **UNBLOCKED — IN PROGRESS** | the whole vision |

---

# RUNTIME

## RUNTIME-001 — compositional task hosting

**STATUS** ✅ **MERGED AND LIVE** — #494, in production on main `60b1365e`
**PRIORITY** closed
**DEPENDENCIES** none
**BLOCKS** every capability downstream of learner evidence

**CAPABILITY BLOCKED** — No learner can be asked anything by the policy on a real canvas, so no
evidence can exist, so nothing adapts. The Canvas cannot do `fast → expand → scaffold → apply →
compress → fast` because only one thing may paint at a time.

**REQUIRED CONTRACT** — A policy contributes an interaction to a Canvas it does not own; unsupported
source material stays visible and reachable beside it.

**SEMANTIC INVARIANTS**
- One answer surface. Two would route an answer to a question nobody was asked.
- A judge that could not be reached writes nothing. An outage is not a learner failure.
- Ownership may still be *computed and reported* — it just no longer decides whether a question is asked.
- Unsupported content is never hidden to make a surface look clean.

**ACCEPTANCE TESTS**
1. A canvas whose sources are only partly representable presents a policy task **and** the document.
2. `learner_evidence` gains its first row from an ordinary session with no `?policy=force`.
3. No canvas presents two answerable surfaces at once.

**NON-REQUIREMENTS** — React structure, hook shape, how regions are composed, whether
`HostedTaskShape` changes. All yours.

**BRAIN REVIEW — ACCEPTED (2026-08-12).** Reviewed semantically, not stylistically.
`AnswerSink` as a union makes two answer surfaces unrepresentable rather than merely unlikely;
"a judge we could not reach is not a learner who failed" is held in code; evidence is written only
through the evaluator. You declined to invent the sixteen-to-three operation mapping and said why —
that was the correct call and the answer is `BRAIN-002`/§3 of `causal-cognition-contract.md`: **no
such mapping should exist.** One follow-up is `RUNTIME-002` below; it is not a revision of this PR.

---

## RUNTIME-003 — a task that targets a SET of objectives

**STATUS** READY — assigned 2026-08-12 to the current Runtime session
**PRIORITY** P0 — the next thing on the critical path after INTEGRATION-001
**DEPENDENCIES** none blocking. The semantics are merged: `docs/causal-cognition-contract.md` §7.
**BLOCKS** every causal cognitive operation; `UI-003`

**CAPABILITY BLOCKED** — Canvas cannot present causal knowledge at all. A learner explaining a
mechanism demonstrates several things in one answer, and today a task can target only one objective.
Until this exists, `objectivesForKnowledge(causal)` must keep returning `[]`, and it does.

**REQUIRED CONTRACT** — A task that targets a **set** of objectives, routes **one** learner
submission to an evaluation that writes evidence for several of them, and does so **without a
causal-specific page runtime**. The cognitive meaning is already written and merged — §7 of the
causal cognition contract is the handoff. Runtime works against that document, not against a future
Brain message.

**🔴 THE CONSTRAINT THAT MUST HOLD BY CONSTRUCTION** — one submission mints **one prompt and one
response identity**, shared by every row that submission writes.

The natural implementation — loop the objectives, build a prompt for each — gives each its own UUID
and turns one answer into N performances. That is the same corruption `BRAIN-001` fixed at the
storage layer, arriving from above it.

The previous Runtime session pinned *"one prompt → one identity across objectives"* and named the
half its tests could not reach: *"one submission → one prompt."* Nothing can test that half until
this path exists, which is why it is written here as a design constraint rather than an acceptance
test — it has to be true by construction, not discovered afterwards in the evidence.

**SEMANTIC INVARIANTS**
- One answer surface, always.
- A judge that could not be reached writes nothing. An outage is not a learner failure.
- `responseLatencyMs` belongs to the **performance**: the same measured duration on each row of one
  answer is correct and must not be divided among them.
- An objective the answer did not address is `not_demonstrated`, never `incorrect`. A learner who
  explains two links of three has not failed the third — nothing was shown about it.
- Unsupported content stays visible and reachable.
- Runtime does not decide what partial understanding means.

**ACCEPTANCE TESTS**
1. One submission targeting three objectives writes three evidence rows sharing one `responseId`.
2. `performancesIn(log).size === 1` for that submission.
3. An objective the response did not address records `demonstrationObtained: false`, `verdict: null`.
4. A double-submit yields one row per objective, not two.
5. A canvas hosting the task still shows its source material.

**NON-REQUIREMENTS** — React structure, hook shape, how regions compose, and whether
`HostedTaskShape` changes at all. It may well survive untouched with the target set carried
alongside it. How the evaluation is invoked and shaped is yours.

**FILES / PARALLEL OWNERSHIP** — `learner-evidence.ts` and `learner-store.ts` are Brain's. Ask for
boundary changes rather than making them.

---

## RUNTIME-002 — one learner answer carries one response identity

**STATUS** ✅ **ACCEPTED — and the defect Brain reported does not exist.** Runtime disproved it.
**PRIORITY** closed
**DEPENDENCIES** none
**BLOCKS** nothing

### 🔴 RETRACTED: Brain's defect report was wrong

Brain reported that `responseId` embeds the objective identity, citing:

```
`${decision.objective.identityKey}:${decision.action.type}:${decision.state.evidenceCount}:${round}`
```

That expression is real, but it is **`decisionKey` — a memo guard deciding *when* to mint an id**,
never the id itself. The id is `crypto.randomUUID()`
(`use-policy-runtime.ts:271` on the branch, `:223` on main), and nothing objective-specific reaches
it. Brain read the memo guard and assumed it fed `responseId` without tracing the second argument of
`retrievalPromptFor`. **Verified independently on both branch and main before retracting.**

The contract holds by construction and always did. This entry stays on the board rather than being
deleted, because a retracted claim that vanishes teaches nothing — and because the reasoning error
is the reusable part: *a cross-layer defect asserted from a partial read of one layer.* That is the
exact class of error this board exists to catch, and it was Brain's.

### What was genuinely missing, and now exists

The property was **untested**, which is why it could be believed broken. Runtime pinned it
(`objective-task.test.ts`, +94 lines): one prompt across two objectives yields one shared
`responseId`; the measured latency is the performance's and identical on each row; nothing
objective-specific survives into the id; separate answers stay separate; an "I don't know" carries
the same answer identity as anything else that submission produced.

**Runtime also recorded a FALSE PASS in the calibration, which is the sharpest part of the work:**
deriving `responseId` from `prompt.objectiveIdentityKey` left the guard *green*, because both rows
share one prompt so the derived value matched anyway. It goes red on `${objectiveRowId}:${prompt.id}`.
A calibration that finds its own blind spot is worth more than one that simply passes.

### 🔴 THE REAL REMAINING RISK, AND IT IS BRAIN'S, NOT RUNTIME'S

Runtime named the half their tests cannot see, correctly: they pin **"one prompt → one identity
across objectives"**, not **"one submission → one prompt."**

The second half lives upstream, and it is a constraint on how `BRAIN-003` designs the multi-objective
causal task. If that design mints a *prompt per objective*, every prompt gets its own UUID and one
answer becomes several performances — the failure Brain described, arriving by a completely
different route than the one Brain reported. Nothing can test it until such a path exists.

**Moved to `BRAIN-003` as a design constraint: a causal task targeting N objectives mints ONE
prompt and ONE response identity, shared across every row that submission writes.**

**REQUIRED CONTRACT** — Response identity is per **answer**, not per objective. Every evidence row
produced by a single learner submission carries the same `responseId`. It must remain stable across
retries of the same submission (it is the idempotency key), and differ across genuinely separate
answers.

**SEMANTIC INVARIANTS**
- One submission → one `responseId`, however many objectives it touches.
- `responseId` must **not** be derived from anything objective-specific.
- Still unique per `(user, objective, response)` — the database enforces this and relies on it.
- Retrying the same submission must remain a no-op, not a second demonstration.
- `responseLatencyMs` belongs to the performance: the same measured duration on each row of one
  answer is correct, and must not be divided among them.

**ACCEPTANCE TESTS**
1. One submission producing evidence for three objectives yields three rows sharing one `responseId`.
2. `performancesIn(log).size === 1` for that submission (helper ships in #498).
3. Two separate submissions for the same objective yield two different `responseId`s.
4. A double-submit of one answer still yields one row per objective, not two.

**NON-REQUIREMENTS** — How the id is generated (uuid, hash, counter), where it is held, and whether
the prompt id keeps its current shape for other purposes. Brain cares only that it identifies the
*answer*.

**FILES / PARALLEL OWNERSHIP** — `use-policy-runtime.ts` and `objective-task.ts` are yours for this.
Brain is editing `learner-evidence.ts` and `learner-store.ts` in #498 — **do not edit those two**;
if you need a change there, ask and Brain will make the boundary change.

---

# PARSER

## PARSER-001 — carry the derived parse verdict across the extraction boundary

**STATUS** READY — sent directly 2026-08-12, now durable here
**PRIORITY** P1
**DEPENDENCIES** PARSER-002 for the *reason*; the verdict itself can ship first
**BLOCKS** Brain's capability gate becoming a real mechanism instead of a fixture label

**CAPABILITY BLOCKED** — Brain cannot refuse to teach from material it could not reliably read.
Your own audit found `SourceContext` carries no coverage at all, so an undescribed figure, an unread
chart and a refused CSV delimiter all report `quality: "full"`. At the consumer, unsupported *is*
absent.

**WHY IT IS LOAD-BEARING** — Brain measured 234 causal candidates across the library: **145 (62%)
come from degraded parses and not one is usable.** They are column fragments, not sentences. One
flattened table produced 126 candidates, all unusable, and it is the richest causal source present.
If the parser destroys a relationship, no Canvas policy can recover it without inventing it.

**REQUIRED CONTRACT** — The derived verdict crosses the boundary as a **value**, not as raw coverage
each consumer re-derives. Every consumer re-deriving it is how the current inconsistency arose.
Brain needs to distinguish *"we could not reliably read this"* from *"this asserts nothing"*.

**SEMANTIC INVARIANTS**
- 🔴 **A source gap is not a learner gap.** If these collapse, Canvas will eventually tell a student
  they are weak on material where the truth is that the parser failed. That is the worst available
  failure in this direction: invisible, and it blames the learner.
- Parser uncertainty stays distinguishable from absence of knowledge.
- Parser does not infer causal knowledge itself. Perception, not interpretation.

**ACCEPTANCE TESTS**
1. A degraded source and a clean source with no causal content return **different** verdicts.
2. A consumer reading only `SourceContext` can tell them apart without touching `parsed_documents`.
3. The three verdicts round-trip: stored → read → consumer, with no re-derivation.

**NON-REQUIREMENTS** — Which parser library, which algorithm, how the verdict is computed, and
whether it is stored or derived on read. Brain does not prescribe any of it.

---

## PARSER-002 — persist the *kinds* of unsupported content

**STATUS** READY
**PRIORITY** P2
**DEPENDENCIES** none
**BLOCKS** PARSER-001 explaining *why* something is incomplete

**CAPABILITY BLOCKED** — Nemesis can say "incomplete" but never why, so it cannot tell a learner
what it could not read, and the Minimap cannot mark source-unmapped regions meaningfully.

**REQUIRED CONTRACT** — Your own finding: both grid parsers build `{kind, count}[]`
(`ambiguous-delimiter`, `unsupported-number-format`) and `csvCoverage`/`xlsxCoverage` **sum it to
one integer**. `unreadableRegions: 1` survives; the reason does not. Persist the kinds — additive,
optional field on `ExtractionCoverage`.

**SEMANTIC INVARIANTS** — Additive and nullable; absent means not observed, never zero. Do not
backfill existing rows with a guessed kind.

**ACCEPTANCE TESTS** — A refused delimiter and an unsupported number format are distinguishable in
stored coverage, and survive to a consumer.

**NON-REQUIREMENTS** — The vocabulary of kinds is yours; you have measured them and Brain has not.

**NOTE** — `table_count` is dead (written by nothing, read by nothing, 0 on every production row
including a DOCX with two real tables). Brain confirms no derivation may consult it.

### Parser's execution plan — accepted 2026-08-12

Parser claimed both tasks and proposed three slices in this order, which Brain confirmed:

1. `PARSER-002` — persist `unsupported` kinds, additive optional on `ExtractionCoverage`
2. a pure `deriveParseQuality({structure, coverage, doc_kind})` → three verdicts
3. `PARSER-001` — carry that derived verdict across the boundary as a value

**Why kinds must come first, recorded so it is not re-litigated:** the reason cannot be
reconstructed afterwards. Once `csvCoverage` has summed `{kind,count}[]` to an integer, no later
function can recover *why* something was unreadable — the information is gone at the point of
summing, not merely unexposed. A verdict shipped first would be permanently unable to explain
itself.

**Brain's answer to "must the vocabulary match BRAIN-003?" — no, and deliberately.** BRAIN-003
assumes nothing about it. Specifying the vocabulary of unsupported content from inside the
cognition layer would be specifying perception from downstream of it. Only one distinction is
depended on: *"we could not reliably read this"* must stay separable from *"we read this fine and
it asserts nothing."*

### 🔴 Two open points from that exchange

**Verdict names embed a cognitive judgement in a perception layer.** "safe-to-teach-from" is a
claim about teaching, which is downstream of Parser. The real issue is that **parse quality is not
one-dimensional with respect to knowledge type**:

| Damage | Associations | Causal |
|---|---|---|
| flattened two-column table | fatal — the pairing is destroyed | fatal — fragments, not sentences |
| unread chart, prose intact | fine | fine |
| intact prose, no grid | useless | fine |

So one verdict is really "safe to teach from, *for the knowledge types extracted today*". When a
knowledge type with different structural needs is added, that verdict silently means something else
and nothing flags it. Preferred fix: name verdicts by **what survived** (sentence integrity,
tabular structure, reading order) and let Brain map survival to teachability per type. Acceptable
alternative: keep the names and record the baseline they were computed against. Not blocking.

**🔴 UNIT-LEVEL OR DOCUMENT-LEVEL? Brain does not know, and says so.** The 62% figure is
per-candidate but derived from a **document-level** signal — the source's structure shape was
`text-only` and every unit from it was stamped degraded. That is a limitation of the measurement,
not a considered design.

A document is not uniformly degraded. A lecture PDF with clean prose and one unreadable chart is
fully usable for causal extraction of the prose. A document-level verdict either over-refuses
(losing good prose because one figure failed) or under-refuses (letting fragments through because
most of the document was fine).

**Brain's preference: over-refuse.** A missed relationship costs coverage; an invented one teaches
something false. If document-level is all that is cheaply available, ship it erring toward refusal
and say so. **But unit-level is worth more to Brain than any refinement of the vocabulary** — it is
the difference between refusing a chart and refusing the chapter it sits in. Parser has the data to
decide this; Brain does not.

---

# UI

## UI-001 — the three uncertainties must never look the same

**STATUS** READY — no dependency, can start now
**PRIORITY** P1
**DEPENDENCIES** none. The semantic states already exist.
**BLOCKS** nothing, but it is the invariant most likely to be violated by accident

**CAPABILITY BLOCKED** — Nothing yet. This is a constraint to hold as the surface grows, and it is
cheaper to hold from the start than to retrofit.

**REQUIRED CONTRACT** — These must remain visually distinguishable, because they call for opposite
responses from a learner:

| Brain state | Means | Must never read as |
|---|---|---|
| `source_state = degraded` | Nemesis could not reliably read the material | learner weakness |
| `learner_state = unknown` | Nemesis has never asked | learner failure |
| `learner_state = not_demonstrated` | Asked; nothing usable came back | a wrong answer |
| `learner_state = incorrect` | The learner contradicted the objective | any of the above |

**SEMANTIC INVARIANTS**
- 🔴 Never invent learner state. If Brain says `unknown`, the surface says unknown — not a grey dot
  that reads as "weak", not an empty progress bar that reads as zero.
- Never imply mastery or certainty Brain did not infer. A confident-looking surface is a claim.
- `unknown` is **not** the bottom of a scale. It sits outside the ordering: "we have never asked"
  and "they got it wrong" call for opposite teaching.

**ACCEPTANCE TESTS**
1. A canvas with a degraded source and a canvas with an untested learner do not look the same.
2. No surface renders `unknown` using the same treatment as `incorrect`.
3. A learner who has answered nothing sees no implied score.

**NON-REQUIREMENTS** — Every visual choice: colour, spacing, motion, iconography, whether a state is
shown as text or shape, and all typography. Brain supplies the semantics and stops. Brain will not
review CSS.

---

## UI-002 — the Minimap surface

**STATUS** BLOCKED
**PRIORITY** P2
**DEPENDENCIES** BRAIN-003 (knowledge/state contract), and clusters/prerequisites do not exist yet
**BLOCKS** the learner choosing territory

**WHY BLOCKED, HONESTLY** — The Minimap must reconcile source organisation, knowledge organisation
and learner state. Today there are 2 knowledge objects and no prerequisite edges, so a Minimap built
now would be a table of contents wearing a map's clothes. `docs/minimap-knowledge-territory.md` is
the target; it is explicitly not a specification of anything that exists.

**WHAT UI CAN DO MEANWHILE** — UI-001, and the collapsible panel *shell* against the versioned
proposed interface in the Minimap doc, provided nothing invents state to fill it.

---

# BRAIN

## BRAIN-001 — performance identity is readable

**STATUS** IN REVIEW — PR #498
**PRIORITY** P0 — must land before or with RUNTIME-001

`response_id`, `response_text` and `task_id` were written on every evidence row and never selected
back. Fixed; select list now derived from the write shape, guards calibrated against the real
defect. Ships `performanceKey` and `performancesIn`, which RUNTIME-002's acceptance tests use.

## BRAIN-002 — response identity is per-answer, enforced by the type

**STATUS** IN REVIEW — landed in #498. **The contract RUNTIME-002 implements against is now live.**
**DEPENDENCIES** BRAIN-001
**BLOCKS** nothing — RUNTIME-002 can proceed against it immediately

`EvidenceToRecord.responseId` is now **required**, and it is the only field in that neighbourhood
that is. Every observation around it stays nullable because for those, absent means *not observed*.
An absent response identity does not mean "not measured" — it means the row cannot be counted or
deduplicated at all. Different kinds of missing, and the interface now says which is which.

The reason it is a type and not an index change: the unique index is `NULLS DISTINCT`, so rows
written without an id never collide and deduplication silently does not apply. `NULLS NOT DISTINCT`
would be wrong in the other direction — two genuinely separate answers that both lacked an id are
two demonstrations, not one. **A retry is only recognisable as a retry if the answer said which
answer it was**, so the database cannot recover an identity nobody supplied.

The change immediately caught a construction site that omitted it, which is the argument for making
it a type rather than a convention.

## BRAIN-003 — causal objectives and the cognitive task contract

**STATUS** BLOCKED on #496/#497 merging
**DEPENDENCIES** #496 (substrate), #497 (contract), RUNTIME-001

`objectivesForKnowledge(causal)` returns `[]` and four tests pin it. That stays true until a task
can target a **set** of objectives and one answer can write evidence for several.

**🔴 DESIGN CONSTRAINT INHERITED FROM RUNTIME-002 — one submission mints ONE prompt.**

Response identity is already correct per prompt: one prompt across N objectives yields one shared
`responseId`, and Runtime has pinned it. The danger is one layer up and it is Brain's to avoid.

A multi-objective causal task must mint **one prompt and one response identity**, shared by every
row that submission writes. The natural implementation — loop the objectives, build a prompt for
each — would give each its own UUID and turn one answer into N performances. That is the failure
Brain originally reported, arriving by a different route than the one Brain described, and it
becomes reachable the moment causal objectives exist.

Nothing can test this until a multi-objective path exists, so the constraint is recorded here to be
satisfied *by construction* when that path is designed, not discovered afterwards in the evidence.

---

# INTEGRATION

## INTEGRATION-001 — the first real end-to-end learner trace

**STATUS** BLOCKED
**DEPENDENCIES** #498 (BRAIN-001) **and** #494 (RUNTIME-001) live in production
**BLOCKS** every claim about adaptive behaviour being observed rather than architectural

**CAPABILITY BLOCKED** — Nemesis cannot demonstrate that the loop closes for a real learner.

**REQUIRED CONTRACT** — One real journey, production, no forced flags:

```
source → knowledge → objective → task → response → performance → evidence
      → learner-state update → the next task differs because of it
```

**SEMANTIC INVARIANTS** — No forced policy override. No synthetic pipeline: synthetic *content* is
fine, a synthetic pipeline is not. Controlled rows deleted afterwards by positive provenance only —
row `created_at` plus a named marker, never `updated_at`.

**ACCEPTANCE TESTS**
1. `learner_evidence` gains a row through ordinary use.
2. That row carries `operation`, `responseLatencyMs`, `responseId` and reads back with all three.
3. The *next* decision differs from what it would have been without that evidence.

**ORDERING CONSTRAINT** — #498 must be live **before** evidence accumulates. Once the gate opens,
rows written while `response_id` is unreadable have unrecoverable performance grouping, permanently.

---

## Rules of the board

1. **Brain does not implement delegated work.** If Brain edits your files, that is a Brain defect
   unless it is a declared boundary change, recorded here.
2. **Say NO CURRENT WORK rather than inventing work.** An idle lane with a reason is information; a
   busy lane with no leverage is waste.
3. **A contract that cannot be implemented is Brain's problem.** Push back here.
4. **Review is semantic.** Brain will not review your CSS, your parser library, or your React.
   Brain reviews whether meaning survived your layer.
