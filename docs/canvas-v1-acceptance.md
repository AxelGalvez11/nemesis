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

## 🔴 THE GLOBAL INVARIANT — owner, 2026-08-12

> **Every claim the UI makes about the learner must be traceable to learner evidence.
> Every claim it makes about the source must be traceable to source capability.**

This one sentence would have prevented both defects found tonight: the *"I already know this"*
control, and the completion screen headlining **"Mastered."** unconditionally. Neither was caught by
a test, because neither is a bug — both are designs that were acceptable until this was written down.

Apply it to anything the surface asserts. If you cannot name the evidence behind a claim, the
surface may not make it.

## 🔴 J. CANVAS IS NOT A DOCUMENT READER — REQUIRED

**Owner architectural correction, 2026-08-12, after seeing the live surface.** The per-block hover
toolbar was the visible symptom; the interaction *model* is the defect.

What the surface does today:

```
generated lesson → paragraphs → hover a block → manually hide / mark known / collapse
```

What Canvas is:

```
determine what matters → expose only enough to encode it → require production
→ diagnose → adapt the surface → repeat
```

| # | Criterion | Why |
|---|---|---|
| J1a | 🔴 **A MASTERY CLAIM must be fully inert.** *"I already know this"* is removed; if any such affordance exists it writes no evidence, changes no estimate, **and has no sequencing effect either.** | A learner claiming knowledge is not a demonstration. **Acting on it at all — including by reordering — is treating self-report as demonstration.** If it hides material, self-report is changing the curriculum without evidence. |
| J1b | **An EXPOSURE ACKNOWLEDGEMENT may rotate the queue, and nothing more.** *"I've read this"* writes no evidence and changes no estimate of what the learner knows; moving that objective to the back of the queue is legitimate. | *"Don't repeat this immediately"* is not *"I know it."* |

**🔴 The line between J1a and J1b is what the learner actually asserted, and Integration found it —
the single rule I first wrote failed against merged, accepted behaviour.**

`acknowledge()` adds the objective to `actedOn`, and `actedOn` **is** an input to `decideNext`
(`policy-runtime.ts:41`). So an acknowledgement *does* change the next decision, deliberately, and
the code says so: *"SESSION STATE, AND DELIBERATELY NOT LEARNER STATE."* A rule demanding that no
self-report change what the policy decides next would have failed a design nobody thinks is broken.

| The learner asserts | True? | May it affect anything? |
|---|---|---|
| *"I have read this"* — **exposure** | **yes, observably** — they did | **sequencing only.** Never the estimate. |
| *"I know this"* — **knowledge** | **unknown; we have no evidence** | **nothing at all.** |

Exposure is a fact about what happened. Knowledge is a claim we cannot support. **An
acknowledgement of what happened may affect sequencing; a claim about what the learner knows may
affect nothing.**
| J2 | 🔴 **No manual per-block fold/expand in the primary Canvas.** | **Brain decides resolution**, from learner state: strong evidence → compress · weak or partial → expand · missing relation → expose that relation · re-demonstration → compress again. Manual folding is not the adaptive mechanism; it is a document-reader remnant. |
| J3 | **Provenance survives; the toolbar does not.** | *"Where did this come from?"* is legitimately useful. It should read as **evidence behind the Canvas** — a quiet citation marker, or answering the learner's own question — not as document-editing chrome. Exact presentation is UI's. |
| J4 | 🔴 **Uploaded material is not automatically rewritten into a mini-textbook.** | Exposition is **a cognitive strategy used when needed, not the default surface.** For an arbitrary association (`losartan ↔ Cozaar`), go straight to production. Expand only when evidence says the learner lacks the distinction. For causal material, expose only enough structure to build a model, then immediately require explanation, prediction or reconstruction. |

### 🔴 J2 EXTENDS TO EXPANDING — ruling 2026-08-13, and it reverses a wrong one

Integration asked whether a control that only reveals **more**, and stores nothing about the learner,
violates a criterion written to stop controls that **hide** material. Brain first ruled it permitted:
*"expanding asserts 'show me more', which is a request for information, not a claim about knowledge,
and it cannot hide anything."* **Every clause is true and the conclusion is wrong.**

**J2's harm was never only concealment.** The owner's own words, below:

> *"…appear, disappear, compress, **expand**, or change representation because Brain's estimate of
> the learner changed."*

`expand` is in that list. J2 is a rule about **who decides resolution**, not about which direction
the block moves. A manual expand is the learner managing AI-generated blocks — the named
prohibition.

**The resolution is not "no agency". It is where the agency lives**, and §K5 already decides it:
*navigation is scrolling; the control surface is the composer.*

| | |
|---|---|
| *"explain that properly"*, *"go deeper"* — **through the composer** | ✅ the learner states intent; **Brain** changes resolution |
| a per-block expand control | ❌ document-reader chrome; the learner edits the document directly |

Same capability, different seam. One produces intent the policy can act on and record; the other
bypasses the policy entirely. **This is the standing rule: remove the control, never the feature.**

🔴 **Unreachable is not compliant.** The click-to-reopen path cannot currently be triggered — 0 of 73
production blocks carry `collapsed` — but an affordance nobody can reach today is *undetonated*, not
absent. It fails J2 and it is removed, not left in place because nothing hits it.

**The principle, in the owner's words:**

> The learner should not manage AI-generated blocks. **The blocks themselves should appear,
> disappear, compress, expand, or change representation because Brain's estimate of the learner
> changed.**

**Worked example of the target, for the same material now on screen.** Instead of several paragraphs
explaining what generic and brand names are:

```
LOSARTAN
What brand name is it sold under?     → "Cozaar" → move on

DIOVAN
Generic?                              → move on
```

…and only if the learner repeatedly misses the *distinction* does Canvas expand to explain it — then
immediately requires another demonstration. The same Canvas moves from rapid recall to causal and
quantitative reasoning **without the learner changing modes**.

**Sequencing: this runs as independent UI cleanup alongside the P0. It must not derail
`RUNTIME-005` or the first evidence-loop proof.**

## 🔴 K. THE LEARNER DOES NOT SEE THE LESSON ENGINE — REQUIRED

**Owner architectural rule, 2026-08-13.** The design rule, in their words:

> **The learner sees the material and Nemesis's intelligence. They do not see Nemesis's lesson
> engine.**

Internally Nemesis may know the learner is on retrieval opportunity 2 of 8, that the last response
scored partial understanding, that FSRS says a concept needs reinforcement, and that the next node is
a transfer question. **None of that belongs in the primary Canvas.** Aggregate progress lives in the
Minimap and stats surfaces, for learners who deliberately ask.

Canvas should read as **a continuous intelligent conversation happening inside the material** —
closer to ChatGPT or Claude than to a quiz app.

| # | Criterion |
|---|---|
| K1 | 🔴 **No lesson-engine vocabulary on the primary surface.** No *"Recall 2 of 8"*, *"You wrote"*, *"Next"*, *"Question"*, *"Feedback"*, *"Correct"* banners. |
| K2 | **No answer card and no `"You wrote:"` wrapper.** The learner's answer does not get framed and returned to them. |
| K3 | **No explicit Next control.** The next thing materialises when Nemesis has determined what the learner needs. |
| K4 | **Correctness is not announced unless there is a reason** — emphasise a misconception, not a score. |
| K5 | **Navigation is scrolling; the control surface is the composer.** Remove explicit in-sequence navigation. The learner may type or dictate *"keep going"*, *"explain that"*, *"I don't understand preload"*, or simply answer. |
| K6 | **Temporary states are ephemeral thinking previews, not permanent chrome** — *"Checking your reasoning…"*, *"Connecting this to the previous concept…"*, *"Looking for the weak point…"*, *"Building from what you already understand…"*. They fade in and disappear as content streams. Ingestion uses the same language: *"Reading the lecture…" → "Identifying the main concepts…" → "Ready."* No progress workflow unless the work genuinely takes long enough for progress to matter. |
| K8 | 🔴 **The surface may remove, not only append.** A Canvas obeying every rule above can still be a chat log: no labels, no counters, and an ever-growing column of alternating turns. Prior interactions are *evidence*, and evidence lives in `learner_evidence`; they need not remain visible. Once an interaction has served its purpose it may collapse, fade, or leave the primary surface. See [`canvas-interaction-model.md` §A](./canvas-interaction-model.md#a-the-canvas-is-a-surface-not-a-transcript) — **including the precondition, which is that removing an element from the DOM must destroy nothing.** |

### 🔴 K1 IS A BAN ON CEREMONY, NOT A BAN ON WORDS — reconciliation, 2026-08-13

K1 forbids *"Correct"* banners; K4 says correctness is not announced without reason. The owner's
interaction-model specification permits a **minimal** correctness signal — `✓`, or the word
*Correct* — plus a subtle visual state change, and requires explicit `Partial` and `Misconception`
labels where a wrong *model* must be named. **That is not a contradiction, and it must not be
resolved by guessing.** The resolving principle:

> A label must carry **information the learner needs**. It must never **narrate the machine.**

A *"Correct"* banner after every right answer is machine narration — it tells the learner what they
already knew, with ceremony proportional to nothing. A `✓` sized to be skipped past is punctuation.
By the same rule, *"Partial"* and *"Misconception"* are **permitted under K1**: what kind of wrong
this is is exactly the information the learner needs, and nothing else conveys it.

Full four-tier contract:
[`canvas-interaction-model.md` §G](./canvas-interaction-model.md#g-feedback-intensity-scales-with-information-value).

### 🔴 K7 — THE ONE THAT CAN GO WRONG QUIETLY, AND THE EXISTING INVARIANT THAT PREVENTS IT

**A thinking caption must describe work that actually ran.**

`use-policy-runtime.ts` already holds this and it is not negotiable under the new direction:

> *"SET BY THE STEP ITSELF. Nothing advances this on a timer, and there is no ordered list it walks —
> if a phase is skipped or repeated, that is because the work was. A caption that cycled through
> plausible stages would be indistinguishable from a working system right up until it described
> something that never ran."*

The owner is asking for **more** of these captions and a richer vocabulary. That is right — and it is
exactly the change that makes theatre cheap. **A caption is a claim about what Nemesis is doing**, so
the global invariant covers it: *"Looking for the weak point…"* may only appear while something is
actually looking for a weak point.

**Never drive them from a timer, a fixed sequence, or a random pick from a list.** If a phase has no
step behind it, it does not exist.

## 🔴 L. CANONICAL NAVIGATION ARCHITECTURE — REQUIRED

**Owner decision, 2026-08-13. This is the canonical navigation model and it supersedes the
sidebar's current behaviour.**

**The sidebar represents DESTINATIONS, not content.** It is almost static:

```
nemesis
＋  New canvas
▤  Library
□  Calendar
◉  Stats
```

**No `Recent`. No folder tree. No canvas names. No growing list.** That is the failure mode being
avoided by construction: *"eventually the sidebar becomes a giant chronological dump. Nemesis users
aren't primarily trying to recover a conversation from three weeks ago. They're managing **bodies of
knowledge**."*

**Collapsed by default on the Canvas landing page**, because the composer is the primary action.

### The three-object model — the distinction that makes the rest follow

| Object | Is |
|---|---|
| **Canvas** | a learning workspace / session |
| **Source** | material attached to a canvas |
| **Folder** | organisation applied to **canvases** |

**Library's primary objects are CANVASES, not raw files.** It is the canvas manager:

```
Library          Search canvases…                    + New folder
All · Folders · Recent · Archived

Name                        Sources   Last opened
📁 Fall 2026
📁 Pharmacology
Hypertension                      8   Today
Diabetes pharmacotherapy         14   Yesterday
```

**Folders are entirely user-created**, arbitrarily nested (`Fall 2026 / PHCY 2105 / Hypertension`),
with an `Unfiled` default.

🔴 **Nemesis does not impose a one-lecture-per-canvas structure.** A canvas may hold a semester's
worth of material if the learner wants. Nemesis **may gently suggest** splitting one once it becomes
cognitively unwieldy — **organisation remains the learner's decision.** That is territory, and §H6
already says the learner chooses territory while Nemesis chooses cognitive strategy.

### The mental model, and it is the whole point

```
New canvas  →  learn
Library     →  find and organise what you have learned
Calendar    →  when things happen / when reviews are due
Stats       →  what Nemesis knows about your cognition
```

**New canvas is the front door** — straight to the minimal composer, *"What do you want to learn?"*,
with upload / record / dictate. **Nemesis creates the canvas automatically once they start**; it
appears under `Unfiled` and the learner files it later.

### 🔴 What this changes about earlier decisions

**Library is REINSTATED, with a different meaning.** The two-surface retirement removed Library as a
*file* manager and `/library` currently redirects to `/learn` — `learn/page.tsx` says so: *"THE HOME
IS ALSO THE LIBRARY. There is no /library navigation item any more."* **That comment is now stale.**
Library returns as a **canvas** manager, which is a different object.

**`Stats` is a new destination** and it is where aggregate progress lives — the surface §K sends
learner-facing progress to, for learners who deliberately ask.

### 🔴 CROSS-SURFACE HAZARD — check before shipping

`/library/classic` and `/library/source/[sourceId]` still exist as routes, and **the shipped browser
extension is recorded as hardcoding `/library?import=coursework`**. Changing what `/library` means
can silently change where an already-shipped extension lands. **Verify the extension's actual link
target before repointing `/library`** — a shipped client cannot be updated by this repo.

## A. Source perception — REQUIRED

| # | Criterion | Evidence required |
|---|---|---|
| A1 | Supported source material can enter Canvas | a real source, uploaded through the ordinary path, reaching a canvas |
| A2 | Known parser loss stays explicit | a document with loss reports it; the loss is readable at the consumer, not re-derived |
| A3 | Trustworthy source structure becomes knowledge | knowledge objects extracted from a real production source |
| A4 | 🔴 Inability to perceive never masquerades as absence of knowledge | a degraded source and a clean source with nothing to say are **distinguishable by the learner** — see the surface ruling below |

### 🔴 A4 — WHICH SURFACE OWNS "WE COULD NOT READ THIS". Decided 2026-08-13.

**It cannot be `CanvasPolicyView`, and that is now proved rather than observed.** Parser established
that the mount condition and the empty-state condition are exact logical complements:

```
MOUNT   policyPresenting = status === "ready" && (feedback !== null || decision !== null)
EMPTY   reached only when feedback is falsy AND decision === null
```

`feedback` is typed `| null` and initialised `null`, so *falsy* **is** `=== null`. The empty state
therefore requires exactly `policyPresenting === false` — which is *not mounted*. Both are computed
from the same object in the **same render pass**, so no frame exists where the child renders with
both null.

🔴 **The entire `if (!decision)` block is dead code, and always has been** — including
*"Nemesis couldn't read this material"*, which predates #509. **All three messages have never been
shown to a learner in any form.** That also retires the earlier "latent mastery-claim" framing:
there is no latent wrong message, because there is no message.

**`RUNTIME-005` moves the component from *not mounted* to *mounted showing a question*. It never
produces *mounted showing an empty state*.** No amount of copy fixes this where it sits.

**THE RULING — two surfaces, two different jobs:**

**1. Nemesis says it, in the conversation.** Under §K the learner sees the material and the
intelligence; the intelligence *speaks*. When the policy has nothing to contribute **because the
source was degraded**, that is what Nemesis says next — not a banner, not a card, not an empty-state
component. It arrives the same way any other turn arrives, and it is the moment the learner actually
needs it. **This satisfies §K by construction: it is not chrome, it is the conversation.**

**2. The source carries the durable fact.** A source with a known reading gap is marked *where
sources live*, inspectable — the same shape as provenance (§J3): **a claim about a source, attached
to that source.** The conversational message is momentary; this is the record.

**Why not a banner:** §K forbids chrome, and a banner would assert the fact permanently at the top of
a surface whose whole point is that the material owns the centre.

**#509's copy is not wasted and must not be reverted.** *"A gap in Nemesis's reading, not in what you
know"* is the right sentence; it simply belongs wherever the verdict lands rather than in a block
that cannot render.

**The distinction A4 actually tests is in the WORDS, not in the presence of a component:** *"I could
not read parts of this"* · *"I read this fine and it asserts nothing teachable"* · *"I have not asked
you yet"* must be three different things a learner can tell apart.

**SEQUENCED behind the two live UI specs (compact session mode, and §K).** The decision is made so it
stops blocking; the work queues.

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
| C4 | 🔴 **A response can leave the Canvas while its evidence still governs a later decision** | the trace below |

### 🔴 C4 — THE TEST THAT PROVES THE ARCHITECTURE, NOT THE FEATURE

**Owner criterion, 2026-08-13.** C1–C3 prove evidence is written, readable, and causal. C4 proves
the thing that makes Canvas *a state rather than a transcript* — that the durable record and the
visible surface are genuinely separate systems, and not merely described as separate.

```
learner answers
        ↓
the answer eventually LEAVES THE SCREEN
        ↓
twenty minutes later
        ↓
Brain still knows exactly what was demonstrated
        ↓
the next interaction reflects it
```

**This is the observable form of Canvas-wide invariant 11** — *screen state is replaceable; evidence
state is durable*
([`canvas-cognitive-runtime.md` §5](./canvas-cognitive-runtime.md#-11-screen-state-is-replaceable-evidence-state-is-durable)).

**Why it is worth its own criterion:** every other route to "the Canvas is not a transcript" is a
claim about rendering, and rendering claims are cheap. This one cannot pass by accident. A Canvas
that secretly depends on visible history as its memory will fail it, and will fail it *only* here —
every other criterion in this document would stay green.

**What makes it a real pass:**

- The disappearance must be **ordinary behaviour**, not a reload, a navigation, or a devtools
  deletion. If the element is removed by the harness rather than by the Canvas, the test proves
  nothing about the Canvas.
- The later decision must be **demonstrably caused by** that evidence — the same counterfactual
  discipline as [C3](#-c3-is-a-counterfactual-not-a-beforeafter-diff), not a plausible sequence.
- 🔴 **A page reload is the degenerate pass.** Re-fetching from the database after a reload proves
  the database works, which nobody doubts. The point is that the *live* surface let go of it and the
  *live* policy still knew.

**What it must NOT be read as licensing:** removing anything still doing work for the operation in
progress. See `minimal ≠ contextless` in invariant 11 — a half-built causal chain stays on screen
even though every part of it is durably stored.

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
2. **Hold the real inputs equal and vary only evidence.** `decideNext` takes exactly four inputs —
   `objectives`, `evidence`, `now`, `actedOn` (`policy-runtime.ts:41-44`) — and is verifiably pure:
   no `await`, no `supabase`, no `Date.now`, no `Math.random`. So C3 is a **replay**, not an
   observation: hold `objectives`, `now` and `actedOn` byte-identical and vary `evidence` alone.

   🔴 **The confound channel is `actedOn`, not `round`.** `round` is **not an input to
   `decideNext`** — it only feeds the memo guard that decides *when* a prompt is minted. An earlier
   version of this document said to hold `round` equal, which would have aimed the control at the
   wrong variable and let `actedOn` move underneath it. `actedOn` is the one that reorders the
   queue when a correction is acknowledged.
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

## 🔴 M. A CORRECT RETRIEVAL IS NOT TERMINAL — REQUIRED

**Owner runtime invariant, 2026-08-13:**

> **A successful retrieval suppresses immediate repetition; it does not suppress future retrieval.
> Every answer writes evidence, updates the learner model, and reschedules the knowledge object for
> future eligibility.**

**Two separate decisions follow every answer, and conflating them is the defect this guards against:**

| Decision | Correct | Partial / wrong |
|---|---|---|
| **UI transition** — what happens *now* | **auto-advance**, no Continue | show the correction long enough to absorb, then continue |
| **Memory scheduling** — when eligible *again* | fast + confident → longer interval · slow / hesitant → shorter, possibly again this session | partial → soon · incorrect → **delayed re-retrieval after intervening material** |

Repeated correct retrievals → progressively longer intervals.

🔴 **Auto-advance must NEVER mutate an item into "done forever." It means only: not the very next prompt.**

| # | Criterion |
|---|---|
| M1 | 🔴 A correct answer removes the objective from the **next** prompt, never from **future** eligibility. A named test goes red if `correct` ever becomes terminal. |
| M2 | Every answer writes evidence, updates the learner model, and **reschedules** the object. |
| M3 | 🔴 **After a correction, the same objective may not be the immediate next prompt.** Intervening retrievals come first — otherwise the learner echoes working memory and the re-ask measures nothing. |
| M4 | Repeated correct retrievals across time lengthen the interval. |

### The associative lane

> **Associative facts are cheap to present and cheap to answer. Prefer rapid, repeated retrieval with
> spacing and interleaving. A correct response advances instantly, but the fact remains active until
> the memory model has sufficient repeated evidence across time.**

```
Valsartan belongs to what class? → ARB  ✓  [next appears immediately]
   … 3–10 items later, or when the scheduler thinks useful …
Give me an example of an ARB.  → valsartan  ✓  [next]
   … then hours or days later, per the memory estimate …
```

### 🔴 M3 IN FULL, BECAUSE THE WRONG VERSION LOOKS RIGHT

```
FORBIDDEN                              REQUIRED
What is an ARB?  → wrong               What is an ARB?  → wrong
Correction: valsartan                  Correction: valsartan   [absorb]
What is an ARB?  → "valsartan"         … 2–5 other retrievals …
                                       Name an ARB.  → valsartan
```

**The forbidden version measures working memory, not learning.** The learner echoes a word still on
screen and the system records a demonstration that proves nothing. This is the same class as
`D6` — *a correction requires later independent re-demonstration*.

🔴 **`actedOn` moves an objective to the back of the queue — but the back of a two-item queue is the
next item.** Reordering is not spacing. With four objectives on the acceptance canvas this is live,
not theoretical.

### 🔴 THREE RECURRENCE PROBLEMS, AND THEY MUST NOT COLLAPSE INTO `actedOn`

| | Problem | Home |
|---|---|---|
| **1** | **Immediate suppression** — do not re-show the identical retrieval right after a correct answer | `actedOn` / reordering can plausibly do this |
| **2** | **Within-session spacing** — eligible again only after enough intervening cognition | 🔴 **reordering is INSUFFICIENT** — needs an explicit eligibility constraint |
| **3** | **Across-session memory scheduling** — correct today ≠ completed | **FSRS, and only here** |

```
answer → semantic evaluation → evidence written → learner state updated
      → immediate next-item selection
             ├─ session spacing / eligibility
             └─ longer-term FSRS scheduling
```

🔴 **With ONE objective, reordering does nothing at all. There is no back.** Layer 2 cannot be solved
by ordering. Candidate concepts — explicitly **not** a full FSRS: `notBeforeTurn` ·
`interveningRetrievals` · `recentlyCorrected` · `sessionEligibility`.

### The four behaviours that decide whether M1–M4 hold

```
CORRECT      A → correct
             next: A suppressed · later same session: A eligible again · future session: still scheduled

INCORRECT    A → incorrect, correction shown
             next: NOT A · after meaningful interference: A eligible again

SMALL SET    only A exists
             cannot be solved by "put A at the back" — needs a temporary eligibility constraint,
             or a different activity (read / explanation) before testing A again

REPEATED     A correct … A correct … A correct
             progressively LESS FREQUENT, not disappeared because evidence > 0
```

### 🔴 "PREFER WHAT'S UNESTABLISHED" IS A PRIORITY HEURISTIC, NOT A DEFINITION OF MASTERY

Given `A: 1 correct` and `B, C, D: no evidence`, going `B → C → D` before returning to `A` is right.
**But once those are established, `A` must re-enter consideration on memory uncertainty** — otherwise
**every objective has a one-shot lifecycle** and a single correct answer retires it forever.

The selection policy eventually thinks:

```
priority = learning_value × memory_risk × objective_importance × uncertainty × session_eligibility
```

**not** `hasEvidence ? lowPriority : highPriority`.

### Sequencing note

🔴 **"NOT REPRESENTABLE" IS A COMPLETE AND SUCCESSFUL VERIFICATION RESULT.** If the runtime lacks
within-session delayed eligibility, the correct outcome is *"M3 is not currently representable; a
small session-spacing capability is needed first"* — **not** a second pseudo-FSRS improvised inside
Canvas policy.

**Evidence first, scheduling derived.** `docs/canvas-cognitive-runtime.md` places FSRS downstream of
evidence, and `response → 1-4 → that IS learner state` remains forbidden. If proper spacing requires
a scheduling capability that does not exist, **it is named and sequenced — not improvised inside the
runtime.**

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

## 🔴 Two traps for whoever runs the trace

**`ensureKnowledgeForCanvas` WRITES.** Once the trust gate opens it calls `saveKnowledge`, so it is
**not a safe read-twice probe**. Knowledge rows appearing during a run are the application working
normally — they are **not** the loop closing, and must not be reported as evidence of it.

**Line numbers are not locations in this codebase.** The Canvas files move between worktrees while
work is in flight — `saveKnowledge` was read at `:164` and then `:199` within minutes of the same
session. **Pin a sha** in any runbook, finding or citation, or a successor will read a different
function than the one you meant.

## 🔴 What actually remains — the post-P0 sequence, decided in advance

**Assessed 2026-08-12 by Brain against `main` `f75ef698`, so the order after the loop is proven does
not have to be re-derived.** Nothing here authorises starting any of it early.

| Section | Remaining work | Owner |
|---|---|---|
| **A** source perception | under audit by Parser | Parser |
| **B** knowledge → task | **`RUNTIME-005` delivers all three** | Runtime |
| **C** the evidence loop | **`INTEGRATION-001` proves it** once B is deployed | Integration |
| **D** rapid associative cognition | mostly already built — see the D1 risk below | — |
| **E** richer cognitive structure | 🔴 **NOT BUILT.** `objectivesForKnowledge(causal)` returns `[]`. This is `BRAIN-003`. | Brain |
| **F** multi-objective responses | F1–F4 land with `RUNTIME-003` (#508); **F5 is `RUNTIME-006`** | Runtime |
| **G** adaptation | same evidence as C3 — the counterfactual | Integration |
| **H** Minimap v1 | 🔴 **NOT BUILT**, and blocked on Brain knowledge-state semantics | Brain → UI |
| **I** UI | under audit by Canvas UI | Canvas UI |

**So after `INTEGRATION-001` passes, three rocks remain: `RUNTIME-006` (F5), `BRAIN-003` (E), and
the Minimap (H).** In that order — F5 is a precondition of E, and H needs the knowledge-state
semantics that E produces.

### 🔴 A verification risk worth knowing about now, not at the end

**D1 requires dictated production to be exercised, and the browser pane blocks the microphone.**
The capability exists — `canvas-composer.tsx:143` distinguishes `spoken` from `typed` and carries it
through to evidence — but **an agent driving a browser pane cannot verify it**, and any claim that it
works from that surface would be unfounded.

Integration must not report D1 as proven from a browser-pane session. Acceptable outcomes: exercise
it on a real device, or **record D1 as `implemented but not agent-verifiable` and say so plainly in
the review packet.** Silently passing it is the failure mode this whole envelope exists to prevent —
a claim with no evidence behind it, indistinguishable from a verified one.

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
