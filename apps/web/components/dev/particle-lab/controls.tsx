"use client";

import { useEffect, useRef, useState } from "react";

import { defaults } from "./types";
import type { Candidate, Params } from "./types";
import { settingsReport } from "./url-state";

type Props = {
  readonly candidate: Candidate;
  readonly params: Params;
  readonly onChange: (next: Params) => void;
  readonly url: string;
};

/**
 * The knob panel for whichever candidate is in focus.
 *
 * Candidates expose different knobs on purpose — a ripple frequency is
 * meaningless on a volumetric cloud — so this renders whatever the candidate
 * declares rather than a fixed list.
 */
export function Controls({ candidate, params, onChange, url }: Props) {
  const [copied, setCopied] = useState(false);
  const slidersRef = useRef<HTMLDivElement>(null);

  // Range inputs treat the scroll wheel as a value change, so scrolling the page
  // with the pointer over this panel silently retunes whatever slider is under
  // the cursor — found the hard way, by scrolling past and arriving with four
  // knobs moved. The listener has to be native and non-passive: React registers
  // its own wheel handlers as passive, where preventDefault does nothing.
  useEffect(() => {
    const host = slidersRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type === "range") e.preventDefault();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  const set = (key: string, value: number) => onChange({ ...params, [key]: value });
  const isDefault = candidate.params.every((s) => (params[s.key] ?? s.def) === s.def);

  const copy = async () => {
    const text = settingsReport(candidate.id, params, url);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is permission-gated and silently unavailable over plain http on
      // some setups. Falling back to a prompt keeps the settings recoverable
      // instead of the button appearing to work and copying nothing.
      window.prompt("Copy the settings:", text);
    }
  };

  return (
    <div className="pl-controls">
      <div className="pl-controls-head">
        <div>
          <div className="pl-controls-title">
            {candidate.id} — {candidate.name}
          </div>
          <div className="pl-controls-sub">{candidate.technique}</div>
        </div>
      </div>

      <div className="pl-sliders" ref={slidersRef}>
        {candidate.params.map((spec) => {
          const value = params[spec.key] ?? spec.def;
          const changed = value !== spec.def;
          return (
            <label key={spec.key} className="pl-slider">
              <span className="pl-slider-label">
                {spec.label}
                <b className={changed ? "pl-changed" : undefined}>{value}</b>
              </span>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(e) => set(spec.key, Number(e.target.value))}
              />
              {spec.hint ? <span className="pl-slider-hint">{spec.hint}</span> : null}
            </label>
          );
        })}
      </div>

      <div className="pl-controls-actions">
        <button type="button" onClick={() => onChange(defaults(candidate))} disabled={isDefault}>
          Reset to default
        </button>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy settings"}
        </button>
      </div>

      <div className="pl-provenance">
        <div>
          <span>Technique from</span>
          {candidate.provenance}
        </div>
        <div>
          <span>What we would maintain</span>
          {candidate.cost}
        </div>
      </div>
    </div>
  );
}
