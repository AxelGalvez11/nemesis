# The Canvas product contract

**Owner, 2026-08-13. This is the north star.** `canvas-ux-brief.md` remains in force as the
implementation detail and today's measurements; where the two differ, **this document
wins**. `canvas-interaction-model.md` and `canvas-cognitive-runtime.md` are subordinate to
both.

> **Nemesis is not a chatbot with study features.** It may *enter* through an interface that
> looks familiar — a minimal landing page with a composer — but the learning experience is a
> dynamic adaptive canvas.

```
drop in material → parse and understand it → diagnose the learner
→ teach only what they need → make them retrieve or solve
→ evaluate their thinking → adapt → repeat
```

**The system should always be answering one question:**

> ## What is the most useful cognitive action for this learner right now?

**The definition:** *Nemesis is an adaptive learning environment that turns whatever someone
needs to learn into a continuously updated cycle of diagnosis, targeted explanation,
retrieval, correction, and spacing. It determines what the learner knows from what they can
actually produce, then changes the Canvas accordingly.*

**The promise:** *Drop in what you need to learn. Nemesis figures out what you already know,
what you're missing, and what you should do next.*

🔴 **When implementing or reviewing, do not optimise for "does this look like an AI tutor?"
Optimise for: does this feel like ONE intelligent learning surface continuously adapting
around the learner?**

---

# 🔴 RECONCILIATION — five places this changes a standing ruling

Read this before acting on anything you were told previously.

## R1 — "Done reading" EXISTS. Brain's ruling is reversed.

Brain ruled *"reading requires no completion event; do not build the checkmark."* **§12
overturns that.** There are now **two distinct checkmarks and neither is a Continue button:**

```
DICTATION      ×  discard    ✓  transcribe      visible only while listening
READING        Continue                          at the BOTTOM OF THE READING CHUNK
```

🔴 **Amended again, later the same day** — the owner moved the reading control **out of the
composer and to the bottom of the paragraph chunk**, labelled **Continue**. §12 below carries
the current wording; the composer placement is dead.

Still forbidden: every counter in §23 of the brief, and a Continue **after an answer** (§17
auto-advances). The distinguishing principle:

> **The learner controls their own reading pace. The system never asks them to acknowledge
> machine state.**

A "Done reading" control is the learner setting their own tempo. A "Continue" button is the
machine asking to be dismissed. Those are opposite things that look alike.

## R2 — Multiple choice is PERMITTED, as weak evidence

Previously recorded as forbidden outright. **§5 permits it** for rapidly locating knowledge,
never as the default interaction.

🔴 **Brain's architectural consequence:** the weaker weight must be real **in the evidence
store**, not merely an intention. A correct multiple-choice answer must **not** write the
same value as a correct free recall. If it does, §22's scheduling and §23's Minimap both
inherit inflated confidence, and the learner is skipped past things they only recognised.
**Recognition is weaker evidence than production** — that has to be representable.

## R3 — Reading is not evidence of knowledge; interacting with it IS evidence of difficulty

Brain ruled *"scaffolding is not evidence."* **§25 does not contradict this — it names a
different thing.** Keep them separate:

```
reading a passage                  → NO evidence about what the learner knows
highlighting · asking Define
 · asking for it simpler · rereading → evidence about what the learner found HARD
```

Both are legitimate. **They must not merge into one store.** One is a claim about
capability; the other is a claim about friction.

## R4 — Knowledge features overlap; six interaction adapters are currently stageable

§6 names **conceptual · associative/factual · procedural · relational/causal ·
discriminative · spatial/structural**.

**Measured 2026-08-15**, by reading `objectivesForKnowledge` rather than this document:

| Category | Knowledge type | Capability | Task |
|---|---|---|---|
| associative/factual | `association` | `recall` | name |
| relational/causal | `causal` | `predict` | predict |
| spatial/structural | `spatial` | `locate` | locate |
| discriminative | `classification` | `discriminate` | compare |
| procedural | `procedure` | `sequence` | reconstruct |
| conceptual/open semantic | `conceptual_system` | `explain` | explain |

These are interaction adapters, not a closed ontology. Explicit semantic relations may overlap on
one idea, use the common relation families, or carry a previously unseen relationship type. The
grounded prose reader supplies those relations to the general controller without forcing them into
one mutually exclusive bucket.

🔴 **A KIND IS NOT SHIPPED WHEN THE EXTRACTOR MINTS IT.** Each row above needs all four columns
before it counts, because §13 of the runtime spec is explicit that a knowledge type without an
interaction that suits it falls back to whatever exists — a mechanism drilled as a flashcard,
taught wrongly and then tested on. `discriminate` sat named-but-unminted in the capability union
for exactly this reason until a task existed to consume it.

🔴 **NUMBERING IS NOT PROCEDURAL MEANING.** Questions, examples, diagnoses and references are often
numbered. Consecutive markers remain recoverable source syntax, but only a grounded semantic read
that identifies executable or temporal steps may mint a procedure and sequence objectives.

## R5 — Minimap vocabulary supersedes

Use **unestablished · developing · established · needs revisit**. `needs revisit` is new and
carries §18's return triggers. It replaces the earlier demonstrated/uncertain/current/
unexplored wording.

## R6 — Adaptation changes Nemesis's action, never the learner's capabilities

- Ordinary information questions default to ordinary conversational answers. Teaching activates
  from clear learning intent or an active learning context, not from every question merely because
  it appears inside Nemesis.
- Course material and outside evidence remain distinct when they disagree. For course or exam
  learning, preserve what the course expects and disclose the current external view; for a request
  about current evidence, lead with the external view without erasing the course claim.
- Trusted semantic renderers are the default for visuals. The model requests a bounded semantic
  visual; it does not emit arbitrary rendering code. Image generation is reserved for inherently
  illustrative cases deterministic rendering cannot express cleanly.
- Vocabulary lookup remains reopenable after mastery. Demonstration updates the learner model and
  reduces proactive intervention; it never removes the dotted underline or definition affordance.

The same rule governs web search, sources, diagrams, vocabulary, and ordinary chat: adapt what
Nemesis chooses to do, not what the learner is allowed to do.

---

# 1. Landing page

After sign-in: an extremely minimal screen. **Sidebar collapsed by default.** The centre is
primarily the composer — familiar enough that the user immediately understands they can type
or drop material in.

**The behaviour to encourage: *drop in what you need to learn.*** PDFs · PowerPoints · Word ·
text/markdown · spreadsheets · images · lecture recordings · other supported material · or
type a topic · or attach material **and** an instruction in one submission.

🔴 **No setup wizard.** Never ask the user to choose flashcards · quiz · tutor mode · study
mode · learning style · difficulty · session type. **Nemesis infers what to do** from the
material, the learner state, and their behaviour.

# 2. Parsing is foundational

**Document understanding is core infrastructure, not an upload utility.** Nemesis cannot
teach well if it does not understand the source correctly.

Preserve and understand: document hierarchy · headings and subheadings · paragraphs · lists ·
tables · equations · diagrams · images · captions · labels · slide relationships ·
definitions · examples · exceptions · procedures · facts · causal relationships · conceptual
relationships · learning objectives where present.

🔴 **Table scope is part of the claim.** Atomic claims may be separated where the author printed
real list markers, but a class-level row must not be fanned out onto every listed member. Preserve
sub-labels such as frequency or severity, accept an entity-specific scope change only when the
source explicitly names it, and refuse a compound prose subject rather than silently choosing the
next column as what the row is about.

🔴 **Do not reduce documents to a loose bag of extracted text.** Construct a structured
representation of the knowledge in the sources.

🔴 **If confidence is low, preserve uncertainty. Do not invent structure to fill a schema.**

**Everything downstream depends on this.**

# 3. Processing state

A polished transition after submission — never an abrupt jump from upload to a finished page.
A restrained, premium thinking state while Nemesis parses, understands structure, organises
concepts, identifies relationships, determines what may need teaching, and prepares an
initial diagnostic.

Subtle polished motion, not loud progress bars. Closer to ChatGPT's restrained thinking
previews: soft movement, subtle pulsing, smooth transitions, the Nemesis bead motif where it
fits. **No developer statuses** (`Parsing chunk 18/84`) outside error/debug.

# 4. Do not begin by summarizing the document

🔴 **When the Canvas opens, do not dump a summary of what was uploaded.** Establish where the
learner is first. The first meaningful Canvas action is usually **diagnostic**.

🔴 **And diagnostics must be dynamic, not canned. Never show the same "What do you want to
learn?" every time.** Choose from the actual material:

> *Explain what you currently understand about competitive inhibition.*
> *Before we begin, what determines whether a weak acid becomes more ionized?*
> *Looking at these lectures, which part of hypertension treatment is least clear to you?*
> *Solve this dosage calculation using whatever approach you currently use.*
> *What do you think is causing the change in Vmax here?*

**This is not a formal test.** It is getting enough evidence to determine the next useful
action.

> **Diagnose until the next useful action is clear, not until the learner has been
> exhaustively measured.**

# 5. Diagnostics are mixed and adaptive

**Recognition is weaker evidence than production** — a learner can guess a multiple choice or
recognise what they cannot recall. Preference order:

```
1  free response
2  dictation
3  drawing / writing / working a problem
4  discriminative tasks
5  multiple choice — for rapid localization only
```

Multiple choice is allowed when genuinely useful, **never as the default**, and **treated as
weak evidence** against successful free recall.

Diagnostics may begin broad and adapt immediately. *Explain what happens to Km and Vmax in
competitive inhibition* → strong answer moves straight to application; weak answer narrows to
a distinction or a short explanation. **No fixed 10-question pre-test when Nemesis already
has enough.**

# 6. Knowledge territory, internally

Different knowledge requires different interactions:

| | |
|---|---|
| **Conceptual** | what something means and why |
| **Associative / factual** | names, dates, drug-class associations, terminology, isolated facts |
| **Procedural** | calculations, algorithms, workflows, solving processes |
| **Relational / causal** | A causes B, mechanism chains, downstream effects, dependencies |
| **Discriminative** | distinguishing similar ideas, diagnoses, mechanisms, structures, categories |
| **Spatial / structural** | anatomy, molecular structures, diagrams, pathways, labelled figures |

🔴 **Never expose this taxonomy mechanically to the user.** Use it to choose the action.

# 7. The Canvas is dynamic

**Not chat history — a surface that restructures itself around the current task.** At any
moment only the current learning action carries substantial visual weight.

```
short passage → Done reading → retrieval question → answer → evaluation
→ next passage/problem → retrieval → correction → next
```

Past material must not remain as giant stacked assistant messages. Resolved history stays
accessible but **recedes**. Local transitions, collapsing, fading, in-place transformation —
**never regenerate the whole page**.

> **Resolved history goes quiet; the current task owns attention.**

# 8. Reading passages

**The smallest useful chunk** — one or two short paragraphs, a small diagram, a concise
table, one equation with explanation, one tightly scoped idea. **No walls of text.**

**Simple technical English.** Do not oversimplify into incorrect statements; do eliminate
academic verbosity. Direct sentences · concrete wording · minimal jargon · jargon defined
when necessary · concise examples. **Do not ramble.**

**The level adapts** to what Nemesis already believes the learner understands. Do not
re-explain prerequisites they have demonstrated unless they become relevant again.

# 9. Highlight-to-explain

Passages are **locally interactive**. The learner highlights a word, phrase, sentence, part
of an equation, or concept, and gets small contextual actions — **Explain · Define**.

🔴 **These modify or expand the relevant part of the Canvas — they never create a long new
chat response underneath.**

# 10. Inline vocabulary memory

A highlighted term the learner asks to define is **learner-state evidence**.

Afterwards that term stays **visually marked as an inline clickable vocabulary term in future
relevant Canvas material**. Clicking opens a small, concise, visually light popup with the
definition.

**Nemesis remembers that this learner explicitly needed help with that term**, and that may
affect later retrieval.

🔴 **Not a separate vocabulary-management workflow.** It emerges from reading.

# 11. Rewrite the Canvas in place

*Make this simpler · I still don't understand this · Explain this differently* must **not**
append another explanation underneath.

**The existing passage enters a subtle processing state and rewrites itself in place.**

> **Original** — *Competitive antagonism produces a parallel rightward displacement of the
> agonist concentration-response curve without reducing the maximal response.*
>
> **Simplified** — *A competitive antagonist makes it harder for the agonist to bind. You can
> overcome this by adding more agonist, so the same maximum effect can still be reached, but
> it takes a higher concentration.*

Keep the old version **internally** so it can be restored. Visually there is normally **one
active explanation**, never competing versions stacked. **This is core Canvas behaviour.**

# 12. Finishing a reading chunk — CURRENT WORDING (owner, amended 2026-08-13 later)

When Nemesis presents material specifically to be read, **the learner controls when they are
finished.**

> **"There should be a 'continue' button once user finishes reading, at the bottom of the
> paragraph chunk."**

```
[ paragraph chunk ]

              Continue        ← at the BOTTOM OF THE CHUNK, not in the composer
```

**This supersedes the earlier `✓ Done reading` in the composer.** The control now sits
inline, at the end of the passage — where the learner's eye already is when they finish.

On selection: the passage becomes resolved · it fades/collapses appropriately · Nemesis
transitions immediately into the next cognitive action · a brief thinking preview may appear
if computation is needed.

**The action exists because reading pace belongs to the learner.**

🔴 **Scope it to reading chunks only.** §17 still stands: after an *answer*, Nemesis
auto-advances and there is no Continue. A Continue that appears after a correct answer would
reintroduce exactly the `answer → celebration → button → next` rhythm §17 forbids. Keep it
restrained in weight per §19 and §28 — an inline control ending a passage, not a call to
action.

# 13. Retrieval is production-first

Ask the learner to **produce** an answer, never to reveal one. **No** *press space to reveal*.
**No** self-grading — Nemesis judges the produced response.

| Task | Preferred modality |
|---|---|
| Conceptual questions | dictation |
| Short factual retrieval | dictation, typing available |
| Math / calculations | handwriting or structured written work |
| Chemistry / structures / diagrams | drawing / writing |
| Longer written reasoning | typing, dictation or writing by context |

**The Canvas automatically emphasises the best modality for the current task.**

# 14. Dictation is a primary retrieval mechanism

Not novelty — **it minimises the distance between the learner's internal understanding and
the evidence Nemesis can observe.** People explain concepts aloud faster than they type.

🔴 **If microphone permission is already granted, retrieval questions should be able to enter
a ready-to-speak state automatically.** No repeatedly pressing a large *Start recording*.

```
question appears → speak answer → Nemesis evaluates → next action
```

Typing stays available. **Dictation is preferred, not mandatory.**

# 15. Analyze meaning, not exact phrasing

Never require textbook wording.

> *"Because the inhibitor and substrate are fighting for the same spot, so if you add enough
> substrate the substrate can eventually win and you can still reach the same maximum rate."*

Internally: competition for the same site understood · increasing substrate overcomes
inhibition · Vmax recoverability understood · terminology informal but concept correct.

🔴 **Do not penalise a learner for not reproducing the source verbatim.**

# 16. Evaluate partial knowledge

Responses are not binary wherever richer judgement is possible. Internally distinguish:
established · mostly understood · partial · uncertain · misconception · incorrect ·
procedural error · arithmetic error · retrieval failure · cue-dependent recall.

**The learner does not see these labels.** The evidence chooses what happens next.

# 17. Correct answers auto-advance

**No** *Correct!* · *Great job!* · *Continue*. A small `✓`, a subtle state change, or simply
the next thing.

```
answer → evaluated → next          NOT      answer → celebration → button → next
```

**Nemesis is a focused learning environment, not a game.**

# 18. 🔴 Correct does not mean permanently finished — REQUIRED INVARIANT

A correct answer makes knowledge **better established**. It does not disappear forever. It
may return on: forgetting · spacing · weak confidence · transfer/application · dependency on
another concept · previous hesitation · previous partial responses · time since retrieval ·
future errors.

> **Correct answers are evidence that changes priority, not a permanent filter.**

# 19. Corrections need time to be absorbed

A concise correction must **remain long enough to be read**. This is one of the few places an
acknowledgment action makes sense.

🔴 **Do not throw another question while the correction is still being processed**, and do
not immediately repeat the identical question while its answer is visibly present.

# 20. Handwriting and problem solving

For math, chemistry, calculations, equations and dosage problems: a **drawing/writing
surface**. Tools stay minimal — pencil, eraser, basic stroke sizing. **Not an illustration
app.**

Handwritten work goes through vision and is reconstructed into clean notation — **LaTeX/KaTeX
for math**.

```
handwritten   CrCl = ((140 - 67) × 80) / (72 × 1.4)
rendered      CrCl = (140−67)(80) / 72(1.4)
```

🔴 **The goal is not whether the final number matches. Nemesis identifies WHERE the reasoning
failed:** correct equation with arithmetic error · wrong equation · correct equation with
wrong patient weight · unit-conversion mistake · wrong rearrangement · conceptual
misunderstanding · transcription/vision uncertainty. **That distinction changes the next
action.**

# 21. Factual material may behave like intelligent flashcards

Not everything needs elaborate explanation. Dates · names · drug classes · terminology ·
definitions · associations · anatomy labels can use very rapid retrieval.

> *Apollo 11 landed on the Moon in what year?* → ✓ → *Who was inaugurated as the first U.S.
> president in 1789?* → *George Washington.* → ✓ → next

Extremely fast with dictation. **No card flipping, no show answer. Active recall.**

# 22. Spaced repetition underneath the Canvas

Preserve the useful properties of Anki/FSRS **without copying their UI**. Nemesis has richer
evidence than self-rated cards: correct/incorrect · semantic completeness · response latency ·
hesitation · self-correction · whether a hint was required · number of attempts · confidence
inferred from speech · time since previous retrieval · transfer performance · repeated
misconceptions.

A scheduling layer uses this to decide when knowledge returns.

🔴 **Do not expose Again / Hard / Good / Easy as the primary interaction** when Nemesis can
infer those signals itself.

# 23. The Minimap

**Not a table of contents. Not a card counter. Not a percentage progress bar.**

A visual representation of **what Nemesis is trying to get the learner able to do**, styled by
the learner-state model. **Qualitative state, never fake precision:**

```
unestablished · developing · established · needs revisit
```

The exact labels need not be shown.

🔴 **The Minimap owns no state. It reads the learner-state store.** Clicking an area may let
the learner inspect what it represents; it must not become a conventional course-navigation
sidebar.

# 24. Remaining effort

The learner should sense whether they are near the end — **and this is not the Minimap.**

```
Minimap            = knowledge state
Remaining session  = effort / time
```

Restrained, e.g. `~8 min remaining` — **never** `17 / 24 cards`. The estimate **changes**,
because the Canvas is adaptive: demonstrated mastery skips material, a discovered
misconception expands the session. **That is expected behaviour, not an error.**

# 25. Interaction itself is evidence

Treat normal Canvas behaviour as cognition signals: highlighting a term · requesting a
definition · requesting a simpler explanation · rereading · response time · hesitation ·
dictation edits · self-correction · drawing behaviour · repeated erasing · asking a follow-up ·
answering correctly · answering partially · exposing a misconception · successful transfer.

**Do not overinterpret weak signals, but preserve useful evidence.** Nemesis builds a better
model of the learner **without repeatedly asking them to describe themselves.**

# 26. 🔴 Minimize the distance between thought and evidence

**One of the most important design principles.**

```
want to know if they understand it   →  let them explain it aloud
want to know if they can solve it    →  let them work it out
they don't understand one word       →  let them interact with that word
the explanation is too difficult     →  rewrite the explanation itself
Nemesis already has enough evidence  →  move on
```

> **Do not make the learner manage the learning system.**

# 27. Avoid mode selection

No **Learn · Flashcards · Quiz · Practice · Explain · Review** controls the Canvas revolves
around. Those may exist as underlying capabilities; the user must not keep deciding which
engine to invoke.

**The product should behave as though it is saying: *I know what you need to do next.***

# 28. Motion and premium feel

Use: smooth fades · restrained movement · in-place transformations · subtle thinking previews ·
soft height changes · local content replacement · polished composer transitions.

Avoid: excessive bouncing · confetti · gamified celebration · large progress animations ·
gratuitous gradients · flashy effects that delay learning.

> **A premium experience here comes primarily from the interface behaving intelligently** —
> the Canvas appearing to understand what the learner is doing and reorganising itself
> without being manually driven.

# 29. 🔴 Core UX invariant

> **At all times: the current cognitive task owns attention.**

Previous content stays recoverable; resolved material goes quiet. **Never allow the Canvas to
become a vertically stacked transcript** of every explanation, answer, correction and
question. The learner is working on **one evolving surface**.

---

# 30. The diagnostic policy (owner, 2026-08-13) — expands §4 and §5

## 🔴 The governing rule — a rule, not a format

> **Nemesis should acquire the maximum useful information about the learner with the minimum
> amount of learner effort.**

**No fixed diagnostic format.** Not a 10-question multiple-choice opener. That optimises for
speed of clicking; Nemesis needs what is actually in the learner's head.

Five options do reduce random guessing to 20% per question — all 10 by luck is about 1 in 9.8
million. **But luck is not the problem.** A student may recognise 7/10 while being unable to
independently explain or recall most of them.

## The hierarchy

```
free production  →  targeted probe  →  recognition when needed  →  teach

NOT:  10 MCQs  →  calculate score  →  start lesson
```

**Usually 2–5 interactions, and the interface itself changes depending on what it learns.**

| modality | when it is the right instrument |
|---|---|
| **Multiple choice** | Nemesis needs **breadth quickly** |
| **Free recall** | Nemesis needs **depth and confidence** |
| **Dictation** | makes free recall **cheap enough to use far more often** than traditional software |
| **Handwriting** | the **process itself** is the evidence |

## Worked example A — a single lecture

**1. Start broad, production-based.**

> *What happens when a competitive inhibitor binds an enzyme? Explain what you know.*
> 🎙️ *Listening…*  — the student talks for 15 seconds

**One spoken answer can reveal simultaneously:** active-site competition · substrate
relationship · Km · Vmax · reversibility · terminology · misconceptions. **More useful
evidence than several MCQs.**

**2a. If they clearly know it — stop interrogating, jump to transfer.**

> *Then predict what happens to this reaction as substrate concentration increases. Why?*

**2b. If they say "I don't really remember" — change strategy.** Do **not** demand another
free response. Rapidly sample the territory instead:

> *Which best describes competitive inhibition?*
> ○ Inhibitor binds the active site ○ Inhibitor permanently destroys the enzyme
> ○ Enzyme concentration decreases ○ Substrate becomes an inhibitor ○ Reaction becomes irreversible

They tap the first. 🔴 **Nemesis now knows something interesting: recognition exists despite
failed recall. That is itself diagnostically valuable.**

**3. Test one more boundary.** Right answer → **enough. Stop testing and start teaching.**

## Worked example B — a large source set, where MCQ earns its place

An entire cardiovascular unit → **HTN · HF · Arrhythmias · Anticoagulation · Lipids · CAD**.
Six separate open-ended questions would be annoying.

**A rapid diagnostic sweep works well here:** five compact questions across widely separated
concepts, five choices each, one tap each. **Not proving mastery — sampling the territory.**

```
HTN ✓   HF ✓   Arrhythmias ✕   Anticoagulation ✕   Lipids ✓
```

🔴 **Then — and this is important — verify the apparent STRENGTHS with production.** Do not
conclude "they know HTN."

> *You recognized the first-line hypertension material. Explain how you'd choose between an
> ACE inhibitor and a calcium-channel blocker for a patient.* 🎙️

Can explain → much stronger evidence. Cannot → **`recognition ✓ / retrieval ✕`**, an
important learner-state distinction.

## No "Diagnostic Test" framing

🔴 **Avoid** `INITIAL ASSESSMENT` · `Question 3 of 10` · `Progress: 30%`. That makes Nemesis
feel like every other educational application. **The Canvas opens and simply starts working:**

```
Question · tap · smooth transition · Question · speak · thinking preview
· a small passage appears · read · Continue · passage recedes · Question
· 🎙️ activates · answer · ✓ · next problem
```

**At no point does the learner need to understand which "mode" they are in.**

## 🔴 The architectural consequence — the diagnostic never ends

> **Diagnostic → teaching → retrieval → correction → diagnostic blur together because,
> architecturally, they are all evidence-producing actions. The diagnostic never really ends.
> Every subsequent interaction continues updating Nemesis's estimate of the learner.**

**Once Nemesis has enough evidence to decide what the learner needs next, stop diagnosing and
do it.**

---

## 31. Brain's notes on §30 — three consequences for the contracts

### 31.1 🔴 `recognition ✓ / retrieval ✕` is a different KIND of evidence, not a weaker score

An earlier ruling said a multiple-choice answer should write a *weaker value*. §30 shows that
is not enough. The two establish **different claims**:

```
recognition task  →  "can discriminate when shown the options"
production task   →  "can generate unprompted"
```

**Production implies recognition. Recognition does NOT imply production.** That is a partial
order, and flattening it into one confidence number is exactly how *"recognised HTN"* becomes
*"knows HTN"* and the learner is skipped past it.

**Therefore: evidence must record the modality that produced it, and the store must never let
recognition satisfy a retrieval requirement.**

### 31.2 The sweep's ✓ and ✕ are not symmetric

```
sweep ✕  →  act immediately            start teaching
sweep ✓  →  PROVISIONAL                triggers a production probe before it counts
```

**Why:** a false ✕ costs re-teaching something known — annoying, and self-correcting. A false
✓ costs skipping something unknown — invisible, and compounding under §22 scheduling and §25
evidence reuse. The asymmetry also makes the probes cheap: production is spent **only** on
what looked strong.

### 31.3 There should be no `diagnose` phase in the state machine

If diagnosis is a state, it acquires an entrance and an exit, and the code will treat
post-exit interactions as a different kind of thing. §30 says it is not. **What varies across
the session is how much uncertainty remains — not which mode is active.** The policy selects
the next action from learner state and uncertainty; it does not consult a phase.

**Selection criterion, stated formally:** maximise expected information gain **per unit of
learner effort**. That is why the hierarchy is ordered as it is, and why dictation changes the
economics — it lowers the effort cost of production, so production can be afforded far more
often than in traditional software.

---

# 32. Learner state (owner, 2026-08-13) — local, uncertain, never a global level

## 🔴 Do not assign the learner one global "level"

Not `beginner` / `intermediate` / `advanced`. **Knowledge is local.** Someone can have
excellent conceptual understanding of hypertension while having poor recall of drug names and
weak dosage-calculation ability.

**Learner state attaches primarily to knowledge/objectives**, and may include:

```
recall strength · conceptual understanding · application strength
scaffolding dependence · misconception risk
evidence count · recency · confidence in the estimate
```

Not every field applies to every knowledge type.

> 🔴 **Do not reduce learner state to mastered / not mastered.**

## Evidence-based and uncertain

Nemesis cannot read minds. It makes **small hypotheses, tests them, and updates**.

> *I think this learner understands competitive inhibition but may not understand why Vmax is
> preserved.* → ask → observe → update

The outcomes it must be able to represent:

```
understands independently · recognizes but cannot retrieve
can retrieve with a cue   · has a misconception
NOT ENOUGH EVIDENCE YET
```

🔴 **One weak answer must not permanently establish mastery. One failure must not permanently
establish ignorance.** The system must be able to represent uncertainty as a first-class
state, not as an absent row.

---

# 33. 🔴 SCAFFOLDING IS PART OF THE EVIDENCE

**The most consequential addition. It changes the shape of evidence.**

> *If two learners eventually say "active site," but one produced it independently while
> another required three cues, those responses are not equivalent evidence.*

```
Independent retrieval   Explain why competitive inhibition does not decrease Vmax.
Narrowed retrieval      What happens when substrate concentration becomes very high?
Partial cue             Substrate and inhibitor compete for the same ____.
Recognition             Active site or allosteric site?
Teaching                Nemesis explains the concept.
```

> **Scaffolding level must be EXPLICIT in evidence.**

## The ladder runs both ways

```
struggling      generation → guided generation → discrimination → recognition → teaching
after teaching  recognition → guided recall → independent recall → application → transfer
```

**The learner never sees a difficulty setting change. The Canvas simply changes the task.**

## 🔴 Brain's synthesis — this SUBSUMES the recognition/production flag

§6's hierarchy `independent production > guided production > discrimination > recognition` is
**the same ladder**. So the evidence shape does **not** need a modality flag plus a strength
score. It needs **one ordered axis: the rung at which the response was produced.**

```
evidence records THE RUNG        not "was it multiple choice?" + "how confident?"
```

This is strictly better than the two-flag design because the partial order is built in:
a response produced at a higher rung entails the lower rungs; a lower rung entails nothing
above it. *"Recognised HTN"* can never be read as *"knows HTN"* because they are different
values on one scale, not the same value with a footnote.

---

# 34. 🔴 THE NEMESIS POLICY — explicit, not an LLM improvising each turn

Given knowledge territory · source provenance · learner state · evidence history ·
prerequisites · current objective · memory state · session context, the policy decides **what
happens next**.

**Action vocabulary:**

```
DIAGNOSE · TEACH · RETRIEVE · APPLY · DISCRIMINATE
SCAFFOLD · CORRECT · RETEST · REVIEW · ADVANCE
```

**Parameters:** target knowledge · difficulty · scaffolding level · modality · explanation
length · retrieval form.

> 🔴 **The model may participate in the decision, but do not allow an unconstrained LLM prompt
> to reinvent learning policy on every turn. There must be explicit system invariants.**

## The invariants, as the owner stated them

```
1  Do not infer durable mastery from one weak recognition response.
2  Do not ask the same question repeatedly after failure — increase scaffolding, or teach.
3  Do not immediately ask a question whose answer is still visible.
4  After successful independent retrieval, REDUCE PRIORITY — do not permanently remove.
5  Corrections need enough time to be read.
6  Never have two simultaneous answer-collecting surfaces competing for attention.
7  Never invent source-supported knowledge when the source does not establish it.
```

**§21 names the mechanism for invariant 4:** `actedOn`, or an equivalent, **must remain a
reordering mechanism, not a permanent filter.**

---

# 35. Ownership and evaluation on the Canvas

## 🔴 35.1 Preserve the learner's answer — BLUE means "this came from you"

The learner must always distinguish **what I produced** from **what Nemesis added**. Use a
consistent visual ownership treatment. **Blue is the learner-work colour.**

> 🔴 **Blue means: this came from you. It does NOT mean correct. Keep that semantic stable.**

A dictated transcript renders as learner-owned material. Handwriting preserves the original
work and/or its interpreted reconstruction as learner-owned material. **Then annotate it.**

> **Do not replace the learner's work with Nemesis's answer.**

## 🔴 35.2 Evaluation is LOCALIZED, not a grading surface

Do not turn answers into giant red/green surfaces. **Do not colour every correct phrase green
and every incorrect phrase red.** Preserve the answer as a coherent object, then identify the
**specific proposition, step or relationship that matters.**

> *"ACE inhibitors decrease angiotensin II, reducing vasoconstriction, but aldosterone
> increases because blood pressure falls."*
>
> ↓ angiotensin II — **correct** · ↓ vasoconstriction — **correct** ·
> aldosterone increases — **misconception**

**Draw attention primarily to the misconception. Explain briefly why.**

> **The goal is not to visually grade every token. The goal is to show: here is exactly where
> your model diverges from the correct one.**

## 35.3 Vision interpretation must be inspectable

**Do not silently pretend vision interpretation is perfect.** Where uncertain, make the
interpreted reconstruction **inspectable and correctable** by the learner. Then evaluate the
steps, distinguishing correct method + arithmetic error · incorrect method · substitution
error · unit error · algebra error · conceptual error · transcription uncertainty.

---

# 36. The architecture is hybrid — not one magic model

```
SOURCE → PARSING / STRUCTURE RECOVERY → KNOWLEDGE TERRITORY → LEARNER STATE
      → NEMESIS POLICY → COGNITIVE ACTION → CANVAS → LEARNER RESPONSE
      → MULTIMODAL EVALUATOR → EVIDENCE → LEARNER-STATE UPDATE → POLICY AGAIN
```

**Separately, and feeding in:**

```
ESTABLISHED MEMORY → MEMORY / FORGETTING SCHEDULER
                   → REVIEW BECOMES CANDIDATE → NEMESIS POLICY
```

**Responsibilities stay separate:**

```
POLICY     answers  "what cognitive action should happen next?"
SCHEDULER  answers  "when is this established memory worth retrieving again?"
```

🔴 **The UI is downstream of this state machine.** Do not search for one algorithm called
"the Nemesis algorithm."

---

# 37. 🔴 Do not over-engineer v1 with a learned policy

**We do not have enough Nemesis-specific learner data to train an optimal educational policy.
Start interpretable.**

Prioritise candidate knowledge with explicit factors:

```
importance · uncertainty · prerequisite relevance · learner weakness
forgetting risk · current objective · source relevance
recent exposure · repetition penalty
```

---

# 38. 🔴 ONE BUTTON (owner, 2026-08-13)

> **"The only button should be 'continue' below reading passages, thats it."**

Asked whether the two dead controls the sweep found — **"Retest me"** and **"Fix my weak
spots"** — should come back, the owner's answer is no, and the rule is wider than those two.

## DELETE — learner-facing controls that steer the learning machine

```
"Retest me"           dead, and not wanted back
"Fix my weak spots"   dead, and not wanted back
```

Both behaviours are already owed to the learner **automatically**: §18 makes re-testing the
system's job, and weak-spot targeting is what the policy's objective ordering does. A button
for either is the learner managing the system, which §26 forbids. If the learner wants to say
*"test me on this again"*, that is **a phrase to the composer**, not a control.

**And the rule generalises: no button on the learning surface that selects what happens next.**
§27's ban on mode selection, expressed as a UI rule.

**Narrowed, not reversed — owner, 2026-08-23.** The rule above was written against controls that
steer the learning machine mid-loop: quiz me, test me, easier, harder. Those stay banned; Nemesis
keeps deciding the next pedagogical action itself. What the owner carved out is a different object,
in their own words: *"`Course` is … a one-shot declaration of user intent at the composer boundary,
analogous to attaching a file. It tells Nemesis: 'Treat this next submission as a request to create
a persistent curriculum.' It does not tell the teaching engine what to do next."* The rule as it now
stands:

```
Do not expose persistent controls that select the next pedagogical
action during an active learning loop.

One-shot composer capabilities may explicitly declare user intent
or attach resources to the next submission.

Examples:
- Attach files
- Course

These capabilities clear after submission and must not become
persistent teaching modes.
```

The distinguishing test: **a capability says what this submission IS; a mode says what Nemesis
should do next.** `+ attach` was always on the KEEP list below for exactly this reason, and Course
is the same shape — it clears on send (`clearsOnSubmit` in `composer-capability.ts` is always true,
and a guard holds it), and once a course exists the Canvas owns it and the composer carries nothing.

## KEEP — these are not "buttons" in the sense meant

```
Continue                     below a reading passage — THE one button
×  leave the canvas          navigation, owner-specified this session
+  attach · mic  dictate     composer affordances, §2 and §14
×  ✓  during dictation       discard / transcribe, owner-specified explicitly
send                         the composer
sidebar · Library row actions   navigation and management, not the learning loop
```

The distinguishing line: **the composer steers; Continue paces; navigation moves. Nothing on
the learning surface chooses the next cognitive action.**

## 🔴 The rule — confirmed and generalised by the owner

> **"Anytime there is a reading requirement, there should be a continue button. Whether it be
> a passage or a correction explanation."**

**The trigger is a READING REQUIREMENT, not a component type.** Brain had proposed this as an
enumeration — passages and corrections — and the owner widened it to the general rule. That
distinction is load-bearing for implementation:

```
WRONG   hard-code Continue into <ReadingPassage> and <Correction>
RIGHT   a reading requirement is a PROPERTY of a region; Continue follows from it
```

Any surface that asks the learner to read — now or later — gets a `Continue`, without anyone
having to remember to add one. Anything that does not require reading does not get one.

**This also resolves §19 and §34 invariant 5 cleanly:** a correction is material the learner
was asked to read, so it carries a reading requirement, so it gets a `Continue`, so nothing
advances before it has been read. Not a special case — the same rule.

**Result: there is exactly ONE button in Nemesis. It says `Continue`, it appears wherever the
learner has been asked to read something, and it means "I have finished processing this."**

---

# 39. 🔴 WHEN CONTINUE APPEARS — cognitive mode, not correctness (owner, 2026-08-13)

**This refines §38.** Brain's rule was *"a reading requirement gets a Continue."* The owner has
supplied the decision procedure for **when a reading requirement exists**, and it is not
"the learner was wrong."

> ## Continue belongs after comprehension, not after correction.

## The invariant

**Do not base Continue on whether the answer was right or wrong. Base it on what Nemesis puts
on the Canvas next.**

```
transient correction          →  AUTO-ADVANCE
reading / comprehension object →  LEARNER ADVANCES
```

> **The Canvas advances automatically after production and brief answer exposure. It waits for
> explicit acknowledgement only when Nemesis has presented material that requires deliberate
> reading or inspection. Correctness does not determine advancement; cognitive mode does.**

**This solves the edge cases in both directions:** a *correct* answer may occasionally reveal
an explanation worth reading — that gets a Continue. An *incorrect* answer may need only one
word revealed — that does not.

## The table

| Situation | After an incorrect answer | Continue? |
|---|---|:--:|
| Simple fact / association | show incorrect → correct answer briefly → move on | **No** |
| Vocabulary / drug fact / flashcard-like recall | show the expected answer, perhaps one tiny distinguishing cue → move on | **No** |
| Partial conceptual answer | show the missing distinction / explanation | *Usually yes* |
| Misconception | explain why their model is wrong and replace it | **Yes** |
| Math / calculation error | show where their reasoning diverged + corrected steps | **Yes** |
| Multi-step reasoning | compare their reasoning against the correct reasoning | **Yes** |
| New concept exposed by failure | teach the necessary passage | **Yes** |

## Associative failure must be extremely fast

> *What ARB is commonly used for hypertension?* → *"Valsartan?"*

**Not** *"Not quite. Losartan is an angiotensin II receptor blocker commonly…"* followed by a
Continue. Instead:

```
Valsartan → Losartan

          or with one cue

Losartan
ARB · hypertension
```

Then, after roughly **1–2 seconds**, the next retrieval appears.

```
GOOD   retrieve → fail → expose answer → move on → LATER retrieve again
BAD    retrieve → fail → mini-lecture → Continue → retrieve
```

🔴 **Two consequences that are not cosmetic:**

1. **Seeing the answer is not evidence that the learner now knows it.** Exposure writes no
   demonstration and must not reduce priority. Nemesis **schedules another retrieval later.**
2. **It must not immediately re-ask the identical question while the answer is still in
   working memory.** This strengthens §34 invariant 3 — that said *"still visible"*; this says
   **still in working memory**, which is a window *after* it leaves the screen.

## Conceptual failure is different

> *Why can ACE inhibitors cause a dry cough?* → *"Because they lower angiotensin II."*

Their causal model is incomplete — not a missing association. So:

> **The missing piece is bradykinin.** ACE normally breaks down bradykinin. When ACE is
> inhibited, bradykinin accumulates, which can trigger a persistent dry cough.
> `Continue`

🔴 **Auto-advancing here would be bad.** *"Nemesis has put information on screen that it
expects the learner to process. It shouldn't decide that 2.5 seconds was enough."*

## Math needs learner-controlled advancement most

```
Your reasoning
  500 mg ÷ 250 mg = 2          ✓
  2 × 10 mL = 20 mL            ✗

Where it went wrong
  If the concentration is 250 mg/5 mL:
  500 mg × 5 mL / 250 mg = 10 mL

  10 mL
                                Continue
```

Here **Continue means something very specific: *I have finished inspecting the correction.***
That is a legitimate interaction, not arbitrary friction.

## The rhythm, and the visual weight

```
answer → answer → answer → read → Continue → answer → answer → correction → Continue → answer…
```

**Controls appear only when the learner's cognitive activity changes.** Never
`Submit → Correct → Continue → Next → Submit → Correct → Continue → Next` — that is software
making the learner administrate the session.

🔴 **Keep Continue visually restrained — not a giant black CTA.** Nemesis is not persuading the
learner to take an action. It is the learner saying *"I've read this."*

## 🔴 Brain's note — this puts the decision in the POLICY, not the UI

*"Does this correction require deliberate reading?"* is a judgement about **what kind of
cognitive object is being emitted**, which only the policy knows — it chose the action, it
knows the knowledge type, and it knows whether it is exposing an answer or teaching a model.

**So the policy declares the cognitive mode of what it emits, and the Canvas renders the
consequence.** The Canvas must not infer it from the verdict, the component type, or the
length of the text. That is §36's *"the UI is downstream of this state machine"* applied to
the one control the product has.

---

# 40. 🔴 THE TEACHING-STRATEGY LAYER — §34 is a bet, and this is the instrument that measures it

*(Owner directive, 2026-08-14. Engineering: this section SCOPES the experiment; it does not
amend §34, which continues to govern the product.)*

> 🔴 **WORDING AWAITING THE OWNER'S CONFIRMATION.** §34 is the owner's ruling and this document is
> theirs. This section was drafted by engineering so the contract is not silent while code that
> *looks* like it contradicts §34 sits in the tree. **What it describes is what shipped, and it is
> accurate.** What is unsettled is whether the owner wants it worded this way, filed as its own
> section, or folded into §34 as an amendment. Read it as a proposal about placement, not about facts.

§34 rules that the Nemesis policy is **explicit, not an LLM improvising each turn**. §37 says the
same thing from the other side: *do not over-engineer v1 with a learned policy; start
interpretable*. Both are **bets** — that structured cognition beats a good model given a good
teaching objective. A bet nobody measures is a belief.

So the Canvas can now run with either of two **teaching controllers** behind it, and the owner's
question is whether the structured engine adds value beyond giving the model a strong teaching
goal.

```
sources + learner context ──→ teaching strategy ──→ next Canvas action
```

| Arm | What decides the next action |
|---|---|
| `nemesis_policy` | The full cognition path: knowledge objects, projected learner state, prerequisites, scaffolding, spacing, action ranking, misconception repair. **The default, and the product.** |
| `llm_teacher` | The same model family, given an explicit adaptive-teaching objective, choosing for itself. **The baseline being measured against.** |

## What is held constant — this is the whole design

**Only the teaching controller changes.** Same Canvas, same source material, same parser, same
knowledge extraction, same objectives, same question wording, same evaluator, same
learner-response capture, same evidence rows, same telemetry, same metered model door and
therefore the same budget. A guard asserts it: two decisions naming the same objective and the
same action produce a byte-identical prompt and a byte-identical evidence row apart from the one
field that names the arm.

## What §34 the baseline DOES still obey, and what it does not

The baseline is **constrained, not unconstrained** — it is not the thing §34's warning forbids:

* it may not word a question, invent a task format, or choose a presentation;
* it may not decide what counts as evidence, or bypass the judge;
* it may not name a misconception the evidence log does not already hold — that would be
  teaching against a mistake nobody made;
* it may only choose among the objectives it was given, and only from the shared action
  vocabulary. Naming anything else is a **counted refusal**, never a fallback.

What it does **not** get is invariants 1–5. That is the point of a control group: those
invariants are the treatment. If the baseline asks the same question twice after a failure, or
re-asks something already demonstrated, the metrics record it — that is the measurement, not a
defect.

## 🔴 The result must be able to come out against Nemesis

A baseline that loses because it was under-instructed proves nothing. It is given a genuinely
strong teaching objective, told explicitly to diagnose, adapt difficulty, use retrieval, correct
misconceptions, scaffold, and aim at durable transferable understanding — and told that
declining to act is a legitimate answer, because *"unnecessary questions on already-established
material"* is one of the outcomes being compared and rigging it by construction would make the
number meaningless.

**There is no fallback from the baseline to the structured policy anywhere.** A fallback would
make the two arms one arm, both cohorts would report identical outcomes, and the conclusion
drawn would be *"structured cognition adds nothing"* when what happened is that the baseline
never ran. **A degraded arm must read as degraded.**

## Assignment

Fixed for the session and **derived, never stored** — from `(learner, canvas)`, so a reload, a
remount or a second tab all resolve the same arm and a session cannot finish under a controller
that did not start it. Recorded on every evidence row it produces. **Random assignment is built
and switched OFF**; turning it on enrols learners into an experiment, which is the owner's call.

There is **no learner-facing control** and there must not be — §27 rules that a learner must not
keep deciding which engine to invoke, and an arm picker is exactly that.

---

# 41. 🔴 THE VISUALIZATION LAYER — a router, not a graphics library (owner, 2026-08-14)

## STATUS: FIRST TRUSTED ROUTES SHIPPED — source figure, equation, relationship and quantitative, behind a router. ADVANCED ROUTES REMAIN PLANNED.

🔴 **The router exists** — `routeVisual()` in `apps/web/lib/learn/visual-route.ts`. It is a pure
function taking a knowledge object, the cognitive operation in flight, and an untrusted model
request, and it returns one of three decisions: **render** a named representation, **prose** (no
visual, which is the common and correct answer), or **refused** with a named reason. Canvas accepts
a bounded semantic `visual` request on a teaching block; trusted code routes equations to KaTeX and
renders simple conceptual relationships and quantitative series with deterministic SVG. The model
cannot supply HTML, SVG, JavaScript, React, Mermaid, or renderer configuration. Geometry, advanced
charting, and true 3D remain planned.

🔴 **The source-figure path is absorbed, not parallel.** The four conditions that used to decide
occlusion inside `canvas-policy-view.tsx` — a figure exists, its pixels were kept, it names enough
parts, and the objective's label resolves — now live in the router as the `source_figure`
representation, and that component asks for them. The source figure is **preferred over any
concurrent model request** for the same moment, because it is the learner's own material.

🔴 **`prose` and `refused` are different outcomes.** Both draw nothing. `prose` means a picture
would not have helped — two nodes and one arrow is a sentence, and an association is an arbitrary
mapping with no structure to show. `refused` means a request was malformed or unsafe, and carries a
named reason (`dangling-edge`, `unsafe-latex`, `unknown-kind`, …) rather than a silence. Collapsing
them would make "the boundary rejected something" indistinguishable from "we chose words".

Read the advanced routes in this section as a description of where Canvas is **going**, not of what it does. It is
recorded now for one reason the owner stated plainly: *"preserve this as an architectural
direction so we don't later lock Canvas into Mermaid-only diagrams or treat Three.js as the
universal visualization system."* A decision made casually in a sprint — one library reached for
twice and then everywhere — is far harder to undo than it is to pre-empt here.

🔴 **THIS DOCUMENT HAS ALREADY BEEN MISREAD ONCE IN EXACTLY THIS WAY.** It described eleven
knowledge kinds while the code had one lane, and that gap was read as a description of built
behaviour rather than of intent. So this section carries a status line, and anything implementing
it must move the status line in the same change.

## The goal

Not one graphics library for everything. **A visualization router that chooses the renderer
according to what would best help the learner understand this concept.**

Text is a renderer too, and often the right one. The question is never "which library" — it is
"what representation makes this idea land", with "prose" as a legitimate answer.

## The planned renderer stack

| Renderer | For |
|---|---|
| **KaTeX** | equations and mathematical notation |
| **JSXGraph** | interactive 2D math — geometry, coordinate planes, functions, calculus, vectors, sliders, transformations, tangent/secant lines |
| **Mermaid** | conceptual diagrams — pathways, mechanisms, causal chains, flowcharts, hierarchies, timelines, state and sequence relationships |
| **Vega-Lite** | quantitative data — bar, line, scatter, histogram, distribution, box plot, heatmap, area, pie/donut, dose–response, time series |
| **React Three Fiber / Three.js** | genuine 3D — molecules, stereochemistry, anatomy, geometric solids, spatial physics, 3D vectors |
| **D3 / custom SVG / React** | escape hatch for bespoke interactive teaching objects the above cannot express cleanly |

## 🔴 THE CONSTRAINED INTERFACE — the load-bearing rule of this section

**The teaching model must not generate arbitrary Three.js, D3 or React visualization code.**

Instead the learning engine gets a constrained *semantic* interface — it says what it wants the
learner to understand, not how to draw it:

```ts
visualize({
  kind,          // the semantic class, not a library name
  concept,       // what this is a picture OF
  data,          // the values, when there are values
  learningGoal,  // what the learner should be able to do after seeing it
  interaction,   // what they may manipulate, and what that reveals
  annotations,   // what is labelled, hidden, or highlighted
})
```

Canvas routes that request to a trusted renderer:

```text
equation / notation        → KaTeX
2D math / geometry         → JSXGraph
conceptual relationship    → Mermaid
quantitative data          → Vega-Lite
true spatial relationship  → React Three Fiber
unusual bespoke object     → D3 / custom
```

Why the constraint is not negotiable: generated visualization code is unreviewable, unbounded in
cost, and fails at render time in front of the learner. A semantic request is checkable before
anything is drawn, cacheable, replayable, and can be *refused* — and a refusal to draw is a
legitimate answer that arbitrary code generation cannot give.

## 🔴 THESE ARE LEARNING OBJECTS, NOT DECORATION

A visual participates in the teaching loop or it does not belong on the Canvas:

- show a parabola and let the learner move the tangent point;
- let them change a parameter with a slider and watch a function transform;
- hide one node in a pathway and ask what belongs there;
- show a bar chart, ask them to infer the comparison, then reveal the values;
- show two distributions and let them manipulate variance;
- rotate a molecule and ask them to identify the chiral center;
- hide the labels on an anatomical figure and use it for retrieval;
- animate a pharmacokinetic curve and ask where one half-life falls.

**The learning algorithm chooses the visualization because it improves the next teaching action —
never because visual content looks impressive.** A picture that cannot be answered against is
decoration, and decoration competes with the material for the attention §19 reserves for it.

🔴 **THE FIRST INSTANCE OF THIS ALREADY SHIPPED, AND THE ROUTER HAS SUBSUMED IT RATHER THAN
SITTING BESIDE IT.** Source figures are stored as durable assets (`DocFigure.asset`, #619) and
occluded for spatial retrieval (#620) — that is precisely "hide the labels on a figure and use it
for retrieval", already in the teaching loop. In this taxonomy the source image is a renderer, and
it is now `routeVisual`'s `source_figure` representation: the decision moved out of
`canvas-policy-view.tsx` and that component asks the router for it. A second, parallel visual
system is how one product ends up with two of everything, and for a while this product had one.

## 🔴 THE 3D RULE — rare, and earned

Use 3D **only when depth, orientation, rotation or spatial relationship is part of what must
actually be understood.** Do not turn an ordinary diagram into a Three.js scene because 3D looks
sophisticated. A pathway is not more comprehensible for floating in space; a stereocenter is.

## Canvas composition

A teaching moment composes primitives rather than filling a dashboard:

```text
short explanation → equation → interactive visual → learner response
  → evaluation → the visual changes or highlights → next question
```

This must obey the Canvas philosophy already in force: **resolved material goes quiet, the current
learning object owns attention (§19), and transitions are fluid rather than a page of widgets.**
Several live visuals on screen at once is a dashboard, and a dashboard is the thing this product
is not.

## 🔴 PRIORITY — this is FOURTH THROUGH SIXTH, and that ordering is the owner's

*"Do not prioritize this over getting the core learning algorithm and Canvas session quality
right."*

1. Excellent adaptive learning / session algorithm
2. Excellent Canvas flow, transitions, evaluation, dictation and interaction
3. Reliable source / document understanding
4. Visual diagrams / charts / image-based teaching
5. Interactive math
6. Selective 3D and advanced simulations

A beautiful renderer attached to a policy that asks the wrong question next is worth less than
plain text attached to the right one. Anyone tempted to start at 5 or 6 because it is the more
enjoyable engineering should read this line as the answer.

# 42. 🔴 SCIENTIFIC REPRESENTATION IS A TRUST LADDER — generation is the last rung, not the first (owner, 2026-08-18)

## STATUS: RUNGS ONE, TWO AND THREE SHIPPED AND SERVING. A LESSON OR A REPLY RESOLVES A NAMED COMPOUND RATHER THAN RECALLING IT; A LESSON NOW REQUESTS A REAL LICENSED PICTURE BY SUBJECT AND A 3D MACROMOLECULE BY NAME, BOTH RESOLVED SERVER-SIDE AND LICENCE-GATED. THE CURATED REGISTRY IS SEEDED AND A LIVE PROVIDER STANDS BEHIND IT. RUNG FOUR EXISTS AS A ROUTER RULE WITH NOTHING WIRED TO IT.

🔴 **Rung three went live on 2026-08-23, on the owner's instruction** (*"let's ingest it… can you
put those APIs in as well… Nemesis or DeepSeek needs to be able to have access to a lot of these
visualizations when it's teaching"*). The shape mirrors the compound lane exactly: the model names
a SUBJECT — `{"kind":"figure","subject":"mitosis stages labelled diagram"}` — and stops there.
`figure-resolve.ts` strips any `asset` a model wrote, `app/api/learn/reference-image` asks the
curated registry and the live provider from the **server**, `chooseAsset` makes the one licence
decision, and the chosen picture travels with its licence object and is rendered with its credit
line by `ReferenceFigure`. A subject that resolves to nothing keeps its prose and shows nothing,
and the stored, assetless request is the countable record of the coverage gap.

🔴 **The macromolecule representation shipped the same day, and it is rung two, not rung three.**
`{"kind":"macromolecule","molecule":"haemoglobin"}` resolves through RCSB's own search on the
server (`macromolecule-resolver.ts` — a name in, a validated accession and the entry's own title
out, `resolvedFrom` stamped and stripped from anything a model sent, exactly as compounds work). An
embedded Mol* viewer (`macromolecule-viewer.tsx`, loaded in its own chunk only when a structure
appears) draws from the Protein Data Bank's deposited coordinates, fetched by the browser from the
database's public file store the way reference images are fetched from theirs. The accession and
title stay printed beside the viewer — the same inspectability a SMILES string gets. A
model-written accession is refused by construction: four opaque characters are the remembered-
SMILES danger with fewer ways to notice, so only the resolver mints them.

🔴 **The resolver was wired on 2026-08-21, and until then this section described something no
learner had ever seen.** `chem-resolver.ts` was built, tested and merged, and `grep -r
resolveStructure` returned one dev-only route. So every molecule Nemesis had drawn was one the model
remembered — the exact case the rule below was written about. The teaching path did not disagree with
the ladder; it simply never climbed it.

The model now names the compound and stops there: `{"kind":"structure","compound":"aspirin"}` in a
lesson, `[compound: aspirin]` in a reply. `app/api/learn/structure/route.ts` asks PubChem from the
**server** — the learner's browser never touches a third party — and `structure-resolve.ts` puts the
answer back before any parser runs.

🔴 **`resolvedFrom` is stamped by the resolver and stripped from anything a model sent.** The field
means "a resolver was asked for this name and returned this string". A model can write those words,
and one that wrote them beside a remembered SMILES would be laundering its own memory into
provenance. The validator still accepts the field because trusted callers set it; nothing arriving
from a model keeps it.

🔴 **A generic group has no name and must not be resolved.** `*O` is every alcohol and PubChem holds
no such compound, so model-written notation still works exactly as it did. What changed is that a
named compound now has a better path, and the prompt says which case is which. A name that does not
resolve loses its picture and never the prose.

🔴 **"SERVING" WAS HALF TRUE UNTIL 2026-08-19 AND THE HALF IT WAS MISSING IS WORTH NAMING.** The structure lane was built, routed, dark-mode-correct and covered by six browser checks — and the teaching prompt never mentioned it, so no lesson could ask for a molecule. Rungs one and two were serving for figures and equations, and merely *reachable* for chemistry. The prompt vocabulary now names `structure`, so a lesson on functional groups can draw one. Rungs three and four are unchanged: the registry is still empty and nothing generates.

§41 asked *which representation makes this idea land*. This section answers a second question §41
never asked: **when the answer is "a picture", where may that picture come from, and how far does
its origin let it be trusted?**

The owner's ordering, in their own words:

```text
source already contains the right figure
        ↓
reuse source figure

exact scientific representation can be rendered from data
        ↓
render deterministically

good open/public-domain reference image exists
        ↓
retrieve licensed image

none of the above works
        ↓
generate an illustrative image
```

*"The last rung should be the least trusted one for scientific accuracy."*

🔴 **THE ORDERING IS CODE, NOT PROSE.** `PROVENANCE_LADDER` in
`apps/web/lib/learn/visual-provenance.ts` is the list above, and `trustRank()` is its index.
`routeVisual()` consults it. A section of a document asserting an ordering is a section somebody
will read past; a sorted array that a router calls is one they have to change on purpose.

🔴 **THE FAILURE THIS PREVENTS IS THE CHEAPEST RUNG WINNING BY DEFAULT.** Generation is the easiest
route to reach for: one call, no registry, no licence bookkeeping, and a picture every single time.
Every other rung needs something to exist first — a parsed figure, a canonical encoding, a licensed
asset. Without an ordering that code applies, the rung that requires the least work becomes the rung
that gets used, and it is the one that invents plausible-looking detail.

## Why a render outranks even a licensed photograph

This is the rung order most likely to be got backwards, because a photograph looks more "real" than
an SVG. A deterministic render is not a picture somebody vouched for — **it is the canonical
encoding, drawn.** If the encoding is right the depiction is right; if the encoding is wrong the
depiction is wrong in a way that is inspectable, because the string that produced it is stored. A
retrieved image is trustworthy on somebody else's authority. A rendered one is trustworthy on
arithmetic.

Only the learner's own source figure outranks it, and that is a **pedagogy** ordering rather than an
accuracy one: the source figure is what they will meet again in the exam and what their lecturer
drew on.

## 🔴 THE RULE WITH TEETH — a generated picture may never be the answer key

`mayBearAccuracyClaim()` returns false for `generated_image`, with no threshold, no confidence
score, and no "unless we have nothing else" branch.

An occlusion question — cover a part, ask what it is — is **graded against the picture**, so the
picture *is* the answer key. A generated image cannot be one: its labels, proportions and
adjacencies are whatever made a plausible picture. Marking a learner **wrong** against invented
detail is worse than showing them nothing, because it also writes durable evidence against them
(§25) for a question that had no correct answer.

So a generated image is reachable only where nothing is graded against it — beside an explanation,
never inside a retrieval. And when it is shown it is labelled `Illustrative — not a source figure`,
which is not a disclaimer but the one fact a learner needs to know how to read it. A retrieved
histology plate and a generated impression of one look equally authoritative on a screen.

## 🔴 A REPOSITORY NAME IS NOT A LICENCE

Open repositories are *reservoirs*, not licences. Media in the broadest of them is intended to be
reusable, but **the licence rides on each individual file**, so a registry row recording only "from
that repository" has recorded nothing legally useful. `visual-provenance.ts` therefore reads the
per-asset `licence` field and never the `source` field, refuses anything outside an **allow list**
of reusable licences (an unrecognised string is a no, never a maybe), and refuses a `CC-BY`-family
asset whose credit line was not kept — so the credit always exists to display at the moment the
picture is shown. A licence stored in a database and never rendered is a record of a promise nobody
kept.

Candidate repositories the owner named — open textbook programmes, government and public-health
image libraries, commons collections, historical medical archives — feed the lane in **two ways,
and the preference between them is code** (`reference-images.ts` lists curated candidates first):

- **A curated registry, entered by hand** (`reference-registry.ts`, seeded 2026-08-23 via
  `scripts/reference-registry-harvest.mts`): each row is one file whose own licence was read
  through the repository's API and normalised onto the allow list, with its credit kept verbatim.
  `reference-registry.test.ts` re-asserts every row's licence, credit and host on every run, so a
  row cannot rot quietly.
- **A harvested shelf of named collections** (`reference-shelf.ts`, generated by
  `scripts/reference-shelf-harvest.mts` on the owner's same-day instruction to ingest at scale):
  the OpenStax textbook figure corpus that legally escaped under CC BY (anatomy & physiology,
  biology, microbiology, chemistry, astronomy, physics), the Blausen Medical gallery, Gray's
  Anatomy plates, Servier Medical Art, the CDC image library uploads and NHGRI's genome
  illustrations — thousands of rows, every single file's licence read and normalised exactly as a
  hand row's is, refusals counted in the file's own header. Collections are named in code, so
  adding one is a reviewed change and never a crawl; `reference-shelf.test.ts` re-verifies every
  row offline on every run. Hand rows are listed ahead of shelf rows, and both ahead of the live
  provider.
- **A narrow live provider** (Wikimedia Commons' API, whose per-file licence metadata is
  machine-readable), asked a specific question at teaching time and believed only about files
  whose licence normalises. This is retrieval, not ingestion: no crawler, no mirror, no embedding
  index — the owner's *"Do NOT bulk-ingest the internet"* stands. One candidate repository was
  evaluated and REFUSED on exactly these rules (Open-i, 2026-08-23: its API hides per-image
  licences and answers only browsers, so nothing it returns can pass the licence gate honestly).

## 🔴 FIELD-AGNOSTIC, AS EVERYWHERE ELSE

Nothing in `visual-provenance.ts` names a field, a topic or a discipline, and nothing may. A
licensed diagram is trusted because its licence and author are recorded, not because of what it
depicts; a generated one is distrusted for the same reason whether it illustrates a kidney, a truss,
or a contract-formation sequence. The owner's design test applies unchanged: **would this work for a
law student and a mechanical engineering student?** The ladder does, because it is a rule about
provenance rather than about subject matter.

## The representation primitives this implies, and their status

| Representation | Canonical form the model emits | Status |
|---|---|---|
| Source figure | the figure already in the learner's material | **shipped** (§41, `source_figure`) |
| Equation | LaTeX | **shipped** (KaTeX) |
| Relationship / pathway | nodes and edges | **shipped** (deterministic SVG) |
| Quantitative | series of points | **shipped** (deterministic SVG) |
| Chemical structure (2D) | SMILES, resolved from a name where possible | **shipped** (`structure`, drawn by a depiction library) |
| Reaction scheme | `reactants>agents>products`, conditions as prose | **shipped** (`reaction-smiles`) |
| Group highlighting inside a structure | atom indices | **shipped** (what makes a structure answerable-against) |
| Relationship polarity | `increases` / `decreases` on an edge | **shipped** (arrowhead vs bar) |
| Licensed reference image | `{"kind":"figure","subject":"…"}` — a subject, resolved and licence-gated | **shipped** (seeded registry + live provider, credit rendered) |
| Generated illustration | a prompt | **router rule only — not wired to `nemesis-media`** |
| Macromolecular structure | `{"kind":"macromolecule","molecule":"…"}` — a name, resolved to a PDB accession | **shipped** (Mol* viewer, RCSB resolver) |

## 🔴 CHEMICAL STRUCTURES ARE THE EQUATION LANE WITH A DIFFERENT NOTATION

A chemical structure is not an image-generation problem. The model emits a canonical string, a
validator bounds it, and a depiction library draws it deterministically — exactly what KaTeX does
for `latex`. Generating a benzene ring as pixels is the wrong instrument for a problem that has an
exact answer.

- **The spec carries notation, never geometry.** `StructureVisual` is `{ notation: "smiles", value }`,
  and the canonical string is shown beside the drawing rather than hidden behind it. Anyone can check
  what was asked for.
- **A name becomes a structure through a resolver, not through recall.** `chem-resolver.ts` asks
  PubChem for a compound name and prefers the **isomeric** SMILES, because a chirality question asked
  against a structure that dropped its stereocentres is unanswerable. A model-written SMILES is still
  accepted and is distinguishable from a resolved one: `resolvedFrom` is present or it is not, and
  both may be right without being equally trustworthy.
- **The validator is a shape check, not a chemistry engine**, and it refuses the two errors a grammar
  accepts: unbalanced brackets, and a ring bond opened and never closed. That second one was measured
  against the depiction library — `C1CC` parses cleanly and then draws the ring missing, and a
  structure that renders WRONG is worse than one that refuses.
- **Reactions are a separate notation, not a SMILES containing an arrow.** Sniffing one from the
  other would make "we do not draw reactions" indistinguishable from "that reaction was malformed",
  and it makes the teaching model state which it is asking for — the decision a reaction question
  turns on. Each side is validated as ordinary SMILES, and a refusal names WHICH side failed.
- **Measured, in a real browser:** aspirin draws 18 bond strokes with identical coordinates across
  two renders; L-alanine draws 14 against 6 for the same molecule written without stereochemistry;
  acetic acid draws as a structure rather than the string `COOHCH3`; highlighting four atoms adds
  52 marks; an esterification draws 13 bonds and 8 text elements. See
  `scripts/visual-ladder-acceptance.mts` — 17 checks.

### What the depiction library offers, and what Nemesis takes

🔴 **THIS TABLE EXISTS BECAUSE "WHAT WE ARE NOT USING" WAS INVISIBLE.** A library is adopted for one
feature and its other capabilities become invisible defaults — nobody decides against them, so
nobody knows they were available. Each row below is a decision.

| Capability | Status | Why |
|---|---|---|
| Molecule depiction from SMILES | **used** | rung two |
| Stereochemistry (wedge/hash) | **used** | measured: a stereocentre visibly changes the drawing |
| `dark` / `light` themes | **used** | see below — colour is baked into the SVG, so it is a redraw |
| Reaction schemes (`reactants>agents>products`) | **used** | conditions ride above the arrow as prose |
| Atom highlighting | **used** | what makes a structure answerable-against |
| `compactDrawing: false` | **used** | the default collapsed small molecules into text |
| `showCarbons` | **used** | a stated teaching choice on the spec, not a theme |
| `getTotalOverlapScore()` | **used** | refuses a drawing whose atoms sit on one another |
| `getMolecularFormula()` | available, **not used** | a formula label is a teaching decision nobody has made |
| Weight/heatmap overlays (`GaussDrawer`) | available, **declined** | a model-attention heatmap is not a teaching object |
| `atomVisualization: "balls"` | available, **declined** | a second visual language for the same fact |
| Canvas (bitmap) rendering | available, **declined** | SVG scales and stays inspectable; a bitmap does neither |
| Debug helpers | available, **declined** | developer output, not learner output |
| CIP / R,S descriptors | **not reachable** | computed internally and not exported — see below |

🔴 **THE ONE THAT HURTS IS R/S.** The library computes stereo priority internally to decide which
way a wedge points, but does not expose the resulting descriptor. So Nemesis can *draw* a
stereocentre correctly and cannot *say* whether it is R or S — which is the question chirality is
actually examined on. Naming a centre would need a cheminformatics layer (an order of magnitude
more weight) or a resolver call. **Not built, and not to be faked**: asking a language model to
label a stereocentre is precisely the plausible-and-unverifiable answer the ladder exists to refuse.

### 🔴 DARK MODE IS A REDRAW, NOT A RESTYLE

The library writes stroke and label colours into the SVG attributes rather than reading CSS
variables, so a theme toggle cannot repaint an existing drawing. `ChemicalStructure` therefore takes
the theme as an effect dependency and draws again. **Measured:** bonds render `#222222` in light and
`#ffffff` in dark, at identical coordinates — the geometry is untouched by the theme, which is what
makes redrawing safe. Without this, switching to dark left a molecule in near-black strokes on a
near-black ground: invisible, with nothing on screen to explain why.

Macromolecules are **built** (2026-08-23), on exactly the boundary this paragraph reserved for them
while they were not: a `macromolecule` representation carrying an accession, resolved by a provider
module shaped like `chem-resolver.ts` (`macromolecule-resolver.ts` — RCSB search plus the entry's
own title), drawn by an embedded viewer behind the same constrained interface
(`macromolecule-viewer.tsx`, Mol* — its own engine, loaded in its own chunk only when a structure
appears; the §41 planned stack of graphing and diagram renderers remains untouched and unadopted).
2D stays the default whenever it teaches the concept adequately — §41's 3D rule still holds: depth
must be part of what has to be understood, not a way to look sophisticated, and the prompt tells
the model to prefer `structure` for anything small enough to read flat. **Nothing is ever simulated
with an image model here** — that would put a plausible-looking wrong structure in front of a
learner, which is the whole reason the ladder exists.

## 🔴 PATHWAYS REUSED THE RELATIONSHIP RENDERER, AND NEEDED ONE THING

The general `relationship` renderer already draws a pathway: nodes, directed edges, edge labels.
Checked before extending it, and the one thing it could not say was **"less"** — every edge drew the
same arrowhead, so an inhibition could only be expressed by writing the word on the line, and a
learner scanning a mechanism reads shape long before they read labels.

So edges gained an optional `polarity` of `increases` / `decreases` / `plain`, drawn as an arrowhead
or a bar. That is the *entire* extension. What was deliberately NOT built is a pathway engine: there
is no `phosphorylates`, no `transcribes`, no domain vocabulary anywhere in the spec. Polarity is
general — a control loop damps, a subsidy suppresses demand, a precedent is distinguished — and
domain verbs belong in the free-text edge label that already existed.

## What is deliberately NOT built yet

- **The curated registry is empty.** `reference-images.ts` ships two providers — a live Wikimedia
  Commons search that reads the **per-file** licence out of each result's metadata, and a curated
  provider reading a checked-in registry. `REFERENCE_REGISTRY` has **no rows**, because a curated row
  is a claim about a real file's licence and author and must be verified against that file before it
  is written down. Seeding it from open textbook programmes and government image libraries is the
  next piece of work; inventing rows would be the fastest way to put an unlicensed picture on screen.
- **No Canvas caller passes `assets` yet.** `routeVisual()` accepts the candidate list and the
  teaching surfaces omit it, so rungs three and four are correct, tested, exercised by the Lab, and
  not yet reached from a lesson. Said plainly here rather than counted as coverage.
- **The licence allow list has no wildcard, and that is load-bearing.** `startsWith("CC BY")` would
  look reasonable and would silently admit `CC BY-NC`, which forbids the commercial use Nemesis is.
  Non-commercial and no-derivatives licences are absent, so they fall through to "no licence
  recorded" and the asset becomes unusable rather than unattributed.
- **No wiring to `nemesis-media`.** That function exists and generates images for Nemesis desktop
  under a per-plan daily budget. It is not connected to the Canvas, and connecting it means
  implementing the rung-four rules above, not merely calling it.

# 43. 🔴 WHEN THE SUBJECT IS AUDITORY — voice stops being an output channel (owner, 2026-08-18)

## STATUS: THE SPEECH ROUTER SHIPPED AND IS SERVING THE CANVAS LANE. THE LANGUAGE LANE IS NOW REACHED FROM A CONVERSATION — A REPLY MARKS A SENTENCE WITH `[say: locale | text]`, `speakExample` IS THE ONE CALLER THAT PASSES THE LANGUAGE PURPOSE, AND THE UTTERANCE GOES TO AZURE — BUT THERE IS STILL NO SESSION TYPE BEHIND IT. A LISTENING BENCH EXISTS IN NEMESIS LAB AND NO PROVIDER HAS BEEN MEASURED. PRONUNCIATION ASSESSMENT SHIPPED IN §47 AND NO LESSON CALLS IT YET. NO UTTERANCE HAS BEEN HEARD FROM THE LIVE AZURE SERVICE THROUGH THIS PATH — THE WIRE IS TESTED, THE SOUND IS NOT.

🔴 **THE LAST CLAUSE CHANGED ON 2026-08-19 AND THE OLD ONE IS RECORDED RATHER THAN ERASED.** This line read *"PRONUNCIATION ASSESSMENT DOES NOT EXIST"* from the day §43 was written until Azure was integrated. It moved because a guard in `visualization-roadmap.test.ts` went red the moment the provider landed — which is the entire mechanism, working exactly once as designed. What has NOT changed: no Canvas lesson enters the language lane, every caller still passes `purpose: "canvas"`, and no provider has won a listening test.

Everywhere else in this product, speech is a **second channel for text the learner could have
read**. `canvas-speech.ts` argues that case and is right: it reads the question and the correction,
refuses explanations, and stays out of the way so the learner's eyes stay on the material (§19,
§41). Reading is faster, skimmable and learner-paced.

**When the subject is a language, the sound is the subject.** Pronunciation, stress, rhythm,
intonation, vowel quality, minimal pairs, listening comprehension and conversational pacing do not
survive text at all. A language lesson delivered silently has not taught most of what it claimed to.
So in that one lane, and only that one, voice moves from an optional output to part of the learning
substrate — and nearly every rule §41 and `canvas-speech.ts` established inverts.

## 🔴 THE LOCALE IS THE DECISION, AND `auto` IS NOT ONE

Before this section every utterance went to the provider as `language: "auto"` — the client sent no
locale at all. For a question read aloud in the learner's own language that is right: the provider
identifies the language from the text and nothing depends on which variety it picks.

For a language lesson it is the whole ballgame. **`es-MX` and `es-ES` differ in exactly the features
being taught**, as do `pt-BR` and `pt-PT`, and `auto` on a Spanish sentence returns *some* Spanish,
chosen by a provider that was not told which one the learner is studying.

So `routeSpeech()` in `apps/web/lib/learn/speech-route.ts` **refuses to speak a target-language
utterance without an explicit locale** (`locale-unknown`) rather than falling back. Falling back
would produce fluent, confident audio in the wrong variety, and neither the learner nor a log could
tell it had happened. **Silence is diagnosable; the wrong accent is not.**

🔴 **AND THE LOCALE BELONGS TO THE MOMENT, NOT THE SESSION.** A Spanish lesson speaks its example in
`es-MX` and the correction that follows it in the language of instruction, seconds apart. A
session-level locale would read *"Almost — the stress falls on the last syllable"* in a Mexican
accent, which is not a teaching decision anybody made.

## The rules that invert

| | Canvas lane | Language lane |
|---|---|---|
| What speech is | an alternative to reading | the material itself |
| Locale | `auto` is fine | required, or nothing is spoken |
| Pace | 0.95 — a question must be held in working memory | 1.0 — natural |
| Unspeakable text | letter-ratio heuristic | explicit mathematical markup only |

🔴 **THE PACE ROW IS A TEACHING CLAIM, NOT A SETTING.** Slowing a target-language utterance teaches
a rhythm the language does not have: connected speech, elision and stress timing are precisely what
disappears when speech is slowed, and precisely what the learner must be able to hear later. A
learner drilled at 0.95 has been trained on a dialect nobody speaks.

🔴 **THE LAST ROW WAS A REAL DEFECT, FOUND BY WRITING THIS SECTION.** `isMostlyNotation()` refuses
anything under roughly two-thirds letters, which is a good heuristic for teaching prose and rejects
exactly the utterances a language lesson is made of. `¿Sí?` is two letters in four characters.
A Japanese line framed in 「」 fails the same way. **The shortest, most useful pronunciation drills
were the ones the rule rejected**, so the target-language lane uses `hasNotationMarkup()` — explicit
LaTeX and maths delimiters — which is decisive in any language.

## 🔴 TTS IS AN INTERCHANGEABLE OUTPUT SERVICE, NEVER PART OF COGNITION

The owner's framing, and the architecture follows it: every decision carries a `provider`, and the
locale→provider table is **data**.

What is deliberately absent is a union of vendor names with no integration behind any of them. One
provider is integrated (xAI, on the key the transcription lane already uses, at a TTS rate the cost
comment records); listing four more would read as a working multi-provider router to the next person
and this repo has been burned by exactly that gap before.

🔴 **AND EVERY ROW SAYS HOW IT WAS CHOSEN.** `ProviderEvidence` is `measured` or
`unmeasured-default`, and today **every locale is `unmeasured-default`**. The owner is explicit that
published language counts are not quality per locale: *"there is no reason to assume the provider
that wins Japanese also wins Mexican Spanish."* A table populated from vendors' own coverage claims
would be indistinguishable at a glance from one populated by listening, so the field exists to keep
them distinguishable. Filling it requires a **bake-off inside Nemesis Lab**: same sentence, several
providers, native speakers rating accent, pronunciation, prosody, naturalness, pacing,
code-switching, numbers and names, latency and cost — **per locale**, because the winner is a
per-locale fact.

### 🔴 THE BENCH IS BUILT — `/dev-preview/tts-lab`

One locale, one phrase, every provider that has a key on the machine, side by side with playback,
measured latency, character count, and five rating axes. Four providers are in the catalogue and one
is integrated in production; a provider with no key is shown as **unavailable rather than hidden**,
so the bench never looks complete when it is not.

Three rules make it a measurement rather than an endorsement:

- **A locale is required and `auto` is refused.** Comparing four providers on `auto` compares four
  guesses at which Spanish to speak, which is the exact confound the locale contract removes.
- **All five axes or the rating does not count.** A half-filled card averaged over the axes somebody
  bothered with ranks a provider on whatever its listener cared about that afternoon.
- **One rated provider is never a winner.** `winnerFor()` refuses `only-one-provider-rated` and
  refuses a tie. A field of one scoring 4/5 says nothing about whether another would score 5, and
  declaring it the winner is how a default gets laundered into a measurement.

Ratings persist to a gitignored file on the machine that did the listening. **The bench does not edit
`speech-route.ts`** — it prints the exact line to add, and a human commits it. A lab surface that
could silently change which provider production speaks through would make the difference between
`measured` and `unmeasured-default` unauditable.

🔴 **THE COST COLUMN IS `unverified` FOR EVERY PROVIDER, INCLUDING THE ONE WE PAY.** The two figures
this repository holds for xAI TTS disagree — `nemesis-speak` bills $4.20 per million characters
citing the vendor's announcement, and the brief that asked for this work cites $15 from the same
vendor's docs. Both cannot be current, and the rate the FUNCTION bills is the one that reaches an
invoice. A cost column filled with plausible numbers is how a bake-off ends up recommending the
cheapest provider nobody priced.

## 🔴 THE MISSING HALF — speech recognition is not pronunciation assessment

Nemesis has strong speech **input** (§14, `docs/voice-state.md`): the learner answers out loud, the
judge is told to forgive false starts, and the modality is kept in the durable record.

That answers *"what words did the learner probably say?"* It does not answer **"did they say them
like a native speaker?"** — and for language teaching that second question is most of the subject.
Phoneme-level accuracy, fluency and prosody scoring is a **different cognitive operation** from
dictated recall, and Nemesis cannot perform it today with anything it has.

### The boundary exists; nothing sits behind it

`lib/learn/pronunciation-evidence.ts` defines the shape — what the learner said, per-word and
per-phoneme accuracy, prosody and fluency where a provider offers them, and the locale assessed
against. `assessPronunciation()` returns the same named refusal every time (`no-provider`), and it is
**called rather than commented out**, so a surface asking for pronunciation evidence gets an honest
"not built" instead of an empty object it would mistake for a perfect score. Every score field is
optional because providers genuinely differ in what they return, and a required `prosody` would force
whichever vendor is chosen to be fabricated into compliance.

The loop the language lane needs:

```text
Nemesis speaks a native example
        ↓
learner listens, then repeats or responds
        ↓
STT: what did they say?          pronunciation assessment: how did they say it?
        ↓
Nemesis diagnoses the specific phoneme, stress or contour
        ↓
targeted correction → try again / continue the conversation
```

Only the first, second and third-left boxes exist. **The third-right box has no provider, no
integration and no evidence schema**, and until it does, Nemesis can teach vocabulary and grammar in
a language but must not claim to teach pronunciation. Stated here so nobody reads the shipped voice
lane as covering it.

## What is deliberately NOT built yet

- **No language-learning session type.** `routeSpeech()` takes a `purpose` and every caller passes
  `canvas`. The rules, the locale contract and the refusals are correct and tested; nothing in
  production reaches the language lane. Said plainly rather than counted as coverage.
- **No provider has been measured.** The bench exists; nobody has listened. `MEASURED_PROVIDERS` is
  empty and every locale reports `unmeasured-default`.
- **The bake-off adapters are dev-only and unexercised.** Four adapters are written from each
  vendor's documented request shape and **none has been run against the live service from this
  repository**, which is why a provider failure is reported as a per-provider row rather than failing
  the request: the first real run is itself the test of those four shapes.
- **No pronunciation-assessment provider.** See above.
- **The voice identity is still fixed.** `nemesis-speak` sends one `voice_id` for every utterance in
  every language. A locale now travels with the request and the pace does too, but *which speaker* is
  heard does not vary — and for a language lesson the speaker is part of the material, not a skin.
  Naming this here so the locale work is not mistaken for having finished the job.
- The canvas lane's request body is **byte-identical to what shipped before this section** when no
  locale is passed, which is what makes the seam safe to add now.

## 🔴 PRIORITY

This sits inside §41's ordering, not beside it. A language lane with excellent audio attached to a
policy that asks the wrong question next is worth less than the core loop being right. Build the
locale contract and refusals first — they are cheap and they prevent a silent wrong-accent failure —
and treat the bake-off and pronunciation assessment as work that follows a real language-learning
session type, not work that precedes it.

# 44. 🔴 FIVE SHAPES, SEVEN SUBJECTS — and the arithmetic is checked before it is drawn (owner, 2026-08-19)

## STATUS: ALL FIVE REPRESENTATIONS SHIPPED, ROUTED AND OFFERED TO THE TEACHING PROMPT, WITH EVERY NUMERIC CLAIM VERIFIED. NOTHING EXECUTES CODE.

🔴 **"NO CANVAS LESSON EMITS ONE YET" WAS TRUE FOR THE FIRST DAY OF THIS SECTION'S LIFE AND IS RECORDED RATHER THAN ERASED.** Every renderer here was built, routed, verified and tested while the teaching prompt offered the model three shapes out of nine — so no lesson could produce one, and a capability nobody is told about is indistinguishable from one that was never built. The vocabulary in `canvas-prompts.ts` now names all nine. A guard in `visualization-roadmap.test.ts` went red the moment it did, which is why this line moved in the same commit, and a second guard now holds the offered vocabulary and the accepted vocabulary to being the same set in both directions.

The owner asked for computer science, accounting, history, statistics, geometry,
physics/engineering and finance. **That is seven subjects and five representations.**

| Subject | Representation | Shared with |
|---|---|---|
| Accounting | `table` | finance, statistics |
| Finance | `table` + `timeline` | accounting, history |
| Statistics | `table` + `quantitative` (already shipped) | accounting |
| History | `timeline`; causation already had `relationship` | finance |
| Geometry | `construction` | physics |
| Physics / engineering | `vectors` | geometry |
| Computer science | `code` | nothing |

🔴 **BUILDING "ACCOUNTING MODE" WOULD HAVE BUILT THE TABLE THREE TIMES** — once for accounting, once
for finance, once for statistics — and taught the Canvas three subjects it must not know. §41's rule
holds: the router chooses on the SHAPE of the knowledge, never on the discipline. There is no
`accounting` and no `physics` in the representation vocabulary and there must never be.

## 🔴 THE RULE THIS SECTION ADDS — an unverified computed answer may not be an answer key

§42 forbids grading a learner against a picture Nemesis cannot vouch for: a generated image has no
standing as evidence because its detail was invented. **A worked total, a stated angle and a claimed
equilibrium are the same thing in numbers.** The model asserted them; until something recomputes
them they are exactly as trustworthy as a generated diagram.

So `visual-verification.ts` recomputes every numeric claim **before the spec is admitted**:

| Claim | Checked by |
|---|---|
| A column's stated total | summing the column |
| Two columns that must balance | summing both sides |
| An angle labelled on a figure | measuring it from the supplied coordinates |
| Forces claimed to cancel | resolving them |

🔴 **A MISMATCH REFUSES; IT NEVER SILENTLY CORRECTS.** Substituting the right total would hide a
model producing bad arithmetic — the same argument `visual-route.ts` already makes for refusing a
malformed visual rather than replacing it. `failed-verification` is its own refusal reason precisely
so a REASONING failure is countable and does not read as a formatting one.

🔴 **AND IT IS ONE MODULE, NOT FOUR.** A T-account that must balance, a triangle whose angle at A is
claimed to be 30°, and a free-body diagram claimed to be in equilibrium are the same operation: the
model stated a number, the structure implies a number, and they must agree. Four implementations of
"close enough" would drift, and the one that drifts is always the one nobody is looking at.

Money and geometry get **different tolerances**, and that is a domain fact rather than a preference:
a trial balance out by half a cent is out, and an angle refused for half a degree would refuse every
correct figure a model can actually place.

## 🔴 GEOMETRY NEEDS NO SOLVER TO BE HONEST

Constructing *"a triangle with a 30° angle at A"* from a description is a hard problem. **Checking
that supplied points really do form 30° at A is arithmetic.** So the model places the points and
trusted code marks them, and a figure whose label disagrees with its own coordinates is refused
rather than drawn — which is the failure that would otherwise teach a wrong number with a picture
backing it up.

Interaction is deliberately absent. Dragging a point is §41 priority five and this work sits below
that line; a static, correct figure teaches most of school geometry.

## 🔴 TIME IS A NUMBER PLUS A LABEL

`at` places an event and `atLabel` is what a human reads. So BCE is a negative number, deep time is
millions, a reaction is seconds, and an uncertain date is a number with a flag drawn faint.

**No date parser, calendar table or era convention exists anywhere in this codebase to be wrong
about any of them.** Parsing "44 BC" is where naive timelines break, and history is full of it.

## 🔴 THE CODE TRACE IS NARRATED AND SAYS SO ON SCREEN

Nothing in this repository executes learner or model code. A trace is therefore the model's account
of what *would* happen, and it may be wrong in exactly the way an invented diagram is wrong.

- `traceOrigin` is **stamped by the validator, never accepted from the request** — a model cannot
  tell the Canvas that its narration was an execution. Measured: a request claiming
  `traceOrigin: "executed"` is stored as `narrated`.
- The rendered block carries the line *"Walkthrough written by Nemesis, not produced by running the
  code"*, and that line is not decoration.
- A trace step naming a line the snippet does not have is **refused**, because it means the trace and
  the code have drifted apart — the model narrated a different program — and highlighting nothing
  would hide that completely.

Executing code for real is a **security commitment**, not a feature flag. It would be a new
`traceOrigin` value and a security review, never a quiet change of meaning.

## What is deliberately NOT built

- **No Canvas lesson emits any of these yet.** All five validate, route, verify and render, and the
  teaching prompts do not produce them. Said plainly rather than counted as coverage, exactly as §42
  says of its lower rungs.
- **No execution.** See above.
- **No interaction** on constructions, and no circuit schematics or ray diagrams — both are separate
  primitives with their own layout problems that share nothing with `vectors`.
- **Statistics gets tables and plots and no simulation.** Distributions are drawable today; sampling
  and resampling are not.

## 🔴 PRIORITY — this sits where §41 put it

The owner deferred language voice work only because it needs API keys, and deferred music, geography
and spectroscopy outright. This section is the middle of that ordering, and it does not outrank §41's
list: the core learning algorithm and Canvas session quality still come first. A perfect free-body
diagram attached to a policy that asks the wrong question next is worth less than plain text attached
to the right one.

# 45. 🔴 THE MODEL MAY WRITE A CALCULATION, NEVER A DRAWING (owner, 2026-08-19)

## STATUS: EXPRESSIONS AND DISTRIBUTIONS ARE REACHABLE FROM A LESSON AND A REPLY. SEEDED SIMULATION IS NOT. NOTHING MODEL-WRITTEN REACHES THE DOM.

🔴 **The wiring, 2026-08-21, and why it took a route.** This layer sat finished and unreachable for
two days — the status line above used to read *"no lesson emits one yet"*, and `grep -r
computed-series` returned a dev gallery and a test. The plot renderer even carried a comment about
colouring a curve split by a pole, for curves nothing could produce. What was missing was never
maths: it was a CHANNEL, somewhere for the model to write `x^2` instead of a hundred and sixty
coordinate pairs, and a model that had been told it may.

The canvas talks to the model from the **browser**, so there was no server already in that path to
hang the arithmetic on, and a lazy `import()` would still have shipped a maths parser to a page whose
only job is to draw a polyline. So `app/api/learn/plot/route.ts` does the evaluating, `plot-compute.ts`
rewrites the model's JSON before the synchronous parsers ever see it, and `computed-plot.ts` decides
what goes where. One round trip, taken only when an answer actually contains a formula — the check is
a substring test that runs before any parse.

🔴 **A plot that cannot be computed costs the picture, never the explanation.** `sqrt(x)` from −10 to
−1 is a real formula asked over the wrong range. The series is dropped, a plot left with nothing
loses its visual entirely rather than drawing empty axes — which read to a learner as a broken app —
and the prose the model wrote around it survives untouched.

🔴 **Simulation is still unreached, and this says so rather than counting it.** `sampledHistogram`
and seeded sampling are built and tested; nothing emits one. A histogram wants bars, and the plot
renderer draws polylines, so reaching it is a renderer question rather than a wiring one.

The owner asked whether Nemesis could *"just code them as needed"*. This section is the answer, and
it draws one line:

> **Model-written computation is safe. Model-written rendering is not.**

A calculation returns **numbers**, and trusted code can check them, bound them, draw them, occlude
them and mark a learner against them. Generated markup returns **pixels**, and nothing downstream
can do any of those things. §41's rule — *"must not generate arbitrary Three.js, D3 or React
visualization code"* — is unchanged and unsoftened. What §45 adds is the other half: a model may
write the maths.

## What this buys

| The model writes | Trusted code does | The learner sees |
|---|---|---|
| `x^2` over −3…3 | evaluates it at 160 points | a parabola, on the existing plot renderer |
| `normal, mean 100, sd 15` | computes the density curve | a bell curve |
| `sample 500, seed 42` | draws them, bins them | a histogram that is the same tomorrow |
| `(x+1)^2` vs `x^2+2x+1` | evaluates both at 97 points | a refusal, if they ever disagree |

🔴 **AND NO NEW VISUAL KIND WAS ADDED.** A function plot IS a quantitative plot whose points were
computed rather than listed. A `function` representation would have meant a second plot renderer, a
second set of axis rules, and two places for a chart to disagree with itself.

## 🔴 THE DEFENCE IS AN AST ALLOW LIST, AND THAT WAS MEASURED RATHER THAN ASSUMED

The obvious way to run a model's expression safely is to evaluate it with a scope containing exactly
the functions we permit. **That is not enough, and there is a probe that proves it.** With a
constrained scope:

- `import("x")` fails — it resolves through the scope and is undefined. ✅
- `createUnit("z")` fails — same. ✅
- **`config({})` RUNS**, and returns the parser's entire configuration, because it lives on the
  parser instance rather than in the scope. ❌

So `expression.ts` walks the parsed tree and refuses **every node type and every function name** not
on its list. Five node types are permitted — constant, symbol, operator, parenthesis, function call.
Everything else mathjs can parse is a capability rather than a gap: `FunctionAssignmentNode` defines
functions, `AccessorNode` and `IndexNode` reach into objects, `AssignmentNode` mutates scope,
`BlockNode` sequences statements. None appears in `x^2 + 3sin(x)`, and each is a step away from an
expression and towards a program.

The constrained scope stays underneath as the floor. Node count and character count are bounded,
because a short string can carry a deep tree that is then evaluated four hundred times.

## 🔴 A SIMULATION THAT CHANGES EACH TIME IS NOT A TEACHING OBJECT

Every other representation on this Canvas is deterministic: the same equation draws the same
picture, the same SMILES draws the same molecule, and a learner returning tomorrow sees what they saw
before. Sampling would break that.

So **the seed is a required argument** — no default, no fallback to the clock. `Math.random` is never
called anywhere in `statistics.ts`, and there is a test that replaces it with a throwing stub to
prove it. Two learners on one question see the same five hundred points, and the seed travels back
out with them so the record can say which simulation was shown.

## 🔴 TWO DEFECTS FOUND BY BUILDING THIS, BOTH THE KIND THAT LOOK FINE

**A pole is not a hole.** `1/x` sampled across zero never lands *on* zero — with 160 points from −5
to 5 the nearest sample sits at ±0.03 — so nothing is undefined, the curve came back as one
continuous run, and the renderer drew a line from −31.8 straight up to +31.8 through the origin. A
picture of a function that is continuous at exactly the place the lesson is about. Curves are now
split where adjacent points **flip sign while both are large**, which catches a pole and leaves an
ordinary zero crossing alone. It cannot catch a pole that does not flip sign (`1/x²`), which draws a
spike up and back down — the right shape, and recorded here as a known limit.

**A parser-only mathjs instance cannot compile arithmetic.** Operators do not compile to JavaScript
maths; `a / b` compiles to a call into the instance's namespace, so `sin(pi/2)` parsed happily and
then failed with *"Function divide missing in provided namespace"*. The eight arithmetic
dependencies are now imported by name, which keeps the instance small and keeps `createUnit` off it.

## 🔴 THE ALGEBRA CHECK IS SAMPLED, NOT PROVED, AND SAYS SO

`verifyEquivalence` evaluates two expressions at 97 points and reports whether they ever disagree.
That catches every ordinary teaching error — a dropped term, a sign, a mis-expanded bracket — and it
**cannot certify an identity**. The asymmetry is the right way round: a disagreement is real and
trustworthy, a pass is evidence. The check exists to stop wrong algebra reaching a learner, not to
award marks.

Two details that make it usable rather than annoying: sample points are offset by an irrational
amount so they avoid the round numbers where a wrong formula accidentally agrees, and points where
either side is undefined are skipped — `x/x` and `1` agree everywhere both exist, and refusing that
would refuse a correct simplification. A disagreement is reported **with the point that found it**,
because "these are not equivalent" is an assertion and "at x = 2 one gives 9 and the other 7" is a
lesson.

## Libraries, and how few there are

Two libraries do arithmetic Nemesis does not do itself:

- **mathjs** (Apache-2.0) — the expression parser only. Not its evaluator, not its matrices, not its
  units.
- **simple-statistics** (ISC) — mean, deviation, quantiles, regression. The functions where a subtle
  mistake is easy and hard to spot.

The distributions are implemented here, in four lines each, because the shape drawn on screen and the
numbers checked against it should come from one place rather than from two libraries' conventions.
The binomial is computed **in logs**: `choose(1000, 500)` overflows a double long before the
probability does, so the naive factorial form returns Infinity for exactly the interesting cases.
There is a test that sums a 1000-trial binomial to one.

## The plot bound moved, and why for everyone

Series were capped at 40 points, which was right for data a model lists by hand — past that it is a
runaway. A computed curve is generated by trusted code and forty points across a sine wave draws a
visible polygon. The bound is now 400 per series and 1200 per plot, **raised for everyone rather
than made conditional**: a validator cannot tell a computed series from a claimed one, and the risk
of a large point count is payload size, which the bound handles, not correctness.

## What is deliberately NOT built

- **No lesson emits a computed curve yet.** The resolvers, the checks and the bounds all work; the
  teaching prompts do not ask for them.
- **No symbolic algebra.** Nothing here solves, differentiates or simplifies. `verifyEquivalence`
  compares by sampling and says so.
- **No interaction** — no dragging a tangent point, no slider that redraws. §41 priority five.
- **The expression layer never reaches the browser.** It is used where a lesson is built; the
  renderers only ever receive points.

# 46. 🔴 WHERE THINGS GO IS ARITHMETIC, AND ARITHMETIC BELONGS SOMEWHERE A TEST CAN REACH IT (owner, 2026-08-19)

## STATUS: LAYOUT LIFTED OUT OF THE RENDERERS INTO `visual-layout.ts`, WITH THE THREE SHIPPED DEFECTS NOW ASSERTED AGAINST.

Three layout defects shipped in §44 and §42's renderers. **Every test passed. Every number was
right.** They were found by generating a sheet of every visual Nemesis can draw and looking at it.

| What was wrong | What a learner saw |
|---|---|
| The relationship diagram put every node in one centred column | An inhibitor acting on the third step of a cascade was drawn *in* the chain, so it read as a step of it |
| The timeline had no collision avoidance | Two events four years apart on a three-century scale printed one label on top of the other |
| A vertex label, a side label and an angle mark all had fixed offsets | On a right angle at the origin, all three landed in the same square centimetre |

🔴 **THE COMMON CAUSE IS WHERE THE ARITHMETIC LIVED, NOT WHAT IT SAID.** Each position was computed
inline inside a React component. A component needs a DOM to run, a DOM needs a browser, and a browser
needs a screenshot somebody re-examines — so "do these two labels overlap?" was not a question the
test suite could ask. It was a question only a person looking at a picture could ask, and nobody was
looking.

## The rule

**Position is computed in `visual-layout.ts` and only drawn in the components.** Every function there
is pure: a verified visual in, coordinates out. No DOM, no measurement, no state. The renderers place
what they are handed and decide nothing.

That turns each defect into an assertion — *no two boxes on a row overlap; no two labels on a tier
overlap; no leader line crosses a label; the angle mark and the vertex label go opposite ways* — and
those assertions run in the ordinary suite, in milliseconds, with no browser.

## What the fixes actually do

- **Rows are ranked from the END of the graph, not the start.** Ranking by distance from a source
  puts an inhibitor level with a ligand it has nothing to do with; ranking by distance to a SINK puts
  every node one row above what it feeds, so a branch lands beside the step it competes with. This is
  also what stops most long edges existing at all; the few that remain are bowed clear of the boxes
  they would otherwise cross.
- **Edges into one node get separate doorways.** Fixing the column exposed a second defect
  underneath it: both arrows now arrived at the exact centre of the shared target, so the blunt bar
  meaning "blocks" was drawn *underneath* the arrowhead meaning "drives" — losing the one distinction
  §42 added the polarity for.
- **A timeline label that will not fit beside its neighbour is lifted a tier**, with a leader line
  back to its marker, and the lane grows to hold it. Not shrunk — no font size fits "31 BCE
  (uncertain)" into four pixels — and not dropped, because a dropped event is a missing fact.
  **Tiers are assigned right to left**, because the thing a label collides with is the leader of an
  event to its *right*, and going left to right decides where a label goes before knowing whether a
  line is about to be ruled across it.
- **Every construction label is pushed away from the middle of the figure**, and the angle mark goes
  *inward* along its own bisector — into the space the vertex label has just left. A right angle gets
  the conventional square rather than an arc, because that is the one angle a reader is expected to
  recognise without reading the number.

## 🔴 TEXT WIDTH IS ESTIMATED AND THE ESTIMATE LEANS GENEROUS

These functions run on the server, where there is no font metrics engine, and they must give the same
answer the browser will — so width is `characters × fontSize × 0.55`, deliberately above the real
average for mixed-case text. Under-estimating puts two labels back on top of each other, which is the
defect this whole section exists about. Over-estimating spreads them slightly further apart than they
strictly need to be. Only one of those is a bug.

## What is deliberately NOT built

- **No general graph layout.** No force simulation, no crossing minimisation, no orthogonal routing.
  A relationship diagram is 2–8 nodes by contract; anything more elaborate is a graphics library, and
  §41 says this is a router.
- **No text measurement.** Nothing calls `getComputedTextLength`, and nothing may — a layout that
  differs between server and browser moves the picture after the learner has seen it.
- **Still no interaction.** Dragging a point remains §41 priority five.

# 47. 🔴 AZURE EARNS TWO CAPABILITIES, NOT THE SPEECH STACK (owner, 2026-08-19)

## STATUS: PROVIDER LAYER, MULTILINGUAL TTS AND PRONUNCIATION ASSESSMENT SHIPPED AND TESTED. NO CANVAS LESSON EMITS A DRILL YET. NO LEARNER AUDIO IS STORED.

The owner supplied an Azure Speech resource and asked for two things: a large multilingual voice
catalogue, and pronunciation assessment. They also asked, twice and in their own words, for the
things NOT to do: *"Do not unnecessarily replace the current speech stack"* and *"Avoid scattering
Azure-specific code throughout the app."*

## 🔴 THE UNIT IS A CAPABILITY, NOT A VENDOR

"We use Azure" is not a fact anybody can act on. Azure serves two of Nemesis's three speech
capabilities and not the third; xAI serves two and not the others; the browser serves the one nobody
pays for. `lib/speech/capabilities.ts` is a table of *capability × provider*, and it is the only file
a provider swap touches.

| Capability | Serving | Standby | Why |
|---|---|---|---|
| TTS — Canvas | xAI | Azure | Works, paid for, no new secret, no locale decision to make |
| TTS — target language | **Azure** | xAI | The variety IS the material, and only Azure publishes a catalogue to name it from |
| Pronunciation | **Azure** | — | The only integrated engine that scores HOW rather than WHAT |
| Transcription | browser / xAI / AssemblyAI | — | Unchanged |

🔴 **`serving` IS MEASURED FROM THE ENVIRONMENT, NEVER ASSERTED.** A row saying "Azure serves
pronunciation" in a deployment with no Azure key is a lie the code tells itself. `capabilityReport`
takes a map of which credentials exist and stamps `unconfigured` on the rows that cannot run. This
repo has already shipped one table that described intent and read as description — §41's eleven
knowledge kinds against one lane — and a capability registry is the same trap in different clothes.

## 🔴 WHY THE CANVAS LANE DID NOT MOVE

`nemesis-speak` reads a question aloud, bills at a rate it logs per utterance, and reads a key from
secrets that already exist. Replacing it would be a migration with no beneficiary.

What it cannot do is name a variety. It takes `auto` or a bare language, picks a voice nobody chose,
and offers no catalogue. §43 refuses to guess across exactly that gap. **Two providers, two jobs.**

## 🔴 THE VOICE FOR A LOCALE IS DETERMINISTIC, AND THAT IS A TEACHING REQUIREMENT

A learner drilling one sentence hears the target four times. If the voice changes between attempts
they are comparing their production against a moving target, and any progress they hear might be the
voice. `selectVoice` sorts neural first, generally-available before preview, then alphabetically —
the last being a tie-break that cannot drift rather than a quality judgement.

A region with no voice **refuses**; `es-ES` is not silently served for `es-MX`. Fallback is opt-in
and the response says `match: "region-fallback"` so a surface can be honest about it.

## 🔴 AN OMITTED WORD HAS NO SCORE, NEVER A ZERO

Azure reports a skipped word with an error type and no accuracy at all. The obvious normalisation —
default the missing number to zero — makes *"did not say it"* and *"said it terribly"* the same
value. Every layer downstream then treats them identically: the diagnosis names a vowel in a word
nobody said, and the progress comparison reports an enormous improvement the moment the learner says
it at all. This is the single most load-bearing line in the transform.

The same rule holds one level up: below 50% completeness, `diagnose` returns `off-target` and names
no sounds. A learner who said a different sentence has no pronunciation problem to diagnose.

## 🔴 THE FIELD THE WHOLE INTEGRATION IS FOR

`NBestPhonemes` → `likelyProduced`. *"Your /r/ scored 0.3"* tells a learner they were wrong, which
they suspected. *"You produced something closer to /ɾ/"* tells them what they did, which is the only
half they could not work out for themselves. A score is a grade; this is a lesson.

## 🔴 NOTHING IN THE DIAGNOSIS KNOWS ANY LANGUAGE

No list of hard sounds, no Spanish rolled-R rule, no English th-fronting rule. Every judgement is
structural — which unit scored lowest, what the assessor said was produced instead, where in the word
it sits. The standing CLAUDE.md rule applies unchanged: a heuristic that only made sense for Spanish
would be silently wrong on Japanese, and this product serves both.

## 🔴 THE KEY IS READ IN ONE FILE, AND A TEST ENFORCES IT

Next.js will not inline a non-`NEXT_PUBLIC_` variable into a client bundle, so importing the config
module from a component yields an EMPTY key — safe, and completely silent. The next person debugging
"why is Azure not working in the browser" fixes it the obvious way, by renaming the variable, and
ships a Speech credential to every visitor. No review catches a one-word rename in an env file.

So `lib/speech/secrets.test.ts` reads the source and fails on: a second reader of `AZURE_SPEECH_KEY`,
any `NEXT_PUBLIC_AZURE` reference in shipped code, any `"use client"` file importing
`lib/speech/azure/`, an unauthenticated route, or anything shaped like a committed key. The config
module also throws outright if evaluated in a browser.

**The region is validated before it becomes a hostname.** Every Azure endpoint is
`https://{region}.something.microsoft.com`, so an unchecked region is a configuration string deciding
where Nemesis sends a bearer credential.

## 🔴 NO LEARNER AUDIO IS STORED, AND THAT IS A DECISION RATHER THAN AN OMISSION

`use-pronunciation-attempt` records one attempt, posts it, and releases it. Nothing writes it to
storage and nothing puts it in `learner_evidence`. A recording of a person's voice is not the same
object as a transcript of what they said, and retaining one is a privacy decision the owner has not
been asked to make. The previous attempt's *numbers* are held in the component so the retry can be
compared; they die with the screen.

## 🔴 THE LIVE HARNESS CHECKS THE TWO HALVES AGAINST EACH OTHER

`npm run azure-speech` synthesises a sentence with Azure and then asks Azure to score that audio
against the same sentence. A native-quality reading must come back near the top of the scale. If the
SSML, the audio format, the assessment header or the normalisation is wrong, that number collapses —
and **no fixture-driven test can produce it**. With no credential every check reports `SKIP` and the
script exits 0, because this runs in environments that deliberately have no Azure key and a red build
there teaches people to ignore it.

## What is deliberately NOT built

- **No Canvas lesson emits a pronunciation drill yet.** The capture hook, the routes, the assessment,
  the diagnosis and the retry comparison all work and are tested; no teaching prompt asks for one.
- **No new language-learning UI.** The owner was explicit: build the backend and the data layer, and
  do not invent an interface. What exists is a hook a surface can call.
- **No streaming recognition.** `/api/speech/token` exists for the day the browser SDK is wanted;
  nothing calls it yet.
- **No attempt history.** A drill is a handful of tries inside one screen. When attempts need to
  outlive it they belong in `learner_evidence` with everything else, which is a schema change
  somebody makes on purpose.
- **No bake-off winners.** `MEASURED_PROVIDERS` is still empty. Azure serving the language lane is an
  argument about capability, not a claim that it sounds best — §43's rule that vendor coverage is not
  quality evidence is untouched.
