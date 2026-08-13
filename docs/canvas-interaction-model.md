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

🔴 **Section letters in this document are its own.** `canvas-v1-acceptance.md` also has a §J, §K, §L
and §M, and they are **different sections about different things**. Always name the document when
citing a letter — *"interaction-model §J"*, not *"§J"*. Two lanes have already lost time to a
mis-cited location in this area.

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

### 🔴 The invariant this depends on

Promoted out of this document: it is **Canvas-wide invariant 11**, in
[`canvas-cognitive-runtime.md` §5](./canvas-cognitive-runtime.md#-11-screen-state-is-replaceable-evidence-state-is-durable),
because it binds Runtime and Brain as much as UI.

> **Removing an element from the rendered Canvas must never destroy durable learner or source state,
> and Canvas should retain only the information still necessary for the current cognitive operation
> or immediate continuity.**

This is safe because the durable record and the visible surface are already separate systems.
Evidence lives in `learner_evidence`, written once at the moment of demonstration. The surface is a
projection.

**If those two ever merge, this rule becomes data loss.** A Canvas that stores state by keeping it
on screen cannot fade anything.

#### 🔴 `minimal ≠ contextless` — the correction that matters

An earlier draft of this section proposed the test *"what would be lost if this element were removed
from the DOM right now? The answer must be nothing."* **That is too strong and it is corrected here**
(owner, 2026-08-13), because it would license removing things the learner is actively reasoning
inside.

Some information is temporarily necessary for the operation in progress **even though it is durably
stored elsewhere.** Mid-way through a causal reconstruction:

```
ACE inhibition
   ↓
angiotensin II ↓
   ↓
   ?
```

Removing the visible chain here destroys the working context. That the chain is saved in the
database does not make it redundant *right now* — the learner is holding a partially built model and
the screen is where they are holding it.

**The test is therefore two questions, not one:**

```
1. would removing this destroy durable state?          must be NO
2. is this still doing work for the CURRENT operation?  if YES, it stays
```

A Canvas that passes only the first test is minimal and unusable. Fading is a **cognitive** decision
about working context, not a storage argument.

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

### 🔴 Vary the evidence form across a large jump

**Owner constraint, 2026-08-13.** Where practical, a large jump should be justified by a **different
form of evidence** than the one before it, not another instance of the same form.

> **One lucky factual retrieval must not promote someone through an entire conceptual hierarchy.**

The worked example above already does this without saying so, and it is why three steps were enough:

```
1  recall / distinguish   → what distinguishes innate from adaptive immunity?
2  explain / justify      → why is clonal selection NECESSARY?
3  predict / apply        → MHC II cannot be expressed — predict the consequence
```

Three different cognitive operations, each a **harder kind** of demonstration rather than a harder
instance of the same one. Two consecutive recalls would have been two samples of one ability; the
sequence above triangulates.

This is the practical form of north star §4's *no single signal determines mastery*, applied to
escalation specifically. **A ladder of same-form questions is a level ladder with the labels
removed.**

---

## C. Reading is the default output modality

Do not simulate a human tutor unnecessarily. **Text is usually substantially faster to consume than
generated speech.**

```
Nemesis displays concise information → learner reads → learner responds
```

### 🔴 Reading is the default ENCODING SURFACE, not the default ACTIVITY

**Owner clarification, 2026-08-13, and it prevents a specific failure.**

Reading is the default surface **when genuinely new structure must be introduced.** It is not what
Canvas does by default. Read the other way, this section quietly recreates **the AI-textbook
problem** — Nemesis generating prose to be consumed, which is exactly what acceptance §J4 already
forbids.

Once enough structure exists for production to be useful, **Canvas moves into production quickly.**

```
new model required            →  minimal reading / representation  →  production
existing model likely enough  →  production immediately
```

The second row is the common case and it should feel like it. Introducing material the learner can
already produce is not preparation; it is the cost the product exists to remove — see
[§B](#b-frontier-finding-not-levels).

**"Minimal" is doing real work in that first row.** Enough representation to make production
possible, and no more. The measure of an explanation is not whether it was complete; it is whether
the learner could then produce.

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

### 🔴 The general rule this establishes, which is bigger than drawing

**Owner, 2026-08-13:**

> **Response modality is independent of presentation modality.**

```
Canvas shows prose      →  the learner may answer by DRAWING
Canvas shows a diagram  →  the learner may answer VERBALLY
Canvas shows an equation→  the learner may answer with HANDWRITING
```

**Canvas chooses the cognitive demand. The interface accepts the most natural way of demonstrating
the mental model.** Those are separate decisions and coupling them costs evidence: a learner who
thinks spatially, forced to type, produces a worse demonstration of a model they actually hold — and
Nemesis records the friction as weakness.

Drawing is the first instance of this rule, not the extent of it.

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

Stated as the general rule (owner, 2026-08-13):

> **Feedback earns screen space only when it changes what the learner knows or needs to do.**

```
✓                                                        punctuation
"Correct! Great job!"                                    machine narration
"You're treating resistance and current as increasing
 together."                                              diagnostic information
```

The third earns its space because it names a **wrong model** — nothing else conveys it, and the
learner cannot repair what has not been named.

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

## I. The composer is the only progression control

**Owner specification, 2026-08-13.** Canvas introduces **no** separate `Next`, `Continue`,
`Done reading` or equivalent. The persistent composer is the primary interaction surface, and the
same control means different things in different states.

### Exposition state — an empty composer offers `✓`

When Canvas is showing material the learner needs to inspect before another cognitive operation:

```
[ Ask something…                                    ✓ ]
```

🔴 **`✓` means exactly one thing:**

> *I am finished inspecting this state and am ready for Canvas to continue.*

It does **not** mean *I understand this* · *I know this* · *I mastered this* · *mark this complete*.

**Therefore `✓` writes no learner evidence and creates no mastery inference. It is progression
telemetry only.** This is evidence invariant 3 (*clicking Continue is not evidence*) applied to a
control that looks more like agreement than Continue did — which is exactly why it needs saying.

### The moment a response begins, the same control becomes send

```
[ Why does aldosterone increase potassium?          ↑ ]
```

🔴 **There is never both a `✓` and a send button.** One location, one primary action, determined by
state. Clearing the composer while still in an exposition state may return it to `✓`.

**Voice follows the same semantics.** Dictation creates a response, so it moves the composer into
submission behaviour exactly as typing does.

### Production state — there is no escape hatch

When Canvas is explicitly requiring a demonstration:

```
Why does AT1 blockade increase serum potassium?
[ Type or speak your answer…                          ]
```

**No `✓`.** Send becomes available only when there is a response to submit.

> 🔴 **A learner must not be able to bypass retrieval, explanation, reconstruction, calculation,
> drawing, application, or any other required cognitive operation by pressing Continue.**

The whole rule in four lines:

```
exposition   empty composer  →  ✓            response begins  →  send
production   empty composer  →  NO control   response exists  →  send
```

**The compact composer requirement stands.** It remains visually subordinate to the Canvas content
and must not become a large ChatGPT-style hero element inside an active session.

---

## J. A question rewrites the Canvas

**Owner specification, 2026-08-13, and it is the most architecturally demanding item in this
document.**

When a learner asks about material currently on screen, **do not default to appending a chatbot
answer underneath the passage.**

> **The question is evidence about what representation is currently insufficient.**

Brain decides whether the right response is to clarify inline, rewrite a local block, reconstruct a
connected conceptual region, or reconstruct most of the page. The governing principle:

> **Rewrite the smallest semantic region sufficient to repair the learner's mental model.**

🔴 **Rewrite scope follows knowledge dependency, not visual boundaries.** A paragraph and a page are
layout facts. What must change is decided by what depends on the missing model.

### Rewrite radius

| Radius | Use when | Example |
|---|---|---|
| **0 — inline clarification** | a word, phrase, acronym, or tiny factual uncertainty | *"What does depolarization mean here?"* |
| **1 — local concept rewrite** | one concept is represented poorly **for this learner** — change language, analogy, diagram, or level of detail | *"Why does sodium enter the cell?"* |
| **2 — connected-region reconstruction** | the gap spans a causal chain, mechanism, sequence or comparison | *"I don't understand how blocking AT1 increases potassium."* |
| **3 — page-level reconstruction** | the learner lacks the **organizing schema** needed to interpret most of the screen. **Rare.** | a nephron page of segment detail, and the learner asks *"what is the kidney actually trying to accomplish?"* |

At radius 2, rather than adding another explanatory paragraph beneath several disconnected ones,
Canvas replaces the region with a representation that makes the dependency structure legible:

```
AT1 blockade  →  aldosterone ↓  →  potassium secretion ↓  →  serum potassium ↑
```

At radius 3, Canvas may temporarily reconstruct the page around a simpler organizing model, then
progressively restore detail. **Fixing one paragraph is insufficient when the learner lacks the model
that gives the whole page meaning.**

### The decision test

> **If I repair only this local representation, will the surrounding material now make sense?**

**Yes** → stay local. **No** → identify which connected concepts depend on the missing model, and
widen the radius to cover them.

Whole-page reconstruction happens only when the missing model **materially changes the usefulness or
interpretation of most of the current surface.**

### A question may interrupt the planned trajectory

The learner may ask at essentially any appropriate point, and **a question in the composer is not a
separate chat thread** — it is an input to the current Canvas state. Brain may answer directly,
rewrite the representation, expose a prerequisite, narrow or broaden scope, change modality, or
scaffold, and then resume or adapt the cognitive trajectory.

🔴 **Do not preserve an artificial distinction between "lesson content" and "chat answer"** when
restructuring the Canvas is the better response.

### How this composes with [§A](#a-the-canvas-is-a-surface-not-a-transcript)

A question and its response need not persist as `USER → question → NEMESIS → answer`. The durable
record retains the interaction; the rendered Canvas holds whatever is still useful.

```
original passage
   ↓  the question reveals a missing mechanism
passage TRANSFORMS into a causal representation
   ↓
the question itself may leave the screen
   ↓
the repaired representation remains only as long as it is useful
   ↓
retrieval follows
```

🔴 **Do not turn Canvas into chat history with disappearing CSS. The workspace itself changes
representation.** Fading a transcript is still a transcript.

---

## K. Preserve spatial stability unless cognition requires change

> **Preserve unaffected Canvas content whenever possible. Adapt aggressively where learner cognition
> requires it, while minimizing unnecessary spatial instability.**

**Adaptation is not gratuitous regeneration.** If one mechanism is misunderstood, do not regenerate
unrelated material merely because generation is cheap. The learner needs enough stable spatial
context to stay oriented.

This is the counterweight to [§J](#j-a-question-rewrites-the-canvas), and the two are load-bearing
together: §J says rewrite as widely as the dependency requires; §K says **not one block wider.**

---

## L. A rewritten explanation is scaffolding, not evidence

🔴 **This is the one in this batch most likely to be violated by accident, because a good rewrite
feels like progress.**

If a learner asks a question and Canvas rewrites the passage far better, **reading that new
representation proves nothing about whether they now understand it.**

```
learner question
   → infer the representation or model gap
   → rewrite the appropriate semantic region
   → learner inspects the scaffold
   → the scaffold eventually compresses or leaves
   → LATER INDEPENDENT PRODUCTION
   → evaluate the demonstration
   → update learner state
```

**No mastery evidence may be written from:** opening an explanation · reading rewritten content ·
pressing `✓` · asking a clarifying question.

Those are **observations that may influence policy.** They are not demonstrations of knowledge. This
is evidence invariants 1–4 restated for a surface that did not exist when they were written.

---

## Ownership — Runtime provides mechanism, Brain decides meaning

🔴 **Runtime must not infer these semantics from UI events.**

| Runtime provides the mechanism for | Brain owns the decision |
|---|---|
| semantic-region replacement | the **rewrite radius** |
| preserving unaffected blocks | whether a rewrite is needed **at all** |
| retiring rendered state without losing durable state | which knowledge dependencies are implicated |
| composer progression events that create **no evidence** | what representation is cognitively appropriate |
| learner-message interruption | what subsequent demonstration should verify the repair |
| transition back into adaptive cognition | |

The failure this partition prevents: a runtime that watches a click and concludes *"they must have
understood, so compress"* has invented a learner-state inference from a UI event, which is
`response → 1-4 → that IS learner state` wearing different clothes.

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
| Surface can remove, not only append | Canvas UI + **Runtime** | [§A](#a-the-canvas-is-a-surface-not-a-transcript). Runtime must be free to **retire** an interaction; UI must not build a transcript. Proven by acceptance **C4** |
| Escalate on demonstration, not on a `correct` boolean | Runtime | [§B](#b-frontier-finding-not-levels). The trap is the whole task |
| Vary the evidence **form** across a large jump | Runtime | [§B](#-vary-the-evidence-form-across-a-large-jump). A ladder of same-form questions is a level ladder with the labels removed |
| Production-first; reading only to introduce new structure | Runtime | [§C](#-reading-is-the-default-encoding-surface-not-the-default-activity). Guards against the AI-textbook failure |
| Response modality independent of presentation modality | Canvas UI | [§E](#-the-general-rule-this-establishes-which-is-bigger-than-drawing). Drawing is the first instance, not the extent |
| Read-aloud as a setting independent of dictation | Canvas UI | [§C](#c-reading-is-the-default-output-modality) |
| Narration never gates the composer | Canvas UI | [§C](#c-reading-is-the-default-output-modality) |
| Auto-listen on a retrieval prompt | Canvas UI + Runtime | [§D](#d-dictation-should-make-retrieval-nearly-frictionless). Consent design is part of the task. **Not verifiable in the browser pane** |
| Drawing in the composer | Canvas UI | [§E](#e-drawing-is-a-first-class-answer-modality). Interpretation of the drawing is a separate, later task |
| Recognition formats permitted on alignment | Runtime | [§F](#f-the-interaction-must-measure-the-operation). Widens what the policy may choose |
| `misconception` as a tier distinct from `incorrect` | Runtime | [§G](#g-feedback-intensity-scales-with-information-value). 🔴 Touches the evidence schema — north star non-goal 10 applies: **do not add the field before something can observe it** |
| §K1 read with the reconciliation attached | Canvas UI | [§G](#g-feedback-intensity-scales-with-information-value) |
| Composer `✓` in exposition, send on input, neither in production | Canvas UI | [§I](#i-the-composer-is-the-only-progression-control). 🔴 `✓` writes no evidence — the control must not be wired to anything that does |
| Semantic-region replacement | Runtime | [§J](#j-a-question-rewrites-the-canvas). Mechanism only — **radius is Brain's** |
| Preserve unaffected blocks across a rewrite | Runtime | [§K](#k-preserve-spatial-stability-unless-cognition-requires-change) |
| Rewrite-radius decision | **Brain** | [§J](#j-a-question-rewrites-the-canvas). Not delegable to a lane that sees only UI events |
| A question is an input to Canvas state, not a chat turn | Runtime + Canvas UI | [§J](#a-question-may-interrupt-the-planned-trajectory) |

### 🔴 One item that is a schema decision, not a UI one

`misconception` is currently a **signal** in north star §4, not a stored verdict. Making it a
feedback tier implies the judge can distinguish *a wrong answer* from *a wrong model* — and north
star non-goal 10 forbids adding an evidence field before something can observe it, because the
backfill will invent history.

**So the order is: prove the judge can make the distinction, then store it, then present it.** Not
the reverse.

---

---

## 🔴 What these rules DELETE — the part that is not a document

**Owner, 2026-08-13:** *"make sure those rules actually delete legacy assumptions from the runtime
instead of merely making the docs describe a better Canvas."*

A specification that only adds is a specification that will be satisfied on paper. Every rule above
contradicts something **currently running in production**, and those contradictions are named here so
the work is a deletion list rather than a reading list.

### The legacy six-stage machine is the largest one

```
lesson → recall → test → diagnose → complete
```

That is **a transcript with a fixed shape**, and it is not a metaphor — it is a literal ordered
sequence of stages, in production, drawing the screen today. Measured against this document it
violates:

| Rule | How |
|---|---|
| [§A](#a-the-canvas-is-a-surface-not-a-transcript) | its stages **are** the transcript; the sequence is the model |
| [§B](#b-frontier-finding-not-levels) | a fixed order is a level ladder — it cannot jump and cannot narrow |
| [§G](#g-feedback-intensity-scales-with-information-value) / acceptance §K1 | **all four §K literals live in it** — `canvas-stages.tsx` draws *Recall · N of M*, *Test · N of M*, *You wrote* |
| [§H](#h-the-interaction-speed-invariant) | stage transitions are machinery the learner waits on |
| north star invariant 8 | **it has never written a `learner_evidence` row** — `recordEvidence` has exactly one caller and it is not this arm |

And the structural fact that makes it urgent rather than merely wrong:

🔴 **`canvas-hosting.ts:164` — `policy = policyPresenting && !evidenceStage`.** Every evidence stage
hands the surface to the legacy machine, and **there is no ordinary path back**: `reset` builds a
*new* canvas and is reachable only from `complete`, itself an evidence stage. **The legacy arm
permanently displaces the compositional runtime on any canvas it captures.**

So a learner who answers one question is, from that moment, in a fixed-sequence quiz that records
nothing — while every document in this repository describes an adaptive runtime. **That gap is the
real state of the product, and no amount of specification closes it.**

### The honest register

| | |
|---|---|
| **Written down and true** | the compositional runtime, evidence loop, trust gate, eligibility |
| **Written down and contradicted by running code** | §A, §B, §G, §H, acceptance §K — all blocked behind the legacy arm |
| **Not yet written and not yet built** | §D auto-listen · §E drawing · `misconception` as a stored verdict |

Only the middle row is a **deletion**. It is also the row that makes the other two matter: shipping
§E into a surface the legacy machine can capture means building a modality a learner loses the
moment they answer a question.

### The one measurement that should gate self-congratulation

> **On a canvas a learner has actually answered a question in — which machine is drawing the
> screen?**

Until that answer is *the compositional runtime*, every rule in this document is describing a Canvas
that a learner reaches only before they start working.

---

## Related

- [`canvas-cognitive-runtime.md`](./canvas-cognitive-runtime.md) — what Canvas must know and decide
- [`canvas-v1-acceptance.md`](./canvas-v1-acceptance.md) — what must be proven, and §J/§K/§L/§M
- [`canvas-agent-board.md`](./canvas-agent-board.md) — the durable roadmap
