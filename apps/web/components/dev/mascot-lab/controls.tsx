"use client";

// The lab's instrument panel. Nothing here knows how the mascot works — it edits one
// flat record and hands it back.

import { STATES, STATE_ORDER, stateDuration, type MascotFocus, type MascotMode } from "@/lib/mascot";

import type { LabState, View } from "./types";

type Patch = Partial<LabState>;

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <label className="mlab-row">
      <span className="mlab-row-head">
        <span>{label}</span>
        {value ? <span className="mlab-val mono">{value}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} value={(format ?? ((v: number) => v.toFixed(2)))(value)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Row>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`mlab-toggle${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span className="mlab-dot" />
      {label}
    </button>
  );
}

const FOCUSES: MascotFocus[] = ["none", "user", "composer", "canvas", "source", "response"];
const VIEWS: { id: View; label: string }[] = [
  { id: "stage", label: "Stage" },
  { id: "board", label: "State board" },
  { id: "transitions", label: "Transitions" },
];

export function Controls({ state, set }: { state: LabState; set: (p: Patch) => void }) {
  const duration = stateDuration(state.mode);
  const def = STATES[state.mode];

  return (
    <aside className="mlab-panel">
      <div className="mlab-group">
        <div className="mlab-seg">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={state.view === v.id ? "on" : undefined}
              onClick={() => set({ view: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mlab-group">
        <h3>State</h3>
        <div className="mlab-states">
          {STATE_ORDER.map((m: MascotMode) => (
            <button
              key={m}
              type="button"
              className={state.mode === m ? "on" : undefined}
              onClick={() => set({ mode: m, progress: 0 })}
              title={STATES[m].note}
            >
              {STATES[m].label}
            </button>
          ))}
        </div>
        <p className="mlab-note">{def.note}</p>
        <p className="mlab-meta mono">
          morph {def.morph.toFixed(2)}s · {def.ease} · {def.loop ? `loop ${def.loop}s` : `settles ${def.settle.toFixed(2)}s`}
        </p>
      </div>

      <div className="mlab-group">
        <h3>Playback</h3>
        <div className="mlab-inline">
          <Toggle label={state.paused ? "Paused" : "Playing"} on={!state.paused} onChange={(v) => set({ paused: !v })} />
          <Toggle label="Reduced motion" on={state.reduced} onChange={(v) => set({ reduced: v })} />
        </div>
        <Slider
          label="Progress"
          value={state.progress}
          min={0}
          max={1}
          step={0.002}
          format={(v) => `${(v * duration).toFixed(2)}s / ${duration.toFixed(2)}s`}
          onChange={(v) => set({ progress: v, paused: true })}
        />
        <Slider label="Speed" value={state.speed} min={0.05} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ speed: v })} />
      </div>

      <div className="mlab-group">
        <h3>Attention</h3>
        <div className="mlab-inline">
          <Toggle label="Pointer tracking" on={state.track} onChange={(v) => set({ track: v })} />
          <Toggle label="Manual gaze" on={state.manualGaze} onChange={(v) => set({ manualGaze: v })} />
        </div>
        <Row label="Focus">
          <div className="mlab-chips">
            {FOCUSES.map((f) => (
              <button key={f} type="button" className={state.focus === f ? "on" : undefined} onClick={() => set({ focus: f })}>
                {f}
              </button>
            ))}
          </div>
        </Row>
        <Slider label="Gaze X" value={state.gazeX} min={-1} max={1} step={0.01} onChange={(v) => set({ gazeX: v, manualGaze: true })} />
        <Slider label="Gaze Y" value={state.gazeY} min={-1} max={1} step={0.01} onChange={(v) => set({ gazeY: v, manualGaze: true })} />
      </div>

      <div className="mlab-group">
        <h3>Shading</h3>
        <Slider label="Intensity" value={state.intensity} min={0} max={1} step={0.01} onChange={(v) => set({ intensity: v })} />
        <Slider label="Confidence" value={state.confidence} min={0} max={1} step={0.01} onChange={(v) => set({ confidence: v })} />
        <Slider label="Voice activity" value={state.voice} min={0} max={1} step={0.01} onChange={(v) => set({ voice: v })} />
      </div>

      <div className="mlab-group">
        <h3>Presentation</h3>
        <Slider label="Size" value={state.size} min={16} max={420} step={1} format={(v) => `${v}px`} onChange={(v) => set({ size: v })} />
        <Row label="Theme">
          <div className="mlab-chips">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" className={state.theme === t ? "on" : undefined} onClick={() => set({ theme: t })}>
                {t}
              </button>
            ))}
          </div>
        </Row>
      </div>

      {state.view === "board" ? (
        <div className="mlab-group">
          <h3>Board</h3>
          <div className="mlab-inline">
            <Toggle label="Characteristic frame" on={state.boardStill} onChange={(v) => set({ boardStill: v })} />
            <Toggle label="Both themes" on={state.boardBothThemes} onChange={(v) => set({ boardBothThemes: v })} />
          </div>
          <Slider
            label="Freeze at"
            value={state.boardT}
            min={0}
            max={6}
            step={0.01}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={(v) => set({ boardT: v, boardStill: false })}
          />
        </div>
      ) : null}
    </aside>
  );
}
