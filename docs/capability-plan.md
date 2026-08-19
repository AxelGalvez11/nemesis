# The capability plan — language first, then seven subjects that are really five primitives

Owner's priorities, 2026-08-19:

1. **Language** — a voice native to the target language, and a way to judge how the learner said it
2. Computer science, accounting, history, statistics, geometry, physics/engineering, finance
3. Music, geography, spectroscopy — later
4. Content-heavy work (the licensed image registry) — later

This plan takes that order. It changes one thing about it: **the seven subjects in group 2 are not seven
projects.** They collapse into five primitives and one thing that is not a primitive at all.

---

## The reframe

| Subject | What it actually needs | Shared with |
|---|---|---|
| Accounting | semantic table | finance, statistics, everything |
| Finance | semantic table + timeline | accounting, history |
| Statistics | table + plot (exists) + distributions | accounting |
| History | timeline; causation already works | finance |
| Geometry | constructed figure | physics |
| Physics / engineering | labelled vectors on a body | geometry |
| Computer science | code + execution trace | nothing |

Five new primitives: **table, timeline, constructed figure, annotated vectors, code trace.**

And one thing that is not a renderer and matters more than any of them.

### 🔴 THE MULTIPLIER — Nemesis cannot check its own arithmetic

Accounting, finance, statistics, geometry and physics are all subjects where the answer is
**calculable**. Today every worked solution Nemesis produces — a journal entry, a present value, a
standard deviation, an angle, a resultant force — is whatever the model wrote, shown with total
confidence, checked by nothing.

This gets **worse** with every primitive added, because each one is another way to display a wrong
answer authoritatively. §42 already forbids grading a learner against a picture Nemesis cannot vouch
for. **There is no equivalent rule for numbers**, and five of the seven subjects above are numbers.

So the verifier is Phase 2 — before any subject primitive — and every primitive after it declares
whether it can carry an answer key, exactly as image provenance does.

---

## Phase 0 — the canvas has to keep the learner's audio

**Blocks all pronunciation work. Nobody had named it.**

Measured: `use-canvas-dictation.ts` opens a microphone, hands the stream to the browser's own
recogniser, and keeps **the transcript only**. The audio is discarded. `MediaRecorder` exists in this
codebase but only in the lecture-recording feature, which is a different surface with a different
lifecycle.

Every pronunciation assessor on the market takes **audio**. Not a transcript — the transcript is what
you compare *against*. So before any provider can be evaluated, the answer path has to capture and
retain the waveform alongside the words.

**What it involves**

- Record audio in parallel with recognition, in the canvas composer.
- Decide retention deliberately: pronunciation audio is a recording of a person's voice, kept for the
  purpose of scoring it. It needs an explicit lifetime and an explicit consent moment, not an implicit
  one inherited from dictation.
- Keep it optional and off by default outside a language session — a physics learner answering out
  loud has no reason to have their voice stored.

**Size:** small-to-medium. The risk is not the recording; it is the privacy decision, and that is the
owner's to make, not an implementation detail.

**Done when:** a spoken answer in a language session produces both a transcript and a retrievable
audio clip, and a spoken answer anywhere else produces only a transcript.

---

## Phase 1 — language

Two capabilities the owner asked for, in dependency order.

### 1a. A voice native to the target language

The routing is already built: locale travels per utterance, `auto` is refused for target-language
speech, and the pace is native rather than slowed. **What is missing is the voice itself.**

`nemesis-speak` sends one fixed voice id for every utterance in every language. A single voice
speaking Spanish is a voice with an accent, and for a language lesson the speaker *is* the material.

**What it involves**

- A voice catalogue keyed by locale, in the same shape as the provider table: each entry records the
  provider, the voice id, and **how it was chosen** — measured by listening, or defaulted.
- A second provider integrated into `nemesis-speak` behind the existing router, once the bake-off has
  a winner.
- The bake-off actually run. **This needs the owner**: API keys, and an hour of listening. No amount
  of code substitutes for it, which is the entire argument of §43.

**Size:** small once the listening is done. The listening is the long pole and it is not engineering.

**Done when:** two locales have a measured voice, `MEASURED_PROVIDERS` names them, and a Spanish
lesson and a Japanese lesson demonstrably use different voices from different providers.

### 1b. Judging how the learner said it

The boundary exists (`pronunciation-evidence.ts`): the shape of the evidence, the named refusals, and
a function that returns `no-provider` today and is *called* rather than commented out.

**What it involves**

- One assessor adapter, added to the Lab first as a dev-only sensor — speak a target phrase, record
  the learner, see what comes back — before anything touches a lesson. Same discipline as the TTS
  adapters.
- A **second** voice role: the exemplar. Demonstrating a single sound is a different job from
  conversation, and the provider that wins one may not win the other. The ability to specify phonemes
  directly matters here and does not matter anywhere else.
- Storage: pronunciation evidence needs a home in the durable record, so "this learner keeps missing
  this contrast" survives the session. The type exists; the table does not.
- **The assessor never decides anything.** It returns numbers. Whether a 53 on one sound matters,
  whether it is recurring, whether it is worth interrupting a conversation — those are teaching
  decisions and they stay in the policy. This is the single most important line in the phase.

**Size:** medium. The adapter is small; the evidence storage and the intervention policy are not.

**Done when:** a learner can hear a native example, repeat it, and get a correction that names the
specific sound — and Nemesis can say what it has been getting wrong across sessions.

**Until it is done, Nemesis must not claim to teach pronunciation.** It can teach vocabulary and
grammar in a language and should say so.

---

## Phase 2 — the verifier

Not a renderer. A checker that runs before an answer is shown.

The model proposes a worked answer; a deterministic evaluator confirms the arithmetic or the algebra;
a mismatch is a **refusal**, not a silent correction — the same way a malformed visual is refused
rather than quietly replaced, so that a model producing bad answers stays visible.

**What it involves**

- A bounded expression evaluator, or a symbolic layer if the subjects demand it. Bounded first: most
  of accounting, finance and statistics is arithmetic, and arithmetic is cheap to check exactly.
- A rule that generalises §42's provenance rule to numbers: **an unverified computed answer may not
  be an answer key.** It can accompany teaching; it cannot mark a learner wrong.
- The same named-refusal discipline everywhere else in this codebase uses.

**Size:** medium, and it pays for itself across five of the seven subjects.

**Done when:** a deliberately wrong worked solution is caught and refused rather than displayed, and
the refusal is countable.

---

## Phase 3 — the table

**Unlocks accounting and finance almost entirely, and helps statistics.**

The canvas today renders **no table at all** — block text is plain text, not even markdown. This is
the largest capability-per-line-of-code item in the plan and the most embarrassing gap: after prose,
a table is the most common teaching object that exists.

It must be a **semantic** table, not markdown. Markdown gives pixels; it does not give a cell you can
hide, highlight, or mark an answer against. The difference is exactly the difference between a figure
and an occludable figure.

**What it involves**

- A `table` visual: columns, rows, cells, with a cell addressable by identity so it can be hidden and
  asked about — the retrieval interaction that already works on figures.
- A small number of **semantic shapes** on top of it, because an accounting table is not any grid:
  T-account, journal entry, trial balance, and the three statements. These are structural, not
  subject-specific keyword lists: a T-account is "two columns that must balance", which is a rule about
  the shape, and it is checked by the Phase 2 verifier.
- Cash-flow timelines for finance, which are a table with a time axis.

**Size:** medium for the table, small for each semantic shape after it.

**Done when:** *"Equipment purchased for $20,000 cash"* renders as a T-account, the totals are verified
rather than asserted, and hiding one cell produces a markable question.

---

## Phase 4 — the timeline

**Unlocks history. Causation already works** — the arrow diagram with polarity handles "this led to
that" today. What is missing is **chronology**: things in order, on a scale, with durations and
overlaps.

**What it involves**

- A `timeline` visual: events with dates, optional durations, optional lanes for parallel threads.
- Occlusion falls out of it for free — hide a date and ask, hide an event and ask what belongs in the
  gap. The same interaction as a figure, on a different representation.
- Date handling is the actual difficulty: BCE, uncertain dates, ranges, and different calendars are
  where naive implementations break, and history is full of all four.

**Size:** small-to-medium. Dates are the hard part, not the drawing.

**Done when:** a sequence of events renders in proportion on a scale, an uncertain date is displayed
as uncertain rather than as a guess, and a hidden event is a markable question.

---

## Phase 5 — constructed geometry

**Unlocks geometry, and half of physics.**

A geometric figure is a **construction**, not a drawing: points, segments, circles, angles,
perpendiculars, with labels. The model states the construction; trusted code computes the coordinates.
Exactly the chemistry pattern — canonical description in, geometry computed out.

**What it involves**

- A `construction` visual with a small vocabulary of primitives, and a solver that places them.
- The Phase 2 verifier does double duty: a construction that is over- or under-determined is a named
  refusal rather than a drawing that looks plausible and is wrong.
- Interactivity is **explicitly out of scope for the first version**. A static, correct figure teaches
  most of geometry. Dragging a point is §41 priority five, and priority five is below this line.

**Size:** medium. The solver is the work.

**Done when:** "triangle with a 30° angle at A and the altitude from B" draws correctly, and an
impossible construction refuses by name.

---

## Phase 6 — vectors on a body

**Unlocks the mechanics half of physics/engineering.**

A free-body diagram is a body, a set of labelled force vectors with directions and magnitudes, and
optionally their components. That is a small, well-defined thing — and it is a *shape*, not a subject:
the same primitive draws any vector quantity on any object.

**What it involves**

- A `vectors` visual: an object, arrows with magnitude/direction/label, optional component
  decomposition, optional axes.
- Verification matters more here than anywhere: a diagram with the normal force in the wrong place will
  mark a correct learner wrong. Phase 2 checks the vector sum against the stated equilibrium.

**Size:** small-to-medium.

**Not included:** circuit schematics and ray diagrams. Both are genuinely separate primitives with
their own layout problems, and neither shares anything with this one. They come after, or with
engineering specifically.

**Done when:** "a 10 kg block on a 30° incline" draws the body, gravity, normal force and components —
and the components are verified to sum correctly.

---

## Phase 7 — code and execution traces

**Unlocks computer science.** Last of the group because it shares nothing with the others and carries
a risk none of them do.

**What it involves**

- Syntax-highlighted code as a first-class block rather than as text.
- An **execution trace**: what each line did, what each variable held, step by step. This is the part
  that teaches; static code is a textbook.
- The trace can be produced two ways, and the choice is the whole design decision:
  - **Model-narrated** — cheap, no sandbox, and *unverified*, which puts it under the Phase 2 rule and
    means it can never be an answer key.
  - **Actually executed** — real, and requires sandboxed execution of untrusted code. That is a
    security surface, not a feature, and it must be treated as one.
- Start model-narrated and clearly marked as such. Escalate only if the teaching demands it.

**Size:** small if narrated. Large if executed — and the largeness is security review, not code.

**Done when:** a short program renders with a step-by-step trace, and the trace is visibly labelled as
narrated rather than executed until it genuinely is executed.

---

## Deferred, and why that is right

- **Music, geography, spectroscopy** — owner's call, and it is the correct one. Notation and maps are
  each a full primitive serving one subject; spectroscopy needs a data source more than a renderer.
- **The licensed image registry (group B)** — the biology mechanism is built and starving, so this is
  the highest value-per-hour item in the whole product. It is deferred only because it is a *content*
  job rather than an engineering one, and it can run in parallel with any phase above the moment
  somebody starts verifying entries.

---

## What this needs from the owner

Three things no amount of engineering substitutes for:

1. **API keys** for the bake-off, and an hour of listening. Phase 1a cannot finish without it.
2. **A privacy decision** on retaining learner audio (Phase 0). How long, with what consent, deleted
   when.
3. **A call on executed code** (Phase 7). Sandboxed execution is a security commitment, not a feature
   flag.

---

## The ordering, in one line

**Phase 0 → 1 (language) → 2 (verifier) → 3 (table) → 4 (timeline) → 5 (geometry) → 6 (vectors) →
7 (code).**

Language first because it is the owner's priority and because Phase 0 blocks it. The verifier second
because five of the remaining subjects are calculable and none of them is trustworthy without it.
Then the primitives in order of subjects-unlocked-per-unit-of-work.
