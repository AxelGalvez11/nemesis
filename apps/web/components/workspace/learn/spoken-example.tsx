"use client";

// A sentence the learner is meant to HEAR, with the button that says it.
//
// 🔴🔴 THIS IS THE SURFACE THE WHOLE LANGUAGE LANE WAS MISSING. §43's router, §47's Azure
// integration, the voice catalogue and `/api/speech/tts` were all built and none of them could be
// reached from a conversation, because a reply was prose and prose has no locale. The owner heard
// the consequence directly: asked for German, Nemesis answered in text, and what audio there was
// came from the one provider any code path could reach.
//
// 🔴 THE VARIETY IS NAMED ON SCREEN, WHICH IS NOT DECORATION. `speech-route.ts` refuses to speak a
// target-language utterance without a locale precisely because a learner taught the wrong accent
// cannot tell from the sound. Printing the tag is the other half of that: the one thing that makes
// a wrong variety visible to the person it is being taught to.
//
// 🔴 IT IS A BUTTON, NOT AN AUTOPLAY. Speech on this surface is a second channel the learner opts
// into — the same reason `canvas-speech.ts` refuses to read explanations aloud. A pronunciation
// example that spoke itself on render would talk over the answer it belongs to, and would do it
// again on every re-render.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { usePronunciationAttempt } from "./use-pronunciation-attempt";

/** How each verdict reads on the page. The words are the diagnosis's, not ours. */
const VERDICT_TONE: Record<string, string> = {
  "close": "text-(--ui-text-secondary)",
  good: "text-(--ui-text-secondary)",
  "needs-work": "text-(--ui-text-primary)",
  "not-assessable": "text-(--ui-text-quaternary)",
  "off-target": "text-(--ui-text-primary)",
};

export function SpokenExample({
  locale,
  onSpeak,
  onStop,
  speaking,
  text,
}: {
  /** BCP-47, already canonicalised by the parser. Shown, because the variety is the material. */
  locale: string;
  onSpeak: () => void;
  onStop: () => void;
  speaking: boolean;
  text: string;
}) {
  /**
   * 🔴🔴 THE DOOR ONTO A SCORER THAT HAD NONE. §47 shipped Azure pronunciation assessment — word,
   * syllable and phoneme level, with the alternative the recogniser considered — and
   * `usePronunciationAttempt` had ZERO callers anywhere in the product. Built, tested, paid for in
   * review, and unreachable from every screen a learner can open.
   *
   * 🔴 IT BELONGS HERE AND NOWHERE ELSE, which is why this is the fix rather than a new page. The
   * scorer needs exactly two things — a sentence and the variety it should be said in — and this
   * component is the only place in the product that has both. A separate practice screen would
   * have had to invent them.
   */
  const attempt = usePronunciationAttempt();
  const scored = attempt.result;

  return (
    <div className="my-2 flex items-start gap-2.5 rounded-[8px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) px-3 py-2.5">
      {/* 🔴 ONE BUTTON, TWO STATES, the same rule `ReplyActions` holds: a separate stop control
          would be dead on every example that is not currently playing. */}
      <button
        aria-label={speaking ? `Stop` : `Hear this in ${locale}`}
        className={cn(
          "mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full",
          "text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)",
        )}
        onClick={speaking ? onStop : onSpeak}
        title={speaking ? "Stop" : `Hear this in ${locale}`}
        type="button"
      >
        <Codicon name={speaking ? "debug-stop" : "unmute"} size="15px" />
      </button>

      <div className="min-w-0 flex-1">
        {/* Not markdown. This is an utterance, and a synthesiser reading `**bien**` aloud says the
            asterisks — `canvas-speech.ts` refuses notation for the same reason. */}
        <p
          className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
          lang={locale}
        >
          {text}
        </p>
        <p className="mt-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) tabular-nums">
          {locale}
        </p>

        {/* 🔴 THE WAVEFORM IS EVIDENCE, NOT DECORATION — the same live strip dictation shows,
            fed by the level this attempt's recorder already publishes. It sits UNDER the
            sentence, never over it: the learner has to keep READING the line while saying it,
            which is the one way this differs from dictation's take-over-the-composer strip. */}
        {attempt.recording && (
          <div className="mt-1.5 flex" data-testid="attempt-waveform">
            <CanvasVoiceBars live />
          </div>
        )}

        {/* 🔴 THE VERDICT IS THE DIAGNOSIS'S OWN SENTENCE. `pronunciation-diagnosis.ts` already
            bounds it to a few words and already refuses to speak when it has nothing to say; a
            second opinion written here would be this file guessing at a score it cannot see. */}
        {attempt.assessing && (
          <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Listening back…</p>
        )}
        {!attempt.assessing && scored?.diagnosis.headline && (
          <p className={cn("mt-2 text-[length:var(--canvas-text-meta)]", VERDICT_TONE[scored.diagnosis.verdict] ?? "text-(--ui-text-secondary)")}>
            {scored.diagnosis.headline}
            {typeof scored.diagnosis.overall === "number" && (
              // The diagnosis carries a 0-1 fraction (evidence scores are normalised); the
              // percent is made here, at the one place a percent is shown.
              <span className="ml-1.5 text-(--ui-text-quaternary) tabular-nums">{Math.round(scored.diagnosis.overall * 100)}%</span>
            )}
          </p>
        )}
        {/* 🔴 A REFUSED MICROPHONE IS SAID PLAINLY. The hook names four different failures and a
            silent button would make every one of them look like the same broken control. */}
        {attempt.failure && !attempt.recording && (
          <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            {attempt.failure === "not-signed-in"
              ? "Sign in to have this scored."
              : attempt.failure === "microphone-unavailable"
                ? "Nemesis could not reach a microphone. It may need permission."
                : attempt.failure === "recording-unsupported"
                  ? "This browser cannot record in a format the scorer accepts."
                  : "That attempt could not be scored."}
          </p>
        )}
      </div>

      {/* 🔴 ONLY WHERE IT CAN WORK. Safari records in a format Azure's endpoint refuses, so
          `supported` is false there and no button appears — rather than one that always fails. */}
      {attempt.supported && (
        <button
          aria-label={attempt.recording ? "Stop and score" : `Say it back in ${locale}`}
          className={cn(
            "mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full transition-colors",
            attempt.recording
              ? "bg-(--ui-bg-elevated) text-(--ui-text-primary)"
              : "text-(--ui-text-secondary) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary)",
          )}
          disabled={attempt.assessing}
          onClick={() => {
            if (attempt.recording) void attempt.stop();
            else void attempt.start({ locale, text });
          }}
          title={attempt.recording ? "Stop and score" : `Say it back in ${locale}`}
          type="button"
        >
          <Codicon name={attempt.recording ? "debug-stop" : "mic"} size="15px" />
        </button>
      )}
    </div>
  );
}
