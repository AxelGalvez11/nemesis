"use client";

// Two ways of looking at the whole vocabulary at once.
//
// THE BOARD answers "are these twenty things actually twenty things" — a question you
// cannot answer by clicking through them one at a time, because the comparison you
// need is side by side.
//
// THE FILMSTRIPS answer the harder one: "does it get from A to B without a cut". Every
// state can look right on its own while a transition between two of them jumps, and
// endpoints are exactly what a state board cannot show. So each strip samples a REAL
// engine driven through a real chain, at evenly spaced instants, and lays the frames
// out in order. Because `sample(t)` is a pure function of time, those frames are
// exactly what the live animation renders — not a reconstruction of it.

import { useEffect, useMemo, useState } from "react";

import {
  EXPRESSIONS,
  EXPRESSION_ORDER,
  MascotEngine,
  STATES,
  STATE_ORDER,
  focusLook,
  stillTime,
  type ExpressionId,
  type MascotFrame,
  type MascotMode,
} from "@/lib/mascot";
import { NemesisMascot } from "@/components/mascot/nemesis-mascot";

import type { LabState } from "./types";

/** The chains from the brief, plus the two the vocabulary implies. */
export const CHAINS: { name: string; steps: MascotMode[] }[] = [
  {
    name: "The teaching loop",
    steps: ["idle", "notice", "listening", "thinking", "teaching", "question", "waiting", "evaluating", "correct", "teaching"],
  },
  {
    name: "A wrong answer, and the repair",
    steps: ["question", "waiting", "evaluating", "incorrect", "thinking", "teaching"],
  },
  { name: "Struggling, then the click", steps: ["teaching", "question", "evaluating", "partial", "confusion", "thinking", "insight", "teaching"] },
  { name: "Going and finding something", steps: ["teaching", "searching", "reading", "generating-visual", "teaching"] },
  { name: "Winding down", steps: ["teaching", "success", "complete", "idle", "inactive", "notice"] },
  { name: "Arriving with a document", steps: ["greeting", "curious", "ingesting", "reading", "writing", "teaching"] },
  { name: "Getting the learner's attention", steps: ["teaching", "question", "waiting", "alert", "nod", "teaching"] },
];

/** How long each step is held: its own morph plus enough to see it resolve. */
const dwell = (m: MascotMode): number => {
  const s = STATES[m];
  return s.morph + Math.max(s.settle, s.loop ? Math.min(s.loop, 1.4) : 0.5) + 0.25;
};

export interface Strip {
  readonly frames: readonly { t: number; frame: MascotFrame; mode: MascotMode }[];
  readonly total: number;
}

/**
 * Samples one chain into `count` frames.
 *
 * The engine is driven forward in schedule order, exactly as the live component drives
 * it, and only then sampled — so a strip shows the same frozen-pose blending that a
 * real mid-fade state change produces.
 */
export function sampleChain(steps: MascotMode[], count: number, reduced: boolean): Strip {
  const engine = new MascotEngine(steps[0]!, 0);
  const at: { mode: MascotMode; start: number }[] = [{ mode: steps[0]!, start: 0 }];
  let t = dwell(steps[0]!);
  for (let i = 1; i < steps.length; i++) {
    engine.setState(steps[i]!, t, { reduced });
    at.push({ mode: steps[i]!, start: t });
    t += dwell(steps[i]!);
  }
  const total = t;

  const frames = Array.from({ length: count }, (_, i) => {
    const time = (i / (count - 1)) * total;
    const mode = [...at].reverse().find((s) => time >= s.start)?.mode ?? steps[0]!;
    return {
      t: time,
      mode,
      frame: engine.sample(time, { reduced, look: focusLook("none"), clock: time }),
    };
  });

  return { frames, total };
}

export function StateBoard({ state }: { state: LabState }) {
  const tone = state.boardBothThemes ? (["light", "dark"] as const) : ([state.theme] as const);
  return (
    <div className="mlab-board">
      {STATE_ORDER.map((mode) => (
        <figure key={mode} className="mlab-cell">
          <div className="mlab-cell-art">
            {tone.map((t) => (
              <div key={t} className="mlab-pane" data-tone={t}>
                <NemesisMascot
                  state={{
                    mode,
                    intensity: state.intensity,
                    confidence: state.confidence,
                    voiceActivity: state.voice,
                    focus: state.focus,
                    expression: state.expression ?? undefined,
                  }}
                  size={92}
                  reducedMotion={state.reduced}
                  frozenAt={state.boardStill ? stillTime(mode) : state.boardT}
                  look={state.manualGaze ? { x: state.gazeX, y: state.gazeY, mix: 1 } : null}
                />
              </div>
            ))}
          </div>
          <figcaption>
            <span>{STATES[mode].label}</span>
            <span className="mono">
              {(state.boardStill ? stillTime(mode) : state.boardT).toFixed(2)}s
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Every expression, on one state, at one instant.
 *
 * The state board answers "are these different things"; this answers the other half —
 * "does the face have a range" — and the two questions need different pictures. Held on
 * `teaching`, because that is the state the character spends most of its life in and the
 * one whose face people will actually read.
 */
export function FaceBoard({ state }: { state: LabState }) {
  return (
    <div className="mlab-board">
      {EXPRESSION_ORDER.map((e: ExpressionId) => (
        <figure key={e} className="mlab-cell">
          <div className="mlab-cell-art">
            <div className="mlab-pane" data-tone={state.theme}>
              <NemesisMascot
                state={{ mode: state.mode, intensity: state.intensity, expression: e, focus: state.focus }}
                size={100}
                reducedMotion={state.reduced}
                frozenAt={stillTime(state.mode)}
                look={state.manualGaze ? { x: state.gazeX, y: state.gazeY, mix: 1 } : null}
              />
            </div>
          </div>
          <figcaption>
            <span>{EXPRESSIONS[e].label}</span>
            <span className="mono">{state.expression === e ? "shown" : ""}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Transitions({ state }: { state: LabState }) {
  const [playing, setPlaying] = useState<string | null>(null);
  return (
    <div className="mlab-strips">
      {CHAINS.map((chain) => (
        <ChainStrip
          key={chain.name}
          chain={chain}
          state={state}
          playing={playing === chain.name}
          onPlay={() => setPlaying(playing === chain.name ? null : chain.name)}
        />
      ))}
    </div>
  );
}

function ChainStrip({
  chain,
  state,
  playing,
  onPlay,
}: {
  chain: { name: string; steps: MascotMode[] };
  state: LabState;
  playing: boolean;
  onPlay: () => void;
}) {
  const strip = useMemo(() => sampleChain(chain.steps, 28, state.reduced), [chain.steps, state.reduced]);
  const [live, setLive] = useState<MascotMode>(chain.steps[0]!);

  // The live run walks the same schedule the strip was sampled from, so what plays and
  // what is laid out are the same sequence at two resolutions.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let i = 0;
    setLive(chain.steps[0]!);
    const next = () => {
      if (cancelled) return;
      i += 1;
      if (i >= chain.steps.length) return;
      setLive(chain.steps[i]!);
      window.setTimeout(next, dwell(chain.steps[i]!) * 1000);
    };
    window.setTimeout(next, dwell(chain.steps[0]!) * 1000);
    return () => {
      cancelled = true;
    };
  }, [playing, chain.steps]);

  return (
    <section className="mlab-strip">
      <header>
        <h3>{chain.name}</h3>
        <span className="mono">{strip.total.toFixed(1)}s · {chain.steps.join(" → ")}</span>
        <button type="button" className={`mlab-toggle${playing ? " on" : ""}`} onClick={onPlay}>
          <span className="mlab-dot" />
          {playing ? "Stop" : "Play"}
        </button>
      </header>
      {playing ? (
        <div className="mlab-strip-live">
          <NemesisMascot state={{ mode: live, intensity: state.intensity }} size={120} reducedMotion={state.reduced} />
          <span className="mono">{STATES[live].label}</span>
        </div>
      ) : (
        <div className="mlab-strip-frames">
          {strip.frames.map((f, i) => (
            <div key={i} className="mlab-frame" title={`${STATES[f.mode].label} @ ${f.t.toFixed(2)}s`}>
              <NemesisMascot frame={f.frame} size={54} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
