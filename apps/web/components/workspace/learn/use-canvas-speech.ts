"use client";

// Playing what `canvas-speech.ts` decided to say — the I/O half, kept out of the component the
// same way `useCanvasDictation` and `useHandwritingCapture` are. Neither of those has a test file
// and nor does this: all three wrap a browser API (Web Speech, fetch+FormData, `Audio` here) that
// this app's test runner cannot exercise without a DOM. The decision logic each calls into —
// `speechFor`, `shouldOpenDictation` — is what actually gets tested.
//
// 🔴 AND THAT SPLIT IS WHY THE ACCEPTANCE CHECK FOR VOICE IS A BROWSER, NOT A SUITE. No test in
// this repo can hear audio. A green run proves the text was chosen correctly and the request was
// shaped correctly; it proves nothing about whether a learner hears a voice. Only a real browser
// with a real network response does that, and any claim otherwise is unearned.
//
// 🔴 ONE UTTERANCE AT A TIME, AND A NEW ONE CANCELS THE OLD. The canvas can move on while audio is
// still playing — the learner answers fast, or presses continue. Speech that outlives the screen it
// belongs to is worse than silence: the learner hears the previous question read over the current
// one. Every path that starts audio stops whatever was playing first.

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Why nothing was heard. Distinct from `SpeechRefusal`, which is why nothing was SENT. */
export type SpeechFailure =
  | "not-signed-in"
  /** The provider key is not set on the function. Nameable so "not configured" and "broken" differ. */
  | "not-configured"
  /** This month's conversational voice allowance is used up. NOT an error: it is
   *  an offer, and the canvas keeps working in text exactly as before. */
  | "voice-quota"
  | "provider-error"
  /** The browser refused to play — autoplay policy, no output device. */
  | "playback-blocked";

/**
 * How an utterance should be synthesised, as `speech-route.ts` decided it.
 *
 * 🔴 PASSED PER UTTERANCE, NOT SET ON THE HOOK. §43's whole point is that a language lesson speaks
 * its example in the target variety and the correction that follows it in the language of
 * instruction — two locales, seconds apart, in one session. A hook-level setting could not express
 * that, and would quietly read the correction in the accent being taught.
 */
export interface SpokenVoice {
  /** BCP-47, or `auto`. Omitted entirely when `auto`, so the request body is unchanged from before §43. */
  locale?: string;
  speed?: number;
  /**
   * Which synthesiser says this.
   *
   * 🔴 THIS FIELD IS WHY THE ROUTER WAS NOT ACTUALLY ROUTING (§47). `routeSpeech` has returned a
   * `provider` since §43 and grew a second value in §47 — and this hook ignored it and posted every
   * utterance to `nemesis-speak`. A decision that is computed, logged, tested, and then discarded at
   * the call site is worse than no decision: every test of the router passed, the contract said two
   * providers, and one of them could never speak.
   *
   * Defaults to xAI, so the Canvas lane is byte-identical to what shipped.
   */
  provider?: "xai" | "azure";
}

export interface CanvasSpeech {
  /** True from the moment a request goes out until playback ends or fails. */
  speaking: boolean;
  /** The last thing that went wrong, or null. Cleared when a new utterance starts. */
  failure: SpeechFailure | null;
  /**
   * Say something, once.
   *
   * `key` is the moment's identity: calling twice with the same key is a no-op, which is what stops
   * a re-render reading the question again. Resolves when playback ENDS — the caller uses that
   * moment to decide whether to open the microphone, so resolving early would open it over the
   * tail of the question.
   */
  speak: (key: string, text: string, voice?: SpokenVoice) => Promise<void>;
  /**
   * Say something again because the learner asked for it.
   *
   * 🔴 A SEPARATE METHOD RATHER THAN A FLAG ON `speak`, BECAUSE IT DELIBERATELY BREAKS `speak`'S ONE
   * RULE. `speak` refuses a key it has already said, which is what stops a re-render reading the
   * question aloud a second time. A learner pressing "hear it again" is the opposite situation: the
   * repeat IS the request, and the whole point of a pronunciation drill is hearing the same phrase
   * five times. Putting that behind an argument to `speak` would leave one function whose central
   * guarantee is conditional; a second name keeps the guarantee absolute and the exception visible.
   *
   * 🔴 AND IT IGNORES VOICE MODE, WHICH IS THE CALLER'S JOB TO GET RIGHT. Voice mode governs whether
   * Nemesis speaks UNPROMPTED. Pressing a play button is a prompt.
   */
  replay: (text: string, voice?: SpokenVoice) => Promise<void>;
  /** Stop immediately and forget what was playing. Safe to call when nothing is. */
  stop: () => void;
}

export function useCanvasSpeech(): CanvasSpeech {
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<SpeechFailure | null>(null);

  /** The element currently playing, so a new utterance can cancel it. */
  const playing = useRef<HTMLAudioElement | null>(null);
  /** Object URLs outlive their element and leak the whole MP3 until revoked. */
  const objectUrl = useRef<string | null>(null);
  /** Keys already spoken. A re-render must not re-read the question on screen. */
  const spoken = useRef(new Set<string>());
  /** Set when the component is going away, so a request in flight cannot set state afterwards. */
  const alive = useRef(true);
  /** How many deliberate repeats have been asked for, so each gets a key of its own. */
  const replays = useRef(0);

  const releaseAudio = useCallback(() => {
    const element = playing.current;
    playing.current = null;
    if (element) {
      element.onended = null;
      element.onerror = null;
      element.pause();
    }
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    releaseAudio();
    if (alive.current) setSpeaking(false);
  }, [releaseAudio]);

  const speak = useCallback(
    async (key: string, text: string, voice?: SpokenVoice) => {
      if (spoken.current.has(key)) return;
      // Claimed BEFORE the await, not after. Two renders can call this in the same tick, and a
      // check-then-await-then-mark would send two paid requests for one question.
      spoken.current.add(key);

      releaseAudio();
      if (!alive.current) return;
      setFailure(null);
      setSpeaking(true);

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (alive.current) { setFailure("not-signed-in"); setSpeaking(false); }
          return;
        }

        // 🔴 TWO PROVIDERS, TWO ENDPOINTS, AND THE CHOICE IS THE ROUTER'S RATHER THAN THIS HOOK'S.
        // Azure lives behind a Next route because its key is in Vercel; xAI lives behind a Supabase
        // function because its key is in that project's secrets. The difference is where a credential
        // sits, which is exactly the sort of thing a caller should not have to know — so the router
        // names a provider and this picks the door.
        //
        // 🔴 AZURE REQUIRES A LOCALE AND THIS DOES NOT PAPER OVER THAT. `/api/speech/tts` refuses
        // without one, deliberately (§43: guessing a variety teaches the wrong accent invisibly). A
        // route that asked for Azure without a locale is a caller bug, and it fails loudly here
        // rather than being quietly downgraded to a provider that would have guessed.
        const useAzure = voice?.provider === "azure";
        const res = useAzure
          ? await fetch("/api/speech/tts", {
              body: JSON.stringify({
                fallback: true,
                locale: voice?.locale,
                ...(typeof voice?.speed === "number" ? { rate: voice.speed } : {}),
                text,
              }),
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              method: "POST",
            })
          : await fetch(`${supabaseUrl}/functions/v1/nemesis-speak`, {
              // 🔴 OMITTED WHEN UNSET RATHER THAN SENT AS A DEFAULT. `nemesis-speak` already has
              // defaults for both, and sending `locale: "auto"` explicitly would make the function
              // unable to tell "the caller chose auto" from "the caller is old and sends neither".
              body: JSON.stringify({
                text,
                ...(voice?.locale && voice.locale !== "auto" ? { locale: voice.locale } : {}),
                ...(typeof voice?.speed === "number" ? { speed: voice.speed } : {}),
              }),
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              method: "POST",
            });

        if (!res.ok) {
          if (alive.current) {
            setFailure(
              res.status === 402 ? "voice-quota"
                : res.status === 503 ? "not-configured"
                : "provider-error",
            );
            setSpeaking(false);
          }
          return;
        }

        const blob = await res.blob();
        // A zero-byte 200 plays as silence and reads exactly like a canvas choosing not to speak.
        // The function already refuses this; checking again is cheap and the failure is invisible.
        if (blob.size === 0) {
          if (alive.current) { setFailure("provider-error"); setSpeaking(false); }
          return;
        }
        // Stopped, unmounted, or superseded while the request was in flight.
        if (!alive.current || !spoken.current.has(key)) return;

        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        const element = new Audio(url);
        playing.current = element;

        await new Promise<void>((resolve) => {
          element.onended = () => {
            if (playing.current === element) releaseAudio();
            if (alive.current) setSpeaking(false);
            resolve();
          };
          element.onerror = () => {
            if (playing.current === element) releaseAudio();
            if (alive.current) { setFailure("playback-blocked"); setSpeaking(false); }
            resolve();
          };
          // Autoplay policy rejects play() when the learner has not interacted with the page.
          // Turning voice mode on IS an interaction, so this is rare — but it must resolve rather
          // than hang, or the caller waits for a microphone moment that never comes.
          void element.play().catch(() => {
            if (playing.current === element) releaseAudio();
            if (alive.current) { setFailure("playback-blocked"); setSpeaking(false); }
            resolve();
          });
        });
      } catch {
        if (alive.current) { setFailure("provider-error"); setSpeaking(false); }
      }
    },
    [releaseAudio],
  );

  // A canvas left mid-sentence would keep talking into an unmounted component.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      releaseAudio();
    };
  }, [releaseAudio]);

  const replay = useCallback(
    async (text: string, voice?: SpokenVoice) => {
      // A key nothing else can hold, so `speak`'s already-said check never short-circuits a repeat
      // the learner explicitly asked for. Counting rather than randomising keeps it deterministic.
      replays.current += 1;
      await speak(`replay:${replays.current}`, text, voice);
    },
    [speak],
  );

  return { failure, replay, speak, speaking, stop };
}
