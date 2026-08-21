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
      </div>
    </div>
  );
}
