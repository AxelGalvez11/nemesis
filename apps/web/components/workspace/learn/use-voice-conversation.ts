"use client";

// A voice CONVERSATION: speak, be answered out loud, speak again — until you turn it off.
//
// Owner, 2026-08-30: *"voice mode should be accessed via the chat composer, the send button
// should function like in chatgpt becoming the voice button until text is manually [typed], it
// should work like claude where its not real time voice but just quick tts and stt."* Measured on
// claude.ai the same evening: the bars button sits in the send slot while the box is empty; the
// press flips the placeholder to "Listening…" and the button to a Stop pill; the reply is read
// aloud; the microphone opens again when it finishes. Turn-based — no realtime session, exactly
// the two cheap halves (STT in, TTS out) stitched around the ordinary send path.
//
// 🔴🔴 THIS IS NOT THE LANE THE OWNER KILLED ON 2026-08-25, AND THE DIFFERENCE IS WHO ASKED.
// What died then was "open mic after each question" — a STANDING PREFERENCE row that re-opened
// the microphone after every narrated quiz prompt, whether or not the learner wanted to talk
// right then (use-canvas-voice.ts still carries the tombstone). This is a SESSION: it exists
// only between an explicit press of the voice button and an explicit stop, and every re-arm
// inside it is the thing the learner pressed the button FOR. Outside a session this hook does
// nothing at all.
//
// 🔴 IT REUSES EVERYTHING AND OWNS ALMOST NOTHING. The microphone is the composer's own
// `useCanvasDictation` instance (a second one would open a second mic stream); the send is the
// composer's own `submit`, so sink routing, filing and analytics are untouched; the speech is
// `replyAudio` — the same controller behind the header's transport bar and the read-aloud
// button, so pausing, scrubbing and the quota failure all keep working mid-conversation. What
// this hook owns is the LOOP: when to stop listening, when to send, when to listen again.
//
// 🔴 THE SILENCE RULE IS A TIMER ON THE TRANSCRIPT, NOT ON THE MICROPHONE. The dictation hook
// deliberately restarts continuous recognition across pauses (that is right for dictation, where
// a breath must not end the take), so "the recogniser stopped" never arrives here. What does
// arrive is the transcript ceasing to grow: SILENCE_SEND_MS after the last new word, with words
// on the page, the turn is sent. A pause mid-sentence under that window costs nothing — the
// timer resets on the next word.
//
// 🔴 BROWSER LANE ONLY. The xAI fallback lane records a clip and transcribes it after stop —
// there is no interim transcript, so there is nothing for the silence rule to watch. On that
// lane the voice button stays a dictation control (press, talk, press send); a conversation that
// cannot hear itself pausing would be theatre. `speechRecognitionSupported()` is not the test —
// engine identity is.

import { useEffect, useRef, useState } from "react";

import type { ResponseAudio } from "./use-response-audio";
import { dictationEngine, type Dictation } from "./use-canvas-dictation";

/** How long the words may sit still, while listening, before they are sent. */
export const SILENCE_SEND_MS = 1600;

/** How close to the end counts as "the reply finished playing" — the element sometimes reports
 *  a currentTime a frame short of reach when `onended` fires. */
const PLAYBACK_END_SLACK_SECONDS = 0.4;

/** The reply's audio has genuinely finished — not paused, not failed, FINISHED. PURE. */
export function playbackFinished(audio: {
  readonly complete: boolean;
  readonly currentTime: number;
  readonly playing: boolean;
  readonly reach: number;
}): boolean {
  return (
    audio.complete && !audio.playing && audio.reach > 0 && audio.reach - audio.currentTime <= PLAYBACK_END_SLACK_SECONDS
  );
}

export interface VoiceConversation {
  /** True between the press and the stop. The composer's button and placeholder read this. */
  active: boolean;
  /** True while the conversation lane is available at all — the browser recogniser exists. */
  offered: boolean;
  begin: () => void;
  /** Adopt a conversation that began on the FRONT DOOR: its first send already went out there,
   *  so the loop enters at "waiting" with the microphone closed — the reply speaks first, and
   *  the ordinary machinery re-arms the microphone when it finishes. */
  adopt: () => void;
  end: () => void;
  /** A turn went out by hand while the conversation was held — the loop resumes waiting on it. */
  noteSent: () => void;
}

export function useVoiceConversation(input: {
  dictation: Dictation;
  /**
   * The composer's own send, with a verdict.
   *
   * 🔴 "held" IS THE GRADED-ANSWER RULE SPEAKING (the same one that keeps `acceptDictation` from
   * submitting): recognition mishears, and a misheard answer written into the evidence is
   * indistinguishable from a wrong one. The words stay in the box, the microphone closes, and
   * the conversation waits for the learner's own press — `noteSent` resumes the loop.
   */
  submit: () => "held" | "retry" | "sent";
  /** The answer's player — the same controller the transport bar drives. */
  replyAudio: Pick<ResponseAudio, "complete" | "currentTime" | "playing" | "reach" | "stop" | "failure" | "status">;
  /** The composer is mid-turn (the send would be refused). The loop waits it out. */
  busy: boolean;
  onActiveChange?: (active: boolean) => void;
}): VoiceConversation {
  const { busy, dictation, onActiveChange, replyAudio, submit } = input;
  const [active, setActive] = useState(false);
  // 🔴 THE SILENCE TIMEOUT MUST READ THE PRESENT, NOT THE RENDER THAT ARMED IT. The transcript's
  // last growth arms the timer in the same render where the composer's `text` has NOT caught up
  // (its sync effect runs after the commit), and the effect's deps never change again — so a
  // `submit` captured in the timeout's closure sent the turn one growth short: the FINAL WORD of
  // a spoken turn was dropped. Proven with a scripted recogniser feeding word-by-word (the ask
  // arrived missing its last word); easy to miss in casual use because the real engine's trailing
  // final often repeats the text and papers over the gap. The ref is written every render, so the
  // timeout submits whatever the composer holds at FIRE time.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  // The conversation is offered only where a live transcript exists to watch — see the header.
  const [offered] = useState(() => dictationEngine() === "browser" && dictation.supported);

  /** Where the loop is: hearing the learner, waiting on the model, or hearing the reply out. */
  const stage = useRef<"held" | "listening" | "speaking" | "waiting">("listening");
  const silence = useRef<number | null>(null);
  /** Armed when a turn finishes without any audio starting, so "waiting" cannot be for ever. */
  const quietTurn = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setSession = (next: boolean) => {
    setActive(next);
    onActiveChange?.(next);
  };

  const clearSilence = () => {
    if (silence.current !== null) window.clearTimeout(silence.current);
    silence.current = null;
  };

  const clearQuietTurn = () => {
    if (quietTurn.current !== null) window.clearTimeout(quietTurn.current);
    quietTurn.current = null;
  };

  const begin = () => {
    if (!offered || active) return;
    stage.current = "listening";
    dictation.reset();
    dictation.start();
    setSession(true);
  };

  const adopt = () => {
    if (!offered || active) return;
    clearSilence();
    clearQuietTurn();
    // 🔴 NO dictation.start() HERE, AND THAT IS THE POINT. The learner already spoke; what they
    // are owed next is the answer. "waiting" hands control to the same effects every ordinary
    // turn uses: reply plays, playbackFinished() opens the microphone, and a turn that dies
    // quietly re-arms through the quiet-turn grace exactly as it would mid-session.
    stage.current = "waiting";
    setSession(true);
  };

  const end = () => {
    clearSilence();
    clearQuietTurn();
    dictation.stop();
    dictation.reset();
    replyAudio.stop();
    stage.current = "listening";
    setSession(false);
  };

  // The silence rule. Re-armed by every new word; disarmed outside the listening stage.
  const transcript = dictation.transcript;
  useEffect(() => {
    if (!active || stage.current !== "listening") return;
    clearSilence();
    if (!transcript.trim()) return;
    silence.current = window.setTimeout(() => {
      silence.current = null;
      if (!alive.current || stage.current !== "listening") return;
      dictation.stop();
      // 🔴 THE COMPOSER'S OWN SEND, AND ITS REFUSALS ARE RESPECTED — differently by kind. "sent"
      // moves the loop to waiting. "retry" (a turn already in flight, an empty box) reopens the
      // microphone; nothing was lost. "held" is the graded-answer rule: the words STAY in the
      // box — no reset, which would wipe them — and the loop stands down until the learner's own
      // send (`noteSent`) or the stop button.
      const verdict = submitRef.current();
      if (verdict === "sent") {
        stage.current = "waiting";
      } else if (verdict === "held") {
        stage.current = "held";
      } else {
        dictation.reset();
        dictation.start();
      }
    }, SILENCE_SEND_MS);
    return clearSilence;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, transcript]);

  // Waiting → speaking happens on its own: the turn lands, `useCanvasVoice` force-plays the reply
  // for the session (see `alwaysSpeak` there), and the player's state flows back in here.
  useEffect(() => {
    if (!active) return;
    if (stage.current === "waiting" && (replyAudio.status === "loading" || replyAudio.playing)) {
      clearQuietTurn();
      stage.current = "speaking";
      return;
    }
    // 🔴 A TURN CAN END WITHOUT AUDIO EVER STARTING — an empty reply, a payload with nothing
    // conversational in it, the speech router refusing notation. "Waiting" with the player idle
    // and the turn over gets a short grace (the force-play effect runs a beat after `busy`
    // falls), and then the microphone opens again. Without this the conversation stalls exactly
    // once and looks broken for ever after.
    //
    // 🔴 "speaking" WITH THE PLAYER IDLE IS THE SAME STRANDING, REACHED THE NEW WAY. A primed
    // head start (see `prime` in use-response-audio.ts) moves this loop to "speaking" the moment
    // the opener begins loading; if that one request then fails before any sound, the player
    // resets to idle and no "playback finished" is ever coming — the same grace reopens the
    // microphone. Unreachable from "speaking" on the shipped path: finished playback keeps the
    // player active (complete, not playing), never idle.
    if ((stage.current === "waiting" || stage.current === "speaking") && !busy && replyAudio.status === "idle" && !replyAudio.playing) {
      if (quietTurn.current === null) {
        quietTurn.current = window.setTimeout(() => {
          quietTurn.current = null;
          if (!alive.current || (stage.current !== "waiting" && stage.current !== "speaking")) return;
          stage.current = "listening";
          dictation.reset();
          dictation.start();
        }, 1200);
      }
      return;
    }
    clearQuietTurn();
    // 🔴 A TURN THAT ENDED WITH NOTHING TO SAY STILL RE-ARMS. A quota failure, a provider error,
    // or a reply the speech router refused would otherwise strand the conversation in "waiting"
    // for ever — the learner pressed a button that promises a LOOP, and silence is the loop
    // continuing, not the loop breaking.
    if (stage.current === "waiting" && !busy && replyAudio.failure !== null) {
      stage.current = "listening";
      dictation.reset();
      dictation.start();
      return;
    }
    if (stage.current === "speaking" && playbackFinished(replyAudio)) {
      stage.current = "listening";
      dictation.reset();
      dictation.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busy, replyAudio.complete, replyAudio.currentTime, replyAudio.failure, replyAudio.playing, replyAudio.reach, replyAudio.status]);

  const noteSent = () => {
    if (!active) return;
    clearSilence();
    if (dictation.listening) dictation.stop();
    stage.current = "waiting";
  };

  return { active, adopt, begin, end, noteSent, offered };
}
