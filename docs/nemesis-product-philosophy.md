# Why Nemesis exists — the owner's product philosophy

**Owner, 2026-08-13. This is the *why* layer.** It states the problem Nemesis solves, what it
optimises for, and the filter every feature is judged against. It applies to the whole product,
not only the Canvas.

## 🔴 How this relates to the documents that already exist

**This document does not overrule `canvas-product-contract.md`.** That contract is the north star
for *concrete Canvas behaviour* — what the surface does, what controls exist, what a learner sees.
Where this document appears to conflict with it on a specific mechanic, **the contract wins**, and
the conflict should be raised rather than resolved locally.

What this document is authoritative on is everything the contract does not settle:

| Layer | Document | Authoritative on |
|---|---|---|
| **Why** | **this file** | positioning, the optimisation target, the product filter, what Nemesis refuses to become |
| **What** | `canvas-product-contract.md` | concrete Canvas behaviour, controls, the interaction contract |
| **How** | `canvas-ux-brief.md`, `canvas-interaction-model.md`, `canvas-cognitive-runtime.md` | implementation detail, cognition mechanics, today's measurements |

Read it before proposing a feature, before arguing that something is worth building, and before
deciding that something already built is finished.

## 🔴 Four rulings that govern how the rest of this document is read

**Owner, 2026-08-13, on greenlighting the knowledge-construction layer.** These are refinements of
the prose below, issued after it. Where they differ from a sentence further down, **these win** —
each one exists because the looser wording would license the wrong build.

### R1 — Evidence has TYPES. Not every action updates mastery.

The section *"Actions on the Canvas are evidence"* ends with **"Everything useful should become
evidence."** Read alone that says: make a highlight update what Nemesis believes the learner knows.
**It must not.**

> Asking Nemesis to explain a highlighted term is evidence about **interest, confusion, or need for
> support**. It is not necessarily evidence that the learner knows or does not know the concept.
> **Different user actions should create different evidence types.**

So the correct reading of that section is: every useful action becomes evidence **of its own kind**.
A request for help is a real observation about friction and belongs in the learner model as such —
it is not a demonstration, and it may never be scored as one. Collapsing the two would be the same
defect the evidence log already refuses: *absence of evidence recorded as negative evidence*.

### R2 — Multiple choice is graded, not binary.

`canvas-cognitive-runtime.md` §11 says **"PRODUCTION IS THE DEFAULT EVIDENCE"** and lists
recognition-shaped interactions among the things that are *not* demonstrations. Read alone, that
forbids ever building a recognition probe. The ruling narrows it rather than reversing it, in three
tiers:

| Interaction | Standing |
|---|---|
| **Diagnostic MCQ** | allowed, as a cheap probe to locate what is already known |
| **A correct MCQ answer** | **weak evidence — never mastery** |
| **Production / retrieval** | substantially stronger evidence |

> That keeps diagnosis fast without turning Nemesis into a multiple-choice study app.

### R3 — Extract the smallest faithful structure. Never invent structure to fill the graph.

The governing rule for the knowledge layer:

> **Extract the smallest faithful knowledge structure supported by the source. Never invent
> structure merely to make the graph fuller.**

This is the same discipline `knowledge-extraction.ts` already holds — *produce less when uncertain
rather than fabricate* — carried forward rather than relaxed. Widening what can be represented must
not widen what may be guessed. A wrong knowledge object is one a learner then gets drilled on.

### R4 — The phase order is fixed. Do not add cognitive scores before the substrate is richer.

The appendix below reports that `recall` is the only capability ever minted. **That is not to be
fixed by adding ten arbitrary cognitive scores.** The substrate comes first: once Nemesis actually
knows that a thing *is* a procedure, a causal model, an association, an equation, then the cognition
layer can decide what kind of evidence matters for each.

```
Phase 1 — KNOWLEDGE SUBSTRATE   Can Nemesis faithfully represent what is learnable?
Phase 2 — EVIDENCE / COGNITION  What does the learner know about each KIND of knowledge,
                                 and what interaction would reveal it?
Phase 3 — CANVAS                 How should that decision appear moment-to-moment,
                                 without becoming chat?
```

Cognition policy and Canvas behaviour stay **largely untouched** until the knowledge layer can
represent heterogeneous material.

---

## 🔴 The knowledge layer's target shape — owner, 2026-08-13

The general transition Nemesis needs is:

> **structured educational material → structured learnable knowledge**

🔴 **The two-column-table rule is the FIRST SYMPTOM, not the bug.** Do not fix "the drug table"
narrowly. A four-column drug chart should become relationships:

```
lisinopril
├─ is_a             → ACE inhibitor
├─ indicated_for    → hypertension
├─ adverse_effect   → cough
├─ contraindicated_in → pregnancy
└─ monitor          → potassium
```

while retaining, for every one of them:

```
source · page/slide · table · row · column · confidence
```

And the same system should eventually handle:

| Source shape | Knowledge shape |
|---|---|
| definition | concept / property |
| comparison table | distinguishing relationships |
| pathway | ordered / causal relationships |
| equation | variables + relation + procedure |
| diagram | entities + spatial / causal relations |
| procedure | ordered steps |
| hierarchy | parent / child relationships |
| association | entity ↔ property |

The 561-fact drug chart is **one of the primary acceptance tests**, not the specification.

---

Nothing else below reverses a standing ruling. The anti-gamification list **confirms** the ban on
counters, XP, celebration and Continue-after-answer already in the UX brief.

---

*Everything from here is the owner's own words, in their order.*

---

I want to give you the clearest possible explanation of why I am building Nemesis, what problem I
think it solves, and what the Canvas is supposed to become. Treat this as product philosophy that
should guide architecture, cognition policy, UI, and future feature decisions.

## Why Nemesis exists

Nemesis is not supposed to be another conventional study app.

I have tried the usual categories: Quizlet, Anki, NotebookLM, LLM tutors, AI-generated
flashcards/tests, Duolingo-style learning products, etc. They can all be useful, but I think they
share a larger problem:

**They still leave too much of the work of constructing the learning process to the learner.**

Usually studying looks something like:

```
material
→ figure out what matters
→ understand missing prerequisites
→ look up confusing terminology
→ take or rewrite notes
→ make flashcards/questions
→ organize everything
→ decide what to study
→ practice
→ figure out what went wrong
→ find another explanation
→ practice again
```

A lot of that is not actually learning. **It is administrative labor surrounding learning.**

Nemesis should remove as much of that layer as possible.

The core learning loop should be closer to:

```
understand → retrieve/use → expose weakness → repair → retrieve/use again
```

Nemesis should automate almost everything around that loop.

## The personal experience that led me here

One experience that changed how I thought about studying was having to memorize roughly 30
vocabulary terms only a few minutes before I needed them.

I wrote each word and definition, then turned the page over and reconstructed them from memory. I
repeated that process until I could do it.

What struck me was how much I could learn in a very short amount of time when there was:

- no setup;
- no elaborate study system;
- immediate retrieval;
- immediate discovery of what I did not know;
- immediate correction;
- another attempt.

That made me realize that learning does not inherently have to be slow.

A huge variable is **how much useful cognitive work can happen continuously without friction
interrupting it.**

That is what I want Nemesis to optimize.

## I dislike the administrative rituals around studying

I especially dislike conventional note-taking when it becomes transcription.

A professor talks or presents slides and the student copies information into another place.

Even when I tried putting things into my own words, I often finished with the feeling:

> I wrote a lot of things, but I am not sure I could actually explain what I wrote.

It also consumes attention during the lecture itself.

Students should often be listening and thinking rather than using cognitive energy to manually
reproduce information that a phone or computer can already record.

The same problem applies to manually creating flashcards.

AI can generate them now, but generated flashcards are frequently mediocre, poorly scoped, or not
appropriate for the type of knowledge being learned.

And if I am already struggling with the material, requiring me to become the person who perfectly
decomposes it into optimal study artifacts is backwards.

Nemesis should do that work dynamically.

## The real optimization target: time-to-mastery

Nemesis should **not** primarily optimize for:

- engagement time;
- streaks;
- how many cards someone completes;
- how long a learner stays in the app;
- artificial retention mechanics.

It should optimize for something closer to:

> **How quickly can this learner genuinely become capable with this material?**

That does NOT mean rushing.

It means **eliminating wasted actions.**

The question Nemesis should continuously answer is:

> Given this material, this learner, and all evidence we currently have, what is the highest-value
> cognitive action this person should perform next?

Then the Canvas should immediately present that action.

## The Canvas is not a chatbot

This is central.

I do not want Nemesis to feel like ChatGPT with a study wrapper.

The Canvas should not primarily be:

```
user message
AI response
user message
AI response
conversation history
```

The Canvas is better thought of as **an adaptive learning runtime.**

Internally there are several things happening:

**Material model**

- What knowledge exists in these sources?
- What relationships exist between concepts?
- What are prerequisites?
- What is important?
- What type of knowledge is each thing?

**Learner model**

- What does this person seem to know?
- What do they partially know?
- Where are misconceptions?
- What terminology creates friction?
- What can they retrieve?
- What can they apply?
- What requires scaffolding?

**Policy / cognition engine**

- What should they do next?

**Canvas**

- What is the best interface for that cognitive operation?

**Evidence**

- What did their latest response or action reveal?

Then repeat.

The learner should mostly experience the result, not the machinery.

## The desired feeling is momentum

A good Nemesis session should be able to feel like:

```
short explanation
→ user explains something aloud
→ Nemesis identifies a missing piece
→ concise correction
→ another attempt
→ correct
→ immediately move onward
→ different concept
→ problem
→ correction
→ retry
→ later revisit weak material
```

There should be very little interface ceremony between those actions.

I care deeply about flow state.

Every Canvas decision should therefore be evaluated by:

> **Does this preserve or interrupt cognitive momentum?**

This is why I do not want things such as:

- "Good job!"
- giant celebrations;
- XP interruptions;
- "Recall 3 of 12";
- "You wrote…" wrappers;
- unnecessary "Next" buttons;
- card-flipping rituals;
- giant Continue buttons after correct retrieval;
- setup screens asking users to configure how they want to study;
- long AI monologues by default.

When a learner gets something correct, a minimal restrained confirmation is enough and the session
should continue.

A button makes sense when the user genuinely needs reading time, such as after an explanation or
substantive correction.

It does not make sense simply because the software wants a transition.

## Speaking should be a first-class learning input

One of the most useful study methods for me has been explaining something aloud in my own words.

I do not do it constantly because talking to yourself in public feels awkward.

Nemesis gives the learner a reason to speak: the system is actively listening to and evaluating the
explanation.

That matters because free-response speech is much more diagnostically rich than many conventional
questions.

If someone explains aloud:

> ACE inhibitors lower blood pressure because they reduce angiotensin II, so there is less
> vasoconstriction and less aldosterone...

Nemesis can inspect the **structure** of their understanding.

It can detect:

- missing causal links;
- incorrect relationships;
- vocabulary gaps;
- incomplete explanations;
- whether something seems memorized versus understood;
- confusion between neighboring concepts.

A multiple-choice answer often tells the system only that the learner selected B.

So dictation is not merely an accessibility or convenience feature.

**Speech is a low-friction method for externalizing cognition.**

When permission is granted and the environment permits it, I want spoken retrieval to be one of
Nemesis's fastest default interaction modes.

Voice playback can exist for users who want it, but I personally prefer reading because it is
faster than listening to an AI talk.

## Different knowledge requires different cognitive actions

**Do not reduce everything to flashcards.**

Nemesis should infer what kind of knowledge it is dealing with and choose an interaction
accordingly.

Examples:

| Knowledge kind | Cognitive action |
|---|---|
| Atomic facts | rapid spoken or written retrieval |
| Vocabulary | produce the term or explain the definition |
| Conceptual knowledge | explain it in your own words |
| Causal mechanisms | explain what happens and why |
| Comparisons | distinguish A from B |
| Procedures | reconstruct the sequence |
| Equations | derive/write them |
| Math and chemistry problems | solve them |
| Spatial or diagrammatic knowledge | draw or label |
| Clinical/application knowledge | work through scenarios |
| Previously misunderstood material | targeted rereading or explanation, then another retrieval attempt |

The Canvas should change form depending on the cognition required.

## Pencil / handwriting matters for math and other constructed work

There are cases where dictation is the wrong input.

For mathematics, chemistry, equations, diagrams, and similar reasoning, I want the learner to be
able to use a pencil tool.

The ideal interaction is:

```
user writes naturally
→ vision interprets handwriting
→ Nemesis can reconstruct it cleanly, potentially as LaTeX
→ Nemesis identifies where the reasoning diverged
→ Canvas explains the specific step
→ learner retries
```

For example, instead of simply saying "incorrect," it might understand:

- setup correct;
- substitution correct;
- algebraic mistake at this step;
- resulting answer wrong.

Then it targets exactly that failure.

## Nemesis still needs to teach

I do NOT want a system that becomes ideologically retrieval-only.

**You cannot retrieve knowledge that was never learned.**

Sometimes the correct action is simply to teach something.

But Nemesis should usually teach only enough to enable meaningful progress.

A useful principle is:

> **Never explain more than the learner currently needs in order to make the next useful attempt.**

So instead of dumping an enormous AI-generated lesson, the flow might be:

```
read a concise passage
→ attempt
→ detect missing prerequisite
→ explain that missing prerequisite
→ attempt again
```

The Canvas should expand where the learner struggles and compress where they already understand.

## Uploading a document should not produce a giant summary

This is important.

If someone uploads a 70-slide lecture and Nemesis converts it into twelve pages of polished notes,
we have mostly converted one information artifact into another information artifact.

**That is not enough.**

Instead, Nemesis should ask:

> What does this learner need next?

Maybe the correct initial Canvas contains only four sentences.

The learner responds.

Nemesis discovers that two of those concepts were already known.

Future explanations get shorter.

One concept produces confusion.

That concept expands.

Another is established.

It becomes quiet.

**The material should compress itself around the learner.**

## Actions on the Canvas are evidence

If a learner highlights a term or passage and asks for an explanation, that interaction should
matter.

Example:

> The learner highlights "competitive antagonism" and asks Nemesis to explain it.

That means Nemesis has learned something about the learner: **this concept or vocabulary was not
sufficiently established to understand the surrounding material.**

That should affect the learner model.

**It should not disappear as an isolated chat event.**

The same applies to:

- repeated rereading;
- requesting simpler wording;
- using an analogy;
- failed retrieval;
- partial retrieval;
- handwriting errors;
- hesitations where detectable;
- correction performance;
- later successful transfer.

Everything useful should become evidence.

## Multiple choice has a limited but valid role

I do not want the learning experience dominated by:

- multiple choice;
- true/false;
- matching;
- press-to-reveal interactions.

Those make it too easy to progress passively.

However, I do think multiple choice may sometimes make sense **during diagnosis.**

For example, ten strategically selected diagnostic questions might cheaply locate which portions of
a large lecture the learner already knows.

That can be useful.

So the principle should not be:

> multiple choice is forbidden.

It should be:

> **use inexpensive recognition probes when Nemesis needs quick diagnostic information, but prefer
> production when trying to establish genuine mastery.**

Diagnosis and mastery do not necessarily need the same interaction.

## The second major Nemesis role: information distillation

In the age of AI and constant information exposure, the problem is no longer simply lack of access
to information.

People are bombarded with information from school, lectures, PDFs, textbooks, meetings, social
media, messages, the web, work, and daily life.

The scarce resources are increasingly:

> **attention, comprehension, and time.**

Nemesis should sit between raw information and the learner.

Its job is to **distill information into the clearest representation that this particular learner
can understand right now.**

That means:

```
raw material
→ Nemesis models it
→ Nemesis reduces it to the smallest useful representation
→ learner engages with it
→ Nemesis observes the result
→ representation recalibrates
```

## Simplicity is adaptive, not universal

I do not want "simple mode" to mean permanently dumbing material down.

The goal is:

> What is the simplest explanation that preserves what the learner actually needs to understand?

Sometimes that means third-grade language. Sometimes a strong analogy. Sometimes avoiding dense
Latin/Greek-root terminology until the concept is intuitive. Sometimes the learner is already
sophisticated and Nemesis should use technical language immediately.

The system should be able to move through something like:

```
intuition → plain language → formal terminology → mechanism → nuance → technical depth
```

And it should be able to **move backward locally.**

A learner could understand an advanced subject but get stuck on one prerequisite or unfamiliar
word. Nemesis should simplify **that one region** without treating the whole learner like a
beginner.

## Nemesis should adapt its language to the learner

The learner model should therefore include more than mastery.

Nemesis should gradually learn things like:

- what vocabulary the learner already knows;
- what vocabulary repeatedly causes friction;
- what level of technical language works;
- whether analogies help;
- how much explanation is necessary;
- whether causal explanations work better than formal definitions;
- whether equations, visual representations, examples, or prose are most effective;
- how much information can be presented before understanding deteriorates.

Example:

> If the learner repeatedly needs help with terms such as "vasoconstriction," "inotropy," and
> "bioavailability," Nemesis might learn: *Technical terminology is currently creating friction in
> this territory. Build the mechanism in ordinary language first, then attach the professional
> term.*

Later, once those words are established, Nemesis no longer needs to simplify them.

That is the kind of personalization I want.

## My "cognitive Elo" analogy

One analogy I keep coming back to is chess.

Chess does not create flow by giving someone XP every time they move a pawn.

A matchmaking system estimates approximately how strong the player is and gives them opponents that
are challenging without being absurdly beyond their ability.

I want Nemesis to do something analogous with learning.

I called it a kind of "cognitive Elo," but **I do not mean that Nemesis should claim to measure
someone's fixed intelligence.** It should be much more domain-specific and multidimensional.

For example, someone could simultaneously have:

- very strong factual recall of ACE inhibitors;
- strong understanding of the RAAS mechanism;
- weak renal physiology prerequisites;
- moderate calculation ability;
- unknown clinical transfer;
- weak terminology in another neighboring topic.

**The system should maintain a changing map rather than a single IQ-like number.**

The question is:

> What level and type of cognitive challenge can this learner productively handle for this specific
> knowledge right now?

Then Nemesis stays around that frontier.

- Too easy → boredom, shallow engagement, wasted time.
- Too difficult → confusion, repeated failure, loss of flow.
- Properly calibrated → effortful but achievable.

## This is what I mean by "true gamification"

I dislike superficial gamification where learning gets wrapped in streaks, XP, gems, hearts,
badges, leaderboards, and cartoon rewards.

I am not against games. I actually think good games demonstrate what learning software should
borrow.

Games such as chess create flow because there is:

```
clear challenge → action → immediate consequence → recalibration → next challenge
```

So my principle is:

> **Do not gamify the interface. Gamify the challenge curve.**

The learning itself should have the structure that makes games compelling.

Nemesis should continuously provide:

```
challenge → learner response → immediate feedback → adaptation → next challenge
```

The learner can feel themselves becoming capable of something they could not do earlier.

That is enough.

## Difficulty is multidimensional

Difficulty should not simply mean easy question → medium question → hard question.

Nemesis can change difficulty through many mechanisms.

**Recall support**

- Early: *Which drug blocks the AT1 receptor?*
- Later: *Name an ARB.*
- Later: *Explain RAAS pharmacologic targets from memory.*

**Explanation depth**

- Early: *What does aldosterone do?*
- Later: *Explain why blocking angiotensin II reduces blood pressure.*
- Later: *Explain why RAAS blockade can affect serum potassium and renal function.*

**Vocabulary** — plain language first, then increasingly technical terminology.

**Scaffolding** — worked example → partial example → independent solution.

**Transfer** — exact lecture example → modified example → unfamiliar scenario.

Nemesis should continuously modify the cognitive resistance.

## Information compression and cognition should work together

A major philosophical belief behind Nemesis is:

> **AI has made information cheap. The next problem is making comprehension fast.**

The internet made information discoverable. LLMs made explanations and information generation
extremely cheap.

But learners still have finite working memory, time, attention, prerequisites, and cognitive
bandwidth.

Nemesis should control the interface between the huge amount of available information and the
learner's mind.

Not: *Give me more information.*

But: **Figure out what my brain needs next.**

## The three optimization objectives

I currently think Nemesis can be thought of as optimizing three major things.

**1. Reduce friction** — minimize time spent preparing to learn. Ideally `upload → begin`. No deck
construction. No note organization. No study-mode configuration. No unnecessary setup.

**2. Maximize useful information density** — present the least amount of information necessary for
genuine understanding. Not brevity for the sake of brevity. The target is closer to **maximum
comprehension per unit of attention.**

**3. Maintain optimal challenge** — continuously estimate the learner's state and keep the next task
near the edge of what they can productively do. Not comfortable. Not impossible. Productively
difficult.

That combination is what I think creates flow:

> **friction down + clarity up + appropriately difficult challenge = flow**

## How surrounding Nemesis features fit

Features such as parsing, transcription, Library, Calendar, recording, and Stats are useful, but
**they are not the deepest reason Nemesis exists.**

- **Parsing** matters because Nemesis needs reliable source material.
- **Transcription** matters because lectures and meetings can become source material without manual
  note-taking.
- **Library** matters because learners need to manage their canvases and source material.
- **Calendar** matters because deadlines tell the system when knowledge is needed.
- **Stats** matter if they expose meaningful information about learning and cognition.

But the central product is:

> **the cognition engine + learner model + adaptive Canvas loop.**

That is where I want the majority of product intelligence and differentiation to live.

## A useful internal definition

> Nemesis is an adaptive learning system that converts source material into a continuous loop of
> teaching, retrieval, diagnosis, correction, and recalibration, optimized to reach mastery with as
> little wasted learner effort as possible.

A simpler user-facing concept is:

> Drop in what you need to learn. Nemesis figures out what you know, what you don't, and what you
> should do next.

And perhaps the broader thesis is:

> **AI makes information cheap. Nemesis makes comprehension fast.**

## Use this as a product filter

When making architecture, cognition-policy, or UI decisions, ask whether the feature helps Nemesis
do one or more of these things:

1. understand the source material;
2. understand the learner;
3. choose the highest-value next cognitive action;
4. present that action in the least-friction interface;
5. learn from the learner's response and recalibrate.

**If something does not meaningfully improve one of those, it should be questioned.**

The hardest and most important problem I want Nemesis to solve is:

> **Given everything Nemesis knows about the material and everything it has observed about this
> learner, what should happen on the Canvas next?**

That is the cognition engine I want us to build around.

---

# Appendix — where the code stands against this filter, 2026-08-13

**Not the owner's words. Measured, dated, and kept separate on purpose** — the same rule
`canvas-cognitive-runtime.md` §12 follows. Everything above is the target; everything here is a
reading taken on one day, against `origin/main` at `bd38cf7b`. If you are about to cite this
appendix as current, re-run the checks first.

Three of the philosophy's claims are load-bearing and checkable today.

## 1. "Different knowledge requires different cognitive actions" — one lane exists

`apps/web/lib/learn/knowledge-extraction.ts` implements exactly **one** extraction lane:
associations read from two-column tables, deterministic and model-free. Its own header says so, and
says why — refusing to guess is a deliberate feature of that lane, because a wrong knowledge object
is one a student then gets drilled on.

The consequence is measured, not theoretical. A 24-page drug chart holding **561 candidate facts
across 27 tables of 8–11 columns** produces **0 knowledge objects**. The refusal is
`table-not-pairs`, and the file is explicit that this is *"a rule of this extractor, not a truth
about knowledge"* — a `Drug | Brand | Class` table holds two perfectly real relationships that a
later lane should extract.

The eleven knowledge kinds in the table above are, today, one.

## 2. "The system should maintain a changing map" — the map is real, one dimension is filled in

This one is **half right, and the correct half is the architecturally hard one.**

`LearnerObjectiveState` is keyed per objective, not per learner. There is no global score. `unknown`
is a real value that sits outside the ordering, distinct from `incorrect` — "we never asked" cannot
be silently recorded as "they cannot". Evidence is an append-only log and state is a projection of
it. That is the changing map the philosophy asks for, and it is built.

What is missing is the dimensions. `ObjectiveCapability` is typed `"recall" | "discriminate" |
"explain"`, but `learning-objective.ts:202` is the **only** place in the app that mints one, and it
is hardcoded `capability: "recall"`. Nothing produces `discriminate` or `explain`. So the map has
one axis per objective: *can you recall this association*.

## 3. "Actions on the Canvas are evidence" — they are events, not evidence

The interaction exists. `canvas-selection.ts` offers `define | explain | simpler | example | why` on
a highlight, and `use-canvas-session.ts` handles it.

What it writes is a **canvas event** (`definition_opened`, `simplification_requested`,
`example_requested`, `why_requested`, `explanation_requested`). Nothing on that path writes
`LearnerEvidence` — the only writers are `policy-runtime.ts`, `teaching-policy.ts`,
`learner-store.ts` and `use-policy-runtime.ts`, all downstream of an *answer*.

So highlighting "competitive antagonism" and asking for an explanation is recorded, and does not
reach the learner model. The philosophy's sentence — *"It should not disappear as an isolated chat
event"* — describes the current behaviour exactly.

## What this appendix does not claim

- It says nothing about whether the **policy** would use richer knowledge if it had it.
- It says nothing about spoken retrieval, which **cannot be verified in the browser pane at all**
  (the pane blocks the microphone) and needs a device test.
- It says nothing about handwriting → vision → step-level divergence, which is unbuilt and gated on
  a vision key.
