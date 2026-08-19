# Voice in Nemesis — what is actually built, measured 2026-08-17, corrected 2026-08-18

Written because the handoff brief treated voice as "the next major unfinished product slice". Most
of it is finished, shipped, and serving. This records what was verified and how, so nobody funds a
rebuild of something that works — and so the one genuinely missing piece is stated plainly.

🔴 **ONE SECTION OF IT WAS ALREADY WRONG ON THE DAY IT WAS WRITTEN.** §4 claimed Nemesis had no
text-to-speech; the function had shipped. It is corrected in place below, with the correction
labelled rather than silently applied, because a status document that quietly rewrites itself
teaches the next reader to trust none of it.

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

## 4. Nemesis speaking back — BUILT, AND THIS SECTION WAS WRONG (corrected 2026-08-18)

🔴 **THIS SECTION SAID "there is no text-to-speech anywhere in the codebase" AND IT HAD STOPPED
BEING TRUE.** `supabase/functions/nemesis-speak` takes a short piece of text and returns MP3 bytes,
on the xAI key the transcription lane already uses; `lib/learn/canvas-speech.ts` decides what may be
said; `components/workspace/learn/use-canvas-speech.ts` plays it. The document was written on
2026-08-17 and the function predates it — the search that produced the claim was run before the
lane landed and the conclusion was never re-run. This is the exact failure mode the rest of this
file was written to prevent, so the correction is recorded rather than quietly overwritten.

So voice is **full-duplex**, with a deliberately narrow mouth. What Nemesis says is bounded on
purpose, and the bounds are the interesting part:

| Rule | Where | Why |
|---|---|---|
| Reads the question and the correction; refuses explanations | `canvas-speech.ts` | a paragraph read aloud cannot be skimmed, re-read, or paced by the learner |
| Refuses text that is mostly notation | `canvas-speech.ts` | a synthesiser reading `\frac` aloud once turns voice off for ever |
| 600 characters, enforced in the function and not only the client | `nemesis-speak` | a cap that lives only in the caller is a cap anybody can remove with a fetch |
| No cache | `nemesis-speak` | a considered cost decision, recorded with the figure that would justify revisiting it |

### What §43 added on top of it

`lib/learn/speech-route.ts` now decides the **locale, the pace and the provider** for each utterance,
where before every request went out as `language: "auto"` at a fixed 0.95. Nothing about the canvas
lane's behaviour changed — with no locale passed the request body is byte-identical — but the seam
now exists, and with it the rule that a **target-language utterance is refused rather than spoken in
a guessed variety**. See §43 of the canvas product contract.

## 5. Judging HOW something was said — DOES NOT EXIST

The gap this document should have been naming. Speech recognition answers *"what words did the
learner probably say?"*. It does not answer *"did they say them like a native speaker?"* — phoneme
accuracy, stress placement, intonation contour, fluency. For every subject Nemesis teaches today that
second question is irrelevant. For teaching a language it is most of the subject.

There is no provider, no integration and no evidence schema for it. **This is a product decision and
it is not made here** — the same standing this document gave to text-to-speech, which is the one
call in the original that has held up.

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

## Update — 2026-08-19: Azure Speech integrated (§47)

Two capabilities changed. Nothing above was replaced.

- **Pronunciation assessment now exists.** It did not when this document was written. Azure scores an
  attempt at word, syllable and phoneme level and reports what the learner *likely produced* instead
  of the target sound. `lib/speech/pronunciation-diagnosis.ts` turns that into a named word, a named
  sound and one corrective line; `pronunciation-progress.ts` compares a retry with the attempt before
  it. **No Canvas lesson calls any of it yet** — the capture hook and the routes work and are tested,
  and no teaching prompt asks for a drill.
- **The target-language TTS lane moved to Azure.** The Canvas lane (§1 above, `nemesis-speak`) is
  unchanged and stays on xAI. The split is in `lib/speech/capabilities.ts`.
- **Learner audio is still not stored anywhere.** The attempt hook records, posts to the assessor, and
  releases. Retaining a recording of a person's voice is a decision nobody has been asked to make.

The architecture, the environment variables and how to test any of it live in
[`speech-architecture.md`](./speech-architecture.md).
