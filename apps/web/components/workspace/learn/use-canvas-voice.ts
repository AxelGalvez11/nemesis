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

import { useCallback, useEffect, useRef, useState } from "react";

import { shouldSpeakAction, speechChunks, SPEECH_CHAR_LIMIT, type SpokenMoment } from "@/lib/learn/canvas-speech";
import { LOCALE_UNSPECIFIED, routeSpeech } from "@/lib/learn/speech-route";
import {
  type AutoDictation,
  DEFAULT_VOICE_MODE,
  DEFAULT_VOICE_SPEED,
  nextVoiceSpeed,
  readAutoDictation,
  readVoiceMode,
  readVoiceSpeed,
  shouldOpenDictation,
  type VoiceMode,
  type VoiceSpeed,
  writeAutoDictation,
  writeVoiceMode,
  writeVoiceSpeed,
} from "@/lib/learn/voice-preferences";

import { correctionLead } from "./correction-copy";
import { speechRecognitionSupported } from "./use-canvas-dictation";
import { DEFAULT_VOICE, readVoice, VOICE_STORAGE_KEY } from "@/lib/learn/canvas-voices";
import { useCanvasSpeech, type CanvasSpeech } from "./use-canvas-speech";
import type { PolicyRuntime } from "./use-policy-runtime";

/**
 * What a voice says when you pick it.
 *
 * 🔴 ONE SENTENCE, AND IT IS ABOUT THE VOICE RATHER THAN ABOUT NEMESIS. A preview is a sample of a
 * SOUND; a line of product copy makes the learner read instead of listen, and a long one makes them
 * wait to hear the end of a thing they are only sampling. Short enough that pressing four options
 * in a row is four sounds rather than four sentences.
 */
const VOICE_PREVIEW_LINE = "This is how I sound.";

export interface CanvasVoice {
  /** Straight onto `<CanvasHeader voice={…}>`. */
  header: {
    mode: VoiceMode;
    autoDictation: AutoDictation;
    dictationSupported: boolean;
    speaking: boolean;
    onToggle: (next: VoiceMode) => void;
    onSetAutoDictation: (next: AutoDictation) => void;
    /** Which speaker the learner chose. See `lib/learn/canvas-voices.ts`. */
    voiceId: string;
    onSetVoice: (next: string) => void;
    /** How fast Nemesis reads, and the control that cycles it. Shown twice by design (owner
     *  2026-08-20, "both"): here for "how should it read from now on", and in the row under an
     *  answer for "read THIS faster". One value behind both, which is what makes showing it twice
     *  honest rather than confusing. */
    speed: VoiceSpeed;
    onCycleSpeed: () => void;
  };
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
  /** Straight onto `<CanvasComposer listenSignal={…}>`. Changes when the microphone should open. */
  listenSignal: number | null;
  /** Called when the learner starts answering. 🔴 NOT AN OPTIMISATION — Nemesis must not still be
   *  talking while somebody is composing a reply to it. */
  stopSpeaking: () => void;
  /**
   * The learner asking to hear a phrase again (§47).
   *
   * 🔴 EXPOSED SEPARATELY FROM EVERYTHING ABOVE, BECAUSE IT OBEYS DIFFERENT RULES. Everything else
   * here is governed by voice mode — whether Nemesis narrates unprompted. This is a press, on a
   * phrase in a language being learned, and it works with voice mode off: "do not read my questions
   * aloud" and "never let me hear how this word sounds" are different preferences, and conflating
   * them would put the pronunciation of a foreign word behind a setting about narration.
   */
  replay: CanvasSpeech["replay"];
  /** True while any audio is playing, so a replay control can disable itself rather than overlap. */
  speaking: boolean;
}

/**
 * What this decision would say out loud, if anything.
 *
 * Returns the moment and its identity together so they cannot be computed from different renders —
 * the identity is what stops a re-render reading the same question twice, and an identity derived
 * separately from the text is an identity that can drift from it.
 */
function momentFor(runtime: PolicyRuntime, reply: SpokenReply | null): { key: string; moment: SpokenMoment } | null {
  // 🔴🔴 THE REPLY IS READ FIRST, AND THE ORDER IS THE FIX. Reported 2026-08-20: *"why does it only
  // read aloud during questions?"* Every branch below is derived from the POLICY runtime, and a
  // conversational answer is not a policy decision — so voice mode was silent on the thing the
  // learner looks at most. It goes first because a reply that is on screen has DISPLACED whatever
  // the policy was showing (see `canvas-hosting.ts`), so speaking the policy's question underneath
  // it would be reading a screen nobody is looking at.
  if (reply) return { key: `reply:${reply.key}`, moment: { kind: "answer", text: reply.text } };

  const { decision, feedback, prompt } = runtime;
  // A verdict is on screen; the decision underneath has already moved on. Reading the next
  // question over the learner's own result is the loudest possible version of getting this wrong.
  if (feedback) return null;
  if (!decision) return null;

  // An exposition short enough to be a remark is read; a paragraph stays on screen where it can be
  // skimmed and re-read. See `shouldSpeakAction`.
  if (decision.action.type === "teach" || decision.action.type === "simplify") {
    // The same text the teach/simplify branch renders: `decision.knowledge.statement`.
    // 🔴 NOT `runtime.exposition` — that is a MODE (transient/held plus a duration), not words.
    const said = decision.knowledge.statement ?? "";
    if (!shouldSpeakAction({ actionType: decision.action.type, text: said })) return null;
    return {
      key: `${decision.action.type}:${decision.objective.identityKey}`,
      moment: { kind: "question", text: said },
    };
  }

  if (!shouldSpeakAction({ actionType: decision.action.type, text: "" })) return null;

  if (decision.action.type === "retrieve") {
    if (!prompt) return null;
    return { key: `retrieve:${prompt.id}`, moment: { kind: "question", text: prompt.prompt } };
  }

  // `cue → answer` on screen; the arrow is a pause when spoken, never the word "arrow".
  const { answer, cue, identityKey } = decision.objective;
  return {
    key: `correction:${identityKey}`,
    moment: {
      answer: cue ? `${cue}. ${answer}` : answer,
      kind: "correction",
      lead: correctionLead(decision.state.status),
    },
  };
}

/** A conversational answer on screen, and a key that changes only when the answer does. */
export interface SpokenReply {
  key: string;
  text: string;
}

export function useCanvasVoice(runtime: PolicyRuntime, composerBusy: boolean, reply: SpokenReply | null = null): CanvasVoice {
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_VOICE_MODE);
  const [autoDictation, setAutoDictation] = useState<AutoDictation>("unasked");
  const [dictationSupported, setDictationSupported] = useState(false);
  const [listenSignal, setListenSignal] = useState<number | null>(null);
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
  /** 🔴 STARTS AT THE DEFAULT AND IS CORRECTED AFTER THE FIRST PAINT, exactly like `mode` above.
   *  Reading `localStorage` during render is a hydration mismatch; this file already solved that
   *  once and the answer is the effect below, not a second pattern. */
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE);
  const [speed, setSpeed] = useState<VoiceSpeed>(DEFAULT_VOICE_SPEED);
  const speech = useCanvasSpeech();

  // Browser-only facts, corrected after the first paint. See the file header.
  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    setMode(readVoiceMode(storage));
    setAutoDictation(readAutoDictation(storage));
    setDictationSupported(speechRecognitionSupported());
    setVoiceId(readVoice(storage?.getItem(VOICE_STORAGE_KEY) ?? null));
    setSpeed(readVoiceSpeed(storage));
  }, []);

  /** The latest values, for the post-speech decision. 🔴 READ AT THE MOMENT OF USE, NEVER LATCHED
   *  WHEN SPEECH BEGAN — a learner who switched voice off mid-sentence is telling us not to open a
   *  microphone a second later, and a closure capturing the old value would do it anyway. */
  const live = useRef({ autoDictation, composerBusy, dictationSupported, mode });
  live.current = { autoDictation, composerBusy, dictationSupported, mode };

  const onToggle = useCallback((next: VoiceMode) => {
    setMode(next);
    writeVoiceMode(typeof window === "undefined" ? null : window.localStorage, next);
    // Turning it off must silence what is already playing, not merely stop the next one.
    if (next === "off") speech.stop();
  }, [speech]);

  const onCycleSpeed = useCallback(() => {
    const next = nextVoiceSpeed(speed);
    setSpeed(next);
    writeVoiceSpeed(typeof window === "undefined" ? null : window.localStorage, next);
  }, [speed]);

  const onSetVoice = useCallback((next: string) => {
    const chosen = readVoice(next);
    setVoiceId(chosen);
    if (typeof window !== "undefined") window.localStorage.setItem(VOICE_STORAGE_KEY, chosen);
    // 🔴 SILENCE WHAT IS PLAYING. Changing the speaker mid-sentence and hearing the old one finish
    // reads as the setting not having worked; the next utterance is where the choice takes effect.
    speech.stop();
    // 🔴🔴 AND SAY SOMETHING IN IT. Owner, 2026-08-20: *"selecting voices should give a small
    // preview."* Six ids — eve, ara, rex, gork, sal, leo — are six words that mean nothing about
    // how a voice sounds, and xAI publishes no catalogue to describe them from. Choosing blind and
    // finding out on the next question is not choosing.
    //
    // 🔴 IT SPEAKS AS THE VOICE BEING CHOSEN, AT THE SPEED BEING USED, so the preview is the thing
    // itself rather than a demonstration of a neighbouring setting. And it is keyed on the id, so
    // pressing the same option twice replays rather than being deduplicated as "already said".
    void speech.speak(`preview:${chosen}`, VOICE_PREVIEW_LINE, { locale: LOCALE_UNSPECIFIED, speed, voiceId: chosen });
  }, [speech, speed]);

  const onSetAutoDictation = useCallback((next: AutoDictation) => {
    setAutoDictation(next);
    writeAutoDictation(typeof window === "undefined" ? null : window.localStorage, next);
  }, []);

  const spokenMoment = mode === "on" ? momentFor(runtime, reply) : null;
  const key = spokenMoment?.key ?? null;

  useEffect(() => {
    if (!spokenMoment) return;
    // 🔴 THE ROUTER RATHER THAN `speechFor` DIRECTLY (§43). It still delegates the text decision to
    // `speechFor`, so nothing about what gets said has changed; what it adds is the locale, the pace
    // and the provider travelling WITH the utterance. This lane is `canvas` and passes no locale, so
    // the request body is byte-identical to what shipped before — the seam exists, and the day a
    // language session exists it passes the other purpose and a target locale here.
    const route = routeSpeech({ key: spokenMoment.key, moment: spokenMoment.moment, purpose: "canvas" });
    // A refusal is a real outcome: notation, or too long. The screen still shows it; Nemesis simply
    // does not read it aloud, and no microphone opens for something that was never said.
    if (route.decision !== "speak") return;

    let cancelled = false;
    void speech
      .speak(route.utterance.key, route.utterance.text, {
        locale: route.locale,
        // 🔴 THE ROUTER'S CHOICE, CARRIED RATHER THAN RECOMPUTED. Until §47 this was decided and
        // dropped, so every utterance went to xAI whatever the router said.
        provider: route.provider,
        speed: route.speed,
        voiceId,
      })
      .then(() => {
      if (cancelled) return;
      const now = live.current;
      if (
        !shouldOpenDictation({
          autoDictation: now.autoDictation,
          composerBusy: now.composerBusy,
          dictationSupported: now.dictationSupported,
          // 🔴 NARROWED RATHER THAN CAST. `shouldOpenDictation` only accepts the two moments a
          // microphone may follow, and `target_language` is deliberately not one of them — opening a
          // microphone after an example sentence would be listening for an answer to something that
          // was not a question. Widening the parameter would have deleted that rule; this keeps it and
          // makes the third kind unreachable here, which it already is (the route above refuses a
          // target_language moment outside a language session, and no caller opens one).
          moment: spokenMoment.moment.kind === "correction" ? "correction" : "question",
          voiceMode: now.mode,
        })
      ) {
        return;
      }
      // A nonce rather than a boolean, so the composer treats this as an EVENT. See its own
      // `listenSignal` comment for why a latched flag reopens the microphone on every render.
      setListenSignal((current) => (current ?? 0) + 1);
    });

    return () => {
      cancelled = true;
    };
    // Keyed on the MOMENT, not on `speech`: the hook's own identity changes as its state does, and
    // depending on it would restart the utterance every time `speaking` flipped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    header: {
      autoDictation,
      dictationSupported,
      mode,
      onCycleSpeed,
      onSetAutoDictation,
      onSetVoice,
      onToggle,
      speaking: speech.speaking,
      speed,
      voiceId,
    },
    listenSignal,
    replay: speech.replay,
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
      // 🔴 A FRESH KEY EVERY PRESS, AND THIS IS THE WHOLE OF "AGAIN". `speak` keeps a set of keys
      // it has already spoken and returns silently on a repeat — correct for the routed lane,
      // where a question must not be read (or paid for) twice because a render ran again. Derive
      // the key from the TEXT and the second press of a repeat button hits that guard and does
      // nothing at all: the precise silent no-op this control exists to fix, rebuilt inside it.
      //
      // 🔴 AND IT READS AT THE CHOSEN SPEED. This was `speed: 1` — a literal, written before there
      // was a speed to choose. Both halves of this line arrived on the same day from different
      // branches, and taking either alone loses the other: the fresh key without `speed` ignores
      // the control, and `speed` without the fresh key silently refuses to repeat.
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
          await speech.speak(`aloud:${press}:${index}`, parts[index] ?? "", { locale: LOCALE_UNSPECIFIED, speed, voiceId });
        }
      })();
    },
    speakExample: (key: string, locale: string, text: string) => {
      // Restarting mid-sentence is what pressing a second example means.
      speech.stop();

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
    },
  };
}
