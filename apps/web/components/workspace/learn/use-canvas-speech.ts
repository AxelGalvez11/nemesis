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

import { type AudioSink, openAudioSink, pumpInto } from "@/lib/learn/audio-stream";
import { ttsRequest } from "@/lib/learn/tts-request";
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
  /**
   * WHICH SPEAKER. The learner's own choice, from `canvas-voices.ts`.
   *
   * 🔴 IT RIDES HERE RATHER THAN ON THE HOOK FOR THE SAME REASON `locale` DOES, AND THE PRODUCT
   * CONTRACT ALREADY ANTICIPATED IT: §43 records that "the voice identity is still fixed … for a
   * language lesson the speaker is part of the material, not a skin". A per-utterance field is what
   * lets a target-language example keep its own speaker later while the learner's chosen voice
   * reads everything else.
   *
   * Omitted when unset, so a request from a canvas that has never opened the picker is byte-
   * identical to what shipped before this existed.
   */
  voiceId?: string;
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
  /** The sink feeding it. Its object URL outlives the element and leaks the MP3 until disposed. */
  const audioSink = useRef<AudioSink | null>(null);
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
      element.removeAttribute("src");
      element.load();
    }
    audioSink.current?.dispose();
    audioSink.current = null;
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

        // 🔴🔴 ONE PROVIDER, ONE REQUEST, DECIDED IN A PURE FUNCTION. This used to be two inline
        // `fetch` calls behind a ternary, which meant "only the selected provider is involved" could
        // only be checked by reading the hook and believing it. `ttsRequest` builds exactly one url
        // and one body from the provider on the utterance, and `tts-request.test.ts` asserts the
        // negative directly: an xAI plan never names Azure's endpoint and vice versa.
        //
        // 🔴 AZURE REQUIRES A LOCALE AND THIS DOES NOT PAPER OVER THAT. `/api/speech/tts` refuses
        // without one, deliberately (§43: guessing a variety teaches the wrong accent invisibly). A
        // caller that asks for Azure without a locale fails loudly rather than being quietly
        // downgraded to a provider that would have guessed.
        const plan = ttsRequest({
          provider: voice?.provider === "azure" ? "azure" : "xai",
          supabaseAnonKey,
          supabaseUrl,
          text,
          token,
          ...(voice?.locale ? { locale: voice.locale } : {}),
          ...(typeof voice?.speed === "number" ? { rate: voice.speed } : {}),
          ...(voice?.voiceId ? { voiceId: voice.voiceId } : {}),
        });
        const res = await fetch(plan.url, plan.init);

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

        // Stopped, unmounted, or superseded while the request was in flight.
        if (!alive.current || !spoken.current.has(key)) return;

        // 🔴🔴 STREAMED INTO THE ELEMENT RATHER THAN COLLECTED INTO A BLOB (§48). This was
        // `await res.blob()`, which waits for the LAST byte before the FIRST one can be heard — so
        // both routes streamed and the client threw that away, on every question voice mode reads.
        // The sink attaches its source immediately and the bytes flow into it, which is why the
        // attach happens BEFORE the pump rather than on first bytes: a MediaSource cannot accept an
        // append until it has opened, and it only opens once attached. Found in a real browser.
        const sink = openAudioSink();
        audioSink.current = sink;
        const element = new Audio();
        playing.current = element;
        if (sink.streaming) {
          const opening = sink.src();
          if (opening) element.src = opening;
        }

        let started = false;
        const begin = () => {
          if (started) return;
          const src = sink.src();
          if (!src) return;
          started = true;
          if (!element.src) element.src = src;
          void element.play().catch(() => {
            // Autoplay policy rejects play() when the learner has not interacted with the page.
            // Turning voice mode on IS an interaction, so this is rare — but it must not hang, or
            // the caller waits for a microphone moment that never comes.
            if (playing.current === element) releaseAudio();
            if (alive.current) { setFailure("playback-blocked"); setSpeaking(false); }
          });
        };

        const gone = () => !alive.current || !spoken.current.has(key) || playing.current !== element;
        const bytes = res.body
          ? await pumpInto(sink, res.body, begin, gone)
          : await (async () => {
              const buffer = await res.arrayBuffer();
              if (buffer.byteLength > 0) { await sink.append(new Uint8Array(buffer)); begin(); }
              return buffer.byteLength;
            })();
        if (gone()) return;
        // A zero-byte 200 plays as silence and reads exactly like a canvas choosing not to speak.
        // Both routes already refuse this; checking again is cheap and the failure is invisible.
        if (bytes === 0) {
          if (alive.current) { setFailure("provider-error"); setSpeaking(false); }
          releaseAudio();
          return;
        }
        await sink.end();
        if (gone()) return;
        begin();

        await new Promise<void>((resolve) => {
          const finish = (failed: boolean) => {
            if (playing.current === element) releaseAudio();
            if (alive.current) {
              if (failed) setFailure("playback-blocked");
              setSpeaking(false);
            }
            resolve();
          };
          element.onended = () => finish(false);
          element.onerror = () => finish(true);
          // Already over by the time the listeners were attached — a very short utterance whose
          // last bytes landed while `end()` was resolving. Without this the caller waits forever
          // for a microphone moment that has already passed.
          if (element.ended) finish(false);
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
