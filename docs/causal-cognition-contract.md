# Causal cognition — what it means for a learner to understand a mechanism

> **Target architecture. None of this is built.** The causal *substrate* exists (extraction,
> identity, persistence); `objectivesForKnowledge` returns `[]` for causal knowledge and a test pins
> that. This document decides what must be true before that `[]` is allowed to change.
>
> Companion to [`canvas-cognitive-runtime.md`](canvas-cognitive-runtime.md), which owns the Canvas
> loop, and [`minimap-knowledge-territory.md`](minimap-knowledge-territory.md), which owns
> navigation. This one owns a single question: **what did a response actually demonstrate about a
> causal relationship?**

## 1. The problem, in one example

Two learners answer *"Why can ACE inhibitors increase potassium?"*

> **A.** "ACE inhibitors cause high potassium."

> **B.** "ACE inhibition lowers angiotensin II, which lowers aldosterone, decreasing renal potassium
> secretion and increasing serum potassium."

Both are correct. They are not the same demonstration. A holds the endpoints; B holds the mechanism.
If these produce the same learner-state update, Nemesis cannot tell a memorised sentence from an
understood model, and every downstream decision — what to teach, what to skip, what to re-test —
inherits that blindness.

**The requirement: a response is evaluated against the causal structure itself, never against one
ideal reference sentence.**

## 2. 🔴 The architecture already supports this, and that is the main finding

The instinct is that evidence needs a new nested shape to record partial understanding. It does not.

```
objectiveIdentityKey({ knowledgeIdentityKey, capability, parameters })
```

An objective is derived from **exactly one** knowledge object. It cannot span several. And a causal
knowledge object is **one directed edge** — that decision was made in the substrate for a different
reason, and it pays off here:

```
ACE inhibition ─▶ ↓ angiotensin II ─▶ ↓ aldosterone ─▶ ↓ K⁺ secretion ─▶ ↑ serum K⁺
      edge 1              edge 2             edge 3            edge 4
```

Four knowledge objects. Four identity keys. Four objectives. `projectLearnerState` already computes
state **per objective**, so per-edge learner state works today with no change to the projection.

Learner B demonstrates edges 1–4. Learner A demonstrates none of them — A asserts a *fifth*
relationship, `ACE inhibition ─▶ ↑ serum K⁺`, which is true, teachable, and a different object.

So the contract is not "make evidence hierarchical". It is:

1. a task may **target a set of objectives**, and
2. one response may **write evidence for several of them at once**.

Everything else already exists.

## 3. Operations, v1

Causal knowledge supports three operations to begin with. The target vocabulary is wider
(§3 of the runtime doc); this is what will be genuinely supported.

| Operation | The question it asks | Example |
|---|---|---|
| `predict` | Given a cause, what follows? | "Aldosterone decreases. What happens to potassium excretion?" |
| `explain` | Why does this happen? | "Why can ACE inhibitors increase potassium?" |
| `reconstruct` | Supply the missing link. | "ACE inhibition → ↓ angiotensin II → ___ → ↓ potassium excretion" |

`explain` already exists as an `ObjectiveCapability`. `predict` and `reconstruct` are new.

**🔴 Never map the wider vocabulary down onto the narrow one.** Runtime asked for a mapping from the
sixteen target operations to the three an objective carries today, and correctly refused to invent
it. The answer is that no such mapping should exist. Recording a `transfer` task as `explain` writes
a claim that the learner explained something when they in fact transferred it — a different
cognitive demand, stored as a fact about the learner. **A lossy operation mapping is a false
evidence record.** The vocabulary widens only when an operation is genuinely supported, and each
widening is a Brain decision.

## 4. What the evaluator returns

```
demonstrationObtained    was any usable demonstration produced at all
verdict                  the overall judgement, unchanged
edgesDemonstrated        objective keys the response established
edgesMissing             objective keys the task expected and the response did not establish
edgesIncorrect           relationships the learner asserted that are wrong
misconception?           a named competing model, when one is identifiable
```

**🔴 `edgesMissing` is not failure.** It is the difference between what was asked and what came back.
If the expected chain is `A→B→C→D` and the learner produces `A→B→C`, the correct system response is
to scaffold the single missing link — **not** to restart the concept. That is the entire practical
payoff of edge-level evaluation, and it is §10 of the charter.

**Deliberately not built yet:** a taxonomy of demonstration depth (`endpoint_only`, `partial_chain`,
`complete_chain`, `transfer`). Those are inferences over the edge sets above, and inference is a
later layer. Naming them now would freeze an interpretation into the observation record.

## 5. 🔴 The one required change: one response is one performance

Today `LearnerEvidence` has no way to say that several rows came from a single answer. The
observation columns are `operation`, `response_latency_ms`, `scaffolding_level` — nothing groups them.

That breaks the moment causal objectives exist. One 20-second explanation covering four edges writes
four rows, each carrying `responseLatencyMs: 20000`, and `demonstrationCount` reads 4. The learner
answered **once**. Latency is quadruple-counted and practice volume is inflated fourfold — corrupting
exactly the signal §7 of the charter says must stay interpretable.

**Required:** an additive, nullable, undefaulted `responseId` shared by every row a single response
produces. Same pattern as the three observation columns.

**And it must be read.** `projectLearnerState` has to count **distinct performances, not rows**.
Storing `responseId` while the projection keeps counting rows is the write-only defect this codebase
has already shipped once — a field persisted correctly that nothing consumes.

**🔴 It stays an observation.** `responseId` records that these judgements share an origin. It does
not say four edges in one sentence are worth more or less than four edges across four sessions.
That is an inference, it belongs in the layer above, and it must remain replaceable.

## 6. Naming a wrong causal belief — proposal, with its cost

A learner who says *"aldosterone increases potassium excretion"* has not made a random error. They
hold a specific inverted model, and it can be taught against.

That belief is a cause, an effect and a relation — which is exactly what `causalIdentityKey` takes.
The identity function built for extraction produces a stable key for **any** causal triple, whether
or not a source ever asserted it. So a wrong edge can name itself, with no new type:

```
misconceptions: [ causalIdentityKey({ cause: aldosterone, effect: K⁺ excretion, relation: "increases" }) ]
```

Two of them converge on the same key, so the same wrong model held by two learners is recognisably
the same wrong model.

**The cost, stated plainly:** `misconceptions` currently reads as a list of human-nameable competing
models. Filling it with opaque key strings changes what a consumer can do with it — **UI cannot
render a hash**. Resolving a key back to readable text is a lookup someone has to own. That is a
presentation decision and it is left to UI (§22); this document only establishes that the *identity*
of a wrong causal belief is already expressible and needs no new machinery.

## 7. Handoffs

### To Canvas Runtime

**Capability blocked** — causal reconstruction, prediction and explanation cannot be hosted, because
no causal objectives exist to host.

**Required contract** — a task must be able to target a **set** of objectives rather than one, and
route a single response to an evaluation that writes evidence for several of them. No causal-specific
page runtime; the task coexists with source material like any other contribution.

**Invariants** — `AnswerSink` stays incapable of holding two answers. A judge that could not be
reached stays "no demonstration obtained", never a verdict. `TaskTempo` stays a projection of a Brain
decision. Runtime does not decide what partial understanding means.

**Non-requirements** — how a multi-target task is composed, sequenced or answered on one surface is
yours. Whether `HostedTaskShape` changes at all is yours; it may well survive untouched with the
target set carried alongside it.

### To Canvas UI

**Capability blocked** — nothing yet. This is a constraint to hold, not work to start.

**Required contract** — three states must remain visually distinguishable, because they call for
opposite responses from a learner:

| State | Meaning | Must never read as |
|---|---|---|
| `source_state = degraded` | Nemesis could not reliably read the material | learner weakness |
| `learner_state = unknown` | Nemesis has never asked | learner failure |
| `learner_state = incorrect` | The learner contradicted the objective | either of the above |

**Invariant** — a source gap is not a learner gap. Collapsing them shows a student a weakness that is
actually a parser failure, and blames them for it.

**Non-requirements** — every visual choice. Spacing, motion, colour, how a partially-demonstrated
chain is drawn, whether missing links are shown at all. Brain supplies the semantic state and stops.

### To Parser

Outstanding, already sent: carry the derived parse verdict across the extraction boundary, and keep
*"we could not read this"* distinct from *"this asserts nothing"*.

## 8. Invariants this contract must not violate

1. **Observation, inference and policy stay separate.** No rule of the form `latency > N → weak` in
   evidence writing, ever.
2. **Seeing an answer is not evidence.** A correction writes no mastery evidence; only a later
   independent demonstration can.
3. **Three kinds of not-knowing stay distinct** — source, knowledge, learner.
4. **Direction, negation and qualification are the fact.** Reversing an edge teaches the opposite of
   the source; dropping a hedge stores a claim the author never made.
5. **An unreachable evaluator is not a learner failure.**

## 9. What this deliberately does not decide

Difficulty adaptation, when to re-test, spacing, yield, prerequisite ordering, compression,
mnemonics, analogies, and the demonstration-depth taxonomy. All are downstream of knowing what a
response demonstrated, which is the only thing settled here.

Related: [[canvas-cognitive-runtime]] · [[minimap-knowledge-territory]] · [[document-intelligence]]
