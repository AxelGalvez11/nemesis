"use client";

// DEV-ONLY PREVIEW — the mascot's animation language, played on its real events.
//
// Owner 2026-08-24: *"can you actually just show me the animation? It will play when an exact
// event happens — that'll help me more than just looking at stills."* So this board has no
// stills. The stage below is a mock slice of the learn canvas — a composer, a reply area, the
// SAME CharacterDock the product mounts — and every row in the event list is a button that fires
// that exact product moment through the same props and the same attention wiring the app uses.
//
// Same convention as the other dev-preview routes: plain client page, no auth gate, not
// linked from navigation, nothing the product ships imports it.

import { useEffect, useRef, useState } from "react";

import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { CharacterDock } from "@/components/character/character-dock";
import { usePoke } from "@/components/character/use-poke";
import type { FeatureFace } from "@/lib/avatar/features";
import { CHARACTER_SILHOUETTE } from "@/lib/character/body";
import type { Station } from "@/lib/character/stations";
import { lookAt } from "@/lib/mascot/attention";

type Step = readonly [at: number, run: () => void];

const QUESTION = "What should I focus on first in this chapter?";
const ANSWER =
  "Start with the two ideas the chapter keeps returning to — every worked example leans on them. " +
  "Read the summary first, then take the examples backwards: answer, then method.";

function Stage() {
  const [face, setFace] = useState<FeatureFace | null>(null);
  const [station, setStation] = useState<Station>("corner");
  const [caption, setCaption] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState("");
  const [reply, setReply] = useState("");
  const [chip, setChip] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  const chipRef = useRef<HTMLDivElement | null>(null);
  const replyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const timers = useRef<number[]>([]);

  const rest = () => {
    setFace(null);
    setStation("corner");
    setCaption(null);
    setLeaving(false);
    lookAt(null);
  };

  const run = (name: string, steps: readonly Step[]) => {
    timers.current.forEach(window.clearTimeout);
    rest();
    setPlaying(name);
    const last = steps.reduce((m, [at]) => Math.max(m, at), 0);
    timers.current = [
      ...steps.map(([at, fn]) => window.setTimeout(fn, at)),
      window.setTimeout(() => setPlaying(null), last + 60),
    ];
  };

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      lookAt(null);
    },
    [],
  );

  // ── The events, each as the steps the product itself would take ─────────────

  /** A document lands: the chip drops in, the glasses go on, the eyes go to what it reads. */
  const ingestSteps = (t: number): Step[] => [
    [t, () => { setChip(true); setFace("reading"); }],
    [t + 80, () => lookAt(chipRef.current)],
    [t + 3000, () => { setFace(null); lookAt(null); }],
  ];

  /** The learner asks: focus lands in the composer and the words arrive; the eyes follow the
   *  focus through the dock's own focus listener — nothing here aims them by hand. */
  const askSteps = (t: number): Step[] => [
    [t, () => { setReply(""); composerRef.current?.focus(); }],
    ...QUESTION.split("").map((_, i): Step => [t + 220 + i * 34, () => setTyped(QUESTION.slice(0, i + 1))]),
  ];

  /** Nemesis works: it walks to the middle, grows, and the words light up beside it. */
  const thinkSteps = (t: number): Step[] => [
    [t, () => { setTyped(""); composerRef.current?.blur(); setStation("centre"); setCaption("Reading your material"); }],
    [t + 1600, () => { setCaption("Mapping what you know"); }],
    [t + 2900, () => setLeaving(true)],
    [t + 3300, () => { setCaption(null); setLeaving(false); setStation("corner"); }],
  ];

  /** A turn that buys a web search: the caption says so in words (the mark beside it died
   *  2026-08-30 with the ChatGPT-parity thinking preview). The favicon chips that will sit under
   *  it land with the same-origin proxy being built in the lane that owns them. */
  const searchSteps = (t: number): Step[] => [
    [t, () => { setTyped(""); composerRef.current?.blur(); setStation("centre"); setCaption("Searching the web"); }],
    [t + 2600, () => setLeaving(true)],
    [t + 3000, () => { setCaption(null); setLeaving(false); setStation("corner"); }],
  ];

  /** The answer arrives: the words write in, then it turns and reads its own answer for a
   *  beat before coming back to the learner. */
  const answerSteps = (t: number): Step[] => {
    const write: Step[] = [];
    for (let i = 3; i <= ANSWER.length; i += 3) {
      write.push([t + (i / 3) * 22, () => setReply(ANSWER.slice(0, i))]);
    }
    return [
      [t, () => setReply("")],
      ...write,
      [t + 1650, () => setReply(ANSWER)],
      [t + 1750, () => lookAt(replyRef.current)],
      [t + 4350, () => lookAt(null)],
    ];
  };

  const events: Array<{ name: string; hint: string; fire: () => void }> = [
    {
      name: "You drop a document in",
      hint: "the file lands, the glasses go on, and it reads what arrived",
      fire: () => run("ingest", ingestSteps(0)),
    },
    {
      name: "You ask a question",
      hint: "focus lands in the composer and its eyes follow your words",
      fire: () => run("ask", askSteps(0)),
    },
    {
      name: "Nemesis thinks",
      hint: "it walks to the middle, grows, sways while it works, and its eyes search",
      fire: () => run("think", thinkSteps(0)),
    },
    {
      name: "Nemesis searches the web",
      hint: "the caption gets a magnifier — the most specific true thing while a search runs",
      fire: () => run("search", searchSteps(0)),
    },
    {
      name: "The answer arrives",
      hint: "the words write in, and it reads its own answer for a beat",
      fire: () => run("answer", answerSteps(0)),
    },
    // 🔴 "Nemesis needs an answer from you" AND "Heads-up" ARE GONE FROM THIS BOARD because the
    // thing they played is gone from the product (owner 2026-08-26). Both did nothing but set the
    // "?"/"!" over the character's head; see the `marker` note in character-dock.tsx.
    {
      name: "Play the whole loop",
      hint: "ask → think → answer → read → point, chained end to end",
      fire: () =>
        run("loop", [
          ...askSteps(0),
          ...thinkSteps(2600),
          ...answerSteps(6100),
        ]),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-(--ui-stroke-secondary)">
        <div ref={replyRef} className="absolute left-6 top-6 max-w-md text-sm leading-relaxed text-(--ui-text-primary)">
          {reply ? <p>{reply}</p> : null}
        </div>
        {chip ? (
          <div
            ref={chipRef}
            className="stage-chip absolute right-6 top-6 flex items-center gap-2 rounded-lg border border-(--ui-stroke-secondary) px-3 py-2 text-xs text-(--ui-text-secondary)"
          >
            <span aria-hidden="true" className="block h-3.5 w-3 rounded-[2px] border border-current" />
            chapter-4-notes.pdf
          </div>
        ) : null}
        <div className="absolute inset-x-6 bottom-6">
          <textarea
            ref={composerRef}
            className="stage-composer w-full resize-none rounded-xl border border-(--ui-stroke-secondary) bg-transparent px-4 py-3 text-sm text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-tertiary)"
            placeholder="Ask anything…"
            readOnly
            rows={2}
            value={typed}
          />
        </div>
        <CharacterDock
          anchor=".stage-composer"
          bottom={24}
          caption={caption}
          captionLeaving={leaving}
          contain
          face={face}
          gap={14}
          left={24}
          // 🔴 THE PRODUCT'S ARRANGEMENT, SO THIS STAGE KEEPS BEING WORTH LOOKING AT. The canvas
          // moved the character on top of the composer at its left edge on 2026-08-26; a preview
          // still showing it in the left margin would be a picture of a surface that no longer
          // exists, which is worse than no preview. `gap` matches the canvas's too.
          place="above"
          station={station}
          state="idle"
        />
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {events.map((ev) => (
          <li key={ev.name}>
            <button
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors hover:bg-(--ui-control-hover-background) ${
                playing !== null
                  ? "border-(--ui-stroke-secondary) opacity-80"
                  : "border-(--ui-stroke-secondary)"
              }`}
              onClick={ev.fire}
              type="button"
            >
              <span className="block text-sm font-medium text-(--ui-text-primary)">
                {ev.name}
              </span>
              <span className="mt-0.5 block text-xs text-(--ui-text-secondary)">{ev.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <style>{`
        .stage-chip { animation: stage-chip-in 340ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @keyframes stage-chip-in {
          from { opacity: 0; transform: translateY(-10px) scale(0.92); }
        }
        @media (prefers-reduced-motion: reduce) { .stage-chip { animation: none; } }
      `}</style>
    </section>
  );
}

function LivePokeable() {
  const poke = usePoke("idle");
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className={
          poke.motion === "jump" ? "character-jump" : poke.motion === "spin" ? "character-spin" : undefined
        }
      >
        <NemesisAvatar
          face={poke.face}
          onPoke={poke.poke}
          size={148}
          animation={poke.state}
          silhouette={CHARACTER_SILHOUETTE}
          track
          waggle={poke.motion === "waggle"}
        />
      </div>
      <figcaption className="text-xs text-(--ui-text-secondary)">
        Poke it — jump · waggle · spin · sigma · wink
      </figcaption>
      {/* The character itself is clickable, exactly as in the product; the button is for
          reviewing on touchpads and for driving the cycle from tests. */}
      <button
        className="rounded-lg border border-(--ui-stroke-secondary) px-3 py-1 text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
        data-poke
        onClick={poke.poke}
        type="button"
      >
        Poke
      </button>
    </figure>
  );
}

export default function MascotLanguagePage() {
  return (
    // data-workspace: outside it, the legacy stylesheet repaints every button as an accent
    // pill — same opt-out the app shell and the other dev-preview boards use.
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-8 py-14" data-workspace="">
      <header>
        <h1 className="text-lg font-medium text-(--ui-text-primary)">The mascot&apos;s own language</h1>
        <p className="mt-1 text-sm text-(--ui-text-secondary)">
          Every row below is a real product event. Press it and watch what the character does —
          this stage runs the same component and the same wiring the app ships.
        </p>
      </header>

      <Stage />

      <section className="flex flex-wrap items-end gap-14">
        <LivePokeable />
        <figure className="flex flex-col items-center gap-3">
          <NemesisAvatar animation="idle" face="reading" silhouette={CHARACTER_SILHOUETTE} size={148} track />
          <figcaption className="text-xs text-(--ui-text-secondary)">
            Reading, live — the glasses ride the gaze. Move your cursor.
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
