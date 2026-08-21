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

import { shouldSpeakAction, type SpokenMoment } from "@/lib/learn/canvas-speech";
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
import { useCanvasSpeech } from "./use-canvas-speech";
import type { PolicyRuntime } from "./use-policy-runtime";

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
  };
  /** Speak an arbitrary passage on demand; pressing again repeats it. */
  speakAloud: (text: string) => void;
  /** How fast Nemesis reads, and the control that cycles it. Shown twice by design (owner
   *  2026-08-20, "both"): a default in the voice picker, and a per-answer control in the icon row
   *  under a reply — the same value, reachable where each decision is actually made. */
  speed: VoiceSpeed;
  onCycleSpeed: () => void;
  /** Straight onto `<CanvasComposer listenSignal={…}>`. Changes when the microphone should open. */
  listenSignal: number | null;
  /** Called when the learner starts answering. 🔴 NOT AN OPTIMISATION — Nemesis must not still be
   *  talking while somebody is composing a reply to it. */
  stopSpeaking: () => void;
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

  const onSetVoice = useCallback((next: string) => {
    const chosen = readVoice(next);
    setVoiceId(chosen);
    if (typeof window !== "undefined") window.localStorage.setItem(VOICE_STORAGE_KEY, chosen);
    // 🔴 SILENCE WHAT IS PLAYING. Changing the speaker mid-sentence and hearing the old one finish
    // reads as the setting not having worked; the next utterance is where the choice takes effect.
    speech.stop();
  }, [speech]);

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
    void speech.speak(route.utterance.key, route.utterance.text, { locale: route.locale, speed: route.speed, voiceId }).then(() => {
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
      onSetAutoDictation,
      onSetVoice,
      onToggle,
      speaking: speech.speaking,
      voiceId,
    },
    listenSignal,
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
    onCycleSpeed: () => {
      const next = nextVoiceSpeed(speed);
      setSpeed(next);
      writeVoiceSpeed(typeof window === "undefined" ? null : window.localStorage, next);
    },
    speakAloud: (text: string) => {
      // Restarting mid-sentence is what "repeat" means when it is already talking.
      speech.stop();
      void speech.speak(`aloud:${text.slice(0, 48)}`, text, { locale: LOCALE_UNSPECIFIED, speed, voiceId });
    },
    speed,
    stopSpeaking: speech.stop,
  };
}
