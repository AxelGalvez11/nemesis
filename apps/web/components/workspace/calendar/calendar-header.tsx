// Calendar header — verbatim from desktop calendar/index.tsx §A.4. Title →
// SegmentedControl(Day/Week/Month/Year) → bordered prev/label/next cluster →
// primary "Add event" button. There is no "Today" button.

import { Button } from "@/components/desktop-ui/button";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { ChevronLeft, ChevronRight, Plus } from "@/lib/workspace/icons";
import { dateKey } from "@/lib/workspace/calendar-model";

import type { CalendarEventKind } from "@/lib/workspace/calendar-model";

import { VIEW_OPTIONS, VIEW_UNIT_LABEL, viewLabel, type CalendarViewMode } from "./format";
import { KindFilter } from "./kind-filter";

interface CalendarHeaderProps {
  view: CalendarViewMode;
  cursor: Date;
  today: Date;
  hiddenKinds: ReadonlySet<CalendarEventKind>;
  onChangeView: (view: CalendarViewMode) => void;
  onChangeHiddenKinds: (next: Set<CalendarEventKind>) => void;
  onStep: (delta: 1 | -1) => void;
  onToday: () => void;
  onAddEvent: (dateKeyStr: string) => void;
}

export function CalendarHeader({
  view,
  cursor,
  today,
  hiddenKinds,
  onChangeView,
  onChangeHiddenKinds,
  onStep,
  onToday,
  onAddEvent,
}: CalendarHeaderProps) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 pb-4 pt-5 max-lg:grid-cols-1 max-lg:gap-3 max-sm:px-3">
      {/* 1.375rem, not 2rem (owner 2026-07-31, "the header text is too big",
          pointing at Google Calendar).

          MEASURED against Google Calendar side by side: its date heading is
          22px on a 16px root — 1.375x the base text. Ours was 2rem on this
          app's 20px root, so 40px: nearly DOUBLE Google's, on a page whose base
          text is already a quarter larger. Kept in rem rather than pinned to a
          pixel size, because the root font here is the student's own text-size
          setting and the heading should still grow with it. */}
      <h1 className="truncate text-[1.375rem] font-semibold tracking-[-0.03em] text-foreground">
        {viewLabel(view, cursor)}
      </h1>
      <div className="justify-self-center max-lg:order-3">
        <SegmentedControl onChange={onChangeView} options={VIEW_OPTIONS} value={view} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <Button
            aria-label={`Previous ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(-1)}
            size="icon-sm"
            variant="secondary"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button onClick={onToday} size="sm" variant="secondary">Today</Button>
          <Button
            aria-label={`Next ${VIEW_UNIT_LABEL[view]}`}
            onClick={() => onStep(1)}
            size="icon-sm"
            variant="secondary"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <KindFilter hidden={hiddenKinds} onChange={onChangeHiddenKinds} />
        {/* THE IMPORT BUTTON IS GONE FROM HERE, NOT THE IMPORT (owner
            2026-07-31: "instead of having the syllabus uploader into the
            calendar page, can we have everything run through the chat
            instead?"). The importer is the same component, opened from the
            chat composer's Add menu — see sessions/composer.tsx. Removing the
            control is the ask; removing the feature would not be. */}
        <Button aria-label="Add event" onClick={() => onAddEvent(dateKey(today))} size="icon-sm">
          <Plus size={16} />
        </Button>
      </div>
    </header>
  );
}
