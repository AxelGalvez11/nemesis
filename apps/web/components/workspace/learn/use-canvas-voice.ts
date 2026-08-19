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

import { shouldSpeakAction, speechFor, type SpokenMoment } from "@/lib/learn/canvas-speech";
import {
  DEFAULT_VOICE_MODE,
  readAutoDictation,
  readVoiceMode,
  shouldOpenDictation,
  writeAutoDictation,
  writeVoiceMode,
  type AutoDictation,
  type VoiceMode,
} from "@/lib/learn/voice-preferences";

import { correctionLead } from "./correction-copy";
import { speechRecognitionSupported } from "./use-canvas-dictation";
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
  };
  /**
   * The composer's dictation channel. Changes when voice mode wants the microphone opened.
   *
   * 🔴 IT CARRIES `"start"` AND NOTHING ELSE, WHICH IS THE HONEST SHAPE OF WHAT VOICE MODE KNOWS.
   * Hands-free means Nemesis finished speaking so the learner may now answer; when they have
   * FINISHED answering is theirs to say, through the composer's own ✓ or by releasing Space. This
   * hook has no way to know that and must not pretend to. See `CanvasComposerProps.dictationSignal`
   * for why the channel carries a verb at all.
   */
  dictationSignal: { nonce: number; command: "start" } | null;
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
function momentFor(runtime: PolicyRuntime): { key: string; moment: SpokenMoment } | null {
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

export function useCanvasVoice(runtime: PolicyRuntime, composerBusy: boolean): CanvasVoice {
  const [mode, setMode] = useState<VoiceMode>(DEFAULT_VOICE_MODE);
  const [autoDictation, setAutoDictation] = useState<AutoDictation>("unasked");
  const [dictationSupported, setDictationSupported] = useState(false);
  const [listenNonce, setListenNonce] = useState(0);
  const speech = useCanvasSpeech();

  // Browser-only facts, corrected after the first paint. See the file header.
  useEffect(() => {
    const storage = typeof window === "undefined" ? null : window.localStorage;
    setMode(readVoiceMode(storage));
    setAutoDictation(readAutoDictation(storage));
    setDictationSupported(speechRecognitionSupported());
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

  const onSetAutoDictation = useCallback((next: AutoDictation) => {
    setAutoDictation(next);
    writeAutoDictation(typeof window === "undefined" ? null : window.localStorage, next);
  }, []);

  const spokenMoment = mode === "on" ? momentFor(runtime) : null;
  const key = spokenMoment?.key ?? null;

  useEffect(() => {
    if (!spokenMoment) return;
    const choice = speechFor(spokenMoment.moment, spokenMoment.key);
    // A refusal is a real outcome: notation, or too long. The screen still shows it; Nemesis simply
    // does not read it aloud, and no microphone opens for something that was never said.
    if (!choice.spoken) return;

    let cancelled = false;
    void speech.speak(choice.spoken.key, choice.spoken.text).then(() => {
      if (cancelled) return;
      const now = live.current;
      if (
        !shouldOpenDictation({
          autoDictation: now.autoDictation,
          composerBusy: now.composerBusy,
          dictationSupported: now.dictationSupported,
          moment: spokenMoment.moment.kind,
          voiceMode: now.mode,
        })
      ) {
        return;
      }
      // A nonce rather than a boolean, so the composer treats this as an EVENT. See its own
      // `dictationSignal` comment for why a latched flag reopens the microphone on every render.
      setListenNonce((current) => current + 1);
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
      onToggle,
      speaking: speech.speaking,
    },
    // 🔴 `null` UNTIL THE FIRST REAL REQUEST. Zero is a nonce like any other, and emitting an
    // object on mount would open the microphone at a learner who has not been spoken to yet.
    dictationSignal: listenNonce > 0 ? { command: "start", nonce: listenNonce } : null,
    stopSpeaking: speech.stop,
  };
}
