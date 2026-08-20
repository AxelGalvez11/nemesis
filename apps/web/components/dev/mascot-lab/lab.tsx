"use client";

// DEV-ONLY — the mascot lab.
//
// Its whole job is to make a visual decision cheap. Every state, every transition,
// every size, both themes, reduced motion, pointer tracking, and any frame frozen at
// any timestamp — without opening the product, signing in, or provoking the system
// into the state you wanted to look at.
//
// Nothing in the product imports this. Deleting `components/dev/mascot-lab` and
// `app/dev-preview/mascot-lab` removes the whole thing and leaves the engine and the
// component untouched.

import { useCallback, useEffect, useRef, useState } from "react";

import { NemesisMascot } from "@/components/mascot/nemesis-mascot";
import { useTheme } from "@/components/theme-provider";
import { STATES, stateDuration } from "@/lib/mascot";

import { StateBoard, Transitions } from "./board";
import { Controls } from "./controls";
import { INITIAL, type LabState } from "./types";

/** The sizes the mascot has to survive in the product. */
const SCALES = [
  { px: 18, label: "Inline", note: "beside a line of text" },
  { px: 28, label: "Rail", note: "the shell's mark" },
  { px: 44, label: "Card", note: "beside a teaching card" },
  { px: 92, label: "Canvas", note: "the working state" },
];

export function MascotLab() {
  const [state, setState] = useState<LabState>(INITIAL);
  const set = useCallback((p: Partial<LabState>) => setState((s) => ({ ...s, ...p })), []);

  // 🔴 THE THEME GOES THROUGH THE PROVIDER, NOT THROUGH `data-theme` DIRECTLY.
  // Writing the attribute by hand appears to work and then loses: ThemeProvider's own
  // mount effect reads the stored preference and writes it back, so the lab's toggle
  // silently did nothing on first paint. The switch drives the DOCUMENT rather than a
  // local override on purpose — the only way to judge the mascot is against the
  // surfaces it will actually sit on.
  const { theme: appTheme, setTheme } = useTheme();
  useEffect(() => {
    if (appTheme !== state.theme) setTheme(state.theme);
  }, [state.theme, appTheme, setTheme]);
  // Adopt whatever the app was already in, so the lab opens showing the truth.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    set({ theme: appTheme });
  }, [appTheme, set]);

  const mascotState = {
    mode: state.mode,
    intensity: state.intensity,
    confidence: state.confidence,
    voiceActivity: state.voice,
    focus: state.focus,
  };
  const look = state.manualGaze ? { x: state.gazeX, y: state.gazeY, mix: 1 } : null;
  const frozenAt = state.paused ? state.progress * stateDuration(state.mode) : null;

  return (
    <div className="mlab">
      <Controls state={state} set={set} />

      <main className="mlab-stage">
        <header className="mlab-head">
          <h1>Nemesis mascot</h1>
          <p>
            One flat blob, drawn procedurally. The silhouette is a superellipse — not a ball
            and not an oval — and the eyes are that same shape at a much smaller scale, stood
            upright. Everything the character does, it does by deforming its own outline.
          </p>
        </header>

        {state.view === "stage" ? (
          <>
            <div className="mlab-hero">
              <NemesisMascot
                state={mascotState}
                size={state.size}
                track={state.track && !state.manualGaze}
                speed={state.speed}
                paused={state.paused}
                frozenAt={frozenAt}
                frozenClock={frozenAt}
                reducedMotion={state.reduced}
                look={look}
                label={`Nemesis, ${STATES[state.mode].label.toLowerCase()}`}
              />
            </div>

            <section className="mlab-scales">
              <h2>At the sizes it has to survive</h2>
              <div className="mlab-scale-row">
                {SCALES.map((s) => (
                  <figure key={s.px}>
                    <div className="mlab-scale-art">
                      <NemesisMascot
                        state={mascotState}
                        size={s.px}
                        speed={state.speed}
                        paused={state.paused}
                        frozenAt={frozenAt}
                        reducedMotion={state.reduced}
                        look={look}
                      />
                    </div>
                    <figcaption>
                      <span>{s.label}</span>
                      <span className="mono">{s.px}px</span>
                      <span className="mlab-dim">{s.note}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section className="mlab-scales">
              <h2>Beside something to read</h2>
              {/* The real test of a mascot next to educational content: can you still
                  read the paragraph while it is animating. */}
              <div className="mlab-reading">
                <NemesisMascot
                  state={mascotState}
                  size={34}
                  speed={state.speed}
                  paused={state.paused}
                  frozenAt={frozenAt}
                  reducedMotion={state.reduced}
                  look={look}
                />
                <p>
                  A competitive inhibitor raises the apparent K<sub>m</sub> without touching
                  V<sub>max</sub>, because the inhibitor and the substrate are contesting the same
                  site — pile in enough substrate and the enzyme reaches the same ceiling it always
                  did. That is the whole diagnostic: if the ceiling moves, the inhibitor is not
                  competing for the site.
                </p>
              </div>
            </section>
          </>
        ) : null}

        {state.view === "board" ? <StateBoard state={state} /> : null}
        {state.view === "transitions" ? <Transitions state={state} /> : null}
      </main>
    </div>
  );
}
