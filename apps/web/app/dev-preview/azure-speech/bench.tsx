"use client";

// DEV-ONLY — the thirty seconds that tell you whether Azure actually works.
//
// 🔴 THIS EXISTS BECAUSE THE SUITE CANNOT ANSWER THE FIRST QUESTION ANYBODY HAS. Every test in
// `lib/speech` runs against fixtures, which proves the transform is right about a shape Azure
// returned once. It proves nothing about whether THIS deployment's credential works, whether the
// region is right, or whether an es-MX voice still exists. Until somebody makes a real request,
// "Azure is integrated" is a claim about code rather than about the product.
//
// 🔴 A BENCH, NOT A FEATURE, AND THE DIFFERENCE IS THE POINT. Nothing here is learner-facing and
// nothing here should become learner-facing. `/api/speech/*` is the product surface; this page just
// exercises it the way a person would, so the owner can hear a Mexican voice and see a real
// pronunciation score without a lesson existing yet.
//
// Guarded to non-production by the routes it calls and by `dev-preview` itself.

import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

interface Voice {
  shortName: string;
  locale: string;
  localeName: string;
  localName: string;
  gender: string;
  styles: string[];
  preview: boolean;
}

/** The three the tests cover, for the same reason: English, a variety distinction, non-Romance. */
const SUGGESTED = [
  { label: "Spanish (Mexico)", locale: "es-MX", text: "El perro corre rápido por el parque." },
  { label: "Spanish (Spain)", locale: "es-ES", text: "El perro corre rápido por el parque." },
  { label: "Japanese", locale: "ja-JP", text: "今日はいい天気ですね。" },
  { label: "English (US)", locale: "en-US", text: "The quick brown fox jumps over the lazy dog." },
];

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AzureSpeechBench() {
  const [locale, setLocale] = useState("es-MX");
  const [text, setText] = useState(SUGGESTED[0]!.text);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [match, setMatch] = useState<string>("");
  const [alternatives, setAlternatives] = useState<Voice[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [score, setScore] = useState<unknown>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const previous = useRef<unknown>(null);

  const lookUp = useCallback(async () => {
    setProblem(null);
    setVoice(null);
    const response = await fetch(`/api/speech/voices?locale=${encodeURIComponent(locale)}&fallback=true`, {
      headers: await authHeaders(),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.voice) {
      setProblem(`${payload?.reason ?? response.status}: ${payload?.detail ?? payload?.error ?? "no voice"}`);
      return;
    }
    setVoice(payload.voice);
    setMatch(payload.match);
    setAlternatives(payload.alternatives ?? []);
  }, [locale]);

  useEffect(() => {
    void lookUp();
  }, [lookUp]);

  const speak = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    setTtsMs(null);
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/speech/tts", {
        body: JSON.stringify({ fallback: true, locale, text }),
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setProblem(`${payload?.reason ?? response.status}: ${payload?.error ?? "synthesis failed"}`);
        return;
      }
      // 🔴 MEASURED IN THE BROWSER, NOT REPORTED BY THE SERVER. The header carries Azure's own round
      // trip; this is what the learner actually waits, which includes our hop and the download.
      const blob = await response.blob();
      setTtsMs(Math.round(performance.now() - startedAt));
      const element = new Audio(URL.createObjectURL(blob));
      void element.play();
    } finally {
      setBusy(false);
    }
  }, [locale, text]);

  const startRecording = useCallback(async () => {
    setProblem(null);
    setScore(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const active = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunks.current = [];
      active.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      active.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      recorder.current = active;
      active.start();
      setRecording(true);
    } catch {
      setProblem("microphone unavailable — Safari cannot record a format Azure accepts");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const active = recorder.current;
    if (!active) return;
    const audio = await new Promise<Blob>((resolve) => {
      const settled = active.onstop;
      active.onstop = (event) => {
        settled?.call(active, event);
        resolve(new Blob(chunks.current, { type: active.mimeType }));
      };
      active.stop();
    });
    recorder.current = null;
    setRecording(false);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("audio", audio, "attempt.webm");
      form.append("text", text);
      form.append("locale", locale);
      if (previous.current) form.append("previous", JSON.stringify(previous.current));
      const response = await fetch("/api/speech/pronunciation", { body: form, headers: await authHeaders(), method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setProblem(`${payload?.reason ?? response.status}: ${payload?.error ?? "assessment failed"}`);
        return;
      }
      previous.current = payload.evidence;
      setScore(payload);
    } finally {
      setBusy(false);
    }
  }, [locale, text]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8 font-sans text-sm">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Azure Speech — bench</h1>
        <p className="text-neutral-500">
          Dev only. Makes real Azure requests through <code>/api/speech/*</code>. If this page works, the credential and
          the region are right and every remaining gate is wiring rather than integration.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((suggestion) => (
            <button
              className="rounded border px-2 py-1 hover:bg-neutral-100"
              key={suggestion.locale}
              onClick={() => {
                setLocale(suggestion.locale);
                setText(suggestion.text);
              }}
              type="button"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="w-32 rounded border px-2 py-1 font-mono"
            onChange={(event) => setLocale(event.target.value)}
            value={locale}
          />
          <input className="flex-1 rounded border px-2 py-1" onChange={(event) => setText(event.target.value)} value={text} />
        </div>

        {problem && <p className="rounded bg-red-50 p-2 font-mono text-red-700">{problem}</p>}

        {voice && (
          <p className="text-neutral-600">
            <strong>{voice.shortName}</strong> — {voice.localName} ({voice.gender}, {voice.localeName})
            {match !== "exact" && <span className="ml-2 rounded bg-amber-100 px-1">{match}</span>}
            {alternatives.length > 0 && (
              <span className="ml-2 text-neutral-400">+{alternatives.length} other voices for this locale</span>
            )}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40" disabled={busy} onClick={() => void speak()} type="button">
            Speak it
          </button>
          {ttsMs !== null && <span className="text-neutral-500">{ttsMs}ms to first playable byte</span>}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Say it back</h2>
        <p className="text-neutral-500">
          Records one attempt, scores it against the sentence above, and compares it with your previous attempt. The
          recording is not stored anywhere.
        </p>
        <button
          className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
          disabled={busy}
          onClick={() => void (recording ? stopRecording() : startRecording())}
          type="button"
        >
          {recording ? "Stop and score" : "Record"}
        </button>
        {score !== null && (
          <pre className="max-h-96 overflow-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(score, null, 2)}</pre>
        )}
      </section>
    </main>
  );
}
