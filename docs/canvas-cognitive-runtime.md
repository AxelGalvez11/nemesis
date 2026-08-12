# Canvas — the adaptive cognitive runtime

> **This document defines the INTENDED cognitive architecture of Canvas. It is a target, not a
> description of what exists.**
>
> Consult it before making any major change to the Canvas runtime, knowledge extraction, teaching
> policy, learner evidence, or presentation layer.
>
> **§12 is the only section that describes today.** Everything else describes where this is going.
> Do not read an aspiration in §1–§11 as a claim that something is built — [§12](#12-current-implementation-status)
> holds the dated capability matrix, and it is the one section that must be updated whenever
> behaviour changes.

Owner-authored, 2026-08-12. Companion to [`document-intelligence.md`](./document-intelligence.md)
(what Nemesis can read) — this is what Nemesis does with it.

---

## 1. Purpose

Canvas is Nemesis's adaptive cognitive runtime. Its job is to continuously answer one question:

> Given the structure of this knowledge, the learner's inferred cognitive state, their goal and
> their available time, **what interaction is most likely to produce the highest useful learning
> gain next?**

It is **not** fundamentally a lesson renderer, a flashcard engine, a chat interface, or a document
viewer. Any of those may appear as a *form* Canvas takes for a moment; none of them is what it is.

The work Canvas automates is not only teaching. It is the **metacognitive** work a student does
manually when they study — deciding what matters, what is high yield, what can be ignored, what
they already know, what they are weak on, what unlocks what, what must be memorised versus derived,
what should be grouped, whether a mnemonic would help, what to practise next, and when something
needs revisiting.

The learner supplies material and a goal. Canvas does the rest.

---

## 2. The core loop

```
SOURCE / TOPIC / GOAL / TIME CONSTRAINT
          ↓
    map the knowledge
          ↓
   organise and compress it
          ↓
     estimate yield
          ↓
    infer learner state
          ↓
select highest-value objective
          ↓
 select learning strategy
          ↓
select cognitive operation + difficulty
          ↓
render the appropriate interaction
          ↓
      learner responds
          ↓
observe: correctness · elapsed time · language · hesitation · completeness ·
         misconceptions · scaffolding dependence · transfer · history
          ↓
infer what the response actually DEMONSTRATES
          ↓
    update learner state
          ↓
correct / scaffold / compress / advance
          ↓
require re-demonstration when warranted
          ↓
        repeat
```

The policy question is never *what content comes next*. It is *what interaction changes this
learner's state most*.

---

## 3. Knowledge representation

**Knowledge structure and cognitive operation are separate dimensions.** This is the single most
important modelling rule in this document, and the easiest to violate by accident.

### Knowledge types

associations · attributes · taxonomy · sequences · causal relationships · mechanisms · concepts ·
rules · exceptions · procedures · quantitative relationships · spatial relationships ·
representations and graphs · patterns · diagnostic relationships · decisions and prioritisation ·
interactions between variables · argument and evidence structures · temporal relationships

### Cognitive operations

recall · classify · distinguish · compare · explain · reconstruct · sequence · calculate · predict ·
apply · diagnose · justify · critique · prioritise · integrate · transfer

### 🔴 Never collapse the two

Do **not** create a knowledge type called `compare_contrast_question`. Compare/contrast is an
*operation over* knowledge, not a kind of knowledge. A type list that starts absorbing operations
will produce a combinatorial explosion of near-duplicate types, and the policy will lose the ability
to ask the same knowledge a harder question.

One lecture becomes a network, not a sequence of pages:

```
Diovan ↔ valsartan                        association
valsartan ∈ ARBs                          taxonomy
ARB → blocks AT1 receptor                 mechanism
AT1 blockade → ↓ aldosterone              causal
↓ aldosterone → ↑ potassium               causal
ARB + spironolactone → ↑ hyperkalaemia    interaction
```

Those are different kinds of knowledge and **must not all be taught with the same interaction.**

---

## 4. Learner-state inference

Canvas is not merely delivering material. **Every interaction is both a learning event and a
diagnostic event.** Canvas is continuously trying to infer what the learner knows, how well, how
they are reasoning, and what support they need next.

### Signals

correctness · partial correctness · misconceptions · omissions · explicit uncertainty · elapsed
response time · hesitation and revisions where observable · response language · causal depth of
explanation · vocabulary used · vocabulary clarification requests · dependence on cues · amount of
scaffolding required · success under application · success under transfer · historical performance ·
time since prior demonstration

### 🔴 No single signal determines mastery

**Response time must be interpreted relative to the cognitive operation.** A 15-second associative
recall and a 15-second causal explanation mean very different things. A fast answer is not
automatically deep; a slow answer is not automatically weak. Time is evidence about *automaticity*,
weighed against knowledge type, operation, difficulty, and that learner's own baseline.

**Answer language is evidence, not decoration.** These must not produce identical state updates:

| Response | What it demonstrates |
|---|---|
| "ACE inhibitors cause high potassium." | Factual recall |
| "Because it blocks potassium excretion." | Partial — conclusion without mechanism |
| "ACE inhibition lowers angiotensin II, which lowers aldosterone, so the kidney secretes less potassium." | A causal model |

All three point at the same conclusion. Only the third demonstrates the structure.

### Diagnosis is continuous, not a test phase

Traditional systems separate teaching from testing. Canvas does not. Asking *"what does aldosterone
mean?"* is diagnostic evidence. Taking 25 seconds over something previously answered in 3 is
diagnostic evidence. Right conclusion with wrong mechanism is diagnostic evidence. Answering a fact
correctly but failing when it is embedded in a case is diagnostic evidence.

The central question is never *was the answer right*. It is **what does this response demonstrate
about what the learner currently understands**.

### No manual level

The learner never chooses beginner / intermediate / advanced. The interaction reveals their state,
and the model gets more accurate the longer they use it.

---

## 5. Evidence invariants

**These are hard architectural rules. Code that violates one is architecturally wrong even when the
interface appears to work.**

1. **Viewing content is not evidence.**
2. **Receiving a correction is not evidence.**
3. **Clicking Continue is not evidence.**
4. **Acknowledgement is not evidence.**
5. **"I don't know" is absence of demonstration, not incorrect knowledge.** It must never be
   recorded as a wrong answer — the learner asserted no false belief.
6. **Positive mastery requires an actual learner demonstration.** Production — typing, speaking,
   calculating, ordering, labelling, explaining, predicting — is the default source of evidence.
7. **A correction creates a pending need for re-demonstration.** Only a later, independent retrieval
   establishes that it was learned.
8. **Learner evidence must survive across sessions and across canvases.** State attaches to
   `learner × objective`, never to a canvas.

The learner model therefore needs states such as: *demonstrated correctly · partially demonstrated ·
incorrect · misconception · no demonstration obtained · correction shown · awaiting
re-demonstration*, and `unknown` must remain representable as something outside the ordering rather
than the bottom of it.

Two further invariants earned in production:

9. **A judge we could not reach is not a learner who failed.** An evaluator outage writes nothing.
10. **The log is the truth; state is a projection of it.** Never write a computed status as though
    it were an observation.

### 🔴 Three layers, and they must not merge

The single most likely way to corrupt the learner model as it gets richer:

| Layer | Example | Where it lives |
|---|---|---|
| **Observation** | *"Correct recall. 14.2 seconds. Short factual answer."* | the evidence row |
| **Inference** | *"This association is retrievable but not automatic."* | the projection |
| **Policy decision** | *"Do not reteach. Test again soon, under a different cue."* | the policy |

An observation is a fact about one demonstration. An inference is a claim about the learner. A
policy decision is a choice about what to do next. **They are written by different code, at
different times, and only the first is durable.**

🔴 **`tookMs > 10s = weak` must never appear in evidence-writing code.** The moment a threshold is
baked into what gets stored, the judgement becomes unreviewable and unrevisable: every row written
under the old rule silently means something different from every row written under the new one, and
no migration can recover what was actually observed. Store `14200`. Decide what it means later, in
one place, where changing your mind is free.

The same rule governs every field in the schema below. `semantic_depth` records what the answer
*contained*, not whether that was good enough. `scaffolding_level` records how much support was
given, not that the learner is dependent.

### 🔴 A field enters the schema when it can be OBSERVED, not when it would be useful

Every field must have clear provenance — something that actually measured it. Add:

```
demonstration
├─ verdict                the evaluator's judgement
├─ operation              which cognitive operation was demanded
├─ response_latency_ms    measured, never bucketed
├─ response_text          what was actually said
├─ scaffolding_level      how much support preceded the attempt
└─ evaluator_observations structured output, when the evaluator produces it
```

Semantic depth, completeness, misconception structure, confidence calibration and transfer distance
enter **only when Nemesis has a well-defined way to observe them** — not as nullable columns filled
in later by a model guessing at old rows.

**`absent` always means NOT OBSERVED. It must never be given a default.** A field added with a
backfilled default retroactively claims something about every demonstration that came before it,
and that claim will be wrong.

---

## 6. Learning strategy selection

Canvas does more than pick questions. It picks *how to teach*:

direct retrieval · explanation · chunking and grouping · rule extraction · causal model · worked
example · analogy · mnemonic · contrast · visual representation · discrimination practice ·
calculation · case and application · spaced re-demonstration

### Understand versus memorise

The central policy question for any piece of knowledge is: **can this be derived from understanding,
or is the relationship fundamentally arbitrary?**

`Diovan → valsartan` has no structure to derive. Teach the association and drill retrieval.

*Why can valsartan cause hyperkalaemia?* has structure:

```
AT1 blockade → aldosterone falls → potassium excretion falls → serum potassium rises
```

Once the learner holds that, several facts become derivable and stop needing separate storage.

**Prefer derivation from understanding wherever it is available. Use memorisation and compression
strategies where understanding cannot eliminate the memory burden.**

### Mnemonics are a strategic tool, not a default mode

Use them when the relationship is arbitrary, when many similar items must be distinguished, when
sequence matters, when direct retrieval stays weak, or when names carry no inherent structure.
Strategies: acronym, acrostic, imagery, phonetic association, story, spatial grouping, chunking.

If a relationship can be derived, **a mnemonic is inferior to teaching the model.**

### Analogies are temporary scaffolding

The progression is: technical explanation → confusion → analogy → connection → **map the analogy
back to the technical system** → remove the analogy → learner explains the real mechanism.

The goal is never for the learner to retain the analogy.

---

## 7. Yield and prioritisation

Not every extracted fact deserves equal attention. Canvas estimates several kinds of value:

| Yield | Question it answers |
|---|---|
| Exam | How likely is this to be assessed? |
| Structural | Does understanding this explain many other things? |
| Dependency | Does later knowledge depend on it? |
| Deficit | How weak does this learner appear on it? |
| Transfer | Does the concept generalise across contexts? |
| Compression | Does learning one rule eliminate many isolated facts? |
| Time | What is the expected gain relative to the time required? |

**Canvas optimises expected learning gain per unit of learner attention, not coverage of the
source.** With three hours before an exam it must triage rather than walk 180 slides: *these 15
concepts explain most of the unit; these 40 associations need direct memorisation; these 8
exceptions are likely traps; you already demonstrate 25 reliably; the rest is lower priority unless
time remains.*

### Compress before memorising

Given *A causes X, B causes X, C causes X, D causes Y*, a flashcard generator emits four independent
cards. Canvas must recognise **one class rule plus one exception**.

The goal is not fewer words. It is **fewer independent things the learner must hold in memory.**

---

## 8. Compositional Canvas

**This is the architectural direction, and it replaces whole-page runtime ownership.**

> **The Canvas owns the surface. Policies contribute cognitive interactions.**

A single mixed source should be able to produce, within one continuous surface:

- prose and reference content
- rapid association retrieval
- causal reconstruction
- conceptual explanation
- a mathematical workspace
- a diagram
- an application case

**without the learner ever perceiving a switch between separate runtimes.**

### 🔴 Whole-page ownership is temporary migration scaffolding

The current model — one runtime wins the page — exists only so the first policy could be proven end
to end without endangering material it cannot teach. It has a measured cost: because ownership is
all-or-nothing, it must refuse any canvas holding material the policy cannot represent, and
[§12](#12-current-implementation-status) records that this means it currently owns **nothing**.

That measurement is evidence that whole-page ownership is the wrong abstraction. **It is not
evidence that the coverage threshold should be loosened** — see [§14](#14-non-goals).

---

## 9. Variable tempo

Canvas should feel fluid, never uniformly paced. The intended experiential grammar:

```
fast → fast → fast → diagnose → expand → scaffold → reconstruct → apply → compress → fast
```

Three retrievals may take seconds each. Then a mechanism question meets hesitation, an incomplete
answer and imprecise terminology; Canvas recognises the problem is no longer recall, slows down,
exposes the missing relationship, perhaps reaches for a diagram or analogy, has the learner
reconstruct it, asks for a novel application — and then compresses again and resumes rapid
retrieval.

**Associative retrieval should be almost instantaneous. Deeper conceptual work may expand the
surface and slow the interaction. The interface changes with the cognition required.**

Variable tempo is a core feature, not an inconsistency.

---

## 10. The generated surface

**Canvas has no fixed interaction template.** Depending on what must be demonstrated, it may become:

minimal text retrieval · voice response · equation workspace · ordering interface · diagram · image
occlusion · comparison surface · graph interpretation · case simulation · free-response explanation

The composer is an **input mechanism**, not the product. A surface is generated around the kind of
thinking Canvas wants the learner to perform:

| Knowledge | Surface |
|---|---|
| Association | Almost blank screen, composer, fast response |
| Anatomy | Image labelling or occlusion |
| Mathematics | Workspace and equation entry |
| Mechanism | Causal diagram |
| Sequence | Ordering interaction |
| Compare / contrast | Temporary structured comparison |
| Clinical application | Case simulation |
| Conceptual system | A model that expands and collapses as needed |

---

## 11. Time horizon

The knowledge map stays the same; **the policy over it changes with the goal.**

| *"Teach me this over the semester"* | *"Exam tomorrow, 90 minutes"* |
|---|---|
| Durable retention | High-yield triage |
| Deep conceptual structure | Prerequisite concepts |
| Transfer | Weak areas |
| Broad coverage | Common traps |
| Spaced retrieval | Compressed rules |
| | Mnemonics for arbitrary material |
| | Rapid retrieval, minimal low-yield detail |

Canvas must support both durable learning and highly efficient cramming from the same map.

### The minimap represents the territory

The learner selects the territory; **Nemesis manages the path through it.** A learner may say *focus
on RAAS*, and Canvas may answer: *you already retrieve the drug names rapidly, your causal
explanation of aldosterone is weak, and that concept unlocks several downstream topics — start
there.*

---

## 12. Current implementation status

**As of 2026-08-12.** 🔴 **This is the only section describing what exists. Update it whenever
behaviour changes, and never blur the three categories.**

### Declared capabilities

The block below is **machine-checked** against the running code by
`apps/web/lib/learn/canvas-runtime-doc.test.ts`. Widening a capability without updating it fails
the build; rewording any prose in this document does not. The test compares *capabilities*, never
sentences — it exists to stop the code and the matrix drifting apart, not to freeze the wording.

<!-- capability-matrix -->
```yaml
# What the code actually does today. Every value is derived from behaviour, not from intent.
knowledge_types: association
cognitive_operations: recall
# The fields one judged demonstration writes. 🔴 `absent` always means NOT OBSERVED.
evidence_fields: canvasId, confidence, demonstrationObtained, evaluatorVersion, misconceptions, objectiveRowId, occurredAt, operation, responseId, responseLatencyMs, responseText, scaffoldingLevel, taskId, verdict
```

### Implemented

| Capability | Where |
|---|---|
| Knowledge extraction — **associations only**, from two-column grids | `lib/learn/knowledge-extraction.ts` (`association/2`) |
| Content-derived versioned identity, converging across canvases without a join | `lib/learn/knowledge-identity.ts` |
| Objectives as capabilities over knowledge, with semantic roles | `lib/learn/learning-objective.ts` |
| Append-only evidence log as truth; state as a projection | `lib/learn/learner-evidence.ts`, `learner_evidence` table |
| Raw observations preserved — `operation`, `response_latency_ms`, `scaffolding_level` | Track B1; written, read back, and interpreted by nothing |
| Stateless one-decision policy (no sequence, no memory between calls) | `lib/learn/teaching-policy.ts`, `policy-runtime.ts` |
| Evidence invariants §5 items 1–4, 6 | `use-policy-runtime.ts`, `objective-task.ts` |
| "I don't know" as no-demonstration, distinct from incorrect (§5.5) | `lib/learn/response-admission.ts` |
| Corrections requiring later independent re-demonstration (§5.7) | `teaching-policy.ts`, `policy-runtime.ts` (`actedOn`) |
| Evidence persisting across sessions and canvases (§5.8) | proven live across two canvases, 2026-08-11 |
| Judge failure writing nothing (§5.9) | `use-policy-runtime.ts` |
| Skipping demonstrated competence (§7 deficit yield, partially) | `teaching-policy.ts` (`advance`) |
| Motion that reports real cognitive phases rather than simulating progress | `lib/learn/thinking-phases.ts` |

### Partially implemented

| Capability | State |
|---|---|
| **Knowledge types** (§3) | 1 of 19 — `association`. Nothing mints any other type, so unsupported knowledge is invisible to a persisted-knowledge router rather than merely unhandled. |
| **Cognitive operations** (§3) | 1 of 16 — `recall`. The dimension exists in the type; it has one member. |
| **Learning strategies** (§6) | 2 of 14 — direct retrieval, and minimal correction. |
| **Learner-state inference** (§4) | Correctness, partial correctness, misconception naming and confidence only. |
| **Association extraction** (§3) | The structured two-column-table lane only. Glossary lists, definition prose and speech lanes are designed but not built. |
| **Compositional Canvas** (§8) | **Step 7b shipped.** The Canvas owns the surface and the policy contributes a task to it; `CanvasDocument` and a hosted task now render together. Ownership (`policyOwnsCanvas`) is still computed and still reported — it is what `?policy=force` discloses against — but it no longer decides whether a question may appear. Reading material may coexist with a task; a second **answer-collecting** surface may not, and that asymmetry is `lib/learn/canvas-hosting.ts`. See [`canvas-task-hosting.md`](./canvas-task-hosting.md). |
| **Variable tempo** (§9) | The runtime **exposes** `tempo` (`instant` / `deliberate`), derived from the policy's own knowledge-type and operation pair. Nothing renders differently for it yet — one presentation still serves every task. |
| **Minimap** (§11) | The **runtime seam only**: a session-local `focusScope` filters candidate objectives before `decideNext`, so a selected territory constrains the policy without choosing an operation. Flat only — whole canvas, or a named selection of knowledge this canvas holds. There is no Minimap surface, and parent/child territories are blocked on a missing Brain contract (see below). |

### Not implemented

- **No yield model** (§7) — no exam, structural, dependency, transfer, compression or time yield.
- **No compression strategy** (§7) — no rule extraction, chunking, grouping or class-plus-exception
  detection. Four facts stay four facts.
- **No adaptive difficulty** (§4) — nothing moves the demand toward the edge of ability.
- **Nothing INFERS from the observations yet.** `operation`, `response_latency_ms` and
  `scaffolding_level` are recorded and read back as of Track B1, and `projectLearnerState` ignores
  all three — deliberately, and a test asserts it. The learner model still cannot distinguish fast
  automatic recall from slow successful reconstruction; what changed is that the raw material for
  that distinction is no longer being thrown away.
- **Semantic answer depth not represented** — the evaluator returns a verdict, so *"ACE inhibitors
  cause high potassium"* and a full causal explanation produce the **same** state update. This
  directly violates the intent of §4 and is the largest remaining gap in the learner model. It waits
  on the evaluator being able to emit a well-defined observation, not on anyone deciding a scale.
- **No hesitation, revision or clarification signals.**
- **No causal, conceptual or procedural runtime** (§3) — no extraction and no interaction.
- **No generated surface** (§10) — §8's composition shipped (see above), but the surface a task is
  presented ON is still one template. A causal reconstruction, an ordering interaction and an
  equation workspace do not exist; `tempo` is exposed so they can differ, and nothing reads it yet.
- **No mnemonic generation** (§6).
- **No analogy scaffolding or its removal** (§6).
- **No time-horizon policy** (§11) — goal and available time are not inputs to anything.
- **No minimap surface** (§11) — the scope seam exists and is honoured by the policy; nothing lets a
  learner select a territory. 🔴 **Parent/child focus is blocked on a Brain contract**: knowledge
  objects converge by `identityKey` and carry no parent/child relation, and deriving one from
  document heading paths would assert a dependency the system cannot back up. What is needed is
  stated in `lib/learn/canvas-focus.ts` (`MISSING_TERRITORY_CONTRACT`).
- **Spacing is not driven by the model** — FSRS-style scheduling sits downstream and is not yet
  informed by demonstration quality.

### The evidence schema is the constraint

Today one demonstration records essentially:

```
objective · verdict · demonstrationObtained · confidence? · misconceptions? · evaluatorVersion?
```

The next boundary adds only the fields with clear provenance — `operation`,
`response_latency_ms`, `response_text`, `scaffolding_level` — under the rules in
[§5](#-a-field-enters-the-schema-when-it-can-be-observed-not-when-it-would-be-useful). Semantic
depth, completeness, misconception structure, confidence calibration and transfer distance wait
until something can actually observe them.

The schema must be able to grow **without a migration that rewrites the meaning of existing rows**.

---

## 13. Migration plan

| Step | What it changes | State |
|---|---|---|
| **7a** — strict automatic association ownership | Removes the `?policy=1` URL gate; ownership decided from source coverage | **shipped** (PR #484) |
| **7b** — compositional Canvas | Policy tasks stop replacing the page; the Canvas presents them alongside its document | **shipped** |
| **B1 - preserve raw observations** | `operation`, `response_latency_ms`, `scaffolding_level` recorded; `response_text` was already stored | **shipped** |
| **Causal knowledge + causal interaction** | First second knowledge type, with a real interaction rather than a fallback quiz | next |
| **Broader knowledge and strategy types** | Conceptual, procedural, quantitative; compression, mnemonics, analogies | after that |

### 🔴 Two axes, and they do not block each other

**7b changes what Canvas can PRESENT. §4/§9/§10 change what Nemesis can INFER.**

Learner-state enrichment does **not** have to wait for the compositional surface. `tookMs` is
already collected end to end and thrown away; the evaluator already reads the whole answer. The
evidence schema can start retaining richer observations without changing a single pixel of the
Canvas surface.

The two axes meet in the policy, and that meeting is the point of the whole system:

> *Because you answered this correctly but slowly, and only at the recall level, I will not reteach
> it — but I will test it soon under application.*

Neither axis alone can produce that sentence.

### 🔴 Shipping a knowledge type means building its interaction

Widening the supported slice is never a flag flip. A knowledge type without an interaction that
suits it will fall back to whatever exists — which means a mechanism drilled as a flashcard, taught
wrongly and then tested on. Refusing to teach it is correct until the interaction exists.

---

## 14. Non-goals

Explicit prohibitions. Each one is a mistake that would look like progress.

1. **Do not loosen whole-page ownership thresholds to compensate for missing compositional
   architecture.** Zero ownable canvases is a signal to build §8, not to lower the bar. A canvas
   owned on a majority rule hides the rest of the document silently, with no error and no gap the
   learner can see.
2. **Do not force all material into flashcards.** A source that produces no associations has not
   failed; it holds knowledge of a kind not yet supported.
3. **Do not treat every correct answer as equivalent evidence.** Depth, latency and completeness
   distinguish demonstrations that a single verdict collapses.
4. **Do not use acknowledgements as mastery.** Continue, "got it", a revealed answer and a read
   correction are not demonstrations.
5. **Do not expose internal knowledge types as modes the learner must choose.** No level picker, no
   "study mode" menu. The interaction reveals their state; asking them to declare it is the work
   Canvas exists to remove.
6. **Do not make every Canvas interaction visually uniform.** A fixed template is the same mistake
   as a fixed difficulty.
7. **Do not encode a curriculum in the arbitration.** An ordering that walks every objective through
   the same steps is the six-stage machine rebuilt one level up.
8. **Do not scope any of this to one field.** Nemesis is a field-agnostic academic OS. Every rule
   here must work for a law student and a mechanical engineering student. Prefer structural signals
   over subject-matter keyword lists, which never generalise.
9. **Do not bake an interpretation into an observation.** No threshold, bucket or verdict about a
   signal may be computed at write time — see [§5](#-three-layers-and-they-must-not-merge). Store
   what was measured; decide what it means where the decision can be changed.
10. **Do not add an evidence field before something can observe it.** A nullable column waiting for
    a future model is a promise the schema cannot keep, and the backfill will invent history.

---

## Related

- [`document-intelligence.md`](./document-intelligence.md) — what Nemesis can read
- [`document-graph.md`](./document-graph.md) — the canonical document model
- [`learning-canvas-pilot.md`](./learning-canvas-pilot.md) — the surface's own history
