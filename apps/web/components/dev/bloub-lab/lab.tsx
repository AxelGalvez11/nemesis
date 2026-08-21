"use client";

// The bloub lab. Every animation, every silhouette, every colour, side by side.
//
// 🔴 IT EXISTS SO THE CANVAS NEVER HAS TO BE THE PLACE THIS IS DEBUGGED. The catalogue
// is 15 animations with drawn glyphs, orbiting rings, particles that pass behind the
// body, and a notification notch cut out of it. Checking those inside a lesson surface
// means reproducing a lesson every time, and it means a broken frame reaches a learner
// before it reaches me.
//
// Frozen cells cost one paint each, not a loop: the engine is a pure function of time,
// so a board of 15 thumbnails is 15 `sample(t)` calls and no `requestAnimationFrame` at
// all. That is why every board here can be a real render rather than a screenshot.

import { useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { BloubBot } from "@/components/bloub/bloub-bot";
import { BloubDock } from "@/components/bloub/bloub-dock";
import { speedOf, stationOf } from "@nemesis/shared/character/stations";
import { defaultCycle, totalDuration } from "@nemesis/shared/bloub/cycles";
import { EXPRESSIONS } from "@nemesis/shared/bloub/expressions";
import { COLORS, SHAPES } from "@nemesis/shared/bloub/skins";
import { POSES, SEQUENCE, STATE_BY_ID, type StateId } from "@nemesis/shared/bloub/states";

const ALL_STATES: StateId[] = [...SEQUENCE, "swirl"];

type View = "stage" | "states" | "shapes" | "colors" | "faces" | "dock";

const VIEWS: { id: View; label: string }[] = [
  { id: "stage", label: "Stage" },
  { id: "states", label: "Animations" },
  { id: "shapes", label: "Shapes" },
  { id: "colors", label: "Colours" },
  { id: "faces", label: "Expressions" },
  { id: "dock", label: "Dock" },
];

const chip = (on: boolean) =>
  [
    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
    on
      ? "border-transparent bg-foreground text-background"
      : "border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)",
  ].join(" ");

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-(--ui-stroke-secondary) p-3">
      <div className="grid h-[150px] place-items-center">{children}</div>
      <p className="mt-1 font-mono text-[10.5px] text-(--ui-text-tertiary)">{label}</p>
    </div>
  );
}

export function BloubLab() {
  const { theme, setTheme, bloubShape, bloubColor, setBloubShape, setBloubColor } = useTheme();
  const [view, setView] = useState<View>("stage");
  const [state, setState] = useState<StateId>("idle");
  const [expression, setExpression] = useState("neutre");
  const [size, setSize] = useState(220);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [track, setTrack] = useState(true);
  const [reduced, setReduced] = useState(false);

  const def = STATE_BY_ID.get(state);
  const cycle = defaultCycle();

  return (
    <div className="flex min-h-dvh gap-6 bg-background p-6 text-foreground">
      <aside className="w-[230px] shrink-0 space-y-5">
        <div className="grid grid-cols-3 gap-1.5">
          {VIEWS.map((v) => (
            <button className={chip(view === v.id)} key={v.id} onClick={() => setView(v.id)} type="button">
              {v.label}
            </button>
          ))}
        </div>

        <section>
          <h2 className="mb-1.5 text-[10px] tracking-widest text-(--ui-text-tertiary)">ANIMATION</h2>
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATES.map((id) => (
              <button className={chip(state === id)} key={id} onClick={() => setState(id)} type="button">
                {id}
              </button>
            ))}
          </div>
          {def && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-(--ui-text-tertiary)">
              hold {def.duration}s · morph {def.morph}s · speed {speedOf(state)}×
              {def.blinkIn ? " · blinks in" : ""}
              {def.baseBody ? " · takes your shape" : " · draws its own"}
              <br />
              station: {stationOf(state)}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-1.5 text-[10px] tracking-widest text-(--ui-text-tertiary)">SHAPE</h2>
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map((s) => (
              <button className={chip(bloubShape === s.id)} key={s.id} onClick={() => setBloubShape(s.id)} type="button">
                {s.id}
              </button>
            ))}
          </div>
          {def && !def.baseBody && (
            <p className="mt-2 text-[10px] text-(--ui-text-tertiary)">
              This animation draws its own body — the shape is what it is, so your choice does
              not apply until it returns to rest.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-1.5 text-[10px] tracking-widest text-(--ui-text-tertiary)">COLOUR</h2>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                aria-label={c.id}
                className={[
                  "size-6 rounded-full border",
                  bloubColor === c.id ? "ring-2 ring-(--theme-primary) ring-offset-2 ring-offset-(--background)" : "",
                  "border-(--ui-stroke-secondary)",
                ].join(" ")}
                key={c.id}
                onClick={() => setBloubColor(c.id)}
                style={{ backgroundColor: c.hex }}
                title={c.id}
                type="button"
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-1.5 text-[10px] tracking-widest text-(--ui-text-tertiary)">PLAYBACK</h2>
          <div className="flex flex-wrap gap-1.5">
            <button className={chip(!paused)} onClick={() => setPaused((p) => !p)} type="button">
              {paused ? "Paused" : "Playing"}
            </button>
            <button className={chip(reduced)} onClick={() => setReduced((r) => !r)} type="button">
              Reduced motion
            </button>
            <button className={chip(track)} onClick={() => setTrack((t) => !t)} type="button">
              Follow pointer
            </button>
            <button className={chip(false)} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
              {theme === "dark" ? "Dark" : "Light"}
            </button>
          </div>
          <label className="mt-2 block text-[10px] text-(--ui-text-tertiary)">
            speed {speed.toFixed(2)}×
            <input
              className="w-full"
              max={2}
              min={0.1}
              onChange={(e) => setSpeed(Number(e.target.value))}
              step={0.05}
              type="range"
              value={speed}
            />
          </label>
          <label className="mt-1 block text-[10px] text-(--ui-text-tertiary)">
            size {size}px
            <input
              className="w-full"
              max={420}
              min={20}
              onChange={(e) => setSize(Number(e.target.value))}
              step={2}
              type="range"
              value={size}
            />
          </label>
        </section>
      </aside>

      <main className="min-w-0 flex-1">
        <h1 className="text-[15px] font-medium">Nemesis character</h1>
        <p className="mt-1 max-w-[54ch] text-[12px] leading-relaxed text-(--ui-text-secondary)">
          The bloub engine, vendored whole (MIT). One body morphing through {ALL_STATES.length}{" "}
          animations, eyes cut as holes through it, gaze on a sphere.
        </p>

        {view === "stage" && (
          <div className="mt-5 grid min-h-[420px] place-items-center rounded-2xl border border-(--ui-stroke-secondary)">
            <BloubBot
              color={bloubColor}
              expression={expression}
              reducedMotion={reduced}
              shape={bloubShape}
              size={size}
              speed={paused ? 0 : speed * speedOf(state)}
              state={state}
              track={track}
            />
          </div>
        )}

        {view === "states" && (
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {ALL_STATES.map((id) => (
              <Cell key={id} label={`${id}  ${POSES[id].toFixed(2)}s`}>
                <BloubBot color={bloubColor} frozenAt={POSES[id]} shape={bloubShape} size={130} state={id} />
              </Cell>
            ))}
          </div>
        )}

        {view === "shapes" && (
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {SHAPES.map((s) => (
              <Cell key={s.id} label={s.id}>
                <BloubBot color={bloubColor} frozenAt={1} shape={s.id} size={130} state="idle" />
              </Cell>
            ))}
          </div>
        )}

        {view === "colors" && (
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {COLORS.map((c) => (
              <Cell key={c.id} label={c.id}>
                <BloubBot color={c.id} frozenAt={1} shape={bloubShape} size={130} state="idle" />
              </Cell>
            ))}
          </div>
        )}

        {view === "faces" && (
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {EXPRESSIONS.map((e) => (
              <button className="text-left" key={e.id} onClick={() => setExpression(e.id)} type="button">
                <Cell label={expression === e.id ? `${e.id} ✓` : e.id}>
                  {/* Expressions replace the RESTING face, so they are shown on `idle` —
                      every other state carries a measured gaze of its own. */}
                  <BloubBot color={bloubColor} expression={e.id} frozenAt={1} shape={bloubShape} size={130} state="idle" />
                </Cell>
              </button>
            ))}
          </div>
        )}

        {view === "dock" && (
          <div className="relative mt-5 min-h-[520px] overflow-hidden rounded-2xl border border-(--ui-stroke-secondary) p-8">
            <h3 className="text-[15px] font-medium">Competitive inhibition</h3>
            <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed">
              A competitive inhibitor raises the apparent Km without touching Vmax, because the
              inhibitor and the substrate are contesting the same site. Pile in enough substrate
              and the enzyme reaches the same ceiling it always did.
            </p>
            <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed">
              Switch the animation to <b>thinking</b>, <b>orbit</b> or <b>comet</b> and the
              character walks to the middle of this surface and grows. Anything else and it
              returns to the corner, above the composer.
            </p>
            <div
              className="absolute inset-x-8 bottom-8 rounded-2xl border border-(--ui-stroke-secondary) p-4 text-[12px] text-(--ui-text-tertiary)"
              id="lab-composer"
            >
              Answer here — the composer grows, and the character holds its place above it.
            </div>
            <BloubDock anchor="#lab-composer" contain left={26} size={48} state={state} />
          </div>
        )}

        <p className="mt-6 font-mono text-[10px] text-(--ui-text-tertiary)">
          full montage: {cycle.blocks.length} blocks, {totalDuration(cycle.blocks).toFixed(1)}s
        </p>
      </main>
    </div>
  );
}
