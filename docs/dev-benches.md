# Dev-preview benches — three surfaces, all local only

Written 2026-08-18, renamed 2026-08-20. **Not to be confused with `nemesis-lab.md`**, which
documents the Lab at `/dev/lab` — a different surface with a different purpose. These three are
small single-question benches under `/dev-preview`; that one is the observability environment for
parsing and teaching. Both files briefly shared a filename, which is the only thing they had in
common.

These are development surfaces. They refuse to run when `NODE_ENV` is `production`, and none is
reachable from the product.


Written 2026-08-18. These are development surfaces. Both refuse to run when `NODE_ENV` is
`production`, and neither is reachable from the product.

## Why they exist

Two decisions in the canvas contract cannot be made by reading code. §42 asks which representation a
concept should get, and the only way to know whether the ladder behaves is to run a real concept
down it and look. §43 asks which speech provider sounds native in a particular locale, and the only
way to know is to listen. Everything else in this repository can be settled by a test; these two
cannot.

## 1. Visual ladder — `/dev-preview/visual-lab`

Type a concept — *aspirin*, *nephron*, *T-cell receptor signalling*, *mitochondrion*, *hemoglobin* —
and the page shows, for that one concept:

- what kind of picture was needed;
- whether a canonical chemical structure resolved, and what the resolver returned;
- every reference-image candidate found, each with its provenance, its **per-file** licence, its
  credit line and a link to the original;
- which rung of the ladder won, and the router's own sentence explaining why;
- the actual drawing, rendered by the same component the Canvas uses.

**It calls the production router.** `routeVisual()` decides, not the page. A lab that made its own
decision would show a picture of the ladder rather than the ladder, and would keep agreeing with
itself long after production stopped agreeing with it.

The `explain` / `locate` switch is worth playing with: `locate` means the learner would be marked
right or wrong against the picture, and flipping it is what makes a generated illustration
unreachable. Watching that happen is half the point of the surface.

## 2. TTS bake-off — `/dev-preview/tts-lab`

Pick a locale, type a phrase, press **Speak all**. Every provider that has an API key set on the
machine synthesises the same sentence, and you get playback, measured latency, the character count,
and five rating axes: native accent, pronunciation, prosody, naturalness, conversational pacing.

Keys are read from the environment: `XAI_API_KEY`, `CARTESIA_API_KEY`, `ELEVENLABS_API_KEY`,
`GOOGLE_TTS_API_KEY`. Cartesia and ElevenLabs additionally need a voice id
(`CARTESIA_VOICE_ID`, `ELEVENLABS_VOICE_ID`) because guessing an identifier produces a 404 that reads
like the provider being broken. A provider with no key shows as **unavailable rather than hidden**,
so the bench never looks complete when it is not.

Three rules make this a measurement rather than an endorsement:

- **A locale is required; `auto` is refused.** Four providers on `auto` are four guesses at which
  Spanish to speak.
- **All five axes, or the rating does not count.**
- **One rated provider is never a winner** — nor is a tie.

Ratings persist to `.nemesis-lab/tts-bakeoff.json`, which is gitignored: they were measured on one
machine and are not a fact about the product until somebody decides they are. **The bench never edits
`speech-route.ts`.** It prints the exact line to add to `MEASURED_PROVIDERS`, and a human commits it.

### Prices, and why most of them read "not priced"

Every rate in the provider table carries **where it came from**, and the three levels are not
degrees of the same thing:

- **invoiced** — this is what Nemesis is actually billed and can be read off a statement.
- **published** — somebody opened the vendor's pricing page on a stated date and copied it.
- **recalled** — it came from somebody's memory and **has not been checked against anything**.

A recalled figure is never turned into a cost. The bench prints "not priced" instead, because a
price and a hypothesis about a price must not render to the same number of decimal places.

Today exactly one provider is settled: **xAI at $4.20 per million characters**, from what
`nemesis-speak` actually bills — and even that is flagged *disputed*, because the brief that
commissioned this work cites $15 from the same vendor. A month of the function's own `tts_spoken`
logs against a statement settles it. The other three are unpriced.

Two things make a single per-million number misleading, and the table records both:

- **How it is sold.** Pay-as-you-go bills what you use. Subscription credits sell a monthly
  allowance, so the effective rate depends on how full the tier runs — a half-empty tier costs
  double its headline rate, and a per-million column silently assumes it is always full.
- **Voice family.** One vendor can price basic, neural and studio voices an order of magnitude
  apart, so "the Google price" is meaningless without naming the tier — and the tier is exactly what
  a language lesson is choosing.

## Running the acceptance harness instead

If you want the claims checked rather than the surfaces looked at:

```
pnpm --filter @nemesis/web exec tsx scripts/visual-ladder-acceptance.mts
```

Thirty-one checks against the production router. It runs against **injected provider responses** by
default and says so in its own output; pass `--live` to run the same checks against PubChem and
Wikimedia Commons from a machine with outbound access.

Six of them launch a real browser, and they are the ones that prove the chemistry is drawn rather
than imagined: identical coordinates across two renders, a stereocentre that visibly changes the
picture, dark mode changing colour without moving a single bond, a small molecule drawing as a
structure instead of collapsing into text, a highlighted group, and a full reaction scheme with its
conditions over the arrow. They skip loudly if the depiction library or Playwright is missing.

The last thirteen cover §44's five shapes and §45's computed curves, and they need no browser — those are drawn by deterministic
SVG in this repository rather than by a third-party library, so the arithmetic is where the risk
lives and the arithmetic is what they check. A T-account that does not balance, a column total that
does not sum, an angle that disagrees with its own coordinates and forces that do not cancel are each
**refused** rather than drawn. What they do not prove is layout, which needs React built.

## 3. Azure Speech — `/dev-preview/azure-speech`

Added with §47. Pick a locale, hear the voice Azure chose for it, then record yourself and see a
real pronunciation score with the word, the sound and what you likely produced instead.

**It calls the production routes.** `/api/speech/voices`, `/api/speech/tts` and
`/api/speech/pronunciation` — the same ones a lesson will use. That is the entire value: a bench
with its own path could pass while the real path is broken. If this page works, the Azure credential
and region are right and everything remaining is wiring.

The recording is sent to the assessor and released. Nothing stores it.
