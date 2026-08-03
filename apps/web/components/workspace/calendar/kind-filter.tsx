"use client";

// Filter the calendar by kind of event (owner 2026-07-31, pointing at Google
// Calendar: "i need users to be able to filter by event type as well").
//
// Google puts a checkbox beside every calendar in its left rail. Ours has no
// left rail, so the same control lives in the header as a small popover — but
// it behaves the same way: tick to show, untick to hide, nothing is deleted,
// and the choice is remembered.
//
// The button always says whether a filter is on. A filter you cannot tell is
// active is indistinguishable from events having gone missing.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Check, RefreshCw, SlidersHorizontal } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";
import type { CalendarEventKind } from "@/lib/workspace/calendar-model";
import { describeFilter, toggleKind } from "@/lib/workspace/calendar-filter";

import { KIND_META, KIND_ORDER } from "./kind-meta";

interface KindFilterProps {
  hidden: ReadonlySet<CalendarEventKind>;
  onChange: (next: Set<CalendarEventKind>) => void;
}

export function KindFilter({ hidden, onChange }: KindFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Without this the panel stays open
  // behind whatever the student clicks next, which on a calendar is usually a
  // day cell — so their click both creates an event and leaves this hanging.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtering = hidden.size > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={describeFilter(hidden, (kind) => KIND_META[kind].label)}
        onClick={() => setOpen((current) => !current)}
        size="icon-sm"
        title="Show or hide kinds of event"
        variant={filtering ? "secondary" : "ghost"}
      >
        <SlidersHorizontal size={16} />
        {/* A dot, because the icon alone cannot say that something is hidden. */}
        {filtering && (
          <span aria-hidden className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-(--theme-primary)" />
        )}
      </Button>

      {/* Owner 2026-08-02: "remove the assignment, class, rotation etc names,
          it should only show colours." So this is a row of swatches now, not a
          labelled list — which is also why it is horizontal: five identical
          squares stacked in a column read as a list with its words missing.

          🔴 THE NAME IS REMOVED FROM THE SCREEN, NOT FROM THE CONTROL. Each
          swatch still carries its name as a hover tooltip and as its accessible
          name, so the filter is still operable with a screen reader and still
          learnable by anyone who has not memorised which hue is which. Dropping
          the word entirely would have made a working control unusable rather
          than quieter. */}
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 flex items-center gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-1.5 shadow-lg"
          data-testid="calendar-kind-filter"
          role="group"
        >
          {KIND_ORDER.map((kind) => {
            const shown = !hidden.has(kind);
            return (
              <button
                aria-checked={shown}
                aria-label={KIND_META[kind].label}
                className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-(--chrome-action-hover)"
                key={kind}
                onClick={() => onChange(toggleKind(hidden, kind))}
                role="menuitemcheckbox"
                title={KIND_META[kind].label}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    // Hidden reads as an empty outline, shown as a filled dot.
                    // With no words left, this contrast IS the state.
                    shown ? "border-transparent" : "border-(--ui-stroke-secondary)",
                    shown && KIND_META[kind].dot,
                  )}
                >
                  {shown && <Check size={10} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {/* Sits at the end of the row rather than under it, and only appears
              when something is actually hidden. Without a way back, a swatch
              row with no words is a filter a student can get lost inside. */}
          {filtering && (
            <button
              aria-label="Show everything"
              className="ml-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-l border-(--ui-stroke-tertiary) pl-0.5 text-(--theme-primary) hover:bg-(--chrome-action-hover)"
              onClick={() => onChange(new Set())}
              title="Show everything"
              type="button"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
