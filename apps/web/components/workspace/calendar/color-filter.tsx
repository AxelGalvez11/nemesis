"use client";

// Filter the calendar by colour.
//
// 🔴 THIS FILTERED BY KIND UNTIL 2026-09-01. Owner: "the only differentiating
// thing should be like filtering by color, that's pretty much it." Before that
// it was assignment/exam/rotation/class — a school-shaped axis in a product that
// is meant to be field-agnostic.
//
// Google puts a checkbox beside every calendar in its left rail. Ours has no
// left rail, so the same control lives in the header as a small popover — but it
// behaves the same way: tick to show, untick to hide, nothing is deleted, and
// the choice is remembered.
//
// The button always says whether a filter is on. A filter you cannot tell is
// active is indistinguishable from events having gone missing.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Check, RefreshCw, SlidersHorizontal } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";
import { describeFilter, NO_COLOR, toggleColor } from "@/lib/workspace/calendar-filter";
import { eventColorOf } from "@/lib/workspace/event-colors";

/** The name a colour filters under. The no-colour bucket is most of a new
 *  calendar, so it gets a word rather than being the one nameless swatch. */
export function colorLabel(colorId: string): string {
  return eventColorOf(colorId)?.name ?? "No colour";
}

interface ColorFilterProps {
  /** Colours actually present on the calendar, in palette order. */
  colours: readonly string[];
  hidden: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}

export function ColorFilter({ colours, hidden, onChange }: ColorFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Without this the panel stays open
  // behind whatever is clicked next, which on a calendar is usually a day cell —
  // so that click both creates an event and leaves this hanging.
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
  // Nothing to filter on a calendar whose events are all one colour: the control
  // would open on a single swatch that can only hide everything.
  if (colours.length < 2 && !filtering) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={describeFilter(hidden, colorLabel)}
        onClick={() => setOpen((current) => !current)}
        size="icon-sm"
        title="Show or hide colours"
        variant={filtering ? "secondary" : "ghost"}
      >
        <SlidersHorizontal size={16} />
        {/* A dot, because the icon alone cannot say that something is hidden. */}
        {filtering && (
          <span aria-hidden className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-(--theme-primary)" />
        )}
      </Button>

      {/* 🔴 THE NAME IS OFF THE SCREEN, NOT OUT OF THE CONTROL. Owner 2026-08-02:
          "remove the assignment, class, rotation etc names, it should only show
          colours." Each swatch still carries its name as a tooltip and as its
          accessible name, so the filter stays operable with a screen reader and
          learnable by anyone who has not memorised which hue is which. Dropping
          the word entirely would make a working control unusable, not quieter. */}
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 flex items-center gap-1 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-1.5 shadow-lg"
          data-testid="calendar-color-filter"
          role="group"
        >
          {colours.map((colorId) => {
            const shown = !hidden.has(colorId);
            const hex = eventColorOf(colorId)?.hex;
            return (
              <button
                aria-checked={shown}
                aria-label={colorLabel(colorId)}
                className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-(--chrome-action-hover)"
                key={colorId || "none"}
                onClick={() => onChange(toggleColor(hidden, colorId))}
                role="menuitemcheckbox"
                title={colorLabel(colorId)}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    // Hidden reads as an empty outline, shown as a filled dot.
                    // With no words on screen, this contrast IS the state.
                    shown ? "border-transparent text-white" : "border-(--ui-stroke-secondary)",
                    // The no-colour bucket has no hex to fill with, so it takes
                    // the surface the events themselves take.
                    shown && colorId === NO_COLOR && "bg-(--ui-bg-quaternary) text-foreground",
                  )}
                  style={shown && hex ? { backgroundColor: hex } : undefined}
                >
                  {shown && <Check size={10} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
          {/* Sits at the end of the row rather than under it, and only appears
              when something is actually hidden. Without a way back, a swatch row
              with no words is a filter you can get lost inside. */}
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
