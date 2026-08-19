"use client";

// The controls the two composers share.
//
// 🔴🔴 THERE ARE TWO COMPOSERS AND THERE WILL GO ON BEING TWO — owner call, 2026-08-19: "why is the
// composer not consistent accross all pages?". The answer was never geometry: both already read the
// same `--composer-*` tokens, so the pill is the same width, height and radius on both pages. What
// diverged was everything inside it. The send control was a FILLED accent circle at hard-coded 36px
// with a 20px glyph on the canvas, and a PLAIN transparent one at `--composer-control` with a
// `--composer-icon` glyph on the front door — and it was conditional in one place and permanent in
// the other. Two people writing the same button twice is how that happens, so it is written once
// here.
//
// 🔴 NOT A FULL UNIFICATION, AND THAT IS DELIBERATE. `canvas-home.tsx` has no canvas and no session:
// its job is to START one, and its `+` opens upload-or-record while the session composer's attaches
// to a canvas that already exists. Those are genuinely different bodies. What must never differ is
// the frame and the controls, which is exactly and only what lives here.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

/**
 * Send.
 *
 * 🔴 ALWAYS RENDERED, DIMMED WHEN THERE IS NOTHING TO SEND. It used to be removed from the DOM
 * whenever the box was empty, so the pill's right edge changed shape as you typed the first
 * character and the control the learner is looking for was absent exactly when they were looking
 * for it. The canvas composer's own comment already stated the principle it was breaking — "the
 * primary action always looks live" — and `disabled:opacity-40` was already there to express the
 * difference between nothing-typed and ready. The reference does the same: the button is always
 * present and changes state, never appears.
 */
export function ComposerSend({
  busy = false,
  disabled = false,
  label,
  onClick,
}: {
  /** A send already in flight. Shows the spinner and refuses a second press. */
  busy?: boolean;
  /** Nothing to send yet. */
  disabled?: boolean;
  /** "Send", "Start", or "Submit answer" — what pressing it does HERE, for a screen reader. */
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "ml-[8px] flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full",
        "bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40",
      )}
      disabled={busy || disabled}
      onClick={onClick}
      type="button"
    >
      {/* 🔴 `spinning` IS NOT OPTIONAL ON A LOADING GLYPH. Without the modifier the codicon renders a
          static broken circle, which sat perfectly still through every wait and read as a rendering
          fault rather than as activity. */}
      <Codicon name={busy ? "loading" : "arrow-up"} size="var(--composer-icon)" spinning={busy} />
    </button>
  );
}

/** Any round control in the pill that is not send: attach, dictate, cancel. One size, one hover. */
export function ComposerControl({
  disabled,
  icon,
  label,
  onClick,
  tone = "plain",
}: {
  disabled?: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  /** `accent` is the filled treatment, for a control that COMMITS something (finishing dictation). */
  tone?: "plain" | "accent";
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex size-[var(--composer-control)] shrink-0 items-center justify-center rounded-full transition-opacity",
        tone === "accent"
          ? "ml-[10px] bg-(--ui-action) text-(--ui-bg-editor) hover:opacity-90"
          : "text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)",
        "disabled:opacity-40",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Codicon name={icon} size="var(--composer-icon)" />
    </button>
  );
}
