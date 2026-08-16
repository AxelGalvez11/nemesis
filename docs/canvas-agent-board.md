# Canvas agent board

**The authoritative task board for every Canvas lane.** Chat memory is not shared and does not
survive; this file is. If you are Parser, Runtime, UI or Integration Claude, everything you need to
start is here — what you own, why it matters, what must stay true, and what you must not touch.

> Maintained by Brain (cognitive architecture lead). Brain defines *meaning*; it does not implement
> another lane's work. If a task here is wrong, say so — a contract that does not survive contact
> with the implementation is a Brain defect, not an implementation inconvenience.

## 🔴 The live channel is GitHub issue #505, "Canvas Agent Control Room"

**This file is the durable snapshot. Issue #505 is the moving state.** Contracts, invariants,
acceptance tests and non-requirements live here and change slowly. Live claims, blockers, decisions
and handoffs go there, tagged `[CLAIM]` `[BLOCKED]` `[QUESTION]` `[DECISION]` `[HANDOFF]`
`[INTEGRATION PASS]` `[INTEGRATION FAIL]` `[OWNER DECISION REQUIRED]`.

**Read #505 before you start, claim before you implement, and post a `[HANDOFF]` when you finish.**
Where #505's reconciled-reality block and this file disagree, **#505 is newer** — it is recomputed
at the start of every architecture cycle and this file is not.

Never let an architectural decision live only in a chat session. If it outlives the week, it lands
here or in the architecture doc it belongs to, in the same session it was decided.

**Last recomputed from repository reality: 2026-08-12, after #500 merged — production alias
resolved to `60b1365e`, database read directly.** 🔴 **That resolution is stale.** Reconciled against
`main` and the live alias again on **2026-08-15** (docs pass, not a lane session) — the alias now
resolves to `37f33760` (PR #629), `main` itself has moved to `82aef041` (#638) whose own build was
**Canceled** and never served (a fresh instance of the green-check-≠-served landmine below), and
every task this file marked "merged, not deployed" as of 08-12 (`RUNTIME-001/002`, `BRAIN-001/002`,
`PARSER-001/002/003`) is confirmed by `git merge-base --is-ancestor` to be an ancestor of the
**current serving commit**, not just of `main`. See "Status at a glance" for the corrected table.

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

**Recomputed 2026-08-12 ~19:40 CDT from `main` `64251365` and the production alias.** The team now
runs as a native Claude Code Agent Team; live coordination is the shared task list, this file is the
durable roadmap, issue #505 is the durable recovery log, and `docs/canvas-v1-acceptance.md` is the
stop condition.

### 🟢🔴 RECONCILED 2026-08-15 — this file had drifted materially from `main`

A documentation pass (not a lane session) re-verified every task row against the actual repository
and the actual production alias, because this file was actively wrong in ways that would mislead
whoever read it next. Method: read the call site on `main`, not the comment describing it; resolve
the alias with `vercel inspect` and match its deployment id against `target_url` on each commit's
GitHub status (never merge-vs-timing); run the tests that exist rather than trust their last
reported result. Full detail is in each task's own section; the headline corrections:

- **`BRAIN-003` (causal cognition) is not parked.** `objectivesForKnowledge` in
  `apps/web/lib/learn/learning-objective.ts:414` branches on five knowledge kinds — association,
  causal, spatial, classification, procedure — each with a dedicated builder. Landed across #605,
  #608, #628. Merged, **and deployed**: all three are ancestors of the commit the production alias
  currently serves. **Not** confirmed integration-proven — see the `BRAIN-003` section for the exact
  production evidence that would close that gap.
- **`UI-002` (Minimap) is still not reachable by a learner, but not for the reason this file gave.**
  The stated blocker — no `BRAIN-003`, "2 knowledge objects" — no longer holds (`BRAIN-003` is
  merged; production `knowledge_objects` was measured at 164 rows on 2026-08-15, per Integration's
  comment on #505, not requeried here). A real data/logic substrate for territory selection now
  exists and is wired into the policy runtime hook. **But nothing renders it**: no `.tsx` file in
  the repository references it. See the `UI-002` section — the actual remaining gap is narrower and
  differently shaped than "blocked on Brain."
- **Deployment truth had drifted.** Every task this file listed as "merged, not deployed" against
  the 08-12 alias (`RUNTIME-001`, `RUNTIME-002`, `BRAIN-001`, `BRAIN-002`, `PARSER-001/002/003`,
  `UI-001`, `RUNTIME-003`, `RUNTIME-006`) is confirmed an ancestor of the **current** serving commit.
  `merged ≠ deployed` remains true as a rule; it no longer describes these specific rows.
- **Issue #505 comments are point-in-time, and two were read as final when they were not.** Two
  `[HANDOFF]`/`[DECISION]` comments posted 2026-08-15 between 14:49 and 15:11 CDT said PR #632 and
  PR #635 were "not merged." Both merged within the following 20 minutes (#632 at 15:00:26Z, #635 at
  15:12:33Z). Comments describe the moment they were written; this file must not propagate a
  snapshot as an update.
- **Some rows were not re-verified in this pass** (`UI-J`, `UI-MASTERED`, `UI-KEBAB`, §M, §J, §K/§L)
  — marked `not re-verified 2026-08-15` in place rather than left showing an 08-12 status or guessed
  at. Where a title match suggests a relevant PR merged since, it is named as a lead, explicitly
  unconfirmed.
- 🔴 **The alias moved again while this reconciliation was being written — proof of its own claim.**
  First resolution (used for most citations below): `37f33760` (#629), deployment
  `dpl_2b6ur3FomP282MdHLoijjijEEjwn`. Re-resolved immediately before committing: **PR #639 merged**
  ("test(acceptance): the Canvas loop, proven against production on a real lecture"), the alias now
  serves `adf0d75c`, deployment `dpl_CjGEaGdnqydupgyk4C2hmQExogDz` — confirmed by the same
  exact-id-match method, not timing. `37f33760` (and everything else this pass verified) is
  confirmed still an ancestor of `adf0d75c`, so no claim below is invalidated — but treat every sha
  in this file as **true at the stated resolution time**, not as a fact that holds until someone
  reads it. **#639 is itself relevant to `BRAIN-003`'s open question below**: it re-proves the C1–C3
  loop on a fresh production source (229 knowledge objects, 48 classification; 474 objectives,
  capabilities `recall` and `discriminate`) — but the one `learner_evidence` row it wrote and the
  adaptive decision it proved (`recall:v1:7624eaa1` → `recall:v1:996b576c`) are both for a `recall`
  objective, i.e. **association**, the same capability `INTEGRATION-001` already proved on 08-13.
  It persisted classification knowledge and objectives under RLS, which is new and real, but it did
  not write or prove an evidence row for `discriminate`, `predict`, or `sequence`. The gap named
  under `BRAIN-003` — no production evidence row yet carries a causal, classification, or procedure
  objective identity — still stands after #639, confirmed by reading the script
  (`apps/web/scripts/canvas-loop-acceptance.ts`), not assumed from its PR title.

### 🟢🟢 THE LOOP CLOSED — 2026-08-13

**`INTEGRATION-001` PASSED.** Canvas's adaptive evidence loop is proven end-to-end in production,
on serving commit `a02d6063`, with **no `?policy=force`**.

```
source → knowledge → objective → task → answer → evaluation
      → evidence → readback → a DIFFERENT next decision, BECAUSE of the evidence
```

**C3 was proven by counterfactual, not by observation.** `decideNext` is pure, so it was replayed
from the **serving commit's own worktree** with `objectives`/`now`/`actedOn` byte-identical and only
`evidence` varying. **Run A (no evidence) re-asked the SAME objective** — so without the evidence the
policy had no reason to move at all, and **the rotation hypothesis is dead rather than unlikely.**
**Run B reproduced what production actually presented**, which proves the captured inputs were
faithful rather than convenient.

**Proven:** `A1` · `C1` · `C2` · `C3`/`G` · `D2` · `RUNTIME-005` 5/5 on **two independent canvases**,
knowledge converging not duplicating. And `response_id === task_id === the prompt id captured
BEFORE the answer existed` — `RUNTIME-002` observed in production.

**The test row was DELETED.** An agent typed it, not the account holder, so it was a durable claim
that the owner demonstrated knowledge they were never asked for. Brain's own *"genuine attempts
stay"* rule would have left it. **The proof is the observation, never the row.**

### What is NOT proven, stated plainly

- **`D5`/`J1b` were vacuous** — a system writing nothing satisfies every *"must not write"* rule
  trivially. **Re-run required now that writing works.**
- Proven on **one canvas, one durable single-unit source.** Not across the library.
- **`D1` dictation is not agent-verifiable** — no agent can produce speech into a microphone.
- 🔴 **No ordinary path back from the six-stage arm.** `reset` builds a *new* canvas and is reachable
  only from `complete`, itself an evidence stage. **The legacy machine permanently displaces the
  compositional runtime on any canvas it captures.** `796a6045` is parked at `recall` 2-of-8 as the
  production specimen. Filed, unfixed.

### The critical path now, reconciled 2026-08-15

**This replaces three overlapping, partly-contradictory status tables that had accumulated below
this point** (one per recomputation pass, each left in place under the next rather than replaced —
two had lost their header rows and were rendering as broken markdown). The reasoning each carried is
not lost: the "four contract defects" list survives intact just below, and the per-task narrative
sections later in this file (`RUNTIME-001`, `INTEGRATION-001`, etc.) were already the fuller account.
This is now the one table to trust for status; task order matches the sections below.

| Task | Owner | Status, reconciled 2026-08-15 |
|---|---|---|
| `RUNTIME-001` compositional task hosting | Runtime | ✅ MERGED #494, **deployed** (ancestor of the serving commit). First attempt moved the gate rather than opening it — `INTEGRATION-001` caught this by execution, not by reading the diff. Fixed by `RUNTIME-005`; integration-proven 2026-08-13 on `a02d6063`, still an ancestor of what serves today. |
| `RUNTIME-002` one response identity per answer | Runtime | ✅ ACCEPTED, deployed. Brain's original defect report retracted — it read a memo-guard expression and mistook it for `responseId` itself. |
| `RUNTIME-003` a task targets a SET of objectives | Runtime | ✅ MERGED #508, deployed. Unit-tested only — no production caller existed at merge time (the board said so itself: "tests executed by Brain: none"). Not confirmed integration-proven in this pass. |
| `RUNTIME-004` sources attached without a durable id | Runtime | `not re-verified 2026-08-15`. Investigated read-only 2026-08-13, nothing built — full finding in its own section below. Not re-examined in this pass — no check was run either way; absence of a contradiction found while verifying other rows is not confirmation. |
| `RUNTIME-005` gate objective production on trust, not coverage | Runtime | ✅ MERGED, deployed. This is the fix that made `INTEGRATION-001` pass. |
| `RUNTIME-006` judged / not-judged are different values (F5) | Runtime | ✅ MERGED **#519** ("An outage and an empty answer stop being the same value"), deployed. Confirmed live: `objective-task.ts:113-115` declares `type Judgement = {judged:true; outcomes} \| {judged:false}` exactly as specified. |
| `PARSER-001` derived verdict crosses the boundary | Parser | ✅ MERGED #504, deployed. |
| `PARSER-002` persist the unsupported *kinds* | Parser | ✅ MERGED #500, deployed (the Vercel cap that blocked this in production on 08-12 has long since reset). |
| `PARSER-003` unit locality at the producers | Parser | ✅ MERGED #510, deployed. |
| `UI-001` the three uncertainties stay distinct | Canvas UI | ✅ MERGED #509, deployed. |
| `UI-002` the Minimap surface | Brain, UI | **Not "parked" — its own section below replaces this row.** Substrate merged and deployed; the stated blocker (no `BRAIN-003`) no longer holds; a rendered surface still does not exist. |
| `BRAIN-001` performance identity readable | Brain | ✅ MERGED #498, deployed. |
| `BRAIN-002` response identity required by type | Brain | ✅ MERGED #498, deployed. |
| `BRAIN-003` causal objectives + task contract | Brain | **Not "parked by decision" — its own section below replaces this row.** Merged (#605, #608, #628) and deployed; not confirmed integration-proven. |
| `INTEGRATION-001` first real end-to-end trace | Integration | ✅ PASSED 2026-08-13 on `a02d6063`, confirmed still an ancestor of the commit serving today (2026-08-15). |
| **§M verification** — is `correct` terminal, or only immediately suppressed? | Runtime | `not re-verified 2026-08-15`. Last known 08-12: IN PROGRESS. Titles suggesting overlap merged since — unconfirmed, named as leads only: #592, #593, #594, #595. |
| **§J** — self-report never substitutes for demonstration | Integration | `not re-verified 2026-08-15`. Last known 08-12: IN PROGRESS. Possible lead, unconfirmed: #583. |
| **§K / §L / compact UI** — three owner specs | Canvas UI | `not re-verified 2026-08-15`. Last known 08-12: IN PROGRESS, sequenced. |
| `recording` signal so auto-advance cannot fire mid-write | Runtime | `not re-verified 2026-08-15`. Was queued behind §M, whose own status is unverified. |
| `UI-J` remove check + fold, redesign provenance | Canvas UI | `not re-verified 2026-08-15`. Last known 08-12: ASSIGNED. Possible lead, unconfirmed: #635 (wired knowledge provenance to a render site — see `BRAIN-003`/Integration notes below; related, not confirmed identical to this item). |
| `UI-MASTERED` "Mastered." claimed without evidence | Canvas UI | `not re-verified 2026-08-15`. Last known 08-12: 🔴 LIVE AND UNWALKED. |
| `UI-KEBAB` remove the three-dots control | Canvas UI | `not re-verified 2026-08-15`. Last known 08-12: ASSIGNED. |

**What "not re-verified" means here, stated so it is not mistaken for either extreme:** it is not
"still true as of 08-12" (five days and dozens of merges is too long for that to be a safe default)
and it is not "done" (no evidence was found either way). It means exactly what it says — read the
call site before trusting either the old status or a lead named above.

🔴 **Corrected, not deleted: this table used to say "seven merges tonight, zero deployments."** True
on 2026-08-12. Every one of those merges is now confirmed an ancestor of the commit the production
alias serves today. `merged ≠ deployed ≠ served` remains the right rule; it stopped describing these
specific rows days ago.

### What the lanes corrected in Brain, recorded because the pattern is the lesson

Four contract defects, all caught by the lane that had to implement against them:

1. **The lead was unreachable** — teammates were told to message `brain`; the address is `main`. Messages were silently lost. *(Parser)*
2. **C3 aimed at the wrong variable** — `round` is not an input to `decideNext`; `actedOn` is. A control built on `round` would have let the confound move underneath it. *(Integration)*
3. **J1 failed against accepted behaviour** — *"must not change what the policy decides next"* is false by design, since `acknowledge()` feeds `actedOn`. Split into mastery-claim (fully inert) vs exposure-acknowledgement (may rotate). *(Integration)*
4. **J3 could not be proven on the trace canvas** — the trace writes evidence there, so a later "Mastered." would have evidence behind it and prove nothing. Two required criteria were competing for one canvas in an order that silently disarms the second. Moved to `8c49587e`, which has zero sources and therefore *cannot* back a mastery claim. *(Integration)*

**A contract that does not survive contact with the implementation is a Brain defect.** Four of them did not, and the board is better for each.

🔴 **Corrected, not deleted: this section used to carry three more copies of the status table above**
(one still citing `RUNTIME-001`'s original false "the gate is open," one citing the alias as
`dpl_B1Lm6ttT…` = `60b1365e`, two with no header row so they rendered as broken markdown). Their
content is superseded by the single reconciled table above; the sha and alias they named are both
long gone — `main` alone has moved dozens of commits since. `RUNTIME-001`'s own section below still
carries the full story of the false "gate is open" claim; it was not shortened.

---

# RUNTIME

## RUNTIME-001 — compositional task hosting

**STATUS** ✅ **MERGED AND LIVE** — #494. `60b1365e` (cited below as "in production") is a stale
serving sha from 2026-08-12; re-verified 2026-08-15 that #494 (`3ec1cb71`) is still an ancestor of
the commit the production alias currently serves. The gate-move/gate-open history in this entry is
otherwise unchanged and accurate — see `INTEGRATION-001` for the fuller account.
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

**STATUS** ✅ **ACCEPTED, and confirmed DEPLOYED 2026-08-15** (ancestor of the commit the production
alias currently serves) — PR #508, 2026-08-12. `prompt.targets.map` is total over the TARGETS
rather than over the outcomes, so an objective the judge stayed silent about records
*"nothing was shown about this"* instead of vanishing; `demonstrationObtained` follows the outcome,
not the submission; `ObjectiveTarget` holds `rowId` and `identityKey` together so a row cannot be
written against one objective while its verdict was decided about another.

**Tests executed by Brain: none.** Its acceptance tests are unit-level and the multi-target path has
no production caller yet, so there is nothing end-to-end to run. Said explicitly rather than letting
"accepted" imply more than it does — see the note under `INTEGRATION-001` about what semantic
review cost on #494.

**🔴 REQUIRED BEFORE `BRAIN-003`, NOT BEFORE MERGE.** `evidenceForSubmission` takes a bare
`outcomes` array, so an empty one writes `demonstrationObtained: false` for every target — right for
*"the judge established nothing"*, wrong for *"the judge never ran"*. **Unreachable today, and
verified rather than assumed:** `submit` returns early on `!result.value` and records nothing, so the
invariant is held by the **caller**, not by the type. That arrangement breaks the moment a
multi-objective judge returns a *short* list for a partial judgement and *nothing* for a failed one.
Brain owns the sequencing and will not ship a multi-objective judge until the split lands.
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

### 🔴 WHO PRODUCES PER-OBJECTIVE OUTCOMES — answered 2026-08-12, do not re-derive

Runtime asked who turns one answer into per-objective outcomes, having found that §4's
`edgesDemonstrated` are *objective keys* while the shipped `ResponseEvaluation` carries
`demonstrated: string[]` / `missing: string[]` as free text plus **one overall** verdict. Same
names, different things. Nothing merged produces a key from a response.

**The answer, and the forbidden option.**

- ✅ **The judge is told which keys are in play and returns the keys it was given**, with a verdict
  for each. Identity is *supplied*, never invented downstream; the evaluator decides what the answer
  showed; nothing re-derives it afterwards.
- 🔴 **A function mapping the judge's prose to targeted keys is FORBIDDEN.** Substring-matching
  against objective labels produces a per-objective claim *no evaluator ever made*, which
  `learner_evidence` then stores durably as though judged. Same failure as mapping a wider operation
  vocabulary down onto a narrower one. Brain will not build it and no lane should.
- **Nothing arrives as an objective key today.** Ship the routing path with its single caller
  passing one outcome; keep the multi-target path exercised by tests until a producer exists.

**The agreed shape**, and it is what `BRAIN-003` will return:

```ts
outcomes: readonly { objectiveIdentityKey: string; verdict: EvidenceVerdict }[]
```

### 🔴 "NOTHING WAS DEMONSTRATED" AND "WE NEVER GOT A JUDGEMENT" MUST NOT BE THE SAME VALUE

A bare `outcomes` array makes an **empty array ambiguous between two opposite obligations**:

| Empty because | Required behaviour |
|---|---|
| the judge ran and established nothing | every target: `demonstrationObtained: false`, `verdict: null` |
| the judge could not be reached, or returned unparseable output | **no rows at all, for any target** |

A `catch` or a failed parse naturally produces an empty array, so a judge outage silently writes
*"we asked and they showed nothing"* across every target — a durable false claim, written by an
outage, that no test catches because it is a representation gap rather than a bug. Make it
unrepresentable at the type, as `AnswerSink` did for two answer surfaces:

```ts
type Judgement =
  | { judged: true; outcomes: readonly { objectiveIdentityKey: string; verdict: EvidenceVerdict }[] }
  | { judged: false }   // writes nothing, for any target
```

The exact shape is Runtime's. The invariant is not.

**This split is also what makes `edgesMissing` safe to leave implicit.** "Every target that arrived
without an outcome" is only equivalent to `edgesMissing` once `judged: false` is separated out —
otherwise it also covers the judge never running. The two decisions are coupled; take them together.

**An outcome naming a key that was not targeted writes NO row.** That is evidence for a question
nobody was asked, and it must be unrepresentable rather than merely unlikely.

**NON-REQUIREMENTS** — React structure, hook shape, how regions compose, and whether
`HostedTaskShape` changes at all. It may well survive untouched with the target set carried
alongside it. How the evaluation is invoked and shaped is yours.

**FILES / PARALLEL OWNERSHIP** — `learner-evidence.ts` and `learner-store.ts` are Brain's. Ask for
boundary changes rather than making them.

---

## RUNTIME-005 — gate objective PRODUCTION on trust, not on coverage

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED — this is the fix that made
`INTEGRATION-001` pass 2026-08-13.** No longer the critical path; superseded below. *(Original entry,
kept: "🔴 **P0 — the critical path.** Specified by Brain 2026-08-12 in answer to Integration's
`[INTEGRATION FAIL]`. Runtime implements; the condition is Brain's.")*
**BLOCKS** `INTEGRATION-001`, and through it every claim about adaptive behaviour.

**CAPABILITY BLOCKED** — No objective can be produced for any real document, so no task, no answer,
no evidence. See the finding under `INTEGRATION-001`.

### The unit of the gate is wrong, not its threshold

`policyOwnsCanvas` asks *"can the policy account for **all** of this document?"* That was right when
the policy **replaced** the page. Under composition it is a category error: the policy contributes a
task **beside** unsupported material, and §14.1 says the answer to "it owns nothing" is composition,
never a lower bar. A whole-document question deciding a per-knowledge action answers "no" for every
real document.

**The two facts whole-page ownership fused are already separate in `canvas-knowledge.ts`:**

| Signal | Question | Job |
|---|---|---|
| `outcome` (`complete`/`degraded`/`failed`) | *did we read this reliably?* | **gate** |
| `coverage.unrepresented` | *did we account for all of it?* | **disclose** |

**REQUIRED CONTRACT** — Produce objectives from the knowledge actually extracted, gated on whether
the extraction can be trusted, never on whether the document is exhaustively represented.

| `outcome` | Production |
|---|---|
| `complete` | **produce** objectives for what was extracted |
| `degraded` | **refuse** — err toward refusal |
| `failed` | **refuse** |
| `no-durable-source` | unchanged — nothing to read |

`degraded` refusing the whole canvas is deliberate over-refusal today, and it is the coarseness
`PARSER-003` removes: once unit locality survives, `degraded` refuses the *chart*, not the chapter
it sits in. Do not soften it before that lands.

**🔴 SEMANTIC INVARIANT — the one that makes this safe.** Producing objectives for extracted
knowledge must never be read as a claim that the document is covered. `unrepresented > 0` stays
true, stays computed, stays reported, and must reach the Minimap as source-unmapped territory and
the UI as visible unsupported content. **This moves the unrepresented fact from *gate* to
*disclosure*; it does not lower the bar.** `PolicyRuntime.ownership` already carries exactly this
pattern one layer down.

**THE CONCERN IN THE OLD COMMENT SURVIVES.** *"Rows produced by opening a document rather than by
learning anything from it"* is real, and it is two things coverage was a poor proxy for:

1. *Do not mint knowledge we cannot trust* — `outcome` handles this, better than coverage did.
2. *Do not mint knowledge nobody will be asked about* — a **cost** concern, not a correctness one.
   The honest fix is writing knowledge when a canvas is **studied**, not when it is **opened**. If
   that distinction does not exist yet, post `[BLOCKED]` — do not reintroduce a coverage gate as a
   proxy for it. Extraction runs a model, so this is real spend.

**ACCEPTANCE TEST — and it must be EXECUTED, not asserted in a fixture**
1. On production canvas `796a6045` ("Acceptance B1") with **no** `?policy=force`,
   `ensureKnowledgeForCanvas` returns `objectives.length > 0`.
2. An ordinary submission on that canvas writes a `learner_evidence` row.
3. A canvas with `outcome: "degraded"` still produces nothing.
4. The canvas still shows its unsupported source material, and `unrepresented` is still reported.

**🔴 `degraded` IS PER-CANVAS, NOT PER-SOURCE, AND THAT OVER-REFUSAL IS ACCEPTED.** `outcome` is
the **worst** result across all of a canvas's sources — one unreadable source sets `failed`, one
degraded extraction sets `degraded` — so a four-source canvas with three clean sources and one
degraded one refuses entirely. That is deliberate and it is not a regression: the old gate already
refused it via `unrepresented`. It is the same coarseness `PARSER-003` (#510, merged locality)
exists to remove, and it stays until a per-unit verdict is computable. **Named here so it is
accepted up front rather than discovered mid-implementation and quietly softened.**

**🔴 GATE ON `outcome` AND NOTHING ELSE. Do NOT consume `contentIntegrity` (#504).** The tempting
inference — *"`PARSER-001` gives Brain the trust signal, `RUNTIME-005` gates on trust, therefore it
needs `PARSER-001`"* — is wrong. `outcome` already exists, is already computed per canvas in this
file, and is **already live in the serving deployment**. `contentIntegrity` is a finer signal that
will later make `degraded` mean *refuse the chart* rather than *refuse the chapter*. Wiring them
together now would make the P0 depend on two unmerged, undeployed PRs behind a 24-hour cap.

**🔴 SCOPE — `canvas-knowledge.ts:111` IS NOT PART OF THIS AND MUST NOT BE TOUCHED.** A separate,
earlier clause returns `nothingToRead()` when `sourceIds.length !== canvas.sources.length`, and
**five of the six production canvases die there, not at `:160`.** That refusal is correct — an
ephemeral source genuinely has nothing to read — and it is `RUNTIME-004`'s territory, not this task's.

Stated explicitly because of the trap it sets: fix `:160`, re-run the acceptance test on one of those
five, see no objectives, and conclude the fix failed when it worked. **Acceptance test 1 names
`796a6045` for exactly this reason** — it is the only canvas that reaches the ownership gate.

**NON-REQUIREMENTS** — Whether `policyOwnsCanvas` keeps its current shape, where the condition
lives, and how ownership continues to be reported. All Runtime's.

---

## RUNTIME-004 — canvas sources attached without a durable id

**STATUS** 🔴 **THE ENTRY BELOW WAS WRONG, AND IT WAS BRAIN'S.** Investigated read-only by Runtime
2026-08-13; nothing built, no production data touched. `not re-verified 2026-08-15` — this
reconciliation pass did not re-check whether the diagnosis below still holds; nothing found while
verifying other rows contradicted it, but that is incidental, not confirmation.

### The board blamed code that did not write those rows

The durability line this task named — `use-canvas-session.ts:341` — **landed 2026-08-11 in #474.**
Canvas `186d0749` was created **2026-08-08, three days earlier.** All four of its sources carry
`durability` **absent**, not `"ephemeral"` — the signature of a writer that predates the field.

**And the only canvas created after #474 that has sources is `796a6045`, at 1 durable of 1.** The
single production sample of the *current* attach path produced a durable source. **There is no
evidence the live path is broken.**

So this is **legacy data plus a latent path**, not the live product failure the entry described.
Brain wrote that diagnosis from a symptom without checking whether the code it named existed yet.

### The owner's material is NOT lost

**136 excerpts survive inside the canvas document** (1 + 45 + 45 + 45). **Addressability was lost,
not content.** `s2`, `s3` and `s4` are the same document attached three times.

### 🔴 DO NOT RELINK — it would accomplish nothing

`s1` is a confident 4-of-4 token match to `IPPE_Community_Exam_Prep_Instructions.pdf` (`3262f236`),
parsed, uploaded the day before the canvas. **Relinking it anyway changes nothing**, because
`canvas-knowledge.ts:111` requires **all** sources durable, not some:

```ts
if (sourceIds.length !== canvas.sources.length && !bypassOwnership) return nothingToRead();
```

1 durable of 4 → `1 !== 4` → `nothingToRead()`. **Identical outcome, one write to the owner's real
data, zero benefit.** `s2`–`s4` have no convincing candidate (best 2 of 7) and **must not be
guessed** — a wrong relink attaches the owner's coursework to an unrelated document, which is worse
than leaving it broken, because it would be broken *and* wrong.

### 🔴 The real defect: a silent, size-asymmetric filing failure

`extractFile` files best-effort, then picks a lane from the **outcome**:

- **small file whose filing failed** → the inline lane still extracts and returns text with **no
  `librarySourceId`** — silently ephemeral, permanently unteachable, **no error**
- **large file** → retries and throws

**The learner sees their material attached and readable while Nemesis can never teach from it, and
nothing says so. Degraded presented as complete** — this board's founding failure mode, arriving
through an upload path nobody was watching.

**BRAIN'S RULING, so it does not need re-litigating:** allow the ephemeral attach, **disclose it**,
and offer relink. Failing the upload loudly would cost a learner their work over a bookkeeping
failure — a source gap becoming the learner's loss. **The silence is the defect; the ephemerality is
not.** One flag currently serves both reading and teaching, and that is what has to stop.

**DO NOT BUILD IT YET.** The live path shows no evidence of the defect and `INTEGRATION-001` is
still unproven. Diagnosis preserved read-only on `probe/runtime-004-diagnosis`.

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

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED.** Superseded below: PR #504 merged
(commit `12f45419`) and is confirmed an ancestor of the commit the production alias currently serves.
Not confirmed integration-proven in this pass. *(Original entry, kept: "**IN REVIEW** — PR #504.
Mergeable. Every red check on it is infrastructure (GitHub Actions billing lockout, Vercel rate
limit), not a code defect.")*
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

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED.** The Vercel cap named below reset days
ago; commit `bee67e41` is confirmed an ancestor of the commit the production alias currently serves,
so the stored kinds are readable in production now. Not independently re-queried in this pass — this
is deployment ancestry, not a read of the live column. *(Original entry, kept: "✅ **MERGED** — #500,
commit `bee67e41`. 🔴 **Merged, not deployed:** the Vercel daily build cap refused it, so the stored
kinds are not yet readable in production. Verification of this task in production waits for the cap
to reset.")*
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

### ✅ RESOLVED 2026-08-12 — Parser measured it and decided. Document-level ships; unit-level is next.

Parser answered the open point below, which Brain could not. **Document-level ships in #504.
Unit-level is correct and blocked on a substrate that does not exist**, because:

- **0 of 11** production rows carry `unreadableRegions` at all.
- The single row with real text loss (`9551f235`, 1 of 24 pages) has structure shape `text-only` —
  one `u0` unit, no page number. **There is nothing to attribute the loss to.** A per-unit field
  shipped today would read `unknown` everywhere, including on the only document that has anything
  to say.
- Locality is *discarded at the producers*, not missing from them: `pdf/structure.ts:278` reduces
  per-page `tablesUnread` to one integer, and the Docling adapter counts `unitIndexesWithContent`
  into totals without keeping which unit was which. Same shape as `PARSER-002` — the fact exists at
  measurement and dies at summing.

**`PARSER-003` — preserve unit locality at the producers — is claimed and approved.** Additive,
optional, absent means *not observed*, no backfilled guesses. Sequencing cost accepted: every
production source reads `unknown` at unit level until a reparse, and a reparse means a
`PARSER_VERSION` bump because that version is half the unique key on `parsed_documents`.

### 🔴 THE FLOOR RULE — Parser's wording, adopted as an invariant

> **The document verdict is a floor, not a summary. Only *located* loss attributes to a unit; any
> *unlocated* loss degrades every unit.**

Brain asked only that Parser *err toward refusal*. Parser found the specific mechanism by which
refinement would quietly stop refusing: go per-unit naively and unlocated loss **vanishes**, so a
document with three unreadable regions whose page cannot be recovered reports every unit `intact` —
parser incapacity reading as absence of loss, arriving through the improvement meant to prevent it.
Calibrate by reintroducing exactly that: a mutation attributing located loss correctly *while*
letting unlocated loss disappear must go red.

### 🔴 CORRECTED — "no tables in the corpus" has expired

The board previously recorded *"0 of 8 production docs contain a DATE, none a TABLE."* Production now
holds **11 parse rows and 8 table blocks across two documents** (pptx 6, docx 2), both stored with a
cell model. **Tables are no longer absent.** Brain's own association-extraction reasoning assumed
they were; anyone reasoning from "there are no tables" is reasoning from an expired fact.

### 🔴 NAME WHAT SURVIVED, NOT WHETHER IT CAN BE TRUSTED — Brain's answer to Parser's question

"Can this text be trusted to assert something from" is a **teachability** claim, and teachability is
not one-dimensional — it depends on the knowledge type, which lives downstream of Parser. A single
trust verdict silently means *"trustworthy for the knowledge types we extract today"*, and adding a
knowledge type with different structural needs changes what the stored value means with nothing to
flag it.

The two properties Brain depends on today, in priority order:

1. **Sentence integrity** — did prose survive as sentences or as fragments? Decides causal
   extraction; it is what the 62%-unusable finding was really measuring.
2. **Tabular structure** — did row/column pairing survive? Decides associations.

Reading order matters only for sequence knowledge, which does not exist. Do not build for it.

**Preference, not a blocker.** If naming survival costs materially more than a trust verdict, ship
trust and record the baseline it was computed against. Brain needs only that *"we could not reliably
read this"* stays separable from *"we read this fine and it asserts nothing."*

---

**🔴 UNIT-LEVEL OR DOCUMENT-LEVEL? Brain does not know, and says so.** *(Superseded by the
resolution above; kept because the reasoning that led to the right question is the reusable part.)* The 62% figure is
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

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED** — #509, confirmed an ancestor of the
commit the production alias currently serves. *(Original entry, kept: "READY — no dependency, can
start now")*
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

**STATUS** 🔴 **RECONCILED 2026-08-15 — not "BLOCKED," and not done either.** The dependency this
row named is satisfied. A real substrate is merged and deployed. **No learner can reach a Minimap
today** — there is no rendered surface at all, confirmed by searching the whole `.tsx` tree, not by
reading what the data layer intends.
**PRIORITY** P2
**DEPENDENCIES** ✅ `BRAIN-003` merged and deployed (see its section). ❌ The hierarchical
territory/prerequisite contract still does not exist — see below, it is a *narrower*, still-real gap
than "blocked on Brain."
**BLOCKS** the learner choosing territory

### What is actually built — a data/logic layer, wired one hook deep, rendered nowhere

**First, a naming trap this task's own brief walked into, worth naming so the next reader does not
repeat it:** three files share the word "territory" and only one of them is Minimap infrastructure.

| File | What it actually is | Minimap-relevant? |
|---|---|---|
| `apps/web/lib/learn/knowledge-territory.ts` | Topic-first canvas construction — turns a typed topic ("teach me the top 35 drugs") into knowledge objects. The product's *front door* for topic canvases, unrelated to navigation. | No |
| `apps/web/lib/learn/canvas-territory.ts` + `supabase/migrations/20260813T01_canvas_territory.sql` | A **build-once cache** for the above — stops a topic canvas from re-generating (and re-paying for) a new, different set of knowledge objects every time it is opened. A performance/cost fix, not a navigation surface. | No |
| `apps/web/lib/learn/canvas-focus.ts` | `FocusScope`, `applyFocus`, `availableTerritories` — a flat, per-canvas list of selectable knowledge groupings, explicitly commented "safe to paint on the Minimap." | **Yes — this is the one.** |

Only `canvas-focus.ts` is Minimap substrate. It is wired one layer into the product:
`use-policy-runtime.ts` imports it and exposes `focus`, `setFocus` and `territories` on the
`PolicyRuntime` object every canvas hook returns (`focus: FocusScope`, `setFocus: (scope) => void`,
`territories: readonly {label, identityKeys}[]` — `use-policy-runtime.ts:100-103`, computed at
`:417`, `:532`, `:1099`).

**Nothing renders it.** Searched every `.tsx` file in `apps/web` for `.territories`, `.setFocus`,
`.focus` read off the policy object, `FocusScope`, `availableTerritories`, `applyFocus`, `Territory`,
`Minimap` — zero matches outside the hook itself and its test. The sole call site,
`learning-canvas.tsx:100`, keeps the hook's return value in one `policy` object and passes the whole
thing to `<CanvasPolicyView runtime={policy} .../>` (`learning-canvas.tsx:690`);
`canvas-policy-view.tsx`, the component that receives it, never reads `territories`, `focus` or
`setFocus` anywhere in its body. This is the same class of defect Integration found and named
elsewhere on this board on 2026-08-15: "a named-but-never-called lane is a FAIL, not a PASS."

**The hierarchical part is honestly, explicitly absent — by the file's own comment, not by omission.**
`canvas-focus.ts:40-57` documents `MISSING_TERRITORY_CONTRACT`: there is no parent/child relation
between knowledge objects anywhere in the system, so `availableTerritories` can only offer a flat
list — one entry per distinct knowledge statement, nothing grouped, nothing clustered, no
prerequisite edges. The file explicitly rejects the tempting shortcut of deriving hierarchy from
document headings ("a heading records where text SAT, not what depends on what... once a tree
rendered from headings is on screen, its wrongness is invisible"). This is a sourced negative claim,
not a guess: the gap `docs/minimap-knowledge-territory.md` describes is still a gap, just a smaller
one than "no substrate at all."

**Even the mechanism-only proof is not clean.** `apps/web/scripts/territory-build-once-acceptance.mts`
is the executable acceptance test for the *cache* (not the Minimap) — its own header states, as of
2026-08-13, that it cannot reach its first leg from a Node harness (`constructTerritory` requires an
authenticated chat session; "Sign in to chat" refuses before any network call), and that even if it
ran, it "does NOT prove the SURFACE wires that correctly... a mechanism proof described as a product
proof is the overclaim to avoid here" — the script's own words. No later comment on #505 records a
successful run since.

**WHY THE OLD "BLOCKED" REASON NO LONGER HOLDS** — it named two things: no `BRAIN-003`, and "2
knowledge objects." `BRAIN-003` is merged and deployed (see its section). The object count is
dramatically stale — Integration measured `knowledge_objects` at 164 rows and `learning_objectives`
at 322 rows in production on 2026-08-15 (comment on #505, not re-queried in this pass, cited rather
than re-derived). Neither original blocker is still true. The real remaining gap is narrower: build
a rendered surface against the flat `territories`/`focus`/`setFocus` the hook already exposes, and
separately, get Brain to define the parent/child territory relation before anything hierarchical can
be honest.

**WHAT UI CAN DO MEANWHILE** — UI-001, and the collapsible panel *shell* against the versioned
proposed interface in the Minimap doc, provided nothing invents state to fill it. That guidance still
holds; `canvas-focus.ts` now gives that shell something real and flat it could actually bind to,
which was not true when this row was last written.

---

# BRAIN

## BRAIN-001 — performance identity is readable

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED** — #498, confirmed an ancestor of the
commit the production alias currently serves. *(Original entry, kept: "IN REVIEW — PR #498")*
**PRIORITY** P0 — must land before or with RUNTIME-001

`response_id`, `response_text` and `task_id` were written on every evidence row and never selected
back. Fixed; select list now derived from the write shape, guards calibrated against the real
defect. Ships `performanceKey` and `performancesIn`, which RUNTIME-002's acceptance tests use.

## BRAIN-002 — response identity is per-answer, enforced by the type

**STATUS** ✅ **RECONCILED 2026-08-15: MERGED AND DEPLOYED** — landed in #498, confirmed an ancestor
of the commit the production alias currently serves. **The contract RUNTIME-002 implements against
is now live.**
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

**STATUS** ✅ **RECONCILED 2026-08-15 — BUILT, MERGED, DEPLOYED.** Not "parked," not "READY
pending" — done past what this entry describes, and gone further than causal alone.

`apps/web/lib/learn/learning-objective.ts:414`, `objectivesForKnowledge`, now branches on **five**
knowledge kinds, each with a dedicated builder in the same file: `causalObjectives` (`:253`),
`spatialObjectives` (`:325`), `classificationObjectives` (`:359`), `procedureObjectives` (`:395`),
plus the original `association` handling inline. Landed across three PRs, all confirmed ancestors of
`main` **and of the commit the production alias currently serves** (`37f33760`, checked by
`git merge-base --is-ancestor`, not by date):

- **#605** "The Canvas can teach a mechanism, not just a word pair" — `causalObjectives`
- **#608** "A causal answer is what follows, not the whole claim repeated" — the answer-shape fix
- **#628** "Five of six knowledge kinds now teach..." — `classificationObjectives`,
  `procedureObjectives`, and `spatialObjectives`

**Executed, not just read:** `knowledge-lane-completeness.test.ts` (2/2 pass) asserts by construction
— it scans `knowledge-types.ts` and every producer file rather than trusting a hand-maintained list —
that `mintedTypes()` equals exactly `["association", "causal", "classification", "procedure",
"spatial"]` and that every one of them has a lane in `objectivesForKnowledge`. `causal-cognition-loop.test.ts`
(13/13 pass) walks one causal edge through the *whole* chain — knowledge → objective → runtime admits
it → prompt → judged → evidence → state → next action — built through the real extractor and
validator, never hand-constructed.

**RUNTIME-006 (F5, the `judged`/`not-judged` split this entry's design constraint depended on) is
also done**, not "in progress" as other parts of this file said: PR **#519**, "An outage and an empty
answer stop being the same value." `objective-task.ts:113-115` declares
`type Judgement = {judged: true; outcomes} | {judged: false}` exactly as specified, and `{judged:
false}` writes nothing for any target, confirmed at `:137`.

**🔴 What this does NOT establish — do not upgrade this past "deployed."** Merged and deployed means
the code is in the build the production alias currently serves. It does not mean a real learner has
been asked a causal, classification, or procedure question. The most recent Integration read of
production (comment on #505, 2026-08-15T14:36:43Z) found `learner_evidence` at **1 row total**,
`teaching_strategy: null` — a figure attributed to that comment **as of that timestamp**, not
re-queried in this pass. **It is no longer current even within this reconciliation pass**: PR #639
(below) wrote at least one more row a few hours later, so the true count now is 2-or-more, not 1 —
cited here as a live illustration of exactly the staleness this document exists to stop propagating.
Nothing in either row's shape ties it to any of the three new capabilities — #639's row is
confirmed `recall` (association), detailed below. **The concrete check that would close this gap:**
a production `learner_evidence` row whose objective identity carries `capability: "predict"`
(causal), `"discriminate"` (classification), or `"sequence"` (procedure) —
`objectiveIdentityKey`'s `capability` field, minted at `learning-objective.ts:274/369/405`. Until
that row exists, the honest status is **merged + deployed, not integration-proven.**

**Closest thing to it so far, and it still falls short:** PR #639 merged during this very
reconciliation pass and re-proves the C1–C3 loop end-to-end against a fresh production source,
persisting 48 classification knowledge objects and objectives with capability `discriminate` under
RLS. But the specific `learner_evidence` row it wrote and the adaptive decision it proved were both
for a `recall` (association) objective — read from the script directly
(`apps/web/scripts/canvas-loop-acceptance.ts`), not assumed from the PR title. Classification
knowledge now demonstrably persists in production; a classification (or causal, or procedure)
**evidence row** still does not. See the top-of-file "RECONCILED 2026-08-15" note for the full
citation.

**Superseded, kept for the record:** the passage below is what this entry said as of #494/#496/#497,
before #605/#608/#628 landed. `objectivesForKnowledge(causal)` returns `[]` and four tests pin it. That stays true until a task
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

**STATUS** ✅ **RE-RUN PASSED 2026-08-13** — see "THE LOOP CLOSED" near the top of this file. Serving
commit at the pass was `a02d6063`, re-confirmed 2026-08-15 still an ancestor of the commit the
production alias currently serves. Everything below this line is the **first** run, 2026-08-12, kept
in full because it is the diagnosis that produced the `RUNTIME-005` fix which made the second run
pass — read the original status it carried as history, not current state:

🔴 **RAN 2026-08-12 AND FAILED.** It did its job: it turned an architectural claim into
an observed one, and the observation was that the claim was false. The fix is `RUNTIME-005` below.

### 🔴 THE FINDING — RUNTIME-001 MOVED THE GATE, IT DID NOT OPEN IT

`learner_evidence` cannot become non-zero through ordinary use on **any** of the 6 production
canvases. #494 removed the ownership gate where a task is **consumed** and left an identical one
where objectives are **produced**:

- `canvas-knowledge.ts:160` returns `objectives: []` when `!ownership.owns`, bypassed only by
  `?policy=force`.
- `use-policy-runtime.ts:214` then refuses on `supported.length === 0` — correct in isolation, but
  its input was already emptied upstream, so it now measures *"the policy does not own this canvas"*
  while reading as *"there is nothing teachable here"*.

**Deleting the consumption gate while the production gate zeroes its input changes nothing
observable.** Every unit test passed because **each layer is correct alone**.

Proved by executing the deployed functions against real production data, not by reading the diff:

```
=== EXTRACTION ===       outcome: complete   objects: 2   unitsUnread: 0
=== COVERAGE ===         {"represented":1,"substantive":5,"unrepresented":4}
=== OWNERSHIP VERDICT === owns: false | refusal: unsupported-content
```

It is structural, not a thin corpus: `policyOwnsCanvas` needs `unrepresented === 0`, `isStructural`
skips only headings, and `expectedFrom` returns `null` for any non-table unit — so **a prose
paragraph is substantive and can never be represented**. `owns: true` is reachable only for a
document whose every non-heading unit is a table.

The 2 knowledge objects in production are artifacts of `?policy=force`: `saveKnowledge` runs only
*after* `:160`.

### 🔴 WHAT THIS COST, AND IT IS BRAIN'S

`RUNTIME-001`'s own acceptance test #2 — *"`learner_evidence` gains its first row from an ordinary
session with no `?policy=force`"* — is exactly the test that catches this, and **it was never
executed**. Brain accepted #494 on semantic review. **Semantic review does not substitute for
running the acceptance test.** Every future acceptance on this board states which tests were
executed and against what.

**Verified sound, so nobody restarts the search there:** RLS insert policy is
`WITH CHECK ((SELECT auth.uid()) = user_id)` and writes go through the browser client under the
learner's own JWT; the unique index `(user_id, objective_id, response_id)` exists and matches the
`onConflict`; `EVIDENCE_SELECT` reads back all six carried fields. **The loop is sound from the task
downward. It was severed above the task.**
**DEPENDENCIES** ✅ **SATISFIED.** The production alias `app.enternemesis.com` resolves to
`dpl_B1Lm6ttT…` → commit `60b1365e`, and `3ec1cb71` (#494) and `c19dcc03` (#498) are both ancestors
of it. Verified from the alias, not from a green check — see the landmine below.
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

### 🔴 RE-RUN TRIGGER — the exact check, because this task is now TIME-gated, not work-gated

Re-run this **unchanged** the moment `RUNTIME-005` reaches the **production alias**. Not the merge,
not a green check — the alias. As of 2026-08-12 19:04 CDT the alias is frozen at `60b1365e` and
Vercel has accepted **no production deployment since 18:04** (no failed builds — no deployment
records at all; the rate limiter refuses before a build starts). That is ~24h unless the cap is
lifted.

**This is written out because the sessions that know it will not outlive the wait.** Whoever picks
this up next runs exactly this:

```bash
# 1. what is actually serving?
vercel inspect https://app.enternemesis.com          # → dpl_XXXX, and its aliases

# 2. which commit is that deployment?  Match dpl_XXXX against the target_url on each candidate:
gh api repos/AxelGalvez11/nemesis/commits/<sha>/status   --jq '[.statuses[]|select(.context=="Vercel – nemesis-web")][0]|"\(.state) \(.target_url)"'

# 3. does the serving commit CONTAIN the fix?
git merge-base --is-ancestor <runtime-005-merge-sha> <serving-sha> && echo LIVE || echo NOT LIVE
```

Step 3 is not optional. A commit can carry a **green** Vercel status on a deployment that was
`CANCELED` and never served — `997a5886` and `99d1bdfe` both do. Containment in the *serving* commit
is the only proof.

**Re-run the ORIGINAL trace.** Do not replace the failed test with one that matches whatever the
implementation turned out to be — the point is to prove the learner path works, not that the code
does what it says.

**Four invariants that must hold alongside the pass**, or it is not a pass:
one response carries one `responseId` · *"I don't know"* stays no-demonstration, never `incorrect` ·
evaluator failure writes no learner claim · Continue/correction creates no mastery evidence.

**ORDERING CONSTRAINT** — #498 must be live **before** evidence accumulates. Once the gate opens,
rows written while `response_id` is unreadable have unrecoverable performance grouping, permanently.
Satisfied: #498 is an ancestor of the serving commit.

### 🔴 `learner_evidence = 0` IS THE BASELINE, NOT A FINDING

Read the number correctly before spending an hour on it. `usage_events` holds 1,079 rows and its
most recent is **2026-08-07** — nobody has used the product in five days. With no submissions, zero
evidence rows is the *expected* value and says nothing about whether the gate works.

| World | What the 0 means | What it asks for |
|---|---|---|
| Nobody submitted | correct and uninformative | **run the experiment** |
| Someone submitted and got nothing | a second gate downstream | hunt the defect |

`usage_events` settles it: nobody submitted. **This task is an experiment, not a bug hunt.** If the
first real submission writes a row, the loop closes. If it does not, *that* is the finding, and it
is worth more than anything else on this board.

### 🔴 A GREEN VERCEL CHECK IS NOT A LIVE DEPLOYMENT

`997a5886` and `99d1bdfe` each carry a green `Vercel – nemesis-web` status on GitHub, and both
deployments are `CANCELED` — superseded mid-build, never aliased, never served. This codebase
already knew *merged is not deployed*; today added *green is not deployed either*. Before verifying
anything in production, resolve the alias:

```bash
vercel inspect https://app.enternemesis.com
```

Brain published the wrong serving commit to every lane from a green check before doing this. The
error is recorded because the reasoning is the reusable part, not the conclusion.

**🔴 THIRD INSTANCE, 2026-08-15 — the same landmine, found during this reconciliation pass.**
`82aef041` (PR #638, currently the tip of `main`) carries `state: success` on its
`Vercel – nemesis-web` GitHub status, target url resolving to deployment
`dpl_4E4TAjATTdDyWeNvmsCyp2HWNjCG`. `vercel inspect` on that deployment id directly shows
`status: ● Canceled` — superseded, never aliased, never served, exactly like the first two. The
production alias `https://app.enternemesis.com` resolves instead to `dpl_2b6ur3FomP282MdHLoijjijEEjwn`,
which matches commit `37f33760` (PR #629) by exact deployment-id equality against `target_url`, not by
timing. `main` HEAD and the serving commit are one merge apart — `git log --oneline 37f33760..origin/main`
shows only `82aef041` between them — so the gap is small this time, but the mechanism recurring a
third time is the point: **a green GitHub check will keep meaning nothing about what serves, and this
codebase will keep needing to check anyway.**

---

## 🔴 How to talk to Brain — set by the owner, 2026-08-12

**Message Brain only when a task is DONE.** No progress updates, no acknowledgements, no
"starting now". The board carries status; a message is for a result.

**The one exception, and it is not a loophole:** if a contract written here cannot be implemented as
written, or you are genuinely blocked, say so **immediately**. A contract that does not survive
contact with the implementation is a *Brain defect*, and hearing it early is worth an interruption.
Working around it silently is not.

Two real examples of each, so the line is concrete:

| Worth interrupting for | Not worth interrupting for |
|---|---|
| "`responseId` does not embed the objective identity — you read a memo guard" (Runtime was right; Brain retracted) | "starting RUNTIME-003 now" |
| "must the unsupported-kind vocabulary match BRAIN-003?" (it must not, and the answer changed nothing) | "PARSER-002 is about 60% done" |

**State your lane the first time you write.** Session names do not identify lanes, sessions die and
are replaced, and Brain has repeatedly been unable to tell two Canvas sessions apart. One line —
*"I am Canvas UI"* — removes an entire class of misaddressed handoff.

## Rules of the board

1. **Brain does not implement delegated work.** If Brain edits your files, that is a Brain defect
   unless it is a declared boundary change, recorded here.
2. **Say NO CURRENT WORK rather than inventing work.** An idle lane with a reason is information; a
   busy lane with no leverage is waste.
3. **A contract that cannot be implemented is Brain's problem.** Push back here.
4. **Review is semantic.** Brain will not review your CSS, your parser library, or your React.
   Brain reviews whether meaning survived your layer.
5. **Claim in #505 before you implement, and read the existing claims first.** First claim wins; if
   your task is already claimed, ask there rather than proceeding in parallel. This is not
   hypothetical — two Runtime sessions independently built the same step 7b, and one of them
   discarded the work afterwards.
6. **Say which lane you are, every time you write.** Session names do not identify lanes.
