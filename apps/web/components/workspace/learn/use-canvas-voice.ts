"use client";

// Voice mode, joined up: the preference, the utterance, and the microphone that opens after it.
//
// 🔴 THIS EXISTS SO `learning-canvas.tsx` DOES NOT GROW A VOICE SECTION. That component is already
// a thousand lines and every feature that has put "just a few lines" into it has made the next one
// harder to read. What it gets from here is two values — a prop bundle for the header and a nonce
// for the composer — and no knowledge of how either is decided.
//
// 🔴 THE PREFERENCES ARE READ ONCE, IN AN EFFECT, NOT DURING RENDER. `localStorage` does not exist
// on the server, and reading it in a `useState` initialiser is the classic hydration mismatch: the
// server renders voice off, the browser renders it on, React discards the tree. Starting from the
// default and correcting after mount means the first paint always matches.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { shouldSpeakAction, speechChunks, SPEECH_CHAR_LIMIT, type SpokenMoment } from "@/lib/learn/canvas-speech";
import { ANSWER_SPEED, LOCALE_UNSPECIFIED, routeSpeech } from "@/lib/learn/speech-route";

import { correctionLead } from "./correction-copy";
import {
  DEFAULT_READING_VOICE,
  READING_VOICE_KEY,
  readReadingVoice,
  type ReadingVoice,
} from "@/lib/speech/reading-voice";
import { useCanvasSpeech, type CanvasSpeech, type SpokenVoice } from "./use-canvas-speech";
import { useResponseAudio, type ResponseAudio } from "./use-response-audio";

export interface CanvasVoice {
  /**
   * The audio of the answer on screen: fetch, playback, and every control over it.
   *
   * 🔴 A CONTROLLER RATHER THAN A `speak()` CALL, AND THAT IS THE ARCHITECTURAL POINT OF §48. Voice
   * used to be fire-and-forget — ask the provider for a file, play it, and afterwards have no idea
   * where in it you were. That is why speed regenerated, why there was no progress bar, and why the
   * only possible control was play/stop. See `use-response-audio.ts`.
   */
  replyAudio: ResponseAudio;
  /**
   * The reply's first sentence, read out of the model's stream MID-TURN — the voice
   * conversation's head start (measured 2026-08-31: the sentence exists 1.6–2.2s in, the full
   * reply at 2.7–4.7s, and the player used to wait for all of it).
   *
   * 🔴 A NO-OP OUTSIDE A VOICE SESSION, AND THE GATE LIVES HERE. `spoken-opener.ts` only watches
   * spoken turns, but this is the arbiter's floor: nothing may start audio uninvited, so the same
   * `alwaysSpeak` that authorises the automatic play below authorises the head start — and it
   * takes the same arbiter path, so a primed opener silences the narration lane exactly the way
   * a pressed play does.
   */
  primeReply: (opener: string) => void;
  /**
   * The turn settled; `replyArrived` says whether a reply is coming to the autoplay effect. When
   * none is — the turn failed, or acted without speaking — a primed head start is sealed so the
   * opener plays out and the conversation loop's "playback finished" rule still fires. When one
   * is, this does nothing: `start` continues the primed timeline itself.
   */
  concludePrime: (replyArrived: boolean) => void;
  /** Speak an arbitrary passage on demand; pressing again repeats it. */
  speakAloud: (text: string) => void;
  /**
   * Speak a sentence in the language being TAUGHT, in the variety it must be heard in.
   *
   * 🔴 A DIFFERENT LANE, NOT A LOUDER `speakAloud`. This is the one call in the product that passes
   * `purpose: "language_learning"`, which is what routes the utterance to Azure and its named
   * catalogue voice rather than to the Canvas provider. Until it existed the language half of §43
   * and the whole of §47 were unreachable from a conversation.
   */
  speakExample: (key: string, locale: string, text: string) => void;
  /** The `key` passed to `speakExample` for the row currently playing, or null. */
  speakingExample: string | null;
  /** Called when the learner starts answering. 🔴 NOT AN OPTIMISATION — Nemesis must not still be
   *  talking while somebody is composing a reply to it. */
  stopSpeaking: () => void;
  /**
   * The learner asking to hear a phrase again (§47).
   *
   * 🔴 EXPOSED SEPARATELY FROM EVERYTHING ABOVE, BECAUSE IT OBEYS DIFFERENT RULES. Everything else
   * above answers a press. This is a press on a phrase in a language being learned, and it kept
   * working when the narration mode existed and was off — hearing how a word sounds was never a
   * preference about narration, which is also why it survived the mode's removal untouched.
   */
  replay: CanvasSpeech["replay"];
  /** True while any audio is playing, so a replay control can disable itself rather than overlap. */
  speaking: boolean;
}

// 🔴🔴 `momentFor` AND THE AUTOMATIC NARRATION LANE ARE GONE — owner, 2026-08-30: *"also remove
// the read outloud."* "Read responses aloud" was the only door into voice mode, and this file's
// own rule (stated when the mic option died the same way on 2026-08-25) is that a lane whose only
// gate is gone goes entirely rather than sitting in the file unable to run. What remains is
// everything a learner PRESSES for: the answer's own play button (`replyAudio`), `speakAloud`,
// the language-example lane, and `replay` — none of which ever depended on the mode.

/**
 * The learner's chosen voice, as the fields an utterance travels with.
 *
 * 🔴 THE PROVIDER COMES FROM THE VOICE AND FROM NOTHING ELSE (§48). Owner, 2026-08-22: *"If the user
 * has selected an xAI voice, only the xAI path should be involved."* One field decides the
 * synthesiser, the speaker id and — for Azure — the locale, so there is no second setting that can
 * disagree with the first and no way for one utterance to reach both providers.
 *
 * 🔴 AZURE GETS THE VOICE'S OWN LOCALE WHEN THE MOMENT DOES NOT NAME ONE. `/api/speech/tts` refuses
 * without a locale, deliberately, and the Canvas lane legitimately has none to give — it sends
 * `auto`, because the provider identifies the language from the text. An Azure voice was catalogued
 * under a locale; that is the one to send, and it is why a stored Azure voice without one resolves
 * back to the default rather than being used.
 */
function utteranceVoice(voice: ReadingVoice, routeLocale: string, speed: number): SpokenVoice {
  if (voice.provider === "azure") {
    return {
      locale: routeLocale && routeLocale !== LOCALE_UNSPECIFIED ? routeLocale : (voice.locale ?? LOCALE_UNSPECIFIED),
      provider: "azure",
      speed,
      voiceId: voice.id,
    };
  }
  return { locale: routeLocale || LOCALE_UNSPECIFIED, provider: "xai", speed, voiceId: voice.id };
}

/** A conversational answer on screen, and a key that changes only when the answer does. */
export interface SpokenReply {
  key: string;
  text: string;
}

// 🔴 THE `runtime` PARAMETER LEFT WITH THE NARRATION LANE — `momentFor` was its only reader.
/**
 * @param alwaysSpeak A voice CONVERSATION is running (owner 2026-08-30, evening: *"it should
 * work like claude where its not real time voice but just quick tts and stt"*): the learner
 * pressed the composer's voice button, so this reply is spoken. 🔴 THIS IS NOT THE AUTOPLAY
 * PREFERENCE RETURNING — that died the same morning (#937), with its toggle. A stored setting
 * spoke every answer for ever; a session speaks them between an explicit press and an explicit
 * stop, and is an ARGUMENT here rather than a mode so there is still one effect, one player,
 * one path.
 */
export function useCanvasVoice(reply: SpokenReply | null = null, alwaysSpeak = false): CanvasVoice {
  /** Counts presses of the on-demand Speak control, so each one is a new utterance key. */
  const aloudPress = useRef(0);
  /**
   * WHICH example row is speaking, or null.
   *
   * 🔴🔴 REPORTED 2026-08-21: *"pressing play on voice makes all the other icons change too."* Every
   * row and the answer's own Read-aloud button were handed one shared `speaking` boolean, so
   * playing the German sentence turned all three examples AND the answer control into stop buttons
   * at once. A boolean cannot say WHICH utterance is playing, and on a surface that can hold
   * several it has to.
   */
  const [speakingExample, setSpeakingExample] = useState<string | null>(null);
  /**
   * WHICH VOICE, from Settings.
   *
   * 🔴 READ HERE, NEVER CHOSEN HERE (§48). Owner, 2026-08-22: *"Canvas should not make the user
   * repeatedly choose a voice."* The picker lives in Settings; this is a subscriber. Everything the
   * Canvas speaks — the automatic lane, the read-aloud row, a highlighted passage — uses this one
   * value, which is what "used everywhere Nemesis reads content aloud" means in code.
   *
   * 🔴 STARTS AT THE DEFAULT AND IS CORRECTED AFTER THE FIRST PAINT.
   * Reading `localStorage` during render is a hydration mismatch; this file already solved that once
   * and the answer is the effect below, not a second pattern.
   */
  const [readingVoice, setReadingVoice] = useState<ReadingVoice>(DEFAULT_READING_VOICE);
  const speech = useCanvasSpeech();
  const player = useResponseAudio(readingVoice);

  /**
   * Silence the narration lane — the routed narration, a spoken passage mid-loop, an example row.
   *
   * 🔴🔴 TWO LANES, ONE SOUND, AND THIS IS THE ARBITER (owner, 2026-08-23: pressing read-aloud
   * repeatedly must not stack voices). The answer's player and the narration speaker are separate
   * machines with separate stop buttons, and until now four different starts silenced only their
   * OWN lane — so an example row could speak over the answer's audio, and the answer's audio could
   * start under a narration still running. Within one lane stacking was already impossible (the
   * player's run ticket, the speaker's single element); ACROSS them nothing decided.
   *
   * 🔴 THE PRESS COUNTER IS BUMPED HERE, NOT ONLY `speech.stop()`. A spoken passage is a LOOP of
   * chunked utterances guarded by `aloudPress`; stopping the current chunk without bumping the
   * counter lets the loop start the next one two seconds later, over whatever began meanwhile —
   * the stack, rebuilt on a timer.
   */
  const hushNarration = useCallback(() => {
    aloudPress.current += 1;
    setSpeakingExample(null);
    speech.stop();
  }, [speech.stop]);

  /**
   * The answer's player, with the arbiter on its only way in.
   *
   * 🔴 WRAPPED HERE SO EVERY CALLER GETS IT FOR FREE — the autoplay effect below, the Read-aloud
   * button in `ResponseAudioControls`, and any future caller all reach `start` through this object,
   * so none of them can start the player without silencing the narration first.
   */
  const replyAudio = useMemo<ResponseAudio>(
    () => ({
      ...player,
      start: (text: string) => {
        hushNarration();
        player.start(text);
      },
    }),
    [hushNarration, player],
  );

  // Browser-only facts, corrected after the first paint. See the file header.
  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    setReadingVoice(readReadingVoice(storage));
  }, []);

  // 🔴 THE VOICE FOLLOWS SETTINGS WITHOUT A RELOAD, IN THIS TAB AND IN OTHERS. `storage` fires only
  // in the OTHER tabs, which is a browser rule and not an oversight — so Settings also dispatches
  // its own event, and this listens for both. Without the second one, changing your voice in the
  // Settings pane and coming back to an open canvas would leave the old voice reading until a
  // refresh, which reads exactly like the setting not having worked.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reread = (event?: Event) => {
      if (event instanceof StorageEvent && event.key && event.key !== READING_VOICE_KEY) return;
      setReadingVoice(readReadingVoice(window.localStorage));
    };
    window.addEventListener("storage", reread);
    window.addEventListener(READING_VOICE_KEY, reread);
    return () => {
      window.removeEventListener("storage", reread);
      window.removeEventListener(READING_VOICE_KEY, reread);
    };
  }, []);

  /**
   * The answer that has already been started, so it is never started twice.
   *
   * 🔴 KEYED ON THE ANSWER'S OWN IDENTITY RATHER THAN ON A COUNTER. `spokenReply.key` is derived
   * from the text, so a re-render cannot re-read a paid utterance and a genuinely new answer always
   * gets one.
   */
  const autoplayed = useRef<string | null>(null);
  const replyKey = reply?.key ?? null;

  useEffect(() => {
    // A new answer replaces the old one on screen; its audio must go with it, whether or not the
    // next one will play. Leaving the previous player open under a different answer is the
    // "controls that do not belong to what you are looking at" failure.
    //
    // 🔴 EXCEPT WHEN THE ARRIVING ANSWER IS THE ONE ALREADY SPEAKING. A voice conversation primes
    // the reply's first sentence mid-turn, so by the time the reply lands here its own audio is
    // playing — stopping it would cut the sentence mid-word only to start it again. The primed
    // record can only belong to this arrival: the turn-start pass through this effect (reply null)
    // already stopped the PREVIOUS answer's audio before any prime existed.
    const arrived = autoplayed.current !== replyKey;
    if (arrived && player.primedOpener() === null) replyAudio.stop();
    autoplayed.current = replyKey;
    // 🔴 ONLY WHEN THE ANSWER IS NEW, NEVER WHEN THE SETTING CHANGES. Switching autoplay on while an
    // answer is already on screen would make the toggle read the paragraph you are in the middle of
    // reading — a preference about what happens NEXT, narrating the present retroactively.
    // 🔴 AUTOPLAY ITSELF DIED WITH THE MODE (owner, 2026-08-30 morning) — this effect used to
    // press play here when the setting was on. Stopping the OLD answer's audio above is what
    // survives of that: it belongs to the answer being replaced, not to any setting.
    // 🔴 A VOICE CONVERSATION IS THE ONE THING THAT STILL PRESSES PLAY — the same owner, the
    // same evening. A SESSION between an explicit press and an explicit stop, never a stored
    // preference; and it takes the same path a learner's own Read-aloud press takes, so which
    // provider, which voice, how it streams and how it is controlled are identical either way.
    if (!arrived || !replyKey || !reply || !alwaysSpeak) return;
    replyAudio.start(reply.text);
    // Keyed on the answer, never on `replyAudio`: the controller's identity changes as its own
    // state does, and depending on it would restart the audio on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyKey]);


  return {
    replyAudio,
    // The head start. Gated on the session, silenced like a press — see the interface note.
    primeReply: (opener: string) => {
      if (!alwaysSpeak) return;
      hushNarration();
      player.prime(opener);
    },
    concludePrime: (replyArrived: boolean) => {
      // A reply is coming: the autoplay effect's `start` continues the primed timeline itself,
      // and sealing here would race it — the sink must stay open for the rest of the plan.
      if (replyArrived) return;
      player.settleStream();
    },
    // 🔴 THE PLAYER YIELDS TO A REPLAY PRESS, like every other cross-lane start. Delegates the
    // repeat itself to the speech lane, which owns the fresh-key rule.
    replay: (text, voice) => {
      player.stop();
      return speech.replay(text, voice);
    },
    speaking: speech.speaking,
    /**
     * Speak an arbitrary passage on demand.
     *
     * 🔴 THIS IS A DIFFERENT DECISION FROM THE AUTOMATIC ONE, AND THAT IS THE POINT. The routed
     * lane reads questions and corrections and REFUSES explanations, which is right: nobody
     * wants a paragraph of prose read at them every turn. But it also meant there was no way to
     * hear anything else at all — the owner asked Nemesis to say something in German and got
     * silence, because a reply is an explanation and explanations are not spoken. Owner
     * 2026-08-20: "there's no way to repeat it, have it repeat phrases or words spoken aloud."
     *
     * Asked for explicitly, any passage may be spoken, and pressing it again repeats it. The
     * safety rules that belong to the SOUND rather than to the policy still apply — `speak`
     * refuses notation and bounds the length — because those protect the learner from an
     * unlistenable noise, not from hearing a paragraph they chose.
     */
    speakAloud: (text: string) => {
      // Restarting mid-sentence is what "repeat" means when it is already talking.
      speech.stop();
      // 🔴 AND THE ANSWER'S PLAYER — the other lane. See `hushNarration`.
      player.stop();
      // 🔴 A FRESH KEY EVERY PRESS, AND THIS IS THE WHOLE OF "AGAIN". `speak` keeps a set of keys
      // it has already spoken and returns silently on a repeat — correct for the routed lane,
      // where a question must not be read (or paid for) twice because a render ran again. Derive
      // the key from the TEXT and the second press of a repeat button hits that guard and does
      // nothing at all: the precise silent no-op this control exists to fix, rebuilt inside it.
      //
      // 🔴 AND IT READS IN THE CHOSEN VOICE. The speed that used to ride here was a SYNTHESIS
      // argument, so pressing the speed control threw away a paid MP3 and bought another one; it is
      // now `playbackRate` on the element and belongs to the player, not to the request.
      aloudPress.current += 1;
      const press = aloudPress.current;

      // 🔴🔴 SEVERAL REQUESTS, BECAUSE ONE WOULD BE REFUSED. Both synthesisers answer 413 above
      // SPEECH_CHAR_LIMIT, and this used to send the whole answer as a single request — so every
      // answer past 600 characters played nothing at all, silently (owner, 2026-08-21: "it
      // wouldn't play the whole passage"). `speechChunks` cuts at sentence ends, so the seams
      // land where a reader would pause anyway.
      const parts = speechChunks(text, SPEECH_CHAR_LIMIT);
      void (async () => {
        for (let index = 0; index < parts.length; index += 1) {
          // 🔴 CANCELLATION IS CHECKED, NOT ASSUMED. `stop()` currently leaves its pending promise
          // unresolved, which happens to halt this loop on its own — but relying on that would
          // make a future fix to `stop()` restart a passage the learner silenced. The press
          // counter is the real guard and holds either way.
          if (aloudPress.current !== press) return;
          await speech.speak(
            `aloud:${press}:${index}`,
            parts[index] ?? "",
            utteranceVoice(readingVoice, LOCALE_UNSPECIFIED, ANSWER_SPEED),
          );
        }
      })();
    },
    speakExample: (key: string, locale: string, text: string) => {
      // Restarting mid-sentence is what pressing a second example means.
      speech.stop();
      // 🔴 AND THE ANSWER'S PLAYER — a German example spoken over the answer still reading itself
      // aloud is the stack the arbiter exists to prevent. See `hushNarration`.
      player.stop();

      // 🔴 THE ROUTER DECIDES, NOT THIS CALLER. It is what refuses a target-language utterance
      // with no locale, holds the natural pace a drill needs, and names Azure — and every one of
      // those is a rule with a test behind it. Reaching past it to `speech.speak` would be
      // rebuilding all three here, badly.
      const route = routeSpeech({
        key: `example:${aloudPress.current + 1}`,
        moment: { kind: "target_language", text },
        purpose: "language_learning",
        targetLocale: locale,
      });
      if (route.decision !== "speak") return;

      // A fresh key every press, for the same reason `speakAloud` needs one: `speak` refuses a key
      // it has already spoken, which is right for the automatic lane and is exactly the silent
      // no-op a repeat control exists to avoid.
      aloudPress.current += 1;

      // 🔴 NO `voiceId`, AND THE OMISSION IS THE POINT. The learner's chosen speaker belongs to
      // Nemesis's own voice; a target-language example is spoken by a voice picked from Azure's
      // catalogue FOR that variety, deterministically, so the same lesson sounds the same
      // tomorrow. Sending the canvas speaker here would ask a Mexican Spanish drill to be read by
      // whichever English voice the learner liked.
      // 🔴 THE ROW IS NAMED WHILE IT PLAYS, so only its own button becomes a stop button. Cleared
      // when playback ends; `stopSpeaking` clears it too, because a stopped utterance never
      // resolves its promise and would otherwise leave one row looking like it was still talking.
      setSpeakingExample(key);
      void speech
        .speak(route.utterance.key, route.utterance.text, {
          locale: route.locale,
          provider: route.provider,
          speed: route.speed,
        })
        .then(() => setSpeakingExample((playing) => (playing === key ? null : playing)));
    },
    speakingExample,
    stopSpeaking: () => {
      // Bumping the press invalidates any passage still being read chunk by chunk.
      aloudPress.current += 1;
      setSpeakingExample(null);
      speech.stop();
      // 🔴 THE ANSWER'S AUDIO TOO. This is called when the learner starts typing, and Nemesis must
      // not still be talking while somebody composes a reply to it — that rule does not care which
      // of the two lanes is making the noise.
      replyAudio.stop();
    },
  };
}
