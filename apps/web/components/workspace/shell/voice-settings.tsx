"use client";

// Choosing the voice Nemesis reads in — once, here, for good.
//
// 🔴🔴 THIS REPLACES A SETTINGS PANEL THAT WAS DECORATION. Until now Settings › Voice offered
// "Juniper / Maple / Vale / Cove" and a speaking-speed slider, and not one of the four was a voice
// Nemesis can produce: they were placeholder names written against a screenshot, stored in
// `nemesis.web.settings`, and read by nothing. Meanwhile the REAL picker was buried in a Canvas
// menu. A setting that looks like it works and does nothing is worse than a missing one, because
// nobody thinks to look for the bug.
//
// 🔴 EVERY VOICE HERE IS ONE THE PRODUCT CAN ACTUALLY SPEAK IN. The xAI six were established by
// probing the deployed function (`lib/learn/canvas-voices.ts` records the run, including the ids
// that were REFUSED, which is what makes it a measurement). Azure's are fetched live from its own
// catalogue. Nothing on this page is a name somebody typed.
//
// 🔴 AND EVERY ONE OF THEM CAN BE HEARD BEFORE IT IS CHOSEN. Owner, 2026-08-20: *"selecting voices
// should give a small preview."* Six syllables — eve, ara, rex, gork, sal, leo — say nothing about
// how a voice sounds, and picking blind then finding out on your next question is not picking.

import { useCallback, useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { ANSWER_SPEED, LOCALE_UNSPECIFIED } from "@/lib/learn/speech-route";
import { ttsRequest } from "@/lib/learn/tts-request";
import { supabase } from "@/lib/supabase";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import {
  DEFAULT_READING_VOICE,
  READING_VOICE_KEY,
  readReadingVoice,
  type ReadingVoice,
  sameVoice,
  writeReadingVoice,
  XAI_READING_VOICES,
} from "@/lib/speech/reading-voice";
import { cn } from "@/lib/utils";

/**
 * What a voice says when you press it.
 *
 * 🔴 ONE SENTENCE, ABOUT THE VOICE RATHER THAN ABOUT NEMESIS. A preview is a sample of a SOUND; a
 * line of product copy makes you read instead of listen, and a long one makes you wait to hear the
 * end of a thing you are only sampling. Short enough that pressing four in a row is four sounds.
 */
const PREVIEW_LINE = "This is how I sound.";

/** One row of the Azure list, as `/api/speech/voices?multilingual=true` answers it. */
interface AzureRow {
  shortName: string;
  name: string;
  locale: string;
  localeName: string;
  gender: string;
  speaks: number;
}

/** Why the Azure section is not showing anything. Named, because "empty" hides three problems. */
type AzureState =
  | { kind: "loading" }
  | { kind: "ready"; rows: AzureRow[] }
  /** Azure has no key in this deployment. Not a failure — the xAI voices are the whole product. */
  | { kind: "unconfigured" }
  | { kind: "failed" };

export function VoiceSettings() {
  const [selected, setSelected] = useState<ReadingVoice>(DEFAULT_READING_VOICE);
  const [azure, setAzure] = useState<AzureState>({ kind: "loading" });
  /** Which row is previewing, so only its own button becomes a stop button. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const alive = useRef(true);

  // 🔴 AFTER THE FIRST PAINT, NEVER DURING RENDER — `localStorage` does not exist on the server, and
  // reading it in a `useState` initialiser is the hydration mismatch the Canvas hooks already
  // solved once.
  useEffect(() => {
    setSelected(readReadingVoice(typeof window === "undefined" ? null : window.localStorage));
  }, []);

  const release = useCallback(() => {
    const audio = player.current;
    player.current = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); }
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; release(); };
  }, [release]);

  // Azure's cross-lingual voices, if this deployment has an Azure key at all.
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!live) return;
      if (!token) { setAzure({ kind: "failed" }); return; }
      try {
        const res = await fetch("/api/speech/voices?multilingual=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!live) return;
        // 503 is "no Azure credential here", which is a normal deployment and not a fault.
        if (res.status === 503) { setAzure({ kind: "unconfigured" }); return; }
        if (!res.ok) { setAzure({ kind: "failed" }); return; }
        const body = (await res.json()) as { voices?: AzureRow[] };
        if (!live) return;
        setAzure({ kind: "ready", rows: Array.isArray(body.voices) ? body.voices : [] });
      } catch {
        if (live) setAzure({ kind: "failed" });
      }
    })();
    return () => { live = false; };
  }, []);

  const choose = useCallback((voice: ReadingVoice) => {
    setSelected(voice);
    writeReadingVoice(typeof window === "undefined" ? null : window.localStorage, voice);
    // 🔴 TELL THE OPEN CANVASES. `storage` fires only in OTHER tabs — a browser rule, not an
    // oversight — so a canvas open behind this pane would keep reading in the old voice until a
    // refresh, which reads exactly like the setting not having worked.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(READING_VOICE_KEY));
  }, []);

  const preview = useCallback(
    async (voice: ReadingVoice) => {
      release();
      setPreviewing(voice.id);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || !alive.current) { setPreviewing(null); return; }
        // 🔴 THE SAME REQUEST BUILDER THE CANVAS USES, SO THE PREVIEW IS THE THING ITSELF. A sample
        // synthesised down a second code path is a demonstration of that path, not of the voice
        // you are about to live with — and it is exactly where "only the selected provider runs"
        // would quietly stop being true.
        const plan = ttsRequest({
          provider: voice.provider,
          rate: ANSWER_SPEED,
          supabaseAnonKey,
          supabaseUrl,
          text: PREVIEW_LINE,
          token,
          ...(voice.provider === "azure" ? { locale: voice.locale ?? LOCALE_UNSPECIFIED } : {}),
          voiceId: voice.id,
        });
        const res = await fetch(plan.url, plan.init);
        if (!res.ok || !alive.current) { setPreviewing(null); return; }
        const blob = await res.blob();
        if (blob.size === 0 || !alive.current) { setPreviewing(null); return; }
        const url = URL.createObjectURL(blob);
        objectUrl.current = url;
        const audio = new Audio(url);
        player.current = audio;
        audio.onended = () => { release(); if (alive.current) setPreviewing(null); };
        audio.onerror = () => { release(); if (alive.current) setPreviewing(null); };
        await audio.play().catch(() => { release(); if (alive.current) setPreviewing(null); });
      } catch {
        release();
        if (alive.current) setPreviewing(null);
      }
    },
    [release],
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
        <h3 className="mb-1 text-[length:var(--canvas-text-small)] font-semibold text-foreground">Nemesis voices</h3>
        <p className="mb-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
          These read whatever language you are working in — they identify it from the text, so one
          choice works for every subject and every language.
        </p>
        <div className="grid gap-1">
          {XAI_READING_VOICES.map((voice) => (
            <VoiceRow
              key={voice.id}
              onPick={() => choose(voice)}
              onPreview={() => void preview(voice)}
              picked={sameVoice(selected, voice)}
              playing={previewing === voice.id}
              title={voice.label}
              voice={voice}
            />
          ))}
        </div>
      </section>

      {/* 🔴 THE SECOND SECTION APPEARS ONLY WHERE THERE IS A SECOND PROVIDER. A deployment with no
          Azure key gets one honest list rather than a greyed-out section explaining an absence
          nobody can act on. */}
      {azure.kind === "loading" && (
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">Looking for more voices…</p>
      )}
      {azure.kind === "ready" && azure.rows.length > 0 && (
        <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
          <h3 className="mb-1 text-[length:var(--canvas-text-small)] font-semibold text-foreground">Azure neural voices</h3>
          <p className="mb-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-tertiary)">
            Multilingual voices from Microsoft&apos;s catalogue. Each one speaks dozens of languages,
            so it will still read your material whatever language it is in.
          </p>
          <div className="grid gap-1">
            {azure.rows.map((row) => {
              const voice: ReadingVoice = {
                id: row.shortName,
                label: row.name,
                locale: row.locale,
                localeName: row.localeName,
                provider: "azure",
              };
              return (
                <VoiceRow
                  hint={`${row.localeName} · speaks ${row.speaks} languages`}
                  key={row.shortName}
                  onPick={() => choose(voice)}
                  onPreview={() => void preview(voice)}
                  picked={sameVoice(selected, voice)}
                  playing={previewing === row.shortName}
                  title={row.name}
                  voice={voice}
                />
              );
            })}
          </div>
        </section>
      )}
      {azure.kind === "failed" && (
        // Named rather than silent: "we could not reach the catalogue" and "there is no second
        // provider here" are different facts with different fixes.
        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
          The additional voice catalogue could not be reached just now.
        </p>
      )}
    </div>
  );
}

function VoiceRow({
  hint,
  onPick,
  onPreview,
  picked,
  playing,
  title,
}: {
  hint?: string;
  onPick: () => void;
  onPreview: () => void;
  picked: boolean;
  playing: boolean;
  title: string;
  voice: ReadingVoice;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-colors",
        picked ? "border-(--theme-primary) bg-(--ui-control-active-background)" : "hover:bg-(--ui-control-hover-background)",
      )}
    >
      {/* 🔴 PICKING AND PREVIEWING ARE TWO BUTTONS, NOT ONE. Owner: *"optionally preview the voice
          BEFORE selecting it."* One button that both auditions and commits makes hearing all six
          mean choosing all six, and leaves you on whichever you happened to press last. */}
      <button
        aria-pressed={picked}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onPick}
        type="button"
      >
        <span className="grid size-4 shrink-0 place-items-center text-(--theme-primary)">
          {picked && <Codicon name="check" size="0.75rem" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--canvas-text-small)] font-medium text-foreground">{title}</span>
          {hint && <span className="block truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{hint}</span>}
        </span>
      </button>
      <button
        aria-label={`Preview ${title}`}
        className="grid size-7 shrink-0 place-items-center rounded-lg text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground"
        onClick={onPreview}
        title={`Preview ${title}`}
        type="button"
      >
        <Codicon name={playing ? "loading" : "play"} size="0.8rem" spinning={playing} />
      </button>
    </div>
  );
}
