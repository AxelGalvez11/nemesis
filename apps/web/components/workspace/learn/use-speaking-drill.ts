"use client";

// Running a speaking drill: say the prompt, listen for exactly as long as the script allows, move on.
//
// 🔴🔴 THE WINDOW IS A HARD TIMER AND THAT IS THE ENTIRE DIFFERENCE FROM VOICE MODE. The
// conversation hook's `SILENCE_SEND_MS` is re-armed by every new word, which is correct there: a
// learner mid-sentence must not be cut off, and the loop is meant to continue for as long as they
// want it to. Here the timer is set ONCE when the microphone opens and nothing the learner says can
// extend it. A drill whose windows could be extended by talking would be an open microphone with a
// countdown drawn on it.
//
// 🔴 NO MODEL RUNS INSIDE THE LOOP. `speaking-drill.ts` says why at length: the script is written
// in one call before any of this starts, so a drill's cost is knowable in advance. Nothing in this
// file calls `askCanvasChat`, and nothing in it may start doing so. What it spends is one synthesis
// per prompt, charged by `/api/speech/tts` on the way through like every other utterance.
//
// 🔴 IT OWNS THE LOOP AND ALMOST NOTHING ELSE, the same arrangement `use-voice-conversation.ts`
// uses. The microphone is the composer's own `useCanvasDictation` instance, because a second one
// opens a second audio stream. The voice is `useCanvasSpeech`, so the learner's chosen speaker,
// the §43 router and the voice meter all apply unchanged. What is here is when to talk, when to
// listen, and when to stop.
//
// 🔴 THE TRANSCRIPT IS READ AT FIRE TIME, NEVER FROM THE CLOSURE THAT ARMED THE TIMER. This is the
// scar `use-voice-conversation.ts` carries in a red comment of its own: a `transcript` captured
// when the window opened is empty by definition, and one captured on the last render is one growth
// stale, which silently drops the final word of a spoken answer. The ref is written every render.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type DrillState,
  type SpeakingDrill,
  drillAdvance,
  drillProgress,
  drillStart,
  drillTurn,
} from "@/lib/learn/speaking-drill";
import type { CanvasSpeech } from "./use-canvas-speech";
import type { Dictation } from "./use-canvas-dictation";

export interface DrillRun {
  /** The script being run, or null when nothing is running. */
  readonly drill: SpeakingDrill | null;
  readonly state: DrillState;
  /** Where the run is, for the card's "2 of 4". */
  readonly progress: { readonly at: number; readonly of: number };
  /** The prompt now live, or null once it is over. */
  readonly turn: ReturnType<typeof drillTurn>;
  /** True while a drill can be started at all: there is a microphone to open. */
  readonly offered: boolean;
  /** Seconds left in the current listening window, for the ring on the card. Null when not listening. */
  readonly remaining: number | null;
  readonly begin: (drill: SpeakingDrill) => void;
  /** End it by hand. What was said so far is kept; see `drillAdvance`. */
  readonly stop: () => void;
}

/** How often the countdown ticks. Only the card reads it; the window itself is one timer. */
const TICK_MS = 250;

export function useSpeakingDrill(input: { dictation: Dictation; speech: CanvasSpeech }): DrillRun {
  const { dictation, speech } = input;
  const [drill, setDrill] = useState<SpeakingDrill | null>(null);
  const [state, setState] = useState<DrillState>(drillStart);
  const [remaining, setRemaining] = useState<number | null>(null);

  const transcriptRef = useRef(dictation.transcript);
  transcriptRef.current = dictation.transcript;

  const window_ = useRef<number | null>(null);
  const ticker = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const clearWindow = useCallback(() => {
    if (window_.current !== null) globalThis.clearTimeout(window_.current);
    if (ticker.current !== null) globalThis.clearInterval(ticker.current);
    window_.current = null;
    ticker.current = null;
  }, []);

  const begin = useCallback(
    (next: SpeakingDrill) => {
      clearWindow();
      setDrill(next);
      setState(drillStart());
      setRemaining(null);
    },
    [clearWindow],
  );

  const stop = useCallback(() => {
    clearWindow();
    dictation.stop();
    dictation.reset();
    speech.stop();
    setRemaining(null);
    setState((current) => (drill ? drillAdvance(drill, current, { type: "stopped" }) : current));
  }, [clearWindow, dictation, drill, speech]);

  const turn = drill ? drillTurn(drill, state) : null;

  // ---- asking: say the prompt, then hand over to listening ----
  //
  // 🔴 KEYED ON THE TURN'S POSITION, WHICH IS WHAT MAKES `speak` SAFE TO CALL FROM AN EFFECT.
  // `speak` refuses a key it has already said, so a re-render mid-prompt cannot start the audio
  // again; a new turn is a new key and speaks normally. Two identically worded prompts in one
  // script are still two keys, because the index is in the key.
  const stage = state.stage;
  const index = state.index;
  useEffect(() => {
    if (!drill || stage !== "asking" || !turn) return;
    let dropped = false;
    const say = async () => {
      await speech.speak(`drill:${index}:ask`, turn.ask);
      // 🔴 THE TARGET-LANGUAGE LINE IS A SECOND UTTERANCE, NOT A LONGER FIRST ONE. It goes to a
      // different provider in a different variety (§43 routes on the locale), and joining the two
      // would send an English instruction to a German voice. It is spoken after the ask because the
      // ask is what tells the learner what to do with it.
      if (!dropped && turn.say) {
        await speech.replay(turn.say.text, { locale: turn.say.locale, provider: "azure" });
      }
      if (dropped || !alive.current) return;
      setState((current) => drillAdvance(drill, current, { type: "spoke" }));
    };
    void say();
    return () => {
      dropped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, index, stage]);

  // ---- listening: one window, one timer, no extensions ----
  useEffect(() => {
    if (!drill || stage !== "listening" || !turn) return;
    dictation.reset();
    dictation.start();
    const seconds = turn.seconds;
    setRemaining(seconds);

    const opened = Date.now();
    ticker.current = globalThis.setInterval(() => {
      const left = seconds - (Date.now() - opened) / 1000;
      setRemaining(Math.max(0, Math.ceil(left)));
    }, TICK_MS);

    window_.current = globalThis.setTimeout(() => {
      window_.current = null;
      if (ticker.current !== null) globalThis.clearInterval(ticker.current);
      ticker.current = null;
      if (!alive.current) return;
      dictation.stop();
      setRemaining(null);
      // 🔴 `transcriptRef`, NOT `dictation.transcript`. See the header: the closure's copy is a
      // render behind at best and empty at worst, and what it loses is the end of the answer.
      const said = transcriptRef.current;
      setState((current) => drillAdvance(drill, current, { said, type: "heard" }));
    }, seconds * 1000);

    return clearWindow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill, index, stage]);

  // ---- done: close everything, and stay closed ----
  useEffect(() => {
    if (stage !== "done") return;
    clearWindow();
    setRemaining(null);
    dictation.stop();
    dictation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // A drill cannot outlive the surface that started it.
  useEffect(() => clearWindow, [clearWindow]);

  return {
    begin,
    drill,
    // 🔴 THE SAME TEST THE CONVERSATION LANE USES, and it is about a microphone rather than a
    // browser: `dictation.supported` is false where nothing can be heard, and a drill that cannot
    // hear the learner is a slideshow that talks.
    offered: dictation.supported,
    progress: drill ? drillProgress(drill, state) : { at: 0, of: 0 },
    remaining,
    state,
    stop,
    turn,
  };
}
