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
import { Check, SlidersHorizontal } from "@/lib/workspace/icons";
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

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-1.5 shadow-lg"
          data-testid="calendar-kind-filter"
          role="group"
        >
          <p className="px-2 pb-1 pt-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-quaternary)">
            Show
          </p>
          {KIND_ORDER.map((kind) => {
            const shown = !hidden.has(kind);
            return (
              <button
                aria-checked={shown}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] hover:bg-(--chrome-action-hover)"
                key={kind}
                onClick={() => onChange(toggleKind(hidden, kind))}
                role="menuitemcheckbox"
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-[0.25rem] border",
                    shown ? "border-transparent" : "border-(--ui-stroke-secondary)",
                    shown && KIND_META[kind].dot,
                  )}
                >
                  {shown && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={cn("truncate", !shown && "text-(--ui-text-quaternary)")}>
                  {KIND_META[kind].label}
                </span>
              </button>
            );
          })}
          {filtering && (
            <button
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[0.75rem] text-(--theme-primary) hover:bg-(--chrome-action-hover)"
              onClick={() => onChange(new Set())}
              type="button"
            >
              Show everything
            </button>
          )}
        </div>
      )}
    </div>
  );
}
