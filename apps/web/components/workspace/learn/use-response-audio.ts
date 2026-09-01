"use client";

// The audio of ONE response: fetched from ONE provider, played through ONE element, controlled by
// the listener.
//
// 🔴🔴 GENERATION AND PLAYBACK ARE TWO DIFFERENT THINGS AND THIS IS WHERE THEY STOP BEING ONE. The
// old path did both in a single call: it asked the provider for a file at a chosen speed, waited
// for all of it, played it with `new Audio(url).play()`, and had no idea afterwards where in the
// audio it was. That is why speed regenerated (the speed was a synthesis argument), why there was
// no progress (nothing tracked the element), and why the only control that could exist was
// play/stop. Here the fetch fills a sink and the element is a first-class, queryable thing.
//
// 🔴 THE TEXT IS NEVER WAITING ON ANY OF THIS. Nothing in this hook is awaited by a render: it is
// started from an effect after the answer is already on screen, and every state it sets is
// additive. An answer appears at the same moment whether voice is on, off, or failing.
//
// 🔴 ONE PROVIDER PER UTTERANCE, AND AN ANSWER IS AN ORDERED LIST OF UTTERANCES. `replySpeechPlan`
// decides each one: prose is read by the voice the learner chose in Settings, and a sentence the
// model marked `[say: es-MX | …]` is routed to the language lane, which names that variety (owner,
// 2026-08-23: a mixed answer reads with both voices). The pieces play SEQUENTIALLY into one sink —
// two synthesisers never make sound at once — and `ttsRequest` still builds exactly one request per
// piece, with no probe and no fallback that would put an unchosen provider on the wire.
//
// 🔴 A VOICE CONVERSATION MAY *PRIME* THE PLAYER WITH THE ANSWER'S FIRST SENTENCE BEFORE THE
// ANSWER EXISTS. Measured 2026-08-31: the first sentence of a spoken reply is complete on the
// stream 1.6–2.2s in; the full completion lands at 2.7–4.7s; the player then waited for ALL of it
// before the first synthesis request went out. `prime(text)` starts the timeline on that first
// sentence alone, and `start(fullText)` — the same call that has always played the reply —
// CONTINUES into the primed sink when its plan opens with the primed text, byte for byte
// (`spoken-opener.ts` is what guarantees it will). On any mismatch, any primed failure, or any
// non-voice turn, `start` behaves exactly as before: the head start is an overlay on the shipped
// path, never a second player.
//
// No test file, for the reason `use-canvas-speech.ts` states about itself: this wraps `Audio`,
// `MediaSource` and `fetch`, none of which this repo's runner can exercise. The decisions it makes
// — which endpoint, which rate, where a seek lands — all live in tested pure modules. What CAN be
// asserted without a browser — when priming is offered, what it is fed, how the continuation
// matches — lives in `spoken-opener.test.ts` and `voice-conversation.test.ts`.

import { useCallback, useEffect, useRef, useState } from "react";

import { openAudioSink, pumpInto, type AudioSink } from "@/lib/learn/audio-stream";
import {
  DEFAULT_PLAYBACK_RATE,
  nextPlaybackRate,
  type PlaybackRate,
  readPlaybackRate,
  seekTarget,
  scrubTarget,
  writePlaybackRate,
} from "@/lib/learn/playback";
import { openerUtterance, replySpeechPlan, type ReplyUtterance } from "@/lib/learn/reply-speech";
import { LOCALE_UNSPECIFIED } from "@/lib/learn/speech-route";
import { ttsRequest } from "@/lib/learn/tts-request";
import { supabase } from "@/lib/supabase";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { DEFAULT_READING_VOICE, type ReadingVoice } from "@/lib/speech/reading-voice";

import type { SpeechFailure } from "./use-canvas-speech";

export type ResponseAudioStatus =
  /** Nothing has been asked for. The player is not on screen. */
  | "idle"
  /** A request is out and no sound has started yet. */
  | "loading"
  /** There is audio, playing or paused. */
  | "active";

export interface ResponseAudio {
  readonly status: ResponseAudioStatus;
  readonly playing: boolean;
  readonly failure: SpeechFailure | null;
  /** Seconds into the audio. */
  readonly currentTime: number;
  /** How much is playable right now — the duration once everything has arrived. */
  readonly reach: number;
  /** True once no more bytes are coming, so the bar can stop being provisional. */
  readonly complete: boolean;
  readonly rate: PlaybackRate;
  /** Speak this passage. Called again with the same text, it starts over. */
  start: (text: string) => void;
  /**
   * Begin speaking the reply's FIRST SENTENCE before the rest of the reply exists — the voice
   * conversation's head start. The following `start` continues into this same timeline when its
   * plan opens with exactly this text; otherwise it restarts clean, as if this was never called.
   */
  prime: (text: string) => void;
  /** The primed opener still owning the element, or null. A function, not state: the autoplay
   *  effect reads it at fire time and must not re-render anything to do so. */
  primedOpener: () => string | null;
  /**
   * No fuller reply is coming (the turn failed, or said nothing): close the primed timeline so
   * the opener plays out, `complete` becomes true, and the conversation loop's ordinary
   * "playback finished" rule can open the microphone again.
   */
  settleStream: () => void;
  /** Pause if playing, resume if paused. Never re-fetches. */
  toggle: () => void;
  /** Rewind or fast-forward. Negative rewinds. */
  seekBy: (deltaSeconds: number) => void;
  /** Jump to a fraction of the playable extent. */
  scrub: (fraction: number) => void;
  /** 🔴 THE ELEMENT'S OWN RATE. No request, no regeneration, no restart. */
  cycleRate: () => void;
  /** Stop and dismiss. The player leaves the screen. */
  stop: () => void;
}

/** Why nothing is being heard, from the response's status code. */
function failureFor(status: number): SpeechFailure {
  if (status === 402) return "voice-quota";
  if (status === 503) return "not-configured";
  return "provider-error";
}

export function useResponseAudio(voice: ReadingVoice = DEFAULT_READING_VOICE): ResponseAudio {
  const [status, setStatus] = useState<ResponseAudioStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [failure, setFailure] = useState<SpeechFailure | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [reach, setReach] = useState(0);
  const [complete, setComplete] = useState(false);
  const [rate, setRate] = useState<PlaybackRate>(DEFAULT_PLAYBACK_RATE);

  const element = useRef<HTMLAudioElement | null>(null);
  const sink = useRef<AudioSink | null>(null);
  /** Bumped by every `start` and `stop`, so a fetch that is still in flight knows it is stale. */
  const run = useRef(0);
  /**
   * The head start, while one is live: what was primed, under which ticket, and a promise that
   * resolves to the OPEN SESSION once the opener's bytes are in the sink (null when its request
   * failed). The session itself rides along because its `begin` closure is the only thing that
   * can start playback on the buffered fallback — a stand-in would leave that path silent.
   *
   * 🔴 THE TICKET IS CHECKED ON EVERY READ. A prime belongs to exactly one turn; any `stop`, any
   * fresh `start`, any new `prime` bumps the run counter and this record is dead the same moment,
   * whether or not anything remembered to clear it.
   */
  const primed = useRef<{ text: string; ticket: number; flow: Promise<SpeakSession | null> } | null>(null);
  const alive = useRef(true);
  /** The latest values a callback needs without re-binding on every tick. */
  const live = useRef({ rate, voice });
  live.current = { rate, voice };

  // 🔴 READ AFTER THE FIRST PAINT, NEVER DURING RENDER. `localStorage` does not exist on the server
  // and reading it in a `useState` initialiser is the hydration mismatch this codebase has already
  // solved once, in `use-canvas-voice.ts`.
  useEffect(() => {
    setRate(readPlaybackRate(typeof window === "undefined" ? null : window.localStorage));
  }, []);

  const teardown = useCallback(() => {
    const audio = element.current;
    element.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplay = null;
      audio.onpause = null;
      audio.ontimeupdate = null;
      audio.onprogress = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    sink.current?.dispose();
    sink.current = null;
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    primed.current = null;
    teardown();
    if (!alive.current) return;
    setStatus("idle");
    setPlaying(false);
    setCurrentTime(0);
    setReach(0);
    setComplete(false);
  }, [teardown]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      teardown();
    };
  }, [teardown]);

  /** How much of the timeline can actually be played right now. See `seekTarget`. */
  const measure = useCallback((audio: HTMLAudioElement) => {
    const buffered = audio.buffered;
    const bufferedEnd = buffered.length > 0 ? buffered.end(buffered.length - 1) : 0;
    const known = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    setReach(Math.max(known, bufferedEnd));
    setCurrentTime(audio.currentTime);
  }, []);

  /**
   * One playing session: the sink, the element, and the gate that starts sound the first moment
   * there is any. Opened once per timeline — `start` and `prime` each open one, and a
   * continuation reuses the primed session rather than opening a second.
   */
  interface SpeakSession {
    bag: AudioSink;
    audio: HTMLAudioElement;
    begin: () => void;
    started: () => boolean;
  }

  const openSession = useCallback(
    (stale: () => boolean): SpeakSession => {
      const bag = openAudioSink();
      sink.current = bag;

      const audio = new Audio();
      audio.preload = "auto";
      audio.playbackRate = live.current.rate;
      element.current = audio;
      audio.onplay = () => { if (!stale()) setPlaying(true); };
      audio.onpause = () => { if (!stale()) setPlaying(false); };
      audio.onended = () => { if (!stale()) setPlaying(false); };
      audio.ontimeupdate = () => { if (!stale()) measure(audio); };
      audio.onprogress = () => { if (!stale()) measure(audio); };
      audio.ondurationchange = () => { if (!stale()) measure(audio); };
      audio.onerror = () => {
        if (stale()) return;
        setFailure("playback-blocked");
        setPlaying(false);
      };

      // 🔴🔴 THE SOURCE IS ATTACHED BEFORE ANY BYTES ARE FETCHED, AND THAT ORDER IS LOAD-BEARING.
      // A MediaSource does not open — and so cannot accept a single append — until its object URL
      // is attached to a media element. Attaching on "first bytes arrived" instead deadlocks:
      // the append waits for the element, the element waits for the callback, the callback waits
      // for the append, and the answer never speaks. Only a real browser shows this; the buffered
      // fallback has no src until `end()`, so it still attaches late, below.
      if (bag.streaming) {
        const opening = bag.src();
        if (opening) audio.src = opening;
      }

      /** Start playing, the first moment there is anything to play. */
      let started = false;
      const begin = () => {
        if (started || stale()) return;
        const src = bag.src();
        if (!src) return;
        started = true;
        if (!audio.src) audio.src = src;
        audio.playbackRate = live.current.rate;
        setStatus("active");
        void audio.play().catch(() => {
          // Autoplay policy, or no output device. Named rather than silent: the controls stay on
          // screen so a press can start it, which is exactly what the policy wants.
          if (!stale()) { setFailure("playback-blocked"); setPlaying(false); }
        });
      };

      return { audio, bag, begin, started: () => started };
    },
    [measure],
  );

  /**
   * Fetch each planned utterance and append it into the session's sink, in order. Resolves true
   * when every part landed; false when one failed, with the failure state already set. The caller
   * owns what a failure means — a fresh `start` tears down to idle when no sound had begun, a
   * primed head start leaves the record for `start` to notice and restart clean.
   */
  const speakInto = useCallback(
    async (session: SpeakSession, parts: readonly ReplyUtterance[], token: string, stale: () => boolean): Promise<boolean> => {
      try {
        for (const part of parts) {
          if (stale()) return false;
          const plan = ttsRequest({
            provider: part.provider,
            // 🔴 THE SYNTHESIS RATE, WHICH IS THE ROUTER'S CONSTANT AND NOT THE LISTENER'S SETTING.
            // Prose runs at answer pace; a target-language sentence at the natural pace a drill
            // needs. How fast the learner then hears it is `audio.playbackRate`.
            rate: part.speed,
            supabaseAnonKey,
            supabaseUrl,
            text: part.text,
            token,
            ...(part.locale !== LOCALE_UNSPECIFIED ? { locale: part.locale } : {}),
            // Absent on a target-language line: the catalogue names that variety's speaker (§47).
            ...(part.voiceId ? { voiceId: part.voiceId } : {}),
          });

          const response = await fetch(plan.url, plan.init);
          if (stale()) return false;
          if (!response.ok) {
            setFailure(failureFor(response.status));
            return false;
          }
          if (!response.body) {
            // No streaming body (an old browser, or a proxy that buffered). Fall back to bytes.
            const buffer = await response.arrayBuffer();
            if (stale()) return false;
            if (buffer.byteLength === 0) throw new Error("empty audio");
            await session.bag.append(new Uint8Array(buffer));
            session.begin();
            continue;
          }
          const bytes = await pumpInto(session.bag, response.body, session.begin, stale);
          if (stale()) return false;
          // A zero-byte 200 plays as silence and reads exactly like a canvas choosing not to speak.
          if (bytes === 0) throw new Error("empty audio");
        }
        return true;
      } catch {
        if (!stale()) setFailure("provider-error");
        return false;
      }
    },
    [],
  );

  /** Close a finished timeline: no more bytes, the bar stops being provisional. */
  const seal = useCallback(
    async (session: SpeakSession, stale: () => boolean) => {
      if (stale()) return;
      await session.bag.end();
      if (stale()) return;
      setComplete(true);
      // The buffered fallback has no src until now.
      session.begin();
      measure(session.audio);
    },
    [measure],
  );

  /** The shipped path: a new ticket, a new session, the whole plan. */
  const startFresh = useCallback(
    (passage: string) => {
      run.current += 1;
      const ticket = run.current;
      teardown();
      setFailure(null);
      setCurrentTime(0);
      setReach(0);
      setComplete(false);
      setPlaying(false);
      setStatus("loading");

      const stale = () => !alive.current || run.current !== ticket;

      void (async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (stale()) return;
        if (!token) {
          setFailure("not-signed-in");
          setStatus("idle");
          return;
        }

        const chosen = live.current.voice;
        const session = openSession(stale);

        // 🔴 SEVERAL REQUESTS, AND THEY BECOME ONE TIMELINE. `replySpeechPlan` decides each one:
        // sentence-seamed chunks (both providers answer 413 above 600 characters), a short opener
        // first so the first audible word arrives while the rest is still synthesising, and a
        // `[say: …]`-marked sentence routed to the language lane in its stated variety. The pieces
        // are appended into a single sink so the listener gets one progress bar rather than a
        // queue of clips.
        const parts = replySpeechPlan(passage, chosen);
        if (parts.length === 0) {
          // Nothing sayable survived the split — an answer that is all notation, or all drawing.
          setStatus("idle");
          teardown();
          return;
        }

        const spoke = await speakInto(session, parts, token, stale);
        if (stale()) return;
        if (!spoke) {
          if (!session.started()) { setStatus("idle"); teardown(); }
          return;
        }
        await seal(session, stale);
      })();
    },
    [openSession, seal, speakInto, teardown],
  );

  const start = useCallback(
    (text: string) => {
      const passage = text.trim();
      if (!passage) return;

      // 🔴 THE HEAD START IS CHECKED FIRST, BEFORE ANY TICKET MOVES. When a voice conversation
      // primed this reply's first sentence, that sentence is ALREADY PLAYING — restarting would
      // cut it mid-word to speak it again. The plan's own opener split reproduces the primed text
      // exactly when nothing rewrote the sentence (`spoken-opener.ts` stands down whenever
      // anything could), so equality here is the proof that continuing is sound. Anything else —
      // no prime, a stale prime, a mismatch, a primed request that failed — falls through to the
      // fresh start below, exactly the shipped path.
      const head = primed.current;
      primed.current = null;
      if (head && head.ticket === run.current && alive.current) {
        const ticket = head.ticket;
        const stale = () => !alive.current || run.current !== ticket;
        const parts = replySpeechPlan(passage, live.current.voice);
        if (parts[0]?.text === head.text) {
          void (async () => {
            const session = await head.flow;
            if (stale()) return;
            if (!session) {
              // The opener's own request failed; nothing is playing. Start over, clean.
              if (run.current === ticket) startFresh(passage);
              return;
            }
            // The session's own `begin` rides along: on the streaming sink it already ran the
            // moment bytes arrived, and on the buffered fallback it is the ONLY closure that can
            // start playback at `seal`. The rest of the plan appends behind the sentence being
            // spoken, into the same timeline.
            const rest = parts.slice(1);
            if (rest.length > 0) {
              const { data } = await supabase.auth.getSession();
              const token = data.session?.access_token;
              if (stale() || !token) return;
              const spoke = await speakInto(session, rest, token, stale);
              if (!spoke) return;
            }
            await seal(session, stale);
          })();
          return;
        }
      }

      startFresh(passage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seal, speakInto],
  );

  const prime = useCallback(
    (text: string) => {
      const opener = text.trim();
      if (!opener) return;

      run.current += 1;
      const ticket = run.current;
      teardown();
      setFailure(null);
      setCurrentTime(0);
      setReach(0);
      setComplete(false);
      setPlaying(false);
      setStatus("loading");

      const stale = () => !alive.current || run.current !== ticket;

      const flow = (async (): Promise<SpeakSession | null> => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (stale()) return null;
        if (!token) {
          setFailure("not-signed-in");
          setStatus("idle");
          return null;
        }
        const session = openSession(stale);
        // 🔴 THE SAME FIELDS THE PLAN'S OWN PROSE BRANCH WOULD USE — `openerUtterance` lives in
        // `reply-speech.ts` beside that branch precisely so the two cannot drift. The sink stays
        // OPEN: `start` appends the rest of the reply behind this, or `settleStream` closes it.
        const spoke = await speakInto(session, [openerUtterance(opener, live.current.voice)], token, stale);
        return spoke ? session : null;
      })();

      primed.current = { flow, text: opener, ticket };
    },
    [openSession, speakInto, teardown],
  );

  const primedOpener = useCallback(() => {
    const head = primed.current;
    return head && head.ticket === run.current ? head.text : null;
  }, []);

  const settleStream = useCallback(() => {
    const head = primed.current;
    primed.current = null;
    if (!head || head.ticket !== run.current) return;
    const stale = () => !alive.current || run.current !== head.ticket;
    void (async () => {
      const session = await head.flow;
      if (stale()) return;
      if (!session) {
        // The opener never made sound and nothing else is coming: back to idle, so the
        // conversation loop's quiet-turn grace can reopen the microphone.
        setStatus("idle");
        teardown();
        return;
      }
      await seal(session, stale);
    })();
  }, [seal, teardown]);

  const toggle = useCallback(() => {
    const audio = element.current;
    if (!audio) return;
    setFailure(null);
    if (audio.paused) {
      void audio.play().catch(() => {
        if (alive.current) setFailure("playback-blocked");
      });
    } else {
      audio.pause();
    }
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = element.current;
      if (!audio) return;
      const buffered = audio.buffered;
      const bufferedEnd = buffered.length > 0 ? buffered.end(buffered.length - 1) : 0;
      const known = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      audio.currentTime = seekTarget(audio.currentTime, deltaSeconds, Math.max(known, bufferedEnd));
      measure(audio);
    },
    [measure],
  );

  const scrub = useCallback(
    (fraction: number) => {
      const audio = element.current;
      if (!audio) return;
      const buffered = audio.buffered;
      const bufferedEnd = buffered.length > 0 ? buffered.end(buffered.length - 1) : 0;
      const known = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      audio.currentTime = scrubTarget(fraction, Math.max(known, bufferedEnd));
      measure(audio);
    },
    [measure],
  );

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const next = nextPlaybackRate(current);
      writePlaybackRate(typeof window === "undefined" ? null : window.localStorage, next);
      // 🔴 APPLIED TO THE AUDIO THAT IS ALREADY HERE. No request, no wait, no restart — the whole
      // reason playback rate was taken off the synthesis request.
      if (element.current) element.current.playbackRate = next;
      return next;
    });
  }, []);

  return {
    complete,
    currentTime,
    cycleRate,
    failure,
    playing,
    prime,
    primedOpener,
    rate,
    reach,
    scrub,
    seekBy,
    settleStream,
    start,
    status,
    stop,
    toggle,
  };
}
