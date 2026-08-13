# Canvas v1 — acceptance envelope

**This is a stop condition, not an architecture document.** Nothing here describes what Canvas should
eventually become; `docs/canvas-cognitive-runtime.md` does that. This file answers one question:

> **Is Canvas v1 ready for the owner to look at?**

The answer is yes only when every **REQUIRED** criterion below has **actual evidence** attached —
not an implementation, not a passing unit test, not a merged PR.

**Owner: you are not the scheduler.** The team runs autonomously against this file and stops with
`[OWNER REVIEW READY]`. See § *Escalation* for the only five things worth interrupting you for.

---

## The four words that are not synonyms

```
implemented   the code exists on a branch
merged        it is on main
deployed      a build of it exists
integration-proven   it was exercised on the deployment currently holding the production alias
```

**Only the fourth counts here.** A green `Vercel – nemesis-web` check is *not* sufficient: two
commits on `main` carry green checks on deployments that were `CANCELED` and never served.

Every claim of production proof must name:

```
production URL · serving deployment id · serving commit sha · the command that resolved it
```

```bash
vercel inspect https://app.enternemesis.com          # → dpl_XXXX and its aliases
git merge-base --is-ancestor <fix-sha> <serving-sha> # containment, not adjacency
```

---

## A. Source perception — REQUIRED

| # | Criterion | Evidence required |
|---|---|---|
| A1 | Supported source material can enter Canvas | a real source, uploaded through the ordinary path, reaching a canvas |
| A2 | Known parser loss stays explicit | a document with loss reports it; the loss is readable at the consumer, not re-derived |
| A3 | Trustworthy source structure becomes knowledge | knowledge objects extracted from a real production source |
| A4 | 🔴 Inability to perceive never masquerades as absence of knowledge | a degraded source and a clean source with nothing to say return **different** verdicts |

**A4 is the load-bearing one.** If it fails, Canvas eventually tells a student they are weak on
material the parser could not read — invisible, and it blames the learner.

## B. Knowledge → task — REQUIRED

| # | Criterion | Evidence required |
|---|---|---|
| B1 | Trustworthy extracted knowledge creates objectives **without** requiring 100% document representation | `objectives.length > 0` on a real canvas with `unrepresented > 0` |
| B2 | Unsupported / unmapped material stays disclosed | `unrepresented` still computed, still reported, still visible |
| B3 | Composition: supported tasks coexist with unsupported source material | one canvas showing both, simultaneously |

**The invariant:** trust gates objective creation; unrepresented coverage is **disclosure, not a
whole-document veto**. "Some of this document is unsupported" must never mean "ask nothing about
anything in this document" — otherwise composition exists visually while the cognitive loop is dead.

## C. The real adaptive evidence loop — REQUIRED

Proven on the **actual deployed application**, with **no development-only force flag**:

```
source → knowledge → objective → cognitive task → learner response
      → evaluation → learner evidence → readback → a DIFFERENT next decision
```

| # | Criterion | Evidence required |
|---|---|---|
| C1 | `learner_evidence` gains a row through ordinary use | the row, and the session that produced it |
| C2 | That row reads back with `operation`, `responseLatencyMs`, `responseId` | the readback |
| C3 | 🔴 The next decision differs **because of the evidence** | a counterfactual, not a sequence — see below |

### 🔴 C3 IS A COUNTERFACTUAL, NOT A BEFORE/AFTER DIFF

**A plain before/after comparison would pass a round-robin scheduler.** Integration found this
before the re-run rather than after, and it changes what a PASS means.

The decision is a function of more than evidence. `acknowledge()` — the learner reading a correction
and continuing — bumps `round` **and** adds the objective to `actedOn`
(`use-policy-runtime.ts:399-404`). Both feed the next decision. **Continue is explicitly not
evidence**, so a learner who reads a correction and continues gets a *different next decision with
no evidence written at all*. That is rotation, and a naive before/after diff reads it as adaptation.

**What a PASS therefore requires:**

1. **A negative control.** Capture the decision twice with **no submission in between**, exercising
   the same non-evidence interactions the real run performs. If it moves on its own, the comparison
   is void — and that instability is itself a P0 finding.
2. **Compare the decision INPUTS, not only the output.** Report `state.evidenceCount`, the
   session-local rotation state (`actedOn`, `round`) and the chosen objective for both captures.
   The difference must be attributable to evidence with rotation state held equal.
3. Only then does a post-submission difference count.

§G says *"inputs identical apart from the new evidence"* — that is a counterfactual by construction.
Do not judge by which question appears on screen. **A system that writes evidence and chooses the
same next task regardless is not adaptive; a system that chooses a different task for reasons
unrelated to evidence is not adaptive either, and is the easier of the two to mistake for success.**

## D. Rapid associative cognition — REQUIRED

| # | Criterion | Evidence |
|---|---|---|
| D1 | Typed and dictated production both work | both paths exercised |
| D2 | Semantic judging — not string equality | a synonym or differently-worded correct answer judged correct |
| D3 | Fast interaction feels fast | the tempo is not gated behind a lesson |
| D4 | 🔴 "I don't know" = no demonstration, never `incorrect` | the row: `demonstrationObtained: false`, `verdict: null` |
| D5 | 🔴 Receiving a correction creates **no** mastery evidence | no row claims demonstration from a correction |
| D6 | A correction requires later **independent** re-demonstration | the objective is asked again |

**D4 and D5 are hard invariants.** Viewing is not evidence. Continue is not evidence.
Acknowledgement is not evidence.

## E. At least one richer cognitive structure — REQUIRED

Causal knowledge is the current candidate. For `A → B → C → D`, Canvas must distinguish

```
demonstrated:  A → B,  B → C
missing:       C → D
```

rather than storing one coarse overall correctness label.

| # | Criterion | Evidence |
|---|---|---|
| E1 | Per-link outcomes are stored, not one overall verdict | evidence rows per objective |
| E2 | An unaddressed link records `not_demonstrated`, never `incorrect` | the row |

## F. Multi-objective responses — REQUIRED

One learner explanation may affect several objectives while remaining **one** response.

| # | Criterion | Evidence |
|---|---|---|
| F1 | One submission → one prompt → one `responseId` → several objective-level rows | rows sharing one `responseId` |
| F2 | `performancesIn(log).size === 1` for that submission | the assertion, executed |
| F3 | `responseLatencyMs` identical on every row of one answer, never divided | the rows |
| F4 | 🔴 Judge failure writes **ZERO** learner claims | an induced judge failure writing nothing |
| F5 | 🔴 "the judge established nothing" and "the judge never returned a usable judgement" are **different values** | the type: `{judged:true, outcomes}` \| `{judged:false}` |

**F5 must land before any multi-objective judge ships.** `judged:false` → zero rows.
`judged:true` with no outcome for a target → that target records *no demonstration*. An empty
`outcomes` array that means both is an outage silently writing "we asked and they showed nothing."

## G. Adaptation — REQUIRED

**Evidence must actually change what happens next.** This is C3 restated as a product criterion
because it is the one most easily faked: a system can write perfect evidence, read it back, and pick
the same task forever. Passing requires a demonstrated difference in the decision, with the inputs
identical apart from the new evidence.

## H. Minimap v1 — REQUIRED

| # | Criterion |
|---|---|
| H1 | Knowledge territory is visible |
| H2 | Current focus is visible |
| H3 | Recommended focus is visible |
| H4 | Learner state distinguishes unknown / weak / established |
| H5 | 🔴 Source-unmapped is **visually and semantically separate** from learner-unknown |
| H6 | 🔴 Choosing a region constrains **territory**, never selects a "mode" |

**H6 is the semantic heart.** Selecting "RAAS" means `focus_scope = RAAS`. It does **not** mean
"use flashcards". The learner chooses territory; Nemesis chooses cognitive strategy.

## I. UI — REQUIRED

| # | Criterion |
|---|---|
| I1 | Rapid tasks feel rapid |
| I2 | Deeper cognition can expand the surface |
| I3 | 🔴 Source uncertainty · learner unknown · no-demonstration · incorrect · actual completion never collapse into one state |
| I4 | 🔴 No UI claim of mastery may be derived from missing parser coverage |

---

## Escalation — the only five things worth the owner

```
[OWNER PRODUCT DECISION]     the north star genuinely cannot choose between two user experiences
[OWNER SPEND REQUIRED]       a paid limit or service is necessary
[OWNER DESTRUCTIVE ACTION]   an irreversible production or data operation
[OWNER SECURITY DECISION]    credentials, permissions, security posture
[OWNER REVIEW READY]         this acceptance envelope has passed
```

**Everything else the team handles itself** — implementation choices, bug fixes, tests, PRs,
ordinary merge conflicts, task sequencing, agent replacement, and any contract already settled by
the existing architecture. **A teammate ending, going idle, or losing its context is not an
escalation. Replace it.**

---

## The review packet

When every REQUIRED criterion passes, produce `docs/canvas-v1-review.md` containing:

- what Canvas now does, in plain English
- production URL **and serving commit sha**
- the acceptance checklist above with evidence against each line
- known limitations
- intentionally deferred capabilities, and why
- the flows and screens for the owner to inspect, named specifically
- only genuine remaining **product** questions — not engineering ones

Then stop with `[OWNER REVIEW READY]`. **Do not continue expanding Canvas after that point.**

---

## Recovery

Agent Teams are experimental: a resumed lead does **not** restore its in-process teammates. If the
Brain session is recovered after a crash:

```
read #505  →  read docs/canvas-agent-board.md  →  read this file
→ inspect main and open PRs  →  reconcile what is actually complete
→ spawn replacement teammates from .claude/agents/*.md
→ recreate the remaining task graph  →  continue the goal
```

**Anything that must survive the death of the whole team lives in issue #505, this file, or the
board — never only in a teammate's context.**
