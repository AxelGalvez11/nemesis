"use client";

// "Say that again" — the one control a language learner actually needs (§47).
//
// 🔴 THIS IS NOT VOICE MODE AND MUST NOT BE GATED ON IT. Voice mode decides whether Nemesis reads
// things aloud UNPROMPTED, and a learner who keeps it off is saying "do not narrate my questions".
// That is a different preference from "I never want to hear how this word sounds". The sound of a
// foreign phrase is not a second channel for text — it IS the material, it cannot be read off the
// page, and it has to be repeatable as many times as the learner wants.
//
// 🔴 IT APPEARS ONLY WHERE THERE IS A LANGUAGE TO HEAR. `replayableLocale` returns null for every
// subject that is not a language, so a law student never sees this and a Spanish learner sees it on
// the Spanish half of the pair and not on the English one. Nothing here inspects the words: script
// detection would be wrong on exactly the pair most learners study, since Spanish and English share
// an alphabet.
//
// 🔴 AND IT IS ALWAYS A PRESS, NEVER AUTOMATIC. Audio that starts by itself on a page somebody is
// reading is the thing every learner turns off first.

import { useCallback, useState } from "react";

import { TARGET_LANGUAGE_SPEED } from "@/lib/learn/speech-route";

import type { SpokenVoice } from "./use-canvas-speech";

/**
 * What this needs to do its job, and nothing else.
 *
 * 🔴 TWO FIELDS RATHER THAN THE WHOLE SPEECH HOOK, so nothing here can start narrating, cancel an
 * utterance it did not begin, or read the failure state of something unrelated. A component handed
 * more capability than it uses is a component that will eventually use it.
 */
export interface ReplayVoice {
  readonly replay: (text: string, voice?: SpokenVoice) => Promise<void>;
  /** True while any audio is playing, so the control disables rather than overlapping itself. */
  readonly speaking: boolean;
}

export interface HearAgainProps {
  /** The phrase to say. Already known to be in `locale` — see `replayableLocale`. */
  readonly phrase: string;
  /** BCP-47, with the variety the material used. */
  readonly locale: string;
  readonly voice: ReplayVoice;
}

export function HearAgain({ locale, phrase, voice }: HearAgainProps) {
  const [failed, setFailed] = useState(false);

  const onPress = useCallback(() => {
    setFailed(false);
    void voice
      .replay(phrase, {
        locale,
        // 🔴 THE PROVIDER IS NAMED HERE BECAUSE THE VARIETY IS THE POINT. This is the one lane where
        // "some Spanish" is the wrong answer, and Azure is the integration that can be told which.
        provider: "azure",
        // Natural pace. Slowing an example teaches a rhythm the language does not have — connected
        // speech and stress timing are exactly what disappears, and exactly what the learner has to
        // be able to hear later.
        speed: TARGET_LANGUAGE_SPEED,
      })
      .catch(() => setFailed(true));
  }, [locale, phrase, voice]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        aria-label={`Hear "${phrase}" again`}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary) disabled:opacity-40"
        disabled={voice.speaking}
        onClick={onPress}
        title={`Hear it in ${locale}`}
        type="button"
      >
        {/* A speaker, drawn rather than imported, so it inherits the Canvas's colour like every
            other mark on the page. */}
        <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
          <path d="M8 2.5 4.5 5.5H2v5h2.5L8 13.5v-11Z" fill="currentColor" />
          <path d="M11 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
        </svg>
      </button>
      {failed && (
        // Named, not silent. A learner pressing play and hearing nothing needs to know the sound
        // failed rather than concluding the phrase has no pronunciation worth hearing.
        <span className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Audio unavailable.</span>
      )}
    </span>
  );
}
