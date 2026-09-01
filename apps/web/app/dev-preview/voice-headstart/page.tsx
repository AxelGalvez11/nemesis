"use client";

// DEV-ONLY PREVIEW — the voice head start's AUDIO mechanics, proven in a real browser.
//
// `spoken-opener.test.ts` proves the watcher's opener equals the finished plan's first utterance,
// and the transport was measured against the live model (2026-08-31: fires at 0.9–1.8s, full
// completion at 1.8–3.5s). What no Node test can exercise is the half that lives in browser API:
// `prime()` opening a MediaSource sink on the first sentence, `start()` APPENDING the rest of the
// plan into that same playing timeline (no restart, no second element), and `settleStream()`
// sealing a primed timeline whose turn died. This page runs those three scenarios against the
// REAL `useResponseAudio` — the world around it is scripted (the See-figures doctrine: real
// component, hand-written spec):
//
//   · fetch is patched for the two TTS routes only, answering with real MP3 bytes (two tones of
//     known duration: 1.2s opener, 1.8s rest) streamed in chunks;
//   · the auth boundary hands back a harness token, because a page with no Supabase env has no
//     session and the hook correctly refuses to speak without one.
//
// The verdict list is written into the DOM with data-verdict attributes so a headless run can
// read PASS/FAIL without a screenshot. Nothing on this page ships anywhere.

import { useCallback, useEffect, useRef, useState } from "react";

import { useResponseAudio } from "@/components/workspace/learn/use-response-audio";
import { supabase } from "@/lib/supabase";
import { DEFAULT_READING_VOICE } from "@/lib/speech/reading-voice";

import { OPENER_MP3, REST_MP3 } from "./clips";

const OPENER = "First sentence here.";
const FULL = "First sentence here. And the second part follows now.";
const MISMATCH = "A different opener sentence.";

function bytesOf(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** A streamed MP3 response: half the bytes now, the rest after a beat, like a live synthesis. */
function streamedClip(base64: string): Response {
  const bytes = bytesOf(base64);
  const half = Math.floor(bytes.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, half));
      setTimeout(() => {
        controller.enqueue(bytes.slice(half));
        controller.close();
      }, 120);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "audio/mpeg" }, status: 200 });
}

interface Verdict {
  name: string;
  pass: boolean;
  detail: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function VoiceHeadstartPreview() {
  const audio = useResponseAudio(DEFAULT_READING_VOICE);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [done, setDone] = useState(false);
  /** Every TTS request the page answered: which text was asked for, in order. */
  const calls = useRef<string[]>([]);
  /** The live audio state, readable by the polling helpers without stale closures. */
  const state = useRef(audio);
  state.current = audio;
  const ran = useRef(false);

  const record = useCallback((name: string, pass: boolean, detail: string) => {
    setVerdicts((past) => [...past, { detail, name, pass }]);
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // The scripted world: TTS answered locally, the auth boundary satisfied.
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("nemesis-speak") || url.includes("/api/speech/tts")) {
        const body = init?.body ? (JSON.parse(String(init.body)) as { text?: string }) : {};
        const text = body.text ?? "";
        calls.current.push(text);
        return streamedClip(text.endsWith("now.") ? REST_MP3 : OPENER_MP3);
      }
      return realFetch(input, init);
    };
    (supabase.auth as unknown as { getSession: () => Promise<unknown> }).getSession = async () => ({
      data: { session: { access_token: "harness-token" } },
    });

    /** Poll until the condition holds; false when the timeout passes first. */
    const until = async (check: () => boolean, ms: number): Promise<boolean> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (check()) return true;
        await wait(60);
      }
      return check();
    };

    void (async () => {
      await wait(250);

      // ── S1: prime, then start — one timeline, no restart ─────────────────────────────────
      {
        const before = calls.current.length;
        state.current.prime(OPENER);
        const spoke = await until(() => state.current.status === "active" && state.current.playing, 4000);
        record("S1 primed audio plays before start() is ever called", spoke, `status=${state.current.status} playing=${state.current.playing}`);

        // Sample for a restart signature from here on: time regressing, or status re-loading.
        let regressed = false;
        let reloaded = false;
        let last = 0;
        const sampler = window.setInterval(() => {
          const now = state.current.currentTime;
          if (now + 0.15 < last) regressed = true;
          last = Math.max(last, now);
          if (state.current.status === "loading") reloaded = true;
        }, 50);

        await wait(900);
        state.current.start(FULL);
        const sealed = await until(() => state.current.complete, 8000);
        const ended = await until(() => !state.current.playing && state.current.complete, 8000);
        window.clearInterval(sampler);

        record("S1 the timeline seals with both parts in it", sealed && ended && state.current.reach > 2.4, `reach=${state.current.reach.toFixed(2)} (opener 1.2s + rest 1.8s)`);
        record("S1 continuation never restarted the audio", !regressed && !reloaded, `regressed=${regressed} reloaded=${reloaded}`);
        const texts = calls.current.slice(before);
        record("S1 exactly two synthesis requests, opener then rest", texts.length === 2 && texts[0] === OPENER && texts[1] === "And the second part follows now.", JSON.stringify(texts));
      }

      // ── S2: prime, then the turn dies — settleStream seals the opener alone ──────────────
      {
        state.current.stop();
        await wait(200);
        const before = calls.current.length;
        state.current.prime(OPENER);
        const spoke = await until(() => state.current.status === "active" && state.current.playing, 4000);
        state.current.settleStream();
        const sealed = await until(() => state.current.complete && !state.current.playing, 6000);
        record("S2 a primed turn that dies still finishes cleanly", spoke && sealed && state.current.reach < 1.7, `reach=${state.current.reach.toFixed(2)} calls=${calls.current.length - before}`);
      }

      // ── S3: a mismatched prime falls back to the shipped path ────────────────────────────
      {
        state.current.stop();
        await wait(200);
        const before = calls.current.length;
        state.current.prime(MISMATCH);
        await until(() => state.current.status === "active" && state.current.playing, 4000);
        state.current.start(FULL);
        const sealed = await until(() => state.current.complete && !state.current.playing, 9000);
        const texts = calls.current.slice(before);
        record(
          "S3 a mismatch restarts clean and speaks the whole reply",
          sealed && state.current.reach > 2.4 && texts.length === 3 && texts[0] === MISMATCH && texts[1] === OPENER,
          `reach=${state.current.reach.toFixed(2)} calls=${JSON.stringify(texts)}`,
        );
      }

      state.current.stop();
      setDone(true);
    })();
  }, [record]);

  return (
    <main data-workspace className="min-h-screen bg-(--ui-bg) p-[48px] text-(--ui-text-primary)">
      <h1 className="text-[15px] font-semibold">voice head start — audio mechanics, real browser</h1>
      <p className="mt-[6px] max-w-[640px] text-[12.5px] text-(--ui-text-tertiary)">
        Real useResponseAudio; scripted TTS (two tones: 1.2s opener, 1.8s rest) and a harness auth
        token. Three scenarios run on load; sound is expected.
      </p>
      <ul className="mt-[24px] flex max-w-[720px] flex-col gap-[8px]" data-suite-done={done ? "1" : undefined}>
        {verdicts.map((verdict) => (
          <li
            key={verdict.name}
            data-verdict={verdict.pass ? "pass" : "fail"}
            data-name={verdict.name}
            className="rounded-[8px] border border-(--ui-border-faint) px-[14px] py-[10px] text-[12.5px]"
          >
            <span className={verdict.pass ? "text-[#3fa96c]" : "text-[#d4544f]"}>{verdict.pass ? "PASS" : "FAIL"}</span>
            <span className="ml-[10px]">{verdict.name}</span>
            <span className="ml-[10px] text-(--ui-text-quaternary)">{verdict.detail}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
