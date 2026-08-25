"use client";

// The studio's controls.
//
// Small, plain and shared, because the alternative is five panels each growing its own
// slightly different slider. Everything here is presentational: it takes a value and a
// setter and has no idea what a mascot is.

import { useCallback, useId, useRef, useState, type ReactNode } from "react";

// ── Layout ──────────────────────────────────────────────────────────────────────

export function Section({
  title,
  note,
  children,
  actions,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="cs-section">
      <header className="cs-section-head">
        <div>
          <h3>{title}</h3>
          {note ? <p>{note}</p> : null}
        </div>
        {actions ? <div className="cs-section-actions">{actions}</div> : null}
      </header>
      <div className="cs-section-body">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="cs-field">
      <span className="cs-field-label">{label}</span>
      {children}
    </label>
  );
}

// ── Slider ──────────────────────────────────────────────────────────────────────

export interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * A slider whose LABEL is also a scrub handle.
 *
 * 🔴 THE SCRUB EXISTS BECAUSE A SLIDER'S RESOLUTION IS ITS PIXEL WIDTH, and a 200px
 * track spanning -1..1 gives a hundredth of a unit per pixel at best — fine for finding
 * the neighbourhood of a value and useless for the last few percent, which is exactly
 * where the difference between a face that reads as warm and one that reads as smug
 * lives. Dragging the label is unbounded in distance, so the same gesture can be as fine
 * as the author wants by moving slowly.
 *
 * Pointer capture, not a document listener: a drag that leaves the window still belongs
 * to this control, and releasing outside it must still end the drag.
 */
export function Slider({
  label,
  value,
  range,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  range: Range;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  const drag = useRef<{ x: number; from: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const clamp = useCallback(
    (v: number) => {
      const stepped = Math.round(v / range.step) * range.step;
      // Re-rounded because multiplying a float step reintroduces the error it removed:
      // 0.1 * 3 is 0.30000000000000004, and that lands in an exported document.
      const fixed = Number(stepped.toFixed(6));
      return Math.min(range.max, Math.max(range.min, fixed));
    },
    [range],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, from: value };
    setScrubbing(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    // A full track's worth of travel per 240px, so the scrub is finer than the slider by
    // roughly the ratio of the track to that distance, and finer still if you go slowly.
    const perPx = (range.max - range.min) / 240;
    onChange(clamp(d.from + (e.clientX - d.x) * perPx));
  };
  const end = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (drag.current) {
      drag.current = null;
      setScrubbing(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const shown = format ? format(value) : String(Number(value.toFixed(3)));

  return (
    <div className={`cs-slider${disabled ? " is-disabled" : ""}`}>
      <div className="cs-slider-head">
        <span
          className={`cs-scrub${scrubbing ? " is-scrubbing" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          title="Drag sideways for fine control"
        >
          <svg viewBox="0 0 12 8" aria-hidden="true" className="cs-scrub-mark">
            <path d="M3.4 1.2 0.8 4l2.6 2.8M8.6 1.2 11.2 4 8.6 6.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <label htmlFor={id}>{label}</label>
        </span>
        <output htmlFor={id} className="cs-slider-value">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
    </div>
  );
}

// ── Buttons and pickers ─────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="cs-segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "is-on" : undefined}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="cs-chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "is-on" : undefined}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  tone = "plain",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "plain" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={`cs-btn is-${tone}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        className="cs-text"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/**
 * A colour, as a swatch and a hex field side by side.
 *
 * 🔴 THE TEXT FIELD IS NOT VALIDATED WHILE YOU TYPE. Committing only complete hex means
 * "#0b0b0d" is unreachable by typing — every prefix of it is invalid — so the field
 * holds whatever you type and commits on the way past a value that parses. What it never
 * does is hand an unparsed string to the renderer, which would end up in a `style`
 * attribute.
 */
export function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  return (
    <Field label={label}>
      <div className="cs-colour">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
          aria-label={`${label} swatch`}
        />
        <input
          className="cs-text cs-mono"
          type="text"
          value={shown}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (/^#[0-9a-fA-F]{3,8}$/.test(next)) onChange(next);
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </Field>
  );
}

/** A one-line status that fades itself out. Used for "Saved", "Copied", "Exported". */
export function Toast({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <div className="cs-toast" role="status">
      {message}
    </div>
  );
}
