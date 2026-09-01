"use client";

// The quick-create card — what appears when a student clicks an empty patch of
// the calendar, in place of the full Add-event modal.
//
// Owner 2026-07-30, comparing us with Apple Calendar: clicking a day should
// make an event THERE. A modal is the wrong weight for that. It covers the
// grid you just pointed at, it asks for a date you already chose by pointing,
// and it takes a round trip through a dialog to write four characters. This
// card sits next to the slot, is pre-filled from where the click landed, and
// needs a title and the Return key.
//
// It is deliberately NOT a smaller copy of the form. Everything past a title —
// colour, repeats, a description — is behind "Details", which hands what has
// been typed to the real dialog rather than throwing it away.
//
// It briefly asked for a TYPE as well (assignment/exam/rotation), first as five
// bare dots and then as named chips. Both are gone: owner 2026-09-01, "that's
// too specific to school ... this should be generalist as possible".

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Input } from "@/components/desktop-ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/desktop-ui/popover";
import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

import { formatEventDate, formatEventTime } from "./format";

/** A slot the student pointed at: always a date, plus a time range when the
 *  click landed on the time grid rather than a month cell. */
export interface QuickCreateDraft {
  date: string;
  time?: string;
  endTime?: string;
}

/** Viewport coordinates of the slot, so the card can hang off it. Radix handles
 *  flipping near an edge from here. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface QuickCreatePopoverProps {
  draft: QuickCreateDraft;
  anchor: AnchorRect;
  onCancel: () => void;
  onCreate: (event: CalendarEvent) => Promise<void>;
  /** Hands the half-written event to the full dialog. */
  onOpenDetails: (draft: QuickCreateDraft, title: string) => void;
}

const newEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** "Wed, 15 Jul · 9:00 AM – 10:30 AM", or just the date for an all-day slot. */
function slotLabel(draft: QuickCreateDraft): string {
  const date = formatEventDate(draft.date);
  if (!draft.time) return `${date} · All day`;
  const start = formatEventTime(draft.time);
  return draft.endTime ? `${date} · ${start} – ${formatEventTime(draft.endTime)}` : `${date} · ${start}`;
}

export function QuickCreatePopover({ anchor, draft, onCancel, onCreate, onOpenDetails }: QuickCreatePopoverProps) {
  const [title, setTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    const built: CalendarEvent = {
      date: draft.date,
      id: newEventId(),
      // 🔴 "other", NOT a type the card asks for. Owner 2026-09-01: "I don't
      // want anything like type, you know, like assignment exam rotation.
      // That's too specific to school." The column still exists — imports and
      // the agent tools write it — but nothing in the product asks a person to
      // pick one, and "other" is the value that claims nothing.
      kind: "other",
      source: "manual",
      title: title.trim(),
      ...(draft.time ? { time: draft.time } : {}),
      ...(draft.endTime ? { endTime: draft.endTime } : {}),
    };
    try {
      await onCreate(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Popover onOpenChange={(open) => !open && onCancel()} open>
      {/* A zero-size marker pinned over the slot. Radix needs an element to
          measure; the slot itself is a grid cell or a painted preview block,
          neither of which can be handed over as a ref without changing how
          they lay out. */}
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed"
          style={{ height: anchor.height, left: anchor.left, top: anchor.top, width: anchor.width }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
            keyEvent.preventDefault();
            void submit();
          }
        }}
        // Without this Radix returns focus to whatever the pointer was last on,
        // which after a drag is a grid cell — and re-focusing a cell mid-close
        // re-opens the card on some pointer sequences.
        onOpenAutoFocus={(focusEvent) => focusEvent.preventDefault()}
        side="right"
      >
        <div className="flex flex-col gap-2.5">
          <Input
            aria-label="Event title"
            autoFocus
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="New event"
            value={title}
          />
          <p className="px-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">{slotLabel(draft)}</p>

          {error && <p className="text-[0.6875rem] text-(--ui-red)">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <Button
              className="px-1.5 text-[0.6875rem]"
              onClick={() => onOpenDetails(draft, title)}
              size="sm"
              variant="ghost"
            >
              Details
            </Button>
            <div className="flex gap-1.5">
              <Button onClick={onCancel} size="sm" variant="outline">Cancel</Button>
              <Button disabled={!title.trim() || saving} onClick={() => void submit()} size="sm">
                {saving ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
