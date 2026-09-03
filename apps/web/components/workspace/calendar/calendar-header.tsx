// Calendar header, laid out the way Google Calendar lays it out (owner
// 2026-07-31: "i need you to literally copy it entirely").
//
// One row, in Google's order: Today, the arrows, the date range, then the
// controls pushed to the right ending in a view dropdown. What this replaced
// led with a large bold title and put navigation on the far right, with a
// four-way segmented control taking the middle of the bar.
//
// The palette stays monochrome — the owner confirmed 2026-07-31 that "copy it
// entirely" is about layout, density and interaction, not Google's blue.

import { Button } from "@/components/desktop-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from "@/lib/workspace/icons";
import { dateKey } from "@/lib/workspace/calendar-model";


import { VIEW_OPTIONS, VIEW_UNIT_LABEL, viewLabel, type CalendarViewMode } from "./format";
import { ColorFilter } from "./color-filter";

interface CalendarHeaderProps {
  view: CalendarViewMode;
  cursor: Date;
  today: Date;
  /** Colours present on the calendar, in palette order. */
  colours: readonly string[];
  hiddenColors: ReadonlySet<string>;
  onChangeView: (view: CalendarViewMode) => void;
  onChangeHiddenColors: (next: Set<string>) => void;
  onStep: (delta: 1 | -1) => void;
  onToday: () => void;
  onAddEvent: (dateKeyStr: string) => void;
  /**
   * Absent when this learner has no calendar connected, and that is the gate.
   *
   * 🔴 THE CONTROL IS NOT SHOWN AT ALL RATHER THAN SHOWN AND DISABLED. A greyed-out Sync button on
   * a calendar with nothing to sync to is a dead control, and this codebase has a standing rule
   * against those (`capabilities-are-live.test.ts`). Somebody who has not connected Google has no
   * question this button could answer.
   */
  onSync?: () => void;
  syncing?: boolean;
}

export function CalendarHeader({
  view,
  cursor,
  today,
  colours,
  hiddenColors,
  onChangeView,
  onChangeHiddenColors,
  onStep,
  onToday,
  onAddEvent,
  onSync,
  syncing,
}: CalendarHeaderProps) {
  return (
    // GOOGLE'S TOOLBAR ORDER, one row (owner 2026-07-31: "literally copy it").
    // Today and the arrows come FIRST, then the date range, then the controls
    // on the right — the opposite of what this had, which led with a large
    // title and pushed navigation to the far side.
    <header className="flex shrink-0 flex-wrap items-center gap-3 px-5 pb-3 pt-4 max-sm:gap-2 max-sm:px-3">
      {/* 1.375rem, not 2rem (owner 2026-07-31, "the header text is too big",
          pointing at Google Calendar).

          MEASURED against Google Calendar side by side: its date heading is
          22px on a 16px root — 1.375x the base text. Ours was 2rem on this
          app's 20px root, so 40px: nearly DOUBLE Google's, on a page whose base
          text is already a quarter larger. Kept in rem rather than pinned to a
          pixel size, because the root font here is the student's own text-size
          setting and the heading should still grow with it. */}
      <Button className="rounded-full px-4" onClick={onToday} size="sm" variant="outline">
        Today
      </Button>
      <div className="flex items-center gap-0.5">
        <Button
          aria-label={`Previous ${VIEW_UNIT_LABEL[view]}`}
          className="rounded-full"
          onClick={() => onStep(-1)}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft size={18} />
        </Button>
        <Button
          aria-label={`Next ${VIEW_UNIT_LABEL[view]}`}
          className="rounded-full"
          onClick={() => onStep(1)}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {/* Regular weight, not semibold: Google's date range is 22px/400. A bold
          heading here reads as a page title; this is a position indicator. */}
      <h1 className="min-w-0 truncate text-[1.375rem] font-normal tracking-[-0.01em] text-foreground">
        {viewLabel(view, cursor)}
      </h1>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {/* Left of the view picker, so the two controls that CHANGE the calendar (sync, add) sit
            at either end of the group rather than crowding one corner. */}
        {onSync ? (
          <Button
            aria-label="Sync with Google Calendar"
            className="gap-1.5 rounded-full px-3"
            disabled={syncing}
            onClick={onSync}
            size="sm"
            variant="outline"
          >
            {syncing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            <span className="max-sm:sr-only">{syncing ? "Syncing" : "Sync"}</span>
          </Button>
        ) : null}
        <ColorFilter colours={colours} hidden={hiddenColors} onChange={onChangeHiddenColors} />
        {/* A dropdown on the right, where Google keeps it — the four-way
            segmented control sat in the middle of the bar and took the space
            the date range needs on a narrow window. */}
        <ViewMenu onChange={onChangeView} value={view} />
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

/** Day / Week / Month / Year as a dropdown, where Google keeps its view picker.
 *  The current view is the button's own label, so the bar says where you are
 *  without needing four visible options to compare against. */
function ViewMenu({ onChange, value }: { onChange: (view: CalendarViewMode) => void; value: CalendarViewMode }) {
  const current = VIEW_OPTIONS.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Change view" className="gap-1 rounded-full px-3" size="sm" variant="outline">
          {current?.label ?? "Week"}
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {VIEW_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.id} onSelect={() => onChange(option.id)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
