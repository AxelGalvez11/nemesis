# Canvas UX brief — owner spec, 2026-08-13

🔴 **SUPERSEDED IN PART. Read [`canvas-product-contract.md`](./canvas-product-contract.md)
FIRST** — the owner issued a 30-section product contract later the same day. That document
is the north star; this one remains in force as the implementation detail and today's live
measurements. **Where they differ, the contract wins.**

**Three things in here are now stale — the contract's RECONCILIATION section has the
detail:** the `✓` ruling in §37 is **reversed** (a small *"Done reading"* control in the
composer DOES exist) · multiple choice is **permitted** as weak evidence for rapid
localization · §29's Minimap vocabulary is replaced by
`unestablished / developing / established / needs revisit`.

**Authored by the owner. This is the contract.** Where it disagrees with
`canvas-interaction-model.md` or `canvas-v1-acceptance.md`, **this wins** and those
documents are amended to match.

**The product invariant:**

> Canvas should never assume the learner needs to be told everything in the source
> before they can engage with it. Nemesis should first determine what the learner
> already knows, then expose only what is useful for advancing their understanding.

```
INTENDED   source → infer → diagnose → expose → retrieve → evaluate → adapt
CURRENT    source → summarize → scroll → quiz          ← this is the thing to kill
```

---

## 1. Remove the current intermediate states

Delete these screens from the normal flow:

- the large centered **"What do you want to learn?"** screen
- the separate upload / drop-zone interface
- the **"1 source attached → Help me learn this"** holding screen
- the behaviour where Nemesis opens with **"What this document covers"** and a long
  summary of the material

The user must not go: upload → wait → inspect source → press "Help me learn this" → get summary.

## 2. The composer is the entry point

The Canvas entry point behaves like the ChatGPT composer. From it the user can type a
topic, dictate, attach a PDF / PowerPoint / Word / spreadsheet / image / multiple files,
eventually attach links, and start a recording.

An attached file appears as an attachment chip **in or immediately above** the composer:

```
[ Diabetes lecture.pdf ]
Focus on the mechanisms and make sure I actually understand them.
+                                                          mic  ↑
```

Attaching a source must **not** auto-launch a workflow. **Send** is what creates and
enters the Canvas session.

## 3. Uploading without a prompt must work

Attach + send with no text means *"learn this material with me."* Infer it. **Remove the
"Help me learn this" button.**

## 4. Enter the Canvas immediately after send

No further onboarding screen. The persistent composer is already docked at the bottom.

## 5. A polished processing state

While uploading, parsing, extracting, analysing structure, identifying concepts,
resolving figures, building source context, deriving objectives and selecting the first
diagnostic — show a **thinking preview**, not those operations.

Visual: lightweight skeleton content lines with a soft pulse travelling **left to right**.

Required: subtle · smooth · low-contrast · **no** large grey upload box · **no** centred
spinner on an empty screen · **no** progress bar without real progress · **no** fake
percentage · **no** large loading headline · native to the Canvas · honours
`prefers-reduced-motion`.

Short, understated, ephemeral labels are allowed — *Reading the material* / *Mapping the
concepts* / *Preparing your first question*. The animation carries the state, not the text.

## 6. Diagnosis comes before teaching — the most important requirement

After parsing, **do not** open by summarising the source. The first interaction is
normally **diagnostic**: what does this learner already understand?

> ✗ *"Diabetes mellitus is a chronic metabolic disorder characterized by hyperglycemia…"*
> ✓ *"Before we get into this, what do you think actually causes blood glucose to become
> elevated in diabetes?"*

Then teach from the point the answer reveals.

## 7. Diagnosis must be fast

Not an onboarding questionnaire. One or two high-information questions typically. Strong
answer → move forward. Foundational gap → go back and repair. It should feel like
learning, not a placement test.

## 8. Prefer active responses

Default is **Nemesis asks → learner produces an answer**. Not multiple choice, not reveal
answer, not tap to flip, not press Space, not true/false, not recognition. Answers may be
typed, dictated, and eventually drawn. Evaluate **semantic understanding**, not wording.

## 9. Dictation is first-class

The microphone stays directly in the persistent composer. Answering must never require
clicking through modal UI.

## 10. Feedback is restrained

No *"Great job! 🎉"*. **"Correct."** or a subtle visual confirmation, then move on.

## 11. The Canvas is not a chat transcript

Borrow the composer's familiarity, not the bubble log. The Canvas is a surface Nemesis
continuously composes — explanation, question, diagram, equation, passage, worked example,
comparison, image, retrieval prompt, corrective feedback — placed according to current
need. **The current learning state is the product; the history is not.** Old interactions
may collapse, disappear, or become secondary.

## 12. Do not dump the document onto the Canvas

80 slides must not become 80 slides of generated prose. The source is reference material.
Extract concepts, relationships, terminology, mechanisms, facts, procedures, objectives,
dependencies, likely misconceptions and retrieval targets — then use them selectively.
**Show the smallest useful amount for the current cognitive task.**

## 13. Preserve source access

Sources stay reachable through the Canvas source control: documents, recordings, webpages,
citations, page/slide references. Cite source-grounded claims. Source management is
secondary to the learning surface.

## 14. Active Canvas hierarchy

1. **Current cognitive task** — what to read, reason about, recall, explain, calculate, solve
2. **Learner response** — the persistent composer / drawing
3. **Feedback or correction** — only what updates understanding
4. **Peripheral controls** — sources, objectives/minimap, overflow, navigation

The UI must not constantly expose learning-system internals.

## 15. One persistent composer

**One component** for Canvas home, active Canvas, source upload, retrieval and freeform
questions. No variants. Docked near the bottom of the viewport on an active Canvas.
Placeholder: *"Ask Nemesis or change how you're learning…"*

The learner can always interrupt: *Explain that word. · Why? · Show me a diagram. · Skip
this. · Go deeper. · Give me an example. · I already know this. · Focus on the exam.*
**These are part of the adaptive loop, not side features.**

## 16. The flow

| | |
|---|---|
| **A — New Canvas** | Minimal page. The composer is the primary object. Attach `Diabetes Physiology.pdf`; chip appears; optionally type *"I have an exam next week. Focus on mechanisms rather than definitions."*; send. |
| **B — Processing** | Canvas opens immediately, composer visible. Centre shows animated thinking previews resolving through *Reading the material…* → *Finding the major relationships…* → *Preparing a starting point…* Fluid, not discrete steps. |
| **C — First diagnostic** | The preview **resolves into** the first interaction. *"Let's start here: what role does insulin normally play in keeping blood glucose within its normal range?"* No slide count, no summary, no "Help me learn this." |
| **D — Learner answers** | Typed or dictated. Nemesis classifies internally: understood / partial / incorrect / misconception. **Do not show those labels.** |
| **E — Adapt** | correct → deeper or another dependency · partial → repair only the missing relationship · incorrect → briefly reconstruct the prerequisite and retrieve again · misconception → surface the distinction that overwrites the wrong model |

## 17. Diagnosis is not interrogation

A diagnostic question must have **high information value** — it should distinguish between
several possible learner states.

> ✓ *"Why can blood glucose remain elevated even when a patient with type 2 diabetes still
> produces insulin?"* — exposes secretion vs resistance
> ✗ *"What is diabetes?"*

## 18. Topic-only input follows the same philosophy

`Photosynthesis` with no source creates a Canvas and diagnoses level — *"What do you
already think the plant is accomplishing during photosynthesis?"* Prompt, document, several
sources, a recording and a webpage all converge on one runtime.

## 19. Design language

Highly restrained · white-space heavy · typography-led · subtle borders · minimal chrome ·
fluid motion · no unnecessary cards · no bright gamification · no educational-dashboard
aesthetic · no childish rewards. **The interface should almost disappear.** The learner
perceives: idea → thought → response → adaptation.

## 20. Animation language

One motion system throughout Nemesis: **information forming from left to right.** Text
shimmer, faint skeleton lines, staged opacity, the small Nemesis bead where appropriate,
smooth content replacement. Avoid spinners.

> A spinner says **wait**. A thinking preview says **something is being formed.**

## 21. Loading resolves into content

Not: loader disappears → blank moment → content pops in.
Instead: **preview structure becomes the final content** — three placeholder lines resolve
into the first diagnostic.

## 22. Do not over-explain the machinery

No *"Step 1 of 4: Parsing"*. Occasional natural-language states are fine; they stay ephemeral.

## 23. No artificial session framing

No *Question 2 of 8* · *Recall 3/10* · *Lesson 42% complete* · *Next* · *Continue* ·
*Check answer* — unless a task genuinely requires it. Nemesis decides what comes next.

## 24. Architecture principle — not a visual redesign

The runtime must enforce: **source ingestion is not source summarization.**

```
1 ingestion
2 concept / objective extraction
3 dependency inference
4 learner-state comparison where prior evidence exists
5 diagnostic selection
6 Canvas interaction
```

**The first generated artifact is normally a diagnostic, not a document overview.** A
summary may still be produced when the user explicitly asks *"Summarize this."*

## 25. Existing learner evidence reduces diagnosis

Do not re-diagnose a prerequisite the learner has already demonstrated. Returning learner:
`source → compare against known learner state → diagnose only the uncertainty`. Nemesis
gets faster and more personal over time.

---

## 26. Acceptance criteria

- [ ] New Canvas no longer depends on the large "What do you want to learn?" state
- [ ] Files attach directly through the primary composer
- [ ] Attachment preview visible before send
- [ ] A file may be sent with no accompanying text
- [ ] A file may be sent with an instruction
- [ ] Sending enters the active Canvas immediately
- [ ] No separate "Help me learn this" confirmation screen
- [ ] Processing shows polished animated preview loaders
- [ ] Processing animation has a subtle left-to-right pulse/shimmer
- [ ] No generic giant grey upload box in the normal workflow
- [ ] Composer stays available during processing where technically safe
- [ ] Processing transitions fluidly into the first real interaction
- [ ] Default post-upload behaviour does not generate a whole-document summary
- [ ] The first substantive interaction is diagnostic/adaptive where appropriate
- [ ] The diagnostic accepts free-response text
- [ ] Dictation works from the same composer
- [ ] Existing learner evidence can shorten diagnosis
- [ ] Correct responses receive restrained feedback
- [ ] No progress counters, "Next" buttons, or gamified celebration introduced
- [ ] Source documents remain accessible separately
- [ ] Explicit "summarize this" still produces a summary
- [ ] Topic-only prompts and source uploads converge on one Canvas runtime
- [ ] Loading states respect reduced-motion settings
- [ ] The shared composer is used — no new composer variant

---

## 27. Chrome corrections, same session (owner, 2026-08-13)

**27.1 — The sidebar toggle.** Hide it while a Canvas is open. Use the panel-toggle glyph
the owner supplied (rounded square with a filled left rail) as **the** sidebar icon
wherever the control does appear. Current control is `aria-label="Collapse sidebar"` at the
sidebar header.

**27.2 — Composer parity with ChatGPT.** Measured live in the owner's browser, same 1440px
viewport, same machine:

```
                     ChatGPT          Nemesis
root font-size       16px             18px      ← html{font-size:112.5%}
composer form width  768px            n/a       Canvas home has NO composer element
composer height      52px             n/a
field font-size      16px             —
field line-height    26px             —
```

🔴 **Two findings.** (a) Every rem in `apps/web` renders 12.5% larger than its number —
this alone makes the whole app look unlike ChatGPT, and specs must be written in **px**.
(b) The Canvas home page has **no composer element at all** — the "Teach me something…"
affordance is not the shared composer, which is why §15 cannot be satisfied by styling.

ChatGPT's right-hand cluster is `model selector · mic · filled circular voice button`.
Nemesis' is `mic · outline arrow`. Match the geometry and weight, not the green.

**27.0 — Correction to a Brain inference.** Brain wrote *"scrolling back up isn't a real interaction."* **Too strong.** Scrolling backward must not be *necessary* to understand what Nemesis is currently asking — but the Canvas is still a persistent, document-like surface. A learner may want to revisit a diagram, reopen an explanation, inspect a source, or compare something seen earlier.

> **The principle: history remains available, but resolved history becomes visually secondary. The current cognitive task owns attention.**

The mistake to avoid is an accumulating chat transcript where scrolling backward is *required* to reconstruct the conversation.

**27.3 — Accent colour belongs in settings.** It must be user-chosen, not hardcoded.
Current state, read from the live stylesheet:

```
--accent            #404040        neutral, correct per the 08-13 decision
--acid              #404040        alias
--bg                #f8faff        🔴 blue-tinted white — ChatGPT's ground is neutral
--accent-foreground 353 65% 32%    🔴 stale crimson from the retired palette
--accent-shadcn     353 45% 95%    🔴 stale crimson
```

Ship a settings control that writes the accent, with the neutral grey as default. Clear
the two stale crimson tokens in the same pass — nothing should reference a hue the product
no longer uses.

---

## 28. The Canvas is a mutable document — block lifecycle (owner, 2026-08-13)

Not a replace-the-whole-screen interface. Not a transcript. **A mutable document.**

The Canvas contains **semantic blocks**:

```
explanation · worked example · diagram · question
freeform workspace · feedback · comparison · source excerpt
```

At any given moment **one region is the active cognitive region**.

Nemesis decides the learner needs a short explanation — it appears naturally in the
document, with its diagram. Then the question appears **directly after** it:

> *"What would happen to the plateau if L-type calcium channels were blocked?"*

Once the learner demonstrates understanding, the explanatory material **does not need to
remain 400 pixels tall forever**. It condenses:

```
▸ Phase 2 plateau mechanism
```

### The lifecycle

```
ACTIVE      full resolution, visually prominent
   ↓        learner demonstrates understanding
RESOLVED    compressed / quieter
   ↓        learner needs it again
REOPENED    expanded locally
```

**Not** `message · message · message · message`.
**Not** `erase whole screen → replace whole screen → erase whole screen`.

> 🔴 **Nemesis mutates LOCALLY. Active material expands; resolved material compresses;
> weak material can reopen. Nothing should remain large merely because it happened
> earlier.**

A worked example behaves the same way — `3(x+4)=21` worked through, then collapsed to a
compact reference once the procedure is demonstrated. A diagram stays available because it
stays cognitively useful, but goes quieter once resolved.

**If the learner highlights one sentence and asks "why?", only that region expands. The
entire page must not regenerate.**

> **The Canvas should accumulate understanding, not conversation.**

### 🔴 Do not read "dynamic" as "everything disappears constantly"

That would make the Canvas cognitively unstable.

```
STABLE     the learner's conceptual landmarks, sources,
           objectives, and useful representations
DYNAMIC    their resolution, prominence, ordering, and the
           task Nemesis puts in front of the learner
```

**The intended feeling: a textbook that is alive and continuously edits itself around what
you understand.** Not a chat feed, and not a sequence of ephemeral screens.

---

## 29. The Minimap (owner, 2026-08-13)

It is **a map of objectives, viewed through learner state.**

It is **not** a map of the document. It is **not** a progress meter. It is **not** a fixed
curriculum path.

```
WHAT NEMESIS IS TRYING TO GET THE LEARNER TO BE ABLE TO DO
                            +
WHAT NEMESIS CURRENTLY BELIEVES ABOUT THOSE CAPABILITIES
```

```
Cardiac action potentials

  ●  Resting membrane potential
  ●  Ventricular phase 0
  ◉  Plateau mechanism
  ◐  Pacemaker depolarization
  ○  Compare nodal vs ventricular AP
  ○  Predict effects of channel blockade

  ●  demonstrated          ◉  current objective
  ◐  uncertain / fresh      ○  unexplored
     evidence needed
```

**Qualitative states, never fake percentages.**

### It owns no state of its own

The Minimap is a **projection** of:

```
LearningObjectives  +  LearnerObjectiveState  +  current TeachingPolicy target
```

> 🔴 **It must not maintain its own progress state.**

### It changes

Nemesis may believe the structure is `A · B · C · D`, then discover the learner is missing
prerequisite `P`:

```
A
B
  └─ P        appears because the teaching policy decided it matters
C
D
```

Once a cluster is well demonstrated, several objectives may visually compress.

### Restrained steering

Clicking an objective means **"work on this"** or **"show me where I stand on this."**
It must **not** simply scroll to an old paragraph.

Nemesis takes `objective + existing evidence + retention` and chooses an appropriate
current task:

```
strong evidence     →  one retrieval check
misconception       →  a contrast
no evidence         →  a diagnostic question
```

So the Minimap is **orientation + lightweight learner steering** — without turning the
Canvas into a course-navigation app.

---

## 30. The full mental model

```
CANVAS                                  MINIMAP
is the mutable working surface.         is the compressed semantic model of
                                        what Nemesis is trying to achieve
Active objective                        + where the learner currently stands.
  → expands into whatever
    representation is useful:
    explanation · question ·
    diagram · example · workspace

Learner acts
  → Nemesis gets evidence

Evidence changes learner state
  → teaching policy chooses next action

Resolved regions   → compress
Weak regions       → expand
Old material       → remains inspectable but secondary
```

---

## 31. 🔴 Brain's note: §28 and §29 share one keystone

Both of the above depend on the same missing capability.

- **§28** compresses a region when *"the learner demonstrates understanding"* — of the
  objective that region serves.
- **§29** paints `● ◐ ◉ ○` per objective.

Both therefore require **per-objective outcomes**, and nothing in the system produces them
today. The judge returns prose; prompt fan-out is **total over its targets**, so one answer
writes the same verdict to every objective it spanned.

**Consequence:** the evaluator returning a per-objective verdict — with a **third value for
"this response said nothing about that objective"** — is not a refinement of §17. It is the
prerequisite for the block lifecycle and the Minimap as well. It is the keystone piece.

Until it exists:
- a block may compress only against an objective that was **individually** demonstrated
- the Minimap must render `◐ uncertain` rather than invent a state it cannot justify
- a multi-target diagnostic may **route** but must **not write evidence**

---

## 32. 🔴 WORK ORDER (owner, 2026-08-13) — this supersedes Brain's sequencing

Brain proposed promoting objective-scoped evidence to the front because §17, §28 and §29
all depend on it. **The owner overruled that: the two live runtime defects come first.**

```
1  HOTFIX      source attachment cannot destroy Canvas state
2  HOTFIX      mapping cannot hang silently forever
3  PROVENANCE  source attachment grounds what it actually supports,
               without laundering model-generated content
4  EVIDENCE    attribute each answer to the specific objectives
               it actually demonstrates
5  POLICY      act only on those objective-level facts
6  CANVAS      expand unresolved regions, compress resolved ones,
               keep history inspectable
```

> **"That last evidence change is indeed a keystone. But first make sure the Canvas cannot
> disappear when the learner gives it more material."**

---

## 33. HOTFIX 1 — attaching a source must never clear the working surface

**Highest severity, because attaching material is one of the core Canvas actions.**

```
existing Canvas  +  new source   ≠   new Canvas state
```

The required shape:

```
existing Canvas remains intact
      ↓
source attaches durably
      ↓
source processes ASYNCHRONOUSLY
      ↓
new knowledge / source assertions become available
      ↓
policy decides whether anything visible needs to change
```

**If processing fails, the existing Canvas still remains.** At worst the new source shows a
degraded or failed processing state **in Sources**. The working surface is never cleared.

---

## 34. PROVENANCE — at the claim, not the session

🔴 **Provenance must not be session-global.** *"This Canvas has at least one source"* does
**not** mean every visible claim became source-grounded.

```
Block A  →  grounded in Source 1
Block B  →  model-derived / unsupported by attached sources
Block C  →  grounded in Source 1 + Source 2
```

**Adding one source must not erase disclosure for unrelated model-generated material.** The
owner's word for the failure is **laundering**: presenting model-written content as
source-backed because *something else* on the canvas has a source.

### Reframing the "byte-identical" result

Integration measured that uploading a document stating facts Nemesis already believed left
the payload byte-identical, and graded it a failure. **The owner narrows this:**

> *"If nothing pedagogically useful changed, the page may legitimately stay identical. But
> something should change underneath: those claims can now acquire source provenance."*

**The defect is not that the page did not change. The defect is that the provenance did
not.** A source may strengthen or ground existing knowledge **without forcing any visible
rewrite**.

---

## 35. HOTFIX 2 — no infinite thinking state

*"Mapping what you know"* ran for >90s with no transition, no failure, and no console
error. This is the same silent-degradation family already found repeatedly here.

> 🔴 **Ninety seconds with no transition or failure state should never be REPRESENTABLE.**

The pipeline needs an explicit lifecycle:

```
mapping → ready

mapping → degraded → continue with available information

mapping → failed  → retry / recover
```

**No infinite "thinking" state.**

---

## 36. EVIDENCE — what an answer actually demonstrated

The evaluator today behaves as:

```
question touches A, B, C   →   answer judged correct   →   A, B, C all demonstrated
```

**Too coarse.** It must instead answer: *what did this response actually provide evidence
for?* For every objective the task touched:

```ts
{
  objectiveId,
  evidence: "demonstrated" | "partial" | "contradicted" | "not_addressed"
}
```

Names may follow the existing model, but **`not_addressed` / `no_evidence` is essential.**

### The worked case

> **Task** — *Explain ventricular phase 0 and why the membrane potential rises.*
>
> **Objectives** — A. Identify Na⁺ as the major inward ion · B. Explain why Na⁺ moves
> inward · C. Connect Na⁺ influx to rapid depolarization
>
> **Answer** — *"Sodium enters the cell, causing rapid depolarization."*

```
A → demonstrated
B → not_addressed      ← Nemesis must NOT infer this from a good overall answer
C → demonstrated
```

### Why it is the keystone

```
precise learner state → accurate Minimap → accurate forgetting state
                     → correct policy decisions → local remediation
```

> **A false green dot becomes a policy bug: Nemesis believes something is resolved,
> collapses it, and may never probe it again.**

### Prefer objective-sparse tasks

If one question can cleanly test one capability, that beats a large question touching seven
objectives and then reverse-engineering what was shown. **Multi-objective tasks remain
necessary** for explanation, synthesis and transfer — **but their evidence attribution must
be explicit.**

---

## 37. The `✓` — Brain misread it. It belongs to DICTATION.

🔴 **Correction of record.** Brain read the composer checkmark as a reading-advance control
and ruled it retired. **It was never that.** It is the dictation confirm control:

```
mic active

[ ~~~~ waveform ~~~~ ]        ×        ✓

×  discard dictation
✓  finish dictation / transcribe
```

**Build it.** It has nothing to do with progressing through reading.

### And reading needs no completion event at all

The dynamic Canvas should not need *"I've read this"* · *"Continue"* · *"Next"* · `✓` for
ordinary reading.

```
Nemesis decides an explanation is useful
      ↓
explanation expands
      ↓
directly beneath it: a diagnostic / retrieval / application task
```

The learner reads at their own pace and answers when ready. No click is required to tell
Nemesis *"I have visually consumed these pixels."*

If the passage is unclear, the same composer takes *"Why is potassium leaving at the same
time?"* — **Nemesis handles that clarification LOCALLY, keeps the task available, and
continues once the learner answers.** A clarification does not consume the task.

> 🔴 **THE GOVERNING RULE: reading requires no completion event. Learner performance
> produces evidence.**

---

## 38. Canvas chrome and Library decoration (owner, 2026-08-13, later)

### 38.1 — Inside a Canvas there is no sidebar

> **"Side bar should also not be visible when inside canvas."**

Not merely the toggle — **the whole rail**. The Canvas is a focused, full-bleed surface.
This is *"Navigation lives at the edge. Learning owns the center"* taken to its conclusion,
and it supersedes the narrower §27.1 instruction.

### 38.2 — The exit is an `×`, not a `←`

> **"When inside a canvas the 'back button' should be an `×`."**

Current control: `aria-label="Leave the canvas"`, rendered as `←`.

🔴 **Together, 38.1 and 38.2 make the `×` the ONLY way out of a Canvas.** Canvas UI
previously flagged that hiding navigation recreates a dead end this repo already hit and
fixed. That concern is answered by the `×` — **provided it is unconditionally present in
every entry path**: deep link (`?c=`), the extension's import link, a fresh sign-in, a hard
refresh, and the processing state. An entry that renders no `×` is the dead end returning.

### 38.3 — Every Library function needs a visible affordance

> **"Make sure that all library functions have UI decoration."**

Measured on the live Library, 2026-08-13:

```
every row HAS  →  a button labelled "Canvas actions"
the whole list →  contains ZERO <svg> elements
```

**The functions are not missing. They are invisible.** Rename, move and delete live behind
a control that draws nothing, so the Library reads as a bare list of text where a canvas
manager should be.

Give each capability a visible, styled affordance — the row action control itself, folders,
sort, filter tabs, and whatever distinguishes one canvas from another at a glance. Keep it
inside §19's restraint: quiet glyphs and hover states, **not** cards, badges or colour.
