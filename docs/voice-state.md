# Voice in Nemesis — what is actually built, measured 2026-08-17

Written because the handoff brief treated voice as "the next major unfinished product slice". Most
of it is finished, shipped, and serving. This records what was verified and how, so nobody funds a
rebuild of something that works — and so the one genuinely missing piece is stated plainly.

Method: read the code, then confirm against the **served production bundle** at
`app.enternemesis.com`, with a probe calibrated before it was trusted (a positive control that must
be present, and a negative control from unmerged work that must be absent). A green build is not a
deployment; a code read is not a capability.

## 1. Speaking an answer — BUILT, WIRED, SERVING

The learner presses the microphone in the Canvas composer and speaks their answer. It is not a
separate mode, a separate session, or a separate tutor: it fills the same composer, submits through
the same path, and produces the same durable evidence as typing.

| Link in the chain | File | Verified |
|---|---|---|
| Microphone + continuous recognition | `components/workspace/learn/use-canvas-dictation.ts` | `webkitSpeechRecognition` present in served bundle |
| Renders as an answer control | `canvas-composer.tsx` | `"Answer out loud"` present in served bundle |
| Tagged as speech, not typing | `canvas-model.ts` → `LearnerInputModality` | — |
| Judge told to forgive speech | `canvas-prompts.ts:513` | `"said out loud"` / `"false starts"` present in served bundle |
| Kept in the durable record | `learner_evidence.response_modality` | `learner-store.ts:610` reads it back |

The grading instruction is the part worth noticing, because it is what makes speech *first-class*
rather than merely *accepted*: a spoken answer arrives with filler, false starts and repair, and the
judge is explicitly told these "mean nothing about their understanding… judge the correction, not
the first attempt."

**Calibration of the probe** — positive control `"Submit answer"` PRESENT, target strings PRESENT,
negative control `"Learn this"` (Codex work, unmerged at time of measurement) correctly ABSENT.

### The defect found and fixed here

The modality was held in a `useRef` that three paths set and four had to clear, and one clear was
missing. `cancelDictation` put the text back but left the flag reading `"spoken"`, so *speak →
cancel → type → send* was graded under the speech-leniency instruction and stored against the wrong
response-time baseline permanently. Fixed by moving the transitions into `lib/learn/answer-modality.ts`
as a pure total reducer. See that file's header for why accepting a capture is deliberately not the
same as discarding one.

## 2. Recording a lecture — BUILT

Record on the Canvas → audio to the `recordings` bucket → `nemesis-transcribe` → the transcript
enters through the ORDINARY file-extraction door, so it becomes a real `library_sources` row rather
than a fourth thing that looks like one. Provider ladder is xAI Grok STT first ($0.10/hr, speaker
labels included), AssemblyAI async as fallback.

🔴 `canvas-recording.ts`'s header documents a real durability limit: the primary provider deletes the
audio inside `/submit` and the DB copy of the text is cleared on first read, so **the fetch response
is briefly the only copy in existence**. That is why nothing on that path may swallow an error.

## 3. Live streaming audio — INFRASTRUCTURE EXISTS, DELIBERATELY UNUSED ON WEB

`/api/live-audio/token` + `/webhook` + a `reserve_live_audio_window` metering RPC are real. The web
app does not use them, on purpose, for cost — and `workload-cost.test.ts:119` enforces it:

    assert.doesNotMatch(recorder, /live-audio/, "web must not be streaming");

Anyone reaching for streaming must change that test deliberately, which is the point.

## 4. Nemesis speaking back — DOES NOT EXIST

There is **no text-to-speech anywhere** in the codebase. Searched `apps/web` and
`supabase/functions` for `speechSynthesis`, `text-to-speech`, `tts`, `elevenlabs`, `/audio/speech`:
the only two hits are comments in the STT cost table.

So voice today is **half-duplex**: the learner can talk, but must read. That is a coherent product —
speaking exposes a mental model better than typing does, which is the pedagogical reason §7 wanted
it — but it is not hands-free study.

**This is a product decision, not an engineering one, and it is not made here.** Whether Nemesis
speaks changes what the product *is* for a learner walking to class. It also changes the cost shape:
every taught turn would carry an audio generation, where today the marginal cost of voice input is
zero (the browser's own recogniser).

The seam if the answer is yes: the provider ladder in `nemesis-transcribe` is the pattern to copy,
xAI already has a TTS API on the same key the STT lane uses, and `_shared/voice-cost.ts` is where the
rate belongs. No account, key, or migration exists for it yet.

## Decision: live dictation stays on the browser's recogniser, for now

The brief asked whether to move live Canvas dictation from the Web Speech API to xAI streaming STT
"if technically and economically appropriate". **Decision: not in this milestone.** Recorded here so
it is a choice with a stated trigger rather than an omission.

**Why not.** Web Speech costs **nothing** per use, works today, and is verified serving in
production. xAI streaming is $0.20/hour and — more importantly — needs a WebSocket relay, because
the provider key cannot go near a browser. That is real new infrastructure (proxy, audio encoding,
interim handling, turn detection, reconnection) whose payoff is browser coverage and vocabulary
accuracy, not a capability the learner does not otherwise have.

**What it would actually buy, honestly stated.** Two things:

1. **Firefox.** Web Speech is absent there, and the mic is correctly hidden rather than broken — but
   a Firefox learner cannot speak answers at all.
2. **Technical vocabulary.** A pharmacology student saying "hydrochlorothiazide", or a materials
   student saying "austenitic", will get something mangled back. This is the one that could matter
   for learning rather than convenience.

**Why (2) is survivable today, and how we would know if it stops being.** The grader is explicitly
told to judge *meaning, not vocabulary* — "if they express the right idea in everyday language, that
is a correct answer, do not require the term the material used" — and spoken answers additionally
get the leniency branch. So a mangled term should still be judged on what the learner meant.

🔴 **The trigger to revisit is measurable, and we now store what it needs.** `learner_evidence`
carries `response_modality`, so spoken and typed verdicts on the *same objectives* can be compared
directly. If spoken answers show systematically worse outcomes than typed ones, that is the signal —
and it is evidence, not a hunch. Until that comparison exists, switching would be paying for a
problem nobody has measured.

**A cheaper option exists if only accuracy matters.** Canvas answers are short (10–20 seconds), so
xAI's *batch* STT — already wired in `nemesis-transcribe` at $0.10/hour — would give the vocabulary
accuracy with no WebSocket infrastructure at all. What it loses is interim text appearing as the
learner speaks, which is a real part of why dictation feels responsive. Worth knowing the option is
there before anyone assumes streaming is the only route.

## Two known duplications, neither a correctness bug

1. **Two Web Speech implementations** — `use-canvas-dictation.ts` (Canvas) and the dictation welded
   into `sessions/composer.tsx` (chat). The Canvas hook's own header names this and argues for
   merging them "later, deliberately, rather than as a side effect". Checked for the failure that
   would make it urgent: the chat composer's `onSubmit(text, files)` carries **no** modality and
   never produces graded learning evidence, so dictated chat cannot be mistagged in the learning
   record. It is duplication, not a defect — and `/sessions` is retired from navigation, so merging
   toward it would be work on a dead surface.
2. **Two microphones open during dictation** — deliberate, and `use-canvas-dictation.ts` explains
   why: the Web Speech API owns its microphone privately and exposes no stream to draw a waveform
   from.

## Answer-position entropy (§7) — ALREADY SOLVED, worth not rebuilding

`lib/workspace/test-answer-balance.ts` balances *then* shuffles which option is correct, seeded
deterministically from the paper, and skips any question whose explanation names an option by
letter. Called from the Canvas (`canvas-parse.ts:275`), the Study tab, and the agent tools. Its
header already makes the argument that a balanced-in-order sequence (A,B,C,D,A,B,C,D) is *more*
exploitable than clustering, not less.
