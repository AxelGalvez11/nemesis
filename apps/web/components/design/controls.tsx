// Form controls.
//
// Canonical source: /design/COMPONENTS.md §2, /design/TOKENS.md §5, §9.
//
// 🔴🔴 THE FOCUS BORDER NEVER CHANGES WIDTH. A control that goes from 1px to 2px on focus moves
// every neighbour by a pixel. Focus is an INSET RING held at transparent when idle (Sana's
// approach, and the reason their rows never jump under keyboard navigation), and the border only
// changes COLOUR.
//
// 🔴 INPUT TEXT IS `body` (16px), NOT UI SIZE. What a learner types should match what they read;
// a 12px input beside 16px prose reads as a form bolted onto a document. 16px also stops iOS
// zooming the viewport on focus, which is a real bug at 14px and below.

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { Check, Minus, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import { Text } from "./text";

const FIELD_BASE =
  "focus-ring w-full type-body tone-primary placeholder:tone-muted transition-[border-color] duration-(--dur-fast) ease-(--ease-standard) disabled:pointer-events-none disabled:opacity-40";

const fieldStyle = (invalid?: boolean) => ({
  background: "var(--bg-sunken)",
  border: `1px solid ${invalid ? "var(--danger, #e5484d)" : "var(--border-default)"}`,
  borderRadius: "var(--radius-6)",
});

export function Input({
  invalid,
  iconStart,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { invalid?: boolean; iconStart?: LucideIcon; className?: string }) {
  if (!iconStart) {
    return (
      <input
        aria-invalid={invalid || undefined}
        className={cn(FIELD_BASE, "px-(--space-12)", className)}
        style={{ height: "var(--control-comfortable)", ...fieldStyle(invalid) }}
        {...rest}
      />
    );
  }
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-(--space-12) top-1/2 -translate-y-1/2">
        <Icon icon={iconStart} size={16} tone="muted" />
      </span>
      <input
        aria-invalid={invalid || undefined}
        className={cn(FIELD_BASE, "pl-(--space-32) pr-(--space-12)", className)}
        style={{ height: "var(--control-comfortable)", ...fieldStyle(invalid) }}
        {...rest}
      />
    </div>
  );
}

export function Textarea({
  invalid,
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { invalid?: boolean; className?: string }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(FIELD_BASE, "resize-none px-(--space-12) py-(--space-8)", className)}
      style={fieldStyle(invalid)}
      {...rest}
    />
  );
}

/**
 * 🔴 THE WHOLE ROW IS THE TARGET, not the 16px box. A native label wrapping both means the text is
 * clickable, which is the difference between a control that feels considered and one that does not.
 *
 * 🔴🔴 CHECKED IS INK, NEVER THE ACCENT (owner's ruling 2026-09-11, /design/TOKENS.md §1.4 and
 * COMPONENTS.md §2). This file said the opposite until 2026-09-14 and painted `--ui-accent`, so every
 * checkbox and switch built from it contradicted the system it belongs to. The accent has two places:
 * the send button and the learner's own message bubble.
 *
 * 🔴 FOCUS IS DRAWN ON THE BOX, because the real input is visually hidden and a ring on it would
 * never be seen. `peer-focus-visible` carries the input's keyboard focus to the box beside it.
 */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
  className,
}: {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const on = Boolean(checked) || Boolean(indeterminate);
  return (
    <label className={cn("inline-flex cursor-pointer select-none items-center gap-(--space-8)", disabled && "pointer-events-none opacity-40", className)}>
      <input
        checked={Boolean(checked)}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      <span
        aria-hidden
        className="inline-flex size-4 shrink-0 items-center justify-center transition-colors duration-(--dur-fast) peer-focus-visible:[box-shadow:var(--focus-ring)]"
        style={{
          borderRadius: "var(--radius-4)",
          background: on ? "var(--text-primary)" : "transparent",
          border: `1px solid ${on ? "var(--text-primary)" : "var(--border-strong)"}`,
          // 🔴 `--ui-bg-primary` IS A FILL, NOT A GROUND. Drawing the tick in it put translucent
          // dark on a dark box and the check vanished. Same mistake as the primary button.
          color: "var(--text-on-inverse)",
        }}
      >
        {indeterminate ? <Minus height={12} strokeWidth={2} width={12} /> : checked ? <Check height={12} strokeWidth={2} width={12} /> : null}
      </span>
      {label ? <Text variant="ui">{label}</Text> : null}
    </label>
  );
}

/**
 * 🔴 A SWITCH IS INK WHEN IT IS ON, the ruling the checkbox above follows. The knob takes the ground
 * colour (`--text-on-inverse`), so it reads on the ink in both themes, and it travels by a transform
 * on the spacing scale rather than by a pixel `left`, so its end stop follows the track at any root
 * size instead of assuming a 16px rem.
 *
 * 🔴🔴 A SWITCH IS A BUTTON WITH `role="switch"`, NOT A HIDDEN CHECKBOX. That is the element a switch
 * is (the label and the track are one target, and `aria-checked` says on or off), and it is the only
 * form the flashcard screen can use: `cards-are-output-only.test.ts` bans every `<input>` there,
 * because the owner has twice said a learner never types into a card, and a guard that learns
 * exceptions stops being a guard. The review screen had hand-built its own switch for exactly that
 * reason; with this, it uses the system's.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** The switch's name when no visible label is passed, for a row that labels it elsewhere. */
  "aria-label"?: string;
}) {
  return (
    <button
      aria-checked={Boolean(checked)}
      aria-label={label ? undefined : ariaLabel}
      className={cn("focus-ring inline-flex cursor-pointer select-none items-center gap-(--space-8) disabled:pointer-events-none disabled:opacity-40", className)}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      role="switch"
      style={{ borderRadius: "var(--radius-6)" }}
      type="button"
    >
      <span
        aria-hidden
        className="relative inline-block h-5 w-9 shrink-0 transition-colors duration-(--dur-fast) ease-(--ease-standard)"
        style={{ borderRadius: "var(--radius-full)", background: checked ? "var(--text-primary)" : "var(--border-strong)" }}
      >
        <span
          className={cn("absolute left-0.5 top-0.5 size-4 transition-transform duration-(--dur-standard) ease-(--ease-standard)", checked && "translate-x-4")}
          style={{ borderRadius: "var(--radius-full)", background: "var(--text-on-inverse)" }}
        />
      </span>
      {label ? <Text variant="ui">{label}</Text> : null}
    </button>
  );
}

/**
 * 🔴 THE SELECTED SEGMENT IS A RAISED SURFACE ON A SUNKEN TRACK, which is the standard reading of
 * this control and needs no accent. The accent is reserved for what the learner is DOING, not for
 * which view they are looking at.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      // 🔴 `w-fit` BECAUSE `inline-flex` IS NOT ENOUGH: as a child of a column Stack, the cross
      // axis stretches it to the full width and the two segments float in a full-bleed track.
      className={cn("inline-flex w-fit items-center gap-(--space-2) p-(--space-2)", className)}
      role="radiogroup"
      style={{ background: "var(--bg-sunken)", borderRadius: "var(--radius-6)" }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              "focus-ring type-ui px-(--space-12) transition-[background-color,color] duration-(--dur-fast) ease-(--ease-standard)",
              selected ? "tone-primary" : "tone-secondary",
            )}
            key={option.value}
            name={name}
            onClick={() => onChange(option.value)}
            role="radio"
            style={{
              height: "calc(var(--control-standard) - var(--space-4))",
              borderRadius: "var(--radius-4)",
              background: selected ? "var(--bg-surface)" : "transparent",
              boxShadow: selected ? "var(--elev-raised)" : undefined,
            }}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
