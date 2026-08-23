"use client";

// DEV-ONLY PREVIEW — the mascot's animation language, played on its real events.
//
// Owner 2026-08-24: *"can you actually just show me the animation? It will play when an exact
// event happens — that'll help me more than just looking at stills."* So this board has no
// stills. The stage below is a mock slice of the learn canvas — a composer, a reply area, the
// SAME BloubDock the product mounts — and every row in the event list is a button that fires
// that exact product moment through the same props and the same attention wiring the app uses.
//
// Same convention as the other dev-preview routes: plain client page, no auth gate, not
// linked from navigation, nothing the product ships imports it.

import { useEffect, useRef, useState } from "react";

import { BloubBot } from "@/components/bloub/bloub-bot";
import { BloubDock } from "@/components/bloub/bloub-dock";
import { usePoke } from "@/components/bloub/use-poke";
import type { FaceId, HandId } from "@/lib/character/face";
import type { Station } from "@/lib/character/stations";
import { lookAt } from "@/lib/mascot/attention";

type Step = readonly [at: number, run: () => void];

const QUESTION = "What should I focus on first in this chapter?";
const ANSWER =
  "Start with the two ideas the chapter keeps returning to — every worked example leans on them. " +
  "Read the summary first, then take the examples backwards: answer, then method.";

function Stage() {
  const [face, setFace] = useState<FaceId | null>(null);
  const [station, setStation] = useState<Station>("corner");
  const [marker, setMarker] = useState<"!" | "?" | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hand, setHand] = useState<HandId | null>(null);
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
    setMarker(null);
    setCaption(null);
    setLeaving(false);
    setHand(null);
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
    [t, () => { setTyped(""); composerRef.current?.blur(); setStation("centre"); setCaption("reading the sources…"); }],
    [t + 1600, () => setCaption("lining up an answer…")],
    [t + 2900, () => setLeaving(true)],
    [t + 3300, () => { setCaption(null); setLeaving(false); setStation("corner"); }],
  ];

  /** The answer arrives: the words write in, it turns and reads its own answer, then the
   *  glove pops out and points at it before everything melts back to rest. */
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
      [t + 4500, () => setHand("point")],
      [t + 6400, () => setHand(null)],
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
      name: "The answer arrives",
      hint: "the words write in, it reads its own answer, then points at it",
      fire: () => run("answer", answerSteps(0)),
    },
    {
      name: "Nemesis needs an answer from you",
      hint: "the ? pops in and bobs until you answer — answering earns a thumbs-up",
      fire: () => {
        if (marker === "?") {
          run("answered", [
            [0, rest],
            [60, () => setHand("up")],
            [1800, () => setHand(null)],
          ]);
        } else {
          timers.current.forEach(window.clearTimeout);
          rest();
          setPlaying(null);
          setMarker("?");
        }
      },
    },
    {
      name: "Heads-up (proposed)",
      hint: "the ! pops in, bobs, and leaves on its own — an animation, not a sticker",
      fire: () => run("headsup", [
        [0, () => setMarker("!")],
        [3200, () => setMarker(null)],
      ]),
    },
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
        <BloubDock
          anchor=".stage-composer"
          bottom={24}
          caption={caption}
          captionLeaving={leaving}
          contain
          face={face}
          gap={10}
          hand={hand}
          left={24}
          marker={marker}
          station={station}
          state="idle"
        />
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {events.map((ev) => (
          <li key={ev.name}>
            <button
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors hover:bg-(--ui-control-hover-background) ${
                playing !== null && ev.name !== "Nemesis needs an answer from you"
                  ? "border-(--ui-stroke-secondary) opacity-80"
                  : "border-(--ui-stroke-secondary)"
              }`}
              onClick={ev.fire}
              type="button"
            >
              <span className="block text-sm font-medium text-(--ui-text-primary)">
                {ev.name === "Nemesis needs an answer from you" && marker === "?" ? "Answer it" : ev.name}
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
          poke.motion === "jump" ? "bloub-jump" : poke.motion === "spin" ? "bloub-spin" : undefined
        }
      >
        <BloubBot
          face={poke.face}
          onPoke={poke.poke}
          size={148}
          state={poke.state}
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

function GloveLive() {
  const [pose, setPose] = useState<HandId | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const pop = (next: HandId) => {
    timers.current.forEach(window.clearTimeout);
    setPose(null);
    timers.current = [
      window.setTimeout(() => setPose(next), 60),
      window.setTimeout(() => setPose(null), 2800),
    ];
  };
  return (
    <figure className="flex flex-col items-center gap-3">
      <BloubBot hand={pose} size={148} state="idle" track />
      <figcaption className="text-xs text-(--ui-text-secondary)">The glove, up close</figcaption>
      <div className="flex gap-2">
        {(["point", "up", "down"] as const).map((p) => (
          <button
            key={p}
            className="rounded-lg border border-(--ui-stroke-secondary) px-3 py-1 text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
            data-glove={p}
            onClick={() => pop(p)}
            type="button"
          >
            {p === "point" ? "Point" : p === "up" ? "Thumbs up" : "Thumbs down"}
          </button>
        ))}
      </div>
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
        <GloveLive />
        <figure className="flex flex-col items-center gap-3">
          <BloubBot face="reading" size={148} state="idle" track />
          <figcaption className="text-xs text-(--ui-text-secondary)">
            Reading, live — the glasses ride the gaze. Move your cursor.
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
