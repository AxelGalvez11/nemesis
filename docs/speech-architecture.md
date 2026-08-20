# Speech in Nemesis — providers, capabilities, and where Azure fits

Written 2026-08-19, when Azure Speech was integrated. Read this before changing anything that
makes or listens to sound.

## The one-paragraph version

Nemesis has **three speech capabilities** and **four providers**, and no provider serves all three.
Text-to-speech on the Canvas is xAI. Text-to-speech for a language being *learned* is Azure, because
that lane needs to name a variety and only Azure publishes a catalogue to name it from. Pronunciation
assessment is Azure, because nothing else integrated can score *how* something was said.
Speech-to-text is the browser for dictation, xAI for recordings, and AssemblyAI for live streaming.
Every one of those is a row in `apps/web/lib/speech/capabilities.ts`, and swapping a provider is a
change to that file.

## The capability table

| Capability | Provider | Runs in | Credential | Where |
|---|---|---|---|---|
| TTS — Canvas questions and corrections | xAI | Supabase function | `XAI_API_KEY` | Supabase function secrets |
| TTS — the language being learned | **Azure** | Next route | `AZURE_SPEECH_KEY` | Vercel |
| Pronunciation assessment | **Azure** | Next route | `AZURE_SPEECH_KEY` | Vercel |
| Transcription — dictation in the Canvas | Web Speech API | Browser | none | — |
| Transcription — recordings and uploads | xAI | Supabase function | `XAI_API_KEY` | Supabase function secrets |
| Transcription — live streaming | AssemblyAI | Next route | `ASSEMBLYAI_API_KEY` | Vercel |

`capabilityReport(configuredSpeechKeys())` returns this table with what is actually true of the
current deployment stamped on each row. A provider with no credential reports `unconfigured` — never
`serving`.

## Why Azure did not replace anything

The Canvas voice lane works. `supabase/functions/nemesis-speak` reads a question aloud, is paid for
at a known rate, logs its own cost per utterance, and reads its key from secrets that already exist.
Replacing it would have been a migration with no beneficiary.

What it cannot do is **name a variety**. It takes `auto` or a bare language, picks a voice nobody
chose, and offers no catalogue to choose from. §43 refuses to guess across exactly that gap: `es-MX`
and `es-ES` differ in what a Spanish lesson is teaching, and a provider quietly picking one is
invisible to the learner and to us. Azure publishes four hundred-odd neural voices across a hundred-
plus locales with a queryable list. That is the whole reason it is here.

So: **two providers, two jobs, one router.** `speech-route.ts` sends a `target_language` moment to
Azure and everything else to xAI.

## Security

- `AZURE_SPEECH_KEY` is read in exactly one file: `apps/web/lib/speech/azure/config.ts`. A test
  (`lib/speech/secrets.test.ts`) fails the build if a second reader appears.
- That module **throws** if it is evaluated in a browser. Next.js would otherwise hand a client
  component an empty string — safe, silent, and an invitation to "fix" it by renaming the variable
  to `NEXT_PUBLIC_*`. The same test file fails on any `NEXT_PUBLIC_AZURE` reference in shipped code,
  and on any `"use client"` file importing `lib/speech/azure/`.
- `AZURE_SPEECH_REGION` is **validated before it is interpolated into a hostname**. Every Azure
  endpoint is `https://{region}.something.microsoft.com`; an unchecked region is a configuration
  string deciding where Nemesis sends a bearer credential.
- If anything ever needs Azure **from the browser** — the streaming SDK is the only real candidate —
  `POST /api/speech/token` mints a nine-minute bearer token. The permanent key is never in that
  response and the response is `Cache-Control: no-store, private`.
- All four routes require a signed-in user (`verifyBearer`).

## The endpoints

| Route | Does |
|---|---|
| `POST /api/speech/token` | Mints a short-lived Azure token for browser SDK use. No key in the body. |
| `GET /api/speech/voices` | No `locale` → every locale Azure speaks. With `locale` → the voice that would be chosen, plus alternatives. Accepts `gender`, `style`, `fallback=true`. |
| `POST /api/speech/tts` | `{ text, locale, voice?, style?, rate?, fallback? }` → streamed MP3. A locale is **required**. |
| `POST /api/speech/pronunciation` | multipart: `audio`, `text`, `locale`, optional `previous` + `targetedWords` → `{ evidence, diagnosis, comparison }`. |

## The modules

```
lib/speech/
  capabilities.ts              the registry — who serves what (pure, client-safe)
  voice-selection.ts           locale → voice, deterministically (pure)
  pronunciation.ts             the seam: callers ask, this dispatches to a provider
  pronunciation-diagnosis.ts   evidence → what word, what sound, what they produced (pure)
  pronunciation-progress.ts    attempt N vs attempt N−1 (pure)
  azure/
    config.ts                  THE ONLY READER OF THE KEY. Region validation, endpoints.
    voice-catalog.ts           fetch + normalise Azure's /voices/list, cached 6h in memory
    tts.ts                     SSML building + synthesis (streamed)
    pronunciation.ts           the assessment call + Azure JSON → Nemesis schema
lib/learn/pronunciation-evidence.ts   the SCHEMA everything produces and consumes (pure)
components/workspace/learn/use-pronunciation-attempt.ts   record one attempt, score it
```

## Voice selection is deterministic, and that is a teaching requirement

A learner drilling one sentence hears the target four times. If the voice changed between attempts
they would be comparing their production against a moving target, and any progress they heard might
be the voice. `selectVoice` therefore sorts: neural before anything else, generally-available before
preview, then alphabetically by short name. The last one is not a quality judgement — it is a
tie-break that cannot drift.

A region with no voice **refuses** rather than substituting. `fallback=true` opts in to another
region of the same language, and the response says `match: "region-fallback"` so the surface can be
honest about it.

## Pronunciation: what comes back

Azure's numbers are transformed into `PronunciationEvidence`, never exported through it.

- Scores arrive `0–100` and are stored `0–1`. Converted once, at the boundary.
- Offsets arrive in 100-nanosecond ticks and are stored in milliseconds.
- An **omitted word has no score at all**, never a zero. "Did not say it" and "said it terribly" must
  not be the same number.
- `NBestPhonemes` becomes `likelyProduced` — *what the learner actually produced*. This is the field
  that makes a correction teachable rather than a grade.
- The raw Azure payload is kept in memory for the transform and is **never returned to a client** and
  never written to `learner_evidence`.

`diagnose()` then answers the six questions the loop needs: which word, which sound, what they
produced, what the target is, one corrective line, and where in the recording it happened.
`compareAttempts()` answers the seventh: did the retry fix the thing they were told to fix.

## Learner audio

`use-pronunciation-attempt.ts` records one attempt, posts it to `/api/speech/pronunciation`, and
releases it. **Nothing stores it.** It is not written to storage, not put in `learner_evidence`, and
not retained past the component. A recording of a person's voice is not the same object as a
transcript of what they said, and keeping one is a decision nobody has made yet.

The previous attempt's *evidence* (numbers, no audio) is held in the component so the next attempt
can be compared with it. It dies with the screen.

## Testing

```bash
cd apps/web
npx tsx --test "lib/speech/*.test.ts" "lib/speech/azure/*.test.ts"   # fixtures, no network
npm run azure-speech                                                  # real Azure, needs the key
npm run dev   # then open /dev-preview/azure-speech
```

`/dev-preview/azure-speech` is the fastest way to find out whether the credential works: pick a
locale, hear the voice Azure chose, then record yourself and see a real score. It calls the same
`/api/speech/*` routes a lesson will, so a green bench means every remaining gate is wiring rather
than integration. It **404s in production** — the bench spends real money and quota.

The fixture tests cover English, Spanish and Japanese — chosen because the response *shape* genuinely
differs between them, not for coverage theatre. Japanese is the one that catches a parser assuming a
Latin alphabet.

`npm run azure-speech` makes real requests. Its fourth check is the one worth having: it synthesises
a sentence with Azure and then asks Azure to score that audio against the same sentence. A
native-quality reading has to come back near the top of the scale — if the SSML, the audio format,
the assessment header or the normalisation is wrong, that number collapses. **No fixture can produce
it.** With no credential the script reports every check as `SKIP` and exits 0.

## Failure modes, and what each one does

| What went wrong | What happens |
|---|---|
| No `AZURE_SPEECH_KEY` | Pronunciation reports `no-provider` (503). Language TTS falls back to xAI. Canvas voice unaffected. |
| Bad region | `azure-region-malformed` at config time — no request is made. |
| Azure 401/403 | `provider-unauthorised`. Never echoes Azure's body, which can contain the request headers. |
| Azure 429 (the free tier does this on ordinary drilling) | `provider-rate-limited` → HTTP 429, "Too many attempts at once." |
| Locale Azure cannot assess | `locale-unsupported` (422), not a generic error. |
| Learner said nothing | `nothing-heard` (422). |
| Learner said a different sentence | `off-target` (422) — and the diagnosis refuses to name vowels in it. |
| Recording too small / wrong format | `audio-unusable` (400), refused locally without spending a request or a quota slot. |
| Safari (`MediaRecorder` gives MP4/AAC, which Azure rejects) | `supported: false` on the hook, so no record button is offered. |
| Microphone denied | `microphone-unavailable`. |

None of these throw. A Canvas session survives every one of them.

## Changing the provider later

1. Add a row to `PROVIDER_ROWS` in `lib/speech/capabilities.ts` (order within a capability is the
   preference order).
2. Implement the capability under `lib/speech/<provider>/`, producing the **same** schema —
   `PronunciationEvidence` for assessment, a streamed body for TTS.
3. Add a branch in `lib/speech/pronunciation.ts` (assessment) or the route (TTS).
4. Nothing else changes. No caller names a vendor.

For an A/B test, `preferredFor(capability, configured, prefer)` already takes a forced provider, and
`speech-route.ts`'s `MEASURED_PROVIDERS` maps a locale to whichever provider won a listening test for
it. That table is deliberately empty — see §43 on why vendor coverage claims are not evidence.
