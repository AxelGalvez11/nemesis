// HOW an answer is read aloud: which words, in which voice, in what order.
//
// 🔴🔴 THIS FILE EXISTS BECAUSE THE ANSWER'S AUDIO WAS READING THE WIRE FORMAT. The automatic lane
// handed `reply.text` — the RAW model output — straight to the synthesiser, so an answer containing
// `[say: es-MX | Buenos días]` was read as "bracket say colon…", and an answer containing a SMILES
// fence spelled the notation aloud. The manual Read-aloud button had the opposite defect: it got the
// pre-flattened copy text, where the Spanish sentence had been folded into the prose — so the one
// sentence that NEEDED the language lane's named variety was read by whichever English voice the
// learner picked. Two callers, two different texts, both wrong in different ways.
//
// One plan, built here, fixes both: the raw reply is split by `replySegments` — the same parser the
// SCREEN uses, so what is heard is what is shown — and each piece travels with its own provider,
// locale and pace:
//
//   · prose        → the learner's chosen reading voice (Settings), at answer pace.
//   · [say: …]     → the language lane: `routeSpeech` with the language purpose, which names the
//                    stated variety and refuses to guess one. Owner, 2026-08-23: *"if a response
//                    requires both the xAI voice and the Azure voice, then the output will read
//                    with the xAI voice and also the Azure voice."*
//   · drawings     → skipped. A diagram has no reading.
//
// 🔴 SEQUENTIAL, NEVER CONCURRENT. The plan is an ORDERED list played into one sink, so two
// providers never make sound at once — the invariant `one-provider-at-a-time.test.ts` protects
// survives becoming per-utterance instead of per-reply.
//
// 🔴 THE OPENER IS SPLIT OFF FOR LATENCY, AND THE NUMBERS ARE WHY. Owner, 2026-08-23: *"if people
// choose for it to answer out loud automatically, then it needs to come in at the same time as the
// text."* The reply arrives as ONE JSON object (there is no token stream on this lane), so the
// earliest possible sound is bounded by how fast the FIRST synthesis request returns — and that
// scales with the characters sent. A 600-character first request is the previous chunking; sending
// the first sentence alone first means the first audible word arrives while the rest of the answer
// is still being synthesised behind it, into the same continuous timeline.
//
// PURE. No React, no fetch. `use-response-audio.ts` owns the I/O.

import type { ReadingVoice } from "@/lib/speech/reading-voice";

import { SPEECH_CHAR_LIMIT, speechChunks, stripFormatting } from "./canvas-speech";
import { replySegments } from "./reply-visuals";
import { ANSWER_SPEED, LOCALE_UNSPECIFIED, routeSpeech, type TtsProvider } from "./speech-route";

/** One synthesis request of a read-aloud answer, with everything the request needs to carry. */
export interface ReplyUtterance {
  readonly text: string;
  readonly provider: TtsProvider;
  /** BCP-47, or `auto` when the provider may identify the language itself. */
  readonly locale: string;
  /**
   * The learner's chosen speaker — prose only.
   *
   * 🔴 ABSENT ON A TARGET-LANGUAGE LINE, AND THE OMISSION IS THE POINT (§47). A `[say: es-MX | …]`
   * sentence is spoken by a voice picked from the catalogue FOR that variety, deterministically, so
   * the same lesson sounds the same tomorrow. Sending the canvas speaker would ask a Mexican
   * Spanish sentence to be read by whichever English voice the learner liked.
   */
  readonly voiceId?: string;
  /** Synthesis pace, from `speech-route.ts` — never the listener's playback speed. */
  readonly speed: number;
}

/**
 * The longest first request worth splitting off.
 *
 * Synthesis latency scales with the characters sent, so the opener exists to be SHORT. Past
 * roughly a fifteen-second sentence the split stops buying anything worth an extra request, and a
 * "sentence" that long with no seam is usually not prose anyway.
 */
export const OPENER_BOUND = 220;

/**
 * Stray one-line tokens the screen's parser deliberately leaves visible when they are malformed.
 *
 * 🔴 VISIBLE ON SCREEN, STRIPPED FROM SPEECH, AND THE ASYMMETRY IS DELIBERATE. `reply-visuals.ts`
 * keeps a malformed `[say: …]` or an unresolved `[figure 2]` in the prose because a sentence that
 * silently vanishes is worse than a visible stray token — the learner can SEE something went
 * wrong. A synthesiser reading "bracket figure two" has no such honesty to offer: it is just
 * noise, so here the tokens go.
 */
const STRAY_TOKENS = /\[(?:figure\s+\d{1,2}|(?:smiles|reaction|reaction-smiles)\s*:[^\]\n]*|say\s*:[^\]\n]*)\]/gi;

/** What the synthesiser is handed for a prose run: markdown stripped, wire tokens gone. */
export function sayableProse(text: string): string {
  return stripFormatting(text.replace(STRAY_TOKENS, " "));
}

/**
 * The first sentence split from the rest, or null when splitting buys nothing.
 *
 * Null when there is no sentence seam, when the first sentence is already most of the text, or
 * when it is longer than `OPENER_BOUND` — in each case one request is as good as two.
 */
export function openerSplit(text: string, bound: number = OPENER_BOUND): { opener: string; rest: string } | null {
  const seam = text.search(/(?<=[.!?…])\s/);
  if (seam === -1 || seam > bound) return null;
  const opener = text.slice(0, seam).trim();
  const rest = text.slice(seam).trim();
  if (!opener || !rest) return null;
  return { opener, rest };
}

/** The chosen reading voice, as the fields a prose utterance travels with. Mirrors the rule in
 *  `use-canvas-voice.ts`: an Azure voice carries the locale it was catalogued under, because
 *  `/api/speech/tts` refuses to guess one; xAI takes `auto` and reads what it sees. */
function proseFields(voice: ReadingVoice): { locale: string; provider: TtsProvider; voiceId: string } {
  return voice.provider === "azure"
    ? { locale: voice.locale ?? LOCALE_UNSPECIFIED, provider: "azure", voiceId: voice.id }
    : { locale: LOCALE_UNSPECIFIED, provider: "xai", voiceId: voice.id };
}

/**
 * One prose utterance in the learner's chosen voice — the shape `replySpeechPlan` gives every
 * prose chunk, importable on its own.
 *
 * 🔴 THIS IS WHAT THE EARLY-SPOKEN OPENER IS SYNTHESISED AS (see `spoken-opener.ts`), and it lives
 * HERE so the fields cannot drift from the plan's own prose branch: the continuation in
 * `use-response-audio.ts` matches the primed opener against `plan[0]` by text, which is only sound
 * while both were built by the same hands.
 */
export function openerUtterance(text: string, voice: ReadingVoice): ReplyUtterance {
  return { ...proseFields(voice), speed: ANSWER_SPEED, text };
}

/**
 * The ordered synthesis plan for one answer.
 *
 * 🔴 FED THE RAW REPLY, NEVER A FLATTENED COPY. The split is what routes a marked sentence to the
 * language lane; text that was flattened first has already lost the marks, which is exactly the
 * manual-button defect described in the header.
 */
export function replySpeechPlan(text: string, voice: ReadingVoice): ReplyUtterance[] {
  const prose = proseFields(voice);
  const plan: ReplyUtterance[] = [];
  let said = 0;

  for (const segment of replySegments(text)) {
    // A diagram has no reading; its introducing sentence is already in the prose around it.
    if (segment.kind === "visual") continue;

    if (segment.kind === "target_language") {
      // 🔴 THE ROUTER DECIDES, NOT THIS CALLER — the same rule `speakExample` states. It refuses a
      // missing locale, refuses notation, holds the natural pace a drill needs, and names the
      // provider that can name the variety. A refusal skips the sentence rather than falling back
      // to the prose voice: hearing `es-MX` read by an English speaker is the exact miseducation
      // §43 exists to prevent, and the sentence is still on screen with its own replay button.
      said += 1;
      const route = routeSpeech({
        key: `reply-say:${said}`,
        moment: { kind: "target_language", text: segment.text },
        purpose: "language_learning",
        targetLocale: segment.locale,
      });
      if (route.decision !== "speak") continue;
      plan.push({
        locale: route.locale,
        provider: route.provider,
        speed: route.speed,
        text: route.utterance.text,
      });
      continue;
    }

    const clean = sayableProse(segment.text);
    if (!clean) continue;

    // 🔴 THE OPENER APPLIES TO THE PLAN'S FIRST WORDS ONLY. Splitting every run's first sentence
    // would double the request count for no one's benefit — latency is only perceptible before the
    // first sound exists.
    if (plan.length === 0) {
      const split = openerSplit(clean);
      if (split) {
        plan.push({ ...prose, speed: ANSWER_SPEED, text: split.opener });
        for (const chunk of speechChunks(split.rest, SPEECH_CHAR_LIMIT)) {
          plan.push({ ...prose, speed: ANSWER_SPEED, text: chunk });
        }
        continue;
      }
    }

    for (const chunk of speechChunks(clean, SPEECH_CHAR_LIMIT)) {
      plan.push({ ...prose, speed: ANSWER_SPEED, text: chunk });
    }
  }

  return plan;
}
