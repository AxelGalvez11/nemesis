"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CandidateCanvas } from "./canvas-view";
import { CANDIDATES, candidateById } from "./candidates";
import { Controls } from "./controls";
import { isPaused, labFps, resetClock, setPaused } from "./harness";
import { Matrix } from "./matrix";
import { defaults } from "./types";
import type { Candidate, Params } from "./types";
import { decode, encode, INITIAL, type LabState, type Mode } from "./url-state";

/** ink / page colours. Monochrome by design — the brief rules out colour entirely. */
const THEME = {
  light: { ink: "#11161d", bg: "#f7f8fa" },
  dark: { ink: "#e9edf3", bg: "#0b0e13" },
} as const;

/** The three sizes a winner would actually have to survive. */
const SCALES = [
  { px: 56, label: "Loader", note: "48–64px" },
  { px: 128, label: "Canvas", note: "100–150px" },
  { px: 480, label: "Landing", note: "400–600px" },
] as const;

/** The size the params are authored against; the other two scale relative to it. */
const REFERENCE_PX = 480;

/**
 * Adapts point size and density to a smaller box, the way a real loader would.
 *
 * Without this, shrinking the box keeps ~24,000 dots at a constant pixel size,
 * so the gaps between them vanish and the object fills in solid. Measured at
 * 56px, ALL EIGHT candidates collapsed into the same black blob — which is a
 * true result about constant settings, and a useless one for choosing between
 * them, because it says nothing about the technique.
 *
 * Dropping density with the square of the scale keeps dots-per-screen-area
 * roughly constant, and the floor on point size stops them shrinking below what
 * a display can actually resolve.
 */
function tuneForSize(params: Params, px: number): Params {
  const k = px / REFERENCE_PX;
  if (k >= 1) return params;
  return {
    ...params,
    density: Math.min(params.density ?? 1, Math.max(0.06, k * k * 2.2)),
    pointSize: Math.max(1.05, (params.pointSize ?? 1.7) * Math.sqrt(k) * 1.15),
  };
}

export function ParticleLab() {
  const [state, setState] = useState<LabState>(INITIAL);
  const [paused, setPausedUi] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [fps, setFps] = useState(0);

  // Read the hash once on mount. Doing it in state initialisation would run on
  // the server too, where there is no location, and mismatch the first render.
  useEffect(() => {
    setState(decode(window.location.hash));
    setPausedUi(isPaused());
    setHydrated(true);

    // Pasting a saved URL into an ALREADY-OPEN lab changes only the hash, which
    // does not remount anything — without this the address bar would show one
    // configuration while the screen showed another. `replaceState` (how this
    // component writes the hash) does not fire `hashchange`, so there is no loop.
    const onHashChange = () => setState(decode(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // The lab has ONE frame rate, because it has one animation loop. Reporting it
  // once in the header rather than on every tile stops eight identical numbers
  // from reading as eight independent measurements.
  useEffect(() => {
    const id = window.setInterval(() => setFps(labFps()), 500);
    return () => window.clearInterval(id);
  }, []);

  const query = useMemo(() => encode(state), [state]);

  useEffect(() => {
    if (!hydrated) return;
    // replaceState rather than assigning location.hash, so tuning a slider does
    // not push a hundred entries onto the back stack.
    window.history.replaceState(null, "", `#${query}`);
  }, [query, hydrated]);

  const focus = candidateById(state.focus) ?? CANDIDATES[0];

  const paramsFor = useCallback(
    (c: Candidate): Params => state.params[c.id] ?? defaults(c),
    [state.params],
  );

  const setParams = useCallback((id: string, next: Params) => {
    setState((s) => ({ ...s, params: { ...s.params, [id]: next } }));
  }, []);

  const setMode = useCallback((mode: Mode) => setState((s) => ({ ...s, mode })), []);

  const step = useCallback((delta: number) => {
    setState((s) => {
      const i = CANDIDATES.findIndex((c) => c.id === s.focus);
      const next = CANDIDATES[(i + delta + CANDIDATES.length) % CANDIDATES.length] ?? CANDIDATES[0];
      return { ...s, focus: next.id };
    });
  }, []);

  const togglePause = useCallback(() => {
    const next = !isPaused();
    setPaused(next);
    setPausedUi(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a slider the owner is nudging.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === " ") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "Escape") setMode("grid");
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, togglePause, setMode]);

  const theme = THEME[state.theme];
  const url = hydrated ? `${window.location.origin}${window.location.pathname}#${query}` : "";

  return (
    <div className="pl-root" data-theme={state.theme} style={{ background: theme.bg, color: theme.ink }}>
      <header className="pl-header">
        <div className="pl-header-title">
          <h1>Particle Lab</h1>
          <p>
            Eight techniques. Pick one — nothing here is wired to the product.
            {fps > 0 ? <span className="pl-fps"> · lab running at {fps.toFixed(0)} fps</span> : null}
          </p>
        </div>

        <div className="pl-header-actions">
          <div className="pl-segmented" role="group" aria-label="View mode">
            {(["grid", "inspect", "compare"] as const).map((m) => (
              <button key={m} type="button" data-active={state.mode === m} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
          <button type="button" onClick={togglePause}>
            {paused ? "Play" : "Pause"}
          </button>
          <button type="button" onClick={resetClock}>
            Sync clocks
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" }))}
          >
            {state.theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      {!hydrated ? (
        <div className="pl-booting">Starting WebGL…</div>
      ) : state.mode === "grid" ? (
        <GridMode
          ink={theme.ink}
          paramsFor={paramsFor}
          onOpen={(id) => setState((s) => ({ ...s, focus: id, mode: "inspect" }))}
        />
      ) : state.mode === "inspect" ? (
        <InspectMode
          candidate={focus}
          params={paramsFor(focus)}
          ink={theme.ink}
          url={url}
          onParams={(p) => setParams(focus.id, p)}
          onStep={step}
          onExit={() => setMode("grid")}
        />
      ) : (
        <CompareMode
          selected={state.compare}
          ink={theme.ink}
          paramsFor={paramsFor}
          onSelect={(ids) => setState((s) => ({ ...s, compare: ids }))}
        />
      )}

      {state.mode === "grid" && hydrated ? <Matrix /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function GridMode({
  ink,
  paramsFor,
  onOpen,
}: {
  readonly ink: string;
  readonly paramsFor: (c: Candidate) => Params;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <div className="pl-grid">
      {CANDIDATES.map((c) => (
        <button key={c.id} type="button" className="pl-card" onClick={() => onOpen(c.id)}>
          <span className="pl-card-letter">
            {c.id}
            {c.reference ? <em title="Built to chase the reference image">ref</em> : null}
          </span>
            <CandidateCanvas
            candidate={c}
            params={paramsFor(c)}
            ink={ink}
            showMetrics
            quality="preview"
            className="pl-card-canvas"
          />
          <span className="pl-card-name">{c.name}</span>
          <span className="pl-card-technique">{c.technique}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function InspectMode({
  candidate,
  params,
  ink,
  url,
  onParams,
  onStep,
  onExit,
}: {
  readonly candidate: Candidate;
  readonly params: Params;
  readonly ink: string;
  readonly url: string;
  readonly onParams: (p: Params) => void;
  readonly onStep: (d: number) => void;
  readonly onExit: () => void;
}) {
  // Defaults ON. The untuned strip is the more honest picture of what constant
  // settings do, but it is the same picture for all eight — so opening on it
  // would show the owner nothing they can choose with.
  const [tuned, setTuned] = useState(true);

  return (
    <div className="pl-inspect">
      <div className="pl-inspect-stage">
        <div className="pl-inspect-nav">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous candidate">
            ← prev
          </button>
          <span>
            {candidate.id} — {candidate.name}
          </span>
          <button type="button" onClick={() => onStep(1)} aria-label="Next candidate">
            next →
          </button>
          <button type="button" onClick={onExit} className="pl-exit">
            exit (esc)
          </button>
        </div>

        <CandidateCanvas
          candidate={candidate}
          params={params}
          ink={ink}
          showMetrics
          className="pl-inspect-canvas"
        />

        <p className="pl-inspect-blurb">{candidate.blurb}</p>

        <div className="pl-scales">
          {SCALES.map((s) => (
            <figure key={s.px} className="pl-scale">
              <div className="pl-scale-box" style={{ width: s.px, height: s.px }}>
                <CandidateCanvas
                  candidate={candidate}
                  params={tuned ? tuneForSize(params, s.px) : params}
                  ink={ink}
                />
              </div>
              <figcaption>
                {s.label}
                <span>{s.note}</span>
              </figcaption>
            </figure>
          ))}
          <div className="pl-scales-note">
            <label>
              <input type="checkbox" checked={tuned} onChange={(e) => setTuned(e.target.checked)} />
              Tune density and dot size to each box
            </label>
            <p>
              {tuned
                ? "What a real loader would do: fewer, slightly larger dots as the object shrinks. This is the comparison that tells you which technique still reads small."
                : "Identical settings at every size. Every candidate fills in solid at 56px this way — true, but it says nothing about the technique. Tick the box to see the fair comparison."}
            </p>
          </div>
        </div>
      </div>

      <aside className="pl-inspect-side">
        <Controls candidate={candidate} params={params} onChange={onParams} url={url} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CompareMode({
  selected,
  ink,
  paramsFor,
  onSelect,
}: {
  readonly selected: readonly string[];
  readonly ink: string;
  readonly paramsFor: (c: Candidate) => Params;
  readonly onSelect: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length <= 2) return;
      onSelect(selected.filter((s) => s !== id));
    } else {
      // Three is the ceiling: past that the panes are too small to judge point
      // structure, which is the thing this mode exists to compare.
      onSelect(selected.length >= 3 ? [...selected.slice(1), id] : [...selected, id]);
    }
  };

  const chosen = selected.map(candidateById).filter((c): c is Candidate => Boolean(c));

  return (
    <div className="pl-compare">
      <div className="pl-compare-picker">
        <span>Compare (2–3):</span>
        {CANDIDATES.map((c) => (
          <button key={c.id} type="button" data-active={selected.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.id}
          </button>
        ))}
        <span className="pl-compare-hint">
          All panes share one clock, so differences in motion are real rather than phase offsets.
        </span>
      </div>

      <div className="pl-compare-panes" data-count={chosen.length}>
        {chosen.map((c) => (
          <figure key={c.id} className="pl-compare-pane">
            <CandidateCanvas candidate={c} params={paramsFor(c)} ink={ink} showMetrics />
            <figcaption>
              <b>
                {c.id} — {c.name}
              </b>
              <span>{c.technique}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
