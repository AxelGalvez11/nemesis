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

## R4 — Six kinds of knowledge, of which the system mints one

§6 names **conceptual · associative/factual · procedural · relational/causal ·
discriminative · spatial/structural**. Measured on the live system: `objectivesForKnowledge`
mints objectives for `association` only, with `capability` hardcoded to `recall`. **Five of
the six categories currently produce nothing at all.** That is the true size of the gap.

## R5 — Minimap vocabulary supersedes

Use **unestablished · developing · established · needs revisit**. `needs revisit` is new and
carries §18's return triggers. It replaces the earlier demonstrated/uncertain/current/
unexplored wording.

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
