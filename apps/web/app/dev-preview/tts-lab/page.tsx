"use client";

// DEV-ONLY — the listening bench §43 asks for.
//
// One locale, one phrase, every provider that has a key on this machine, side by side. Latency,
// characters and cost are measured or reported as unknown; the five rating axes are the owner's own
// list. A winner is only named after two or more providers have actually been listened to.
//
// 🔴 THE COLUMN THAT MATTERS MOST IS THE ONE THAT SAYS "advertised". A provider's language count
// sits beside its ratings precisely so the gap is visible: "supports 75 languages" and "sounds
// native in es-MX" are different claims, and only one of them can be heard.

import { useCallback, useEffect, useState } from "react";

import { RATING_AXES, type RatingAxis } from "@/lib/learn/tts-bakeoff";

interface ProviderRow {
  advertisedLocales: number | null;
  available: boolean;
  keyEnv: string;
  label: string;
  provider: string;
  usdPerMillionChars: number | null;
}

interface SampleRow {
  audioBase64?: string;
  available: boolean;
  chars?: number;
  detail?: string;
  latencyMs?: number;
  locale?: string;
  mime?: string;
  phrase?: string;
  provider: string;
  voice?: string;
}

interface WinnerRow {
  locale: string;
  promote: string | null;
  result:
    | { ok: true; provider: string; mean: number; ratings: number; locale: string }
    | { ok: false; reason: string; detail: string };
}

/** Locales worth having on hand: two varieties of one language, then two very different ones. */
const LOCALES = ["es-MX", "es-ES", "ja-JP", "pt-BR", "fr-FR", "de-DE"];

export default function TtsLabPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [locale, setLocale] = useState("es-MX");
  const [phrase, setPhrase] = useState("¿Dónde está la biblioteca? Está a la vuelta de la esquina.");
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRatings = useCallback(async () => {
    const response = await fetch("/api/dev/tts-bakeoff/ratings");
    if (!response.ok) return;
    const payload = await response.json();
    setWinners(payload.winners ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/dev/tts-bakeoff");
      if (response.ok) setProviders((await response.json()).providers ?? []);
    })();
    void loadRatings();
  }, [loadRatings]);

  const synthesise = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/tts-bakeoff", {
        body: JSON.stringify({ locale, phrase }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? `${response.status}`);
        setSamples([]);
        return;
      }
      setSamples(payload.samples ?? []);
    } finally {
      setBusy(false);
    }
  }, [locale, phrase]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-sm">
      <h1 className="text-xl font-semibold">TTS bake-off</h1>
      <p className="mt-1 text-neutral-500">
        Same phrase, same locale, every provider with a key on this machine. Nothing here changes what
        production speaks through — promotion is a commit.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-neutral-300 px-3 py-2"
          onChange={(event) => setLocale(event.target.value)}
          value={locale}
        >
          {LOCALES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          className="min-w-72 flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          onChange={(event) => setPhrase(event.target.value)}
          value={phrase}
        />
        <button className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40" disabled={busy} onClick={() => void synthesise()} type="button">
          {busy ? "Synthesising…" : "Speak all"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}

      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Providers on this machine</h2>
      <table className="w-full text-left">
        <thead className="text-xs text-neutral-500">
          <tr>
            <th className="py-1">provider</th>
            <th>key</th>
            <th>advertised locales</th>
            <th>USD / M chars</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((row) => (
            <tr className="border-t border-neutral-200" key={row.provider}>
              <td className="py-1">{row.label}</td>
              <td className={row.available ? "text-green-700" : "text-neutral-400"}>
                {row.available ? "set" : `${row.keyEnv} unset`}
              </td>
              {/* Advertised, never measured. The whole reason both columns exist. */}
              <td className="text-neutral-400">{row.advertisedLocales ?? "unverified"}</td>
              <td className="text-neutral-400">{row.usdPerMillionChars ?? "unverified"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {samples.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Samples</h2>
          <ul className="space-y-4">
            {samples.map((sample) => (
              <SampleCard key={sample.provider} onRated={loadRatings} sample={sample} />
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Measured winners</h2>
      {winners.length === 0 ? (
        <p className="text-neutral-500">Nobody has listened to anything yet.</p>
      ) : (
        <ul className="space-y-2">
          {winners.map((winner) => (
            <li className="rounded-lg border border-neutral-200 p-3" key={winner.locale}>
              <span className="font-mono text-xs">{winner.locale}</span>{" "}
              {winner.result.ok ? (
                <>
                  <strong>{winner.result.provider}</strong> · mean {winner.result.mean.toFixed(2)} over {winner.result.ratings} ratings
                  {winner.promote && (
                    <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 p-2 text-xs text-white">{winner.promote}</pre>
                  )}
                </>
              ) : (
                <span className="text-neutral-500">
                  no winner — <span className="font-mono text-xs">{winner.result.reason}</span> · {winner.result.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function SampleCard({ onRated, sample }: { onRated: () => void; sample: SampleRow }) {
  const [scores, setScores] = useState<Partial<Record<RatingAxis, number>>>({});
  const [saved, setSaved] = useState(false);

  if (!sample.available) {
    return (
      <li className="rounded-lg border border-dashed border-neutral-300 p-3 text-neutral-400">
        {sample.provider} — {sample.detail}
      </li>
    );
  }
  if (!sample.audioBase64) {
    return (
      <li className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
        {sample.provider} — {sample.detail}
        {sample.latencyMs !== undefined && <span className="ml-2 text-xs">after {sample.latencyMs}ms</span>}
      </li>
    );
  }

  const complete = RATING_AXES.every((axis) => scores[axis] !== undefined);

  return (
    <li className="rounded-lg border border-neutral-200 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <strong>{sample.provider}</strong>
        <span className="text-neutral-500">{sample.locale}</span>
        {sample.voice && <span className="text-neutral-500">voice {sample.voice}</span>}
        <span className="text-neutral-500">{sample.latencyMs}ms</span>
        <span className="text-neutral-500">{sample.chars} chars</span>
        {/* Cost is deliberately absent until a rate is verified — see PROVIDER_CATALOGUE. */}
        <span className="text-neutral-400">cost unverified</span>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio className="mt-2 w-full" controls src={`data:${sample.mime ?? "audio/mpeg"};base64,${sample.audioBase64}`} />
      <div className="mt-3 flex flex-wrap gap-4">
        {RATING_AXES.map((axis) => (
          <label className="text-xs" key={axis}>
            <span className="mr-1 text-neutral-500">{axis.replace(/_/g, " ")}</span>
            <select
              className="rounded border border-neutral-300 px-1 py-0.5"
              onChange={(event) => setScores((current) => ({ ...current, [axis]: Number(event.target.value) }))}
              value={scores[axis] ?? ""}
            >
              <option value="">–</option>
              {[1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40"
          disabled={!complete || saved}
          onClick={async () => {
            await fetch("/api/dev/tts-bakeoff/ratings", {
              body: JSON.stringify({ rating: scores, sample }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });
            setSaved(true);
            onRated();
          }}
          type="button"
        >
          {saved ? "Saved" : "Save rating"}
        </button>
      </div>
    </li>
  );
}
