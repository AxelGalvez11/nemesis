"use client";

// The row of actions under an answer.
//
// Owner, 2026-08-26, with a screenshot of Claude's own: copy, read aloud, thumbs, retry, and the
// time since. Measured off claude.ai the same day at a 1456px viewport:
//
//     button      24 x 24, radius 6px, no padding, colour #898781 (their tertiary)
//     pitch       24px — the boxes touch; the air is inside them, not between
//     timestamp   11px, same colour, after the last button
//
// 🔴🔴 THUMBS ARE DELIBERATELY ABSENT, AND THAT IS THE OWNER'S OWN CALL. Nemesis has nowhere to
// put a rating — no table, no endpoint, nothing but a dev-only TTS bake-off. Asked which way he
// wanted it, he chose to ship the four that work now rather than two buttons wired to nothing.
// A control that does not do what it says is this codebase's most-repeated defect, and
// `canvas-answer-actions.test.ts` holds the absence so the pair cannot arrive decoratively later.
//
// 🔴 EVERY ACTION HERE ALREADY EXISTED. Copy is the answer's own text, read-aloud is the same
// speech route the header toggle drives, retry re-asks the question that produced this answer.
// Nothing new was invented to fill the row out.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

/** 🔴 24px, MEASURED. Not a rem: every rem in apps/web paints 1.125x its number. */
const ACTION =
  "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] text-(--ui-text-tertiary) "
  + "transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)";

/**
 * How long ago, in the shortest true form.
 *
 * 🔴 IT NEVER SAYS "0 minutes ago". Below a minute the honest word is "just now", and a counter
 * that starts at zero reads as broken.
 */
export function timeSince(atISO: string, now: number): string {
  const then = Date.parse(atISO);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function CanvasAnswerActions({
  at,
  onReadAloud,
  onRetry,
  reading = false,
  text,
}: {
  /** ISO. Omitted for an answer with no recorded time, in which case no timestamp is drawn. */
  at?: string;
  /** Reads this answer aloud, or stops. Absent when speech is unavailable. */
  onReadAloud?: () => void;
  /** Re-asks the question that produced this answer. Absent on a turn there is no way to re-run. */
  onRetry?: () => void;
  reading?: boolean;
  /** Exactly what Copy puts on the clipboard. */
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const clear = useRef<number | null>(null);

  // 🔴 THE TIMER IS CLEARED ON UNMOUNT. A turn scrolls out of the thread, and a `setState` on a
  // component that is gone is a warning in development and a leak in a long session.
  useEffect(() => () => {
    if (clear.current !== null) window.clearTimeout(clear.current);
  }, []);

  /**
   * 🔴 THE TIME IS READ ONCE PER MOUNT, NOT ON A TICKING CLOCK. A thread can hold eighty turns;
   * eighty timers re-rendering every second to move "3 minutes" to "4 minutes" is a real cost for
   * a fact nobody is watching. It refreshes when the thread does, which is whenever anything
   * actually happens.
   *
   * 🔴 AND IT IS COMPUTED IN AN EFFECT, because `Date.now()` during render differs between the
   * server and the client and React discards the tree for it.
   */
  const [since, setSince] = useState("");
  useEffect(() => {
    if (at) setSince(timeSince(at, Date.now()));
  }, [at]);

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      if (clear.current !== null) window.clearTimeout(clear.current);
      clear.current = window.setTimeout(() => setCopied(false), 1_600);
    });
  };

  return (
    // 🔴 `gap-0`: the reference's boxes touch at a 24px pitch, and the air is the padding inside
    // each one. A gap here would push the row wider than the thing it was measured from.
    <div className="mt-3 flex items-center gap-0" data-answer-actions="">
      <button
        aria-label={copied ? "Copied" : "Copy"}
        className={cn(ACTION)}
        onClick={copy}
        title={copied ? "Copied" : "Copy"}
        type="button"
      >
        <Codicon name={copied ? "check" : "copy"} size="15px" />
      </button>

      {onReadAloud && (
        <button
          aria-label={reading ? "Stop reading" : "Read aloud"}
          aria-pressed={reading}
          className={cn(ACTION, reading && "text-(--ui-action) hover:text-(--ui-action)")}
          onClick={onReadAloud}
          title={reading ? "Stop reading" : "Read aloud"}
          type="button"
        >
          <Codicon name={reading ? "unmute" : "mute"} size="15px" />
        </button>
      )}

      {onRetry && (
        <button aria-label="Retry" className={cn(ACTION)} onClick={onRetry} title="Retry" type="button">
          <Codicon name="refresh" size="15px" />
        </button>
      )}

      {/* 🔴 11px, THE REFERENCE'S OWN, AND IT SITS AFTER THE BUTTONS RATHER THAN OPPOSITE THEM.
          §46.3-exempt: measured off claude.ai, 2026-08-26. */}
      {since && (
        <span className="ml-2 text-[11px] leading-none text-(--ui-text-tertiary)">{since}</span>
      )}
    </div>
  );
}
