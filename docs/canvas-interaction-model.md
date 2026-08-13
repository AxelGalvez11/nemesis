# Canvas — the interaction model

**Owner specification, 2026-08-13. Additive to [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md), which it does not supersede.**

The north star describes what Canvas must **know and decide**. This document describes **how the
learner and Canvas exchange it**. Neither replaces the other, and where this document is silent the
north star governs.

```
canvas-cognitive-runtime.md   what Canvas must know, infer and decide      COGNITION
canvas-interaction-model.md   how that reaches and returns from a learner  INTERACTION
canvas-v1-acceptance.md       what must be independently proven            EVIDENCE
```

---

## The organising claim

> **The unit of Nemesis is the learner's cognitive state, not the conversation.**

This is the same claim the north star makes from the cognitive side — *the policy question is never
what content comes next, it is what interaction changes this learner's state most* — restated as an
interaction rule. It is worth stating twice because the failure it prevents is a UI failure, not a
modelling one.

The conventional model, which Nemesis is not:

```
AI speaks → student answers → AI evaluates → AI speaks again
```

Courses, study plans, checkpoints, avatars and exercises can all be layered onto that model without
changing it. The fundamental unit stays a conversation. **Adding structure to a chatbot does not
produce an adaptive cognitive environment.**

The learner should feel the Canvas **restructuring around them**, not feel that they are chatting
with a tutor.

### The decision rule

Apply this to any Canvas interaction, existing or proposed:

> **Does this interaction help Nemesis obtain or change meaningful cognitive state with less
> friction — or is it reproducing a familiar tutor / chat / study-app convention?**

If the latter, reconsider it. Familiarity is not a justification.

---

## 🔴 What is new here, and what is restatement

**Read this table before implementing anything from this document.** Roughly half of the owner's
specification was already written down elsewhere; re-deriving it wastes a cycle, and treating a
restatement as a new requirement produces duplicate work in two lanes.

| Owner § | Status | Where it already lives, or why it is new |
|---|---|---|
| 1 · not a chat transcript | 🟡 **half new** | The *vocabulary* ban is acceptance §K1–K6. **The claim that interaction history may leave the surface entirely is new** — see [§A](#a-the-canvas-is-a-surface-not-a-transcript) |
| 2 · diagnostic-first, fast | 🟡 **half new** | *Diagnosis is continuous* is north star §4. **The frontier-search strategy is new** — see [§B](#b-frontier-finding-not-levels) |
| 3 · reading is the default modality | 🟢 **NEW** | [§C](#c-reading-is-the-default-output-modality) |
| 4 · frictionless dictation | 🟢 **NEW** | [§D](#d-dictation-should-make-retrieval-nearly-frictionless) |
| 5 · drawing as an answer modality | 🟢 **NEW** | [§E](#e-drawing-is-a-first-class-answer-modality) |
| 6 · no cognitively passive defaults | 🟡 **half new** | Non-goal 2 and evidence invariant 1 ban the passive case. **The positive rule for when recognition formats ARE correct is new** — see [§F](#f-the-interaction-must-measure-the-operation) |
| 7 · no manual sequencing | ⚪ restatement | North star §4 *No manual level*, §11 *the learner selects the territory*, non-goal 5 |
| 8 · correct answers barely interrupt | 🟡 **half new** | Acceptance §K4. **The permitted minimal signal is new and resolves a conflict** — see [§G](#g-feedback-intensity-scales-with-information-value) |
| 9 · feedback scales with information | 🟢 **NEW** | [§G](#g-feedback-intensity-scales-with-information-value) — the four tiers, and `misconception` as its own tier |
| 10 · streaks accelerate difficulty | ⚪ restatement | North star §9 *Variable tempo*, §7 *Compress before memorising* |
| 11 · many cognitive surfaces | ⚪ restatement | North star §10 *The generated surface*, §3 knowledge × operation |
| 12 · agency without friction | ⚪ restatement | Acceptance §K5 — the composer is the control surface |
| 13 · minimise visible machinery | ⚪ restatement | Acceptance §K, non-goal 5 |
| 14 · interaction-speed invariant | 🟢 **NEW** | [§H](#h-the-interaction-speed-invariant) |
| 15 · the intended feeling | ⚪ restatement | North star §1, §14 |

Restatement is not redundancy — it is corroboration from the product side of something previously
argued only from the architecture side, and it is worth having. But **the build queue comes from the
🟢 and 🟡 rows only.**

---

## A. The Canvas is a surface, not a transcript

**This is the most architecturally significant new claim in the specification.**

Acceptance §K already forbids lesson-engine *vocabulary*. It does not say anything about the
*shape* of what accumulates. A Canvas could obey every §K rule and still be a chat log — no labels,
no counters, no "You wrote", and yet an ever-growing append-only column of alternating turns.

The rule:

> **Previous interactions are evidence for the cognitive model. They do not need to remain visible
> as conversation history.**

Once an interaction has served its purpose it may **collapse, fade, or leave the primary surface
entirely.** The current surface matters more than the historical transcript.

### 🔴 The invariant this depends on, and it already exists

This is only safe because **the durable record and the visible surface are already separate
systems.** Evidence lives in `learner_evidence` and is written once, immutably, at the moment of
demonstration. The surface is a projection. Removing something from view therefore destroys nothing:
the learner's demonstration survives in the only place that was ever authoritative.

**If those two ever merge, this rule becomes data loss.** A Canvas that stores state by keeping it on
screen cannot fade anything. Any implementation of this section must be checked against that: *what
would be lost if this element were removed from the DOM right now?* The answer must be **nothing**.

### What follows

- The surface must be able to **remove** and not only append. This is a capability, not a style.
- What remains visible is chosen by the same policy that chooses what to ask — visibility is a
  **resolution decision**, exactly as acceptance §J2 already says folding is.
- Continuity, not cards. The Canvas should not read as a stack of discrete units, whether those
  units are chat bubbles or flashcards.

### Non-requirement

**This is not a requirement to delete history.** A learner may legitimately want to see what they
worked through. That is a *destination* — the Library, or a session review — not the primary
surface. See acceptance §L for why the distinction matters.

---

## B. Frontier-finding, not levels

North star §4 establishes that diagnosis is continuous and that the learner never picks a level.
Neither says **how Canvas should search.** This does.

Nemesis should initially assume **as little as possible** about the learner: begin near the
foundational level with retrieval or a diagnostic interaction, then escalate **rapidly** on
demonstrated understanding.

```
probe → succeed → JUMP → probe → succeed → JUMP → miss → NARROW
```

Not:

```
Level 1 → Level 2 → Level 3 → Level 4
```

**The objective is to locate the learner's frontier of understanding in as few interactions as
possible.** Walking someone through material they have already demonstrated is not thoroughness; it
is the cost the product exists to remove.

Worked example, and note how few steps reach real diagnostic value:

| # | Interaction | Result | Move |
|---|---|---|---|
| 1 | *What distinguishes innate from adaptive immunity?* | strong | jump — increase conceptual depth |
| 2 | *Why is clonal selection necessary for adaptive immunity?* | strong | jump — move to application |
| 3 | *A patient cannot express MHC II. Predict the major immunologic consequence.* | partial | **narrow** — investigate that weakness |

Three interactions to find the edge. A level ladder would still be on the first tier.

### 🔴 The trap

A jump policy that escalates on **one** correct answer will mistake a lucky recall for
understanding. North star §4 already governs this and is not weakened here: *no single signal
determines mastery*, and response time must be read relative to the cognitive operation. The jump is
justified by what the response **demonstrates** — causal depth, vocabulary, completeness — not by
the verdict alone.

**Escalating on a bare `correct` boolean is this section implemented wrongly.**

---

## C. Reading is the default output modality

Do not simulate a human tutor unnecessarily. **Text is usually substantially faster to consume than
generated speech.**

```
Nemesis displays concise information → learner reads → learner responds
```

Voice output exists as an **optional synchronised layer** for learners who prefer listening or need
accessibility support.

### 🔴 Voice input and voice output are independent settings

They must not be a single "voice mode" toggle. The combination that is likely the ideal high-speed
default is:

```
dictation ON  ·  read-aloud OFF
```

A learner enabling read-aloud must not thereby change the Canvas interaction model, and a learner
dictating answers must not thereby be read to.

### 🔴 Narration must never gate progress

**The learner must never wait for audio to finish before they can continue.** If speech is playing
and the learner answers, the answer wins. Any implementation where the composer is disabled, the
next surface withheld, or input buffered until narration completes violates
[§H](#h-the-interaction-speed-invariant).

---

## D. Dictation should make retrieval nearly frictionless

Free-response retrieval is central to Nemesis, and typing every response adds friction to the exact
operation the product most wants to be cheap.

**With explicit learner permission**, offer a setting of the form *"automatically listen when Nemesis
asks me a question."* When enabled:

1. A retrieval prompt appears
2. The microphone **automatically** enters listening state
3. A very subtle listening indicator appears
4. The learner answers naturally
5. Silence detection **or an explicit stop action** completes the response
6. Transcription appears quickly
7. Nemesis evaluates
8. The Canvas transitions immediately

The learner should not press the microphone for every retrieval once this permission is granted.

```
read fast → speak answer fast → evaluate fast → continue
```

### 🔴 Consent, and it is not a detail

This is the only part of the specification that turns a device sensor on without a per-use action.
Non-negotiables:

- **Explicit, informed, revocable opt-in.** Never on by default, never enabled as a side effect of
  enabling dictation-per-press.
- **An always-visible, always-reachable mute/stop control.** Not in a menu.
- **The listening state must be unambiguous** whenever the microphone is live.
- Silence detection is a convenience; **an explicit stop must always work.**

### 🔴 Verification hazard, known in advance

**The in-app browser pane blocks microphone access.** No agent can verify this feature there, and a
green check from that surface would be meaningless. It requires a real browser or device, and until
then any claim that auto-listen works must be stated as unverified rather than implied. See
[`canvas-v1-acceptance.md`](./canvas-v1-acceptance.md) on the difference between implemented and
proven.

---

## E. Drawing is a first-class answer modality

The persistent composer supports **three** fundamental response modes:

```
type  ·  dictate  ·  draw
```

A pencil control sits beside the microphone. It opens a lightweight work surface — **not a separate
application and not a "whiteboard mode"**. If drawing can simply *become* the current response
surface, it should.

Minimal initial tools, deliberately:

```
pen · eraser · stroke thickness · undo · redo · clear
```

### Why this is not a novelty

Drawing is **another way for the learner to demonstrate cognition**, and for a large class of
knowledge it is the *natural* way:

work a calculation by hand · draw a biological structure · sketch a mechanism · annotate an image ·
construct a diagram · draw a graph · show relationships spatially

Nemesis should interpret the work and **evaluate the reasoning** — not merely store an image. Where
useful it may afterwards normalise handwritten work into clean equations, diagrams or structured
steps.

### 🔴 The distinction from north star §10, which is easy to miss

North star §10 already lists *equation workspace*, *diagram* and *ordering interface* as surfaces
**Canvas may generate when it decides the cognition calls for them.**

**This section is the opposite direction.** Drawing is available to the **learner**, in the composer,
**regardless of what Canvas chose to present.** A learner facing a prose question may answer with a
sketch because that is how they think.

Those are different capabilities and both are required. One is Canvas choosing a surface; the other
is the learner choosing a modality.

---

## F. The interaction must measure the operation

Nemesis is not maximising clicks or quiz completion. Do not default to interactions that let a
learner progress without producing meaningful evidence.

**Forbidden as a default:**

```
prompt → think vaguely → press Space → reveal answer
```

Conventional flashcard revealing is not the primary retrieval mechanism. And **selecting** a correct
answer is not equivalent evidence to **generating** one — a distinction the evidence invariants
already make and which this section does not weaken.

### 🔴 But this is not a blanket ban on recognition formats

**This is the new part, and it corrects an over-reading of the existing non-goals.** Multiple choice,
matching, ordering, classification and drag-and-drop are legitimate **when the interaction itself
measures the cognitive operation being tested**:

| Format | Legitimate when the objective is |
|---|---|
| Ordering | sequence knowledge |
| Classification | categorisation |
| Image selection | recognition, in recognition-heavy domains |
| Multiple choice | occasionally, diagnostically |

The rule:

> **Choose the lowest-friction interaction that produces the evidence Nemesis currently needs.**
>
> Do not choose an interaction because it is a familiar study-app mechanic.

Both halves matter. The first permits recognition formats on merit; the second is why they are rare.

**The test is alignment, not format.** Ordering-as-the-objective is measurement. Ordering because
drag-and-drop feels interactive is a study-app convention wearing a cognitive justification.

---

## G. Feedback intensity scales with information value

> **Feedback intensity scales with information value, not success.**

A correct response contains **little new information for the learner**. They already knew it; that is
what "correct" means. Interrupting successful cognition to announce successful cognition is pure
friction.

Errors, partial answers and misconceptions are where the information is, and they justify more.

### The four tiers

| Verdict | Response |
|---|---|
| **Correct** | A minimal signal. Continue immediately. |
| **Partial** | Name precisely what was missing, then probe or remediate **that exact gap**. *"You identified specificity, but missed immunologic memory."* |
| **Incorrect** | The **smallest correction** that reorients the learner, then require them to reconstruct or apply it. |
| **Misconception** | 🔴 **Explicitly identify the mistaken model**, because this requires conceptual repair, then test the corrected model. *"Antibodies are effectors. They are not the mechanism that distinguishes self from non-self."* |

`misconception` as a tier distinct from `incorrect` is new. The difference is not severity — it is
that a wrong *answer* needs a correction while a wrong *model* will keep generating wrong answers
until it is named and replaced.

### Explicitly forbidden

*"Great job!"* · *"Excellent!"* · *"You nailed it!"* · celebratory animation · confetti · large
success cards · re-explaining what the learner just demonstrated.

```
question → answer → ✓ → harder question
```

**Successful cognition should make the session feel faster.**

### 🔴 Reconciliation with acceptance §K1 — read this before implementing

There is an apparent conflict and it must not be resolved by guessing.

- **Acceptance §K1** forbids *"Correct"* banners, and §K4 says correctness is not announced without
  reason.
- **This section** permits a minimal correctness signal — `✓`, or the word *Correct* — plus a subtle
  visual state change.

**Both are right, and the resolving principle is:**

> A label must carry **information the learner needs**. It must never **narrate the machine.**

A *"Correct"* banner after every right answer is machine narration: it tells the learner something
they already knew, in ceremony proportional to nothing. A `✓` that is the smallest possible
acknowledgement before the next thing is not a banner — it is punctuation, and its whole purpose is
to be skipped past.

By the same principle, the `Partial` and `Misconception` labels in the tiers above are **permitted
under §K1** even though they are labels: *what kind of wrong this is* is precisely the information
the learner needs, and it is not available any other way.

**§K1 is a ban on ceremony and score-keeping, not a ban on words.** Acceptance §K should be read
with this paragraph attached.

---

## H. The interaction-speed invariant

> **Minimise the time between cognitive operations.**

A core product invariant, stated here for the first time.

Every unnecessary click, animation, narration, confirmation screen, button press and success message
is friction. The ideal loop approaches:

```
see → think → respond → evaluate → adapt
```

and should feel almost continuous.

Processing states may use subtle thinking previews — acceptance §K6 already specifies their language
— but **they must not introduce artificial pauses.** A preview that exists to make the system look
thoughtful is friction wearing a costume.

### 🔴 How this relates to variable tempo, which it does not contradict

North star §9 says the Canvas should feel **variably** paced — fast retrieval, then slow expansion
when the cognition demands it. This section says the gaps should be **minimal**.

These are orthogonal and it is worth being explicit, because a careless reading makes them look
opposed:

```
VARIABLE TEMPO   the time spent THINKING varies with the cognition required   ← a feature
SPEED INVARIANT  the time spent NOT thinking approaches zero                  ← always
```

Deep conceptual work may legitimately occupy a learner for minutes. Waiting for an animation,
confirming a dialog, pressing Next, or listening to narration finish is not deep work. **Variable
tempo governs cognition; the speed invariant governs everything that is not cognition.**

---

## The intended feeling

Nemesis should not feel like:

talking to an AI tutor · completing generated lessons · doing flashcards · taking an endless quiz ·
scrolling a chatbot transcript

It should feel like **the material itself has become responsive.** The learner puts something in,
and the Canvas begins testing, explaining, compressing, connecting and resurfacing it according to
their changing understanding.

> **The learner does not operate the learning system. The learning system operates around the
> learner.**

---

## What this adds to the build queue

Derived from the 🟢 and 🟡 rows only. **Not sequenced here** — sequencing is the lead's, in
`canvas-agent-board.md` and issue #505.

| Item | Lane | Note |
|---|---|---|
| Surface can remove, not only append | Canvas UI | [§A](#a-the-canvas-is-a-surface-not-a-transcript). Check the DOM-removal question first — it is a precondition, not a detail |
| Escalate on demonstration, not on a `correct` boolean | Runtime | [§B](#b-frontier-finding-not-levels). The trap is the whole task |
| Read-aloud as a setting independent of dictation | Canvas UI | [§C](#c-reading-is-the-default-output-modality) |
| Narration never gates the composer | Canvas UI | [§C](#c-reading-is-the-default-output-modality) |
| Auto-listen on a retrieval prompt | Canvas UI + Runtime | [§D](#d-dictation-should-make-retrieval-nearly-frictionless). Consent design is part of the task. **Not verifiable in the browser pane** |
| Drawing in the composer | Canvas UI | [§E](#e-drawing-is-a-first-class-answer-modality). Interpretation of the drawing is a separate, later task |
| Recognition formats permitted on alignment | Runtime | [§F](#f-the-interaction-must-measure-the-operation). Widens what the policy may choose |
| `misconception` as a tier distinct from `incorrect` | Runtime | [§G](#g-feedback-intensity-scales-with-information-value). 🔴 Touches the evidence schema — north star non-goal 10 applies: **do not add the field before something can observe it** |
| §K1 read with the reconciliation attached | Canvas UI | [§G](#g-feedback-intensity-scales-with-information-value) |

### 🔴 One item that is a schema decision, not a UI one

`misconception` is currently a **signal** in north star §4, not a stored verdict. Making it a
feedback tier implies the judge can distinguish *a wrong answer* from *a wrong model* — and north
star non-goal 10 forbids adding an evidence field before something can observe it, because the
backfill will invent history.

**So the order is: prove the judge can make the distinction, then store it, then present it.** Not
the reverse.

---

## Related

- [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md) — what Canvas must know and decide
- [`canvas-v1-acceptance.md`](./canvas-v1-acceptance.md) — what must be proven, and §J/§K/§L/§M
- [`canvas-agent-board.md`](./canvas-agent-board.md) — the durable roadmap
